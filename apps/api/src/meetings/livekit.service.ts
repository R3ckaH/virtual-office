import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AccessToken, EgressClient, EncodedFileOutput, EncodedFileType, S3Upload, WebhookEvent, WebhookReceiver } from 'livekit-server-sdk';
import { env } from '../config/env';
import { storageConfigured } from './storage';

/** Talks to LiveKit: join tokens, webhooks and recordings. */
@Injectable()
export class LiveKitService {
  private readonly log = new Logger('LiveKit');

  configured(): boolean {
    const e = env();
    return !!(e.LIVEKIT_URL && e.LIVEKIT_API_KEY && e.LIVEKIT_API_SECRET);
  }

  assertConfigured() {
    if (!this.configured()) {
      throw new ServiceUnavailableException({ message: 'Video calls aren’t set up yet. An admin needs to connect LiveKit.', code: 'VIDEO_NOT_CONFIGURED' });
    }
  }

  /** The URL browsers connect to (wss://…). */
  clientUrl(): string {
    return env().LIVEKIT_URL.replace(/^http/, 'ws');
  }

  /** Room names carry the meeting and the occurrence, so webhooks can be matched without a lookup table. */
  roomName(meetingId: string, occurrenceStart: Date): string {
    return `m_${meetingId}_${Math.floor(occurrenceStart.getTime() / 1000)}`;
  }

  parseRoomName(name: string): { meetingId: string; occurrenceStart: Date } | null {
    const m = /^m_([0-9a-f-]{36})_(\d+)$/.exec(name);
    return m ? { meetingId: m[1], occurrenceStart: new Date(Number(m[2]) * 1000) } : null;
  }

  async token(opts: { identity: string; name: string; room: string; isHost: boolean; ttlSeconds?: number }): Promise<string> {
    this.assertConfigured();
    const e = env();
    const at = new AccessToken(e.LIVEKIT_API_KEY, e.LIVEKIT_API_SECRET, {
      identity: opts.identity,
      name: opts.name,
      ttl: opts.ttlSeconds ?? 6 * 3600,
      metadata: JSON.stringify({ host: opts.isHost }),
    });
    at.addGrant({
      roomJoin: true,
      room: opts.room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // lets people set their own attributes (raised hand)
      canUpdateOwnMetadata: true,
      roomAdmin: opts.isHost,
    });
    return at.toJwt();
  }

  /** Checks the signature and parses a webhook (throws when it doesn't verify). */
  async receive(body: string, authorization: string | undefined): Promise<WebhookEvent> {
    this.assertConfigured();
    const e = env();
    return new WebhookReceiver(e.LIVEKIT_API_KEY, e.LIVEKIT_API_SECRET).receive(body, authorization);
  }

  private egress(): EgressClient {
    this.assertConfigured();
    const e = env();
    return new EgressClient(e.LIVEKIT_URL.replace(/^ws/, 'http'), e.LIVEKIT_API_KEY, e.LIVEKIT_API_SECRET);
  }

  /** Records the whole room (grid layout) to an MP4 in the recordings bucket. */
  async startRecording(room: string, fileKey: string): Promise<string> {
    if (!storageConfigured()) {
      throw new ServiceUnavailableException({ message: 'Recording storage isn’t connected yet.', code: 'STORAGE_NOT_CONFIGURED' });
    }
    const e = env();
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: fileKey,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: e.RECORDINGS_S3_ACCESS_KEY,
          secret: e.RECORDINGS_S3_SECRET_KEY,
          bucket: e.RECORDINGS_S3_BUCKET,
          region: e.RECORDINGS_S3_REGION,
          endpoint: e.RECORDINGS_S3_ENDPOINT,
          forcePathStyle: true,
        }),
      },
    });
    const info = await this.egress().startRoomCompositeEgress(room, { file: output }, { layout: 'grid' });
    return info.egressId;
  }

  async stopRecording(egressId: string): Promise<void> {
    try {
      await this.egress().stopEgress(egressId);
    } catch (e) {
      this.log.warn(`stopEgress(${egressId}) failed: ${e}`);
    }
  }
}
