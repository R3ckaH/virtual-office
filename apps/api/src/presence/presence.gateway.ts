import { HttpException, Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import {
  Ack,
  answerSchema,
  ClientEvents,
  endMeetingSchema,
  enterRoomSchema,
  idleSchema,
  knockSchema,
  ServerEventListeners,
  setStatusSchema,
  summonSchema,
} from '@vo/shared';
import type { Server, Socket } from 'socket.io';
import { UAParser } from 'ua-parser-js';
import type { ZodType } from 'zod';
import { AccessService } from '../auth/access.service';
import type { ClientInfo } from '../common/request-context';
import { PresenceError, PresenceService } from './presence.service';

interface SocketData {
  userId: string;
  sessionId: string;
  user: Awaited<ReturnType<AccessService['authenticate']>>['user'];
}
type VoSocket = Socket<Record<string, never>, ServerEventListeners, Record<string, never>, SocketData>;

/** At most this many messages per socket per window; enough for normal use, stops runaway loops. */
const RATE_LIMIT = { max: 40, windowMs: 10_000 };

function socketClient(socket: Socket): ClientInfo {
  const ua = String(socket.handshake.headers['user-agent'] ?? '').slice(0, 512) || null;
  const r = ua ? new UAParser(ua).getResult() : null;
  const join = (...p: (string | undefined)[]) => p.filter(Boolean).join(' ') || null;
  // behind one proxy (Railway's edge) the last x-forwarded-for entry is the address it saw
  const xff = String(socket.handshake.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    ip: xff.length ? xff[xff.length - 1] : socket.handshake.address || null,
    userAgent: ua,
    browser: r ? join(r.browser.name, r.browser.major) : null,
    os: r ? join(r.os.name, r.os.version) : null,
    device: r ? join(r.device.vendor, r.device.model) : null,
  };
}

/**
 * The live connection for the office floor. Browsers connect with their access token; every
 * message is validated and answered with an `Ack`. Server → client events are typed in
 * `@vo/shared` (ServerEvents).
 */
@WebSocketGateway()
export class PresenceGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger('PresenceGateway');
  @WebSocketServer() private server!: Server;

  constructor(
    private readonly access: AccessService,
    private readonly presence: PresenceService,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || !token) {
        const err = new Error('Please sign in') as Error & { data?: unknown };
        err.data = { code: 'UNAUTHENTICATED' };
        return next(err);
      }
      this.access
        .authenticate(token, socketClient(socket))
        .then(({ user, session }) => {
          socket.data = { userId: user.id, sessionId: session.id, user } satisfies SocketData;
          next();
        })
        .catch((e: unknown) => {
          const body = e instanceof HttpException ? (e.getResponse() as { message?: string; code?: string }) : {};
          const err = new Error(body.message ?? 'Please sign in') as Error & { data?: unknown };
          err.data = { code: body.code ?? 'UNAUTHENTICATED' };
          next(err);
        });
    });

    this.presence.attach({
      toAll: (event, data) => server.to('floor').emit(event, data),
      toUser: (userId, event, data) => server.to(`user:${userId}`).emit(event, data),
      disconnect: (socketIds, reason) => {
        for (const id of socketIds) {
          const s = server.sockets.sockets.get(id);
          if (!s) continue;
          s.emit('session:ended', reason);
          s.disconnect(true);
        }
      },
    });
  }

  async handleConnection(socket: VoSocket) {
    const { userId, sessionId, user } = socket.data;
    if (!userId) return socket.disconnect(true);
    this.registerHandlers(socket);
    try {
      const snapshot = await this.presence.connect(user, sessionId, socket.id);
      await socket.join(['floor', `user:${userId}`]);
      socket.emit('floor:snapshot', snapshot);
      for (const s of this.presence.pendingSummonsFor(userId)) socket.emit('summon:incoming', s);
      for (const k of this.presence.pendingKnocksFor(userId)) socket.emit('knock:incoming', k);
    } catch (e) {
      this.log.warn(`Connection for ${userId} failed: ${e}`);
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: VoSocket) {
    await this.presence.disconnect(socket.id).catch((e) => this.log.error(e));
  }

  private registerHandlers(socket: VoSocket) {
    const hits: number[] = [];
    const allowed = () => {
      const now = Date.now();
      while (hits.length && hits[0] < now - RATE_LIMIT.windowMs) hits.shift();
      hits.push(now);
      return hits.length <= RATE_LIMIT.max;
    };
    const me = () => socket.data.userId;

    const on = <E extends keyof ClientEvents, T>(event: E, schema: ZodType<T>, fn: (input: T) => Promise<unknown> | unknown) => {
      const listener = async (payload: unknown, ack?: (a: Ack<unknown>) => void) => {
        const reply = typeof ack === 'function' ? ack : () => undefined;
        if (!allowed()) return reply({ ok: false, message: 'Slow down a little and try again.', code: 'RATE_LIMITED' });
        const parsed = schema.safeParse(payload);
        if (!parsed.success) return reply({ ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid request', code: 'INVALID' });
        try {
          const data = await fn(parsed.data);
          reply(data === undefined ? { ok: true } : { ok: true, data });
        } catch (e) {
          if (e instanceof PresenceError) return reply({ ok: false, message: e.message, code: e.code });
          this.log.error(`${event} failed for ${me()}`, e as Error);
          reply({ ok: false, message: 'Something went wrong. Please try again.', code: 'ERROR' });
        }
      };
      (socket as unknown as { on(ev: string, l: (...args: never[]) => void): void }).on(event, listener);
    };

    on('room:enter', enterRoomSchema, (i) => this.presence.enter(me(), i.roomId));
    on('status:set', setStatusSchema, (i) => this.presence.setStatus(me(), i.status, i.message));
    on('activity:idle', idleSchema, (i) => this.presence.setIdle(socket.id, i.idle));
    on('knock:send', knockSchema, (i) => this.presence.knock(me(), i.roomId));
    on('knock:answer', answerSchema, (i) => this.presence.answerKnock(me(), i.id, i.accept));
    on('summon:send', summonSchema, (i) => this.presence.summon(me(), i.roomId, i.userIds));
    on('summon:answer', answerSchema, (i) => this.presence.answerSummon(me(), i.id, i.accept));
    on('meeting:end', endMeetingSchema, (i) => this.presence.endMeeting(me(), i.roomId));
    for (const h of this.presence.clientHandlers) on(h.event, h.schema, (i) => h.fn(me(), i));
  }
}
