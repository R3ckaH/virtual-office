import { Controller, Get, Inject, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import type { PublicConfigDto } from '@vo/shared';
import { sql } from 'drizzle-orm';
import { SsoService } from '../auth/sso.service';
import { Public } from '../common/auth-context';
import { env } from '../config/env';
import { DB, Db } from '../db/client';
import { SettingsService } from './settings.service';

/**
 * Where browsers open the live connection. Behind the Vercel proxy (which can't carry WebSockets)
 * that's the API's own domain; otherwise the same site as the web app (null).
 */
export function realtimeUrl(): string | null {
  const e = env();
  if (e.REALTIME_URL) return e.REALTIME_URL.replace(/\/$/, '');
  const host = e.DEVICE_HOST || e.RAILWAY_PUBLIC_DOMAIN;
  return e.ORIGIN_SECRET && host ? `https://${host}` : null;
}

/** The public link for a stored logo: a data URL becomes /api/branding/logo?v=<hash>; a plain URL is kept. */
export function logoLink(stored: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith('data:')) return stored;
  return `/api/branding/logo?v=${createHash('sha1').update(stored).digest('hex').slice(0, 12)}`;
}

@Public()
@Controller()
export class PublicController {
  constructor(
    private readonly settings: SettingsService,
    private readonly sso: SsoService,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** Branding and login options for the sign-in page (no secrets). */
  @Get('config')
  async config(): Promise<PublicConfigDto> {
    const s = await this.settings.get();
    return {
      companyName: s.companyName,
      primaryColor: s.primaryColor,
      logoUrl: logoLink(s.logoUrl),
      sessionTimeoutMinutes: s.sessionTimeoutMinutes,
      ssoProviders: this.sso.enabledProviders(),
      deviceHost: env().DEVICE_HOST || env().RAILWAY_PUBLIC_DOMAIN || null,
      realtimeUrl: realtimeUrl(),
    };
  }

  /** The company logo (stored in settings as a data URL). Cached by the browser; the link changes when the logo does. */
  @Get('branding/logo')
  async logo(@Res() res: Response) {
    const s = await this.settings.get();
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(s.logoUrl ?? '');
    if (!m) throw new NotFoundException('No logo');
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(Buffer.from(m[2], 'base64'));
  }

  /** Liveness + database check for the host's health probe (Railway calls it directly). */
  @Get('health')
  async health() {
    await this.db.execute(sql`select 1`);
    return { status: 'ok', time: new Date().toISOString() };
  }
}
