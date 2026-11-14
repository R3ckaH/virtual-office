import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ingestSchema, type IngestInput, type IngestResultDto } from '@vo/shared';
import { Public, RequiresModule } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import { IngestService } from './ingest.service';

/**
 * For the office sync agent and devices that can POST JSON. Authenticated with the device token
 * (Authorization: Bearer vod_...), not a user session.
 */
@Controller('ingest')
@RequiresModule('devices')
@Public()
@Throttle({ default: { ttl: 60_000, limit: 120 } })
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post('punches')
  @HttpCode(200)
  async punches(@Headers('authorization') auth: string | undefined, @Body(new ZodPipe(ingestSchema)) body: IngestInput): Promise<IngestResultDto> {
    const device = await this.ingest.deviceForToken(auth);
    const r = await this.ingest.ingest(
      device,
      body.punches.map((p) => ({ deviceUserId: p.deviceUserId, at: p.at, verify: p.verify ?? null })),
      device.connection === 'AGENT' ? 'agent' : 'push',
    );
    return { added: r.added, duplicates: r.duplicates, unknownUserIds: r.unknownUserIds };
  }

  /** Agent heartbeat: marks the device online and hands over a pending "Sync now". */
  @Get('status')
  async status(@Headers('authorization') auth: string | undefined) {
    const device = await this.ingest.deviceForToken(auth);
    const syncRequested = !!device.syncRequestedAt;
    await this.ingest.touch(device.id, syncRequested ? { syncRequestedAt: null } : {});
    return { deviceId: device.id, name: device.name, timezone: device.timezone, syncRequested, serverTime: new Date().toISOString() };
  }
}
