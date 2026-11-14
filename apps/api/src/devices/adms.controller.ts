import { Body, Controller, Get, Header, HttpCode, Inject, Logger, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import { Public, RequiresModule } from '../common/auth-context';
import { DB, Db } from '../db/client';
import { Device, devices } from '../db/schema';
import { IngestService } from './ingest.service';
import { parseAttlog } from './parsers';

/**
 * Cloud push using the ADMS / "iclock" protocol spoken by ZKTeco terminals and most of their rebrands.
 * Point the device's "Cloud server" setting at this API's host and port. Served at /iclock/* (no /api prefix)
 * because devices use that fixed path.
 *
 * ADMS has no real authentication, so a device must be registered here by serial number (SN), set to
 * "Cloud push", be active, and (optionally) come from an allowed IP.
 */
@Controller('iclock')
@RequiresModule('devices')
@Public()
export class AdmsController {
  private readonly logger = new Logger('ADMS');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ingest: IngestService,
  ) {}

  private async device(sn: string | undefined, req: Request): Promise<Device> {
    const serial = (sn ?? '').trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(serial)) throw new UnauthorizedException('Unknown device');
    const [d] = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.serialNumber, serial), eq(devices.connection, 'PUSH'), eq(devices.active, true)));
    if (!d) {
      this.logger.warn(`Push from unregistered device SN=${serial} (${req.ip})`);
      throw new UnauthorizedException('Unknown device');
    }
    const allowed = (d.allowedIps ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ip = (req.ip ?? '').replace(/^::ffff:/, '');
    if (allowed.length && !allowed.includes(ip)) {
      this.logger.warn(`Push for ${d.name} from a non-allowed IP ${ip}`);
      throw new UnauthorizedException('Unknown device');
    }
    return d;
  }

  /** Handshake: the device asks for its options when it starts. */
  @Get('cdata')
  @Header('Content-Type', 'text/plain')
  async options(@Query('SN') sn: string, @Req() req: Request) {
    const d = await this.device(sn, req);
    await this.ingest.touch(d.id);
    return [
      `GET OPTION FROM: ${d.serialNumber}`,
      `ATTLOGStamp=${d.lastStamp ?? 0}`,
      'OPERLOGStamp=9999',
      'ATTPHOTOStamp=None',
      'ErrorDelay=30',
      'Delay=10',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=TransData AttLog',
      'Realtime=1',
      'Encrypt=None',
    ].join('\n');
  }

  /** The device uploads data. Only the attendance log (table=ATTLOG) matters here. */
  @Post('cdata')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  async upload(@Query('SN') sn: string, @Query('table') table: string, @Query('Stamp') stamp: string | undefined, @Body() body: unknown, @Req() req: Request) {
    const d = await this.device(sn, req);
    const text = typeof body === 'string' ? body : Buffer.isBuffer(body) ? body.toString('utf8') : '';
    if ((table ?? '').toUpperCase() !== 'ATTLOG') {
      await this.ingest.touch(d.id);
      return 'OK';
    }
    const parsed = parseAttlog(text);
    const r = await this.ingest.ingest(
      d,
      parsed.rows.map((p) => ({ deviceUserId: p.deviceUserId, at: p.local, verify: p.verify })),
      'push',
    );
    if (stamp && /^\d{1,20}$/.test(stamp)) await this.ingest.touch(d.id, { lastStamp: stamp });
    if (parsed.errors.length) this.logger.warn(`${d.name}: ${parsed.errors.length} unreadable ATTLOG lines`);
    return `OK: ${r.added + r.duplicates}`;
  }

  /** The device polls for commands every few seconds; doubles as its heartbeat. */
  @Get('getrequest')
  @Header('Content-Type', 'text/plain')
  async getRequest(@Query('SN') sn: string, @Req() req: Request) {
    const d = await this.device(sn, req);
    if (d.syncRequestedAt) {
      await this.ingest.touch(d.id, { syncRequestedAt: null });
      return `C:${Math.floor(Date.now() / 1000) % 100000}:CHECK`; // asks the device to upload anything new now
    }
    await this.ingest.touch(d.id);
    return 'OK';
  }

  /** The device reports the result of a command. */
  @Post('devicecmd')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain')
  async deviceCmd(@Query('SN') sn: string, @Req() req: Request) {
    const d = await this.device(sn, req);
    await this.ingest.touch(d.id);
    return 'OK';
  }
}
