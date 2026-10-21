import { Controller, Get, Inject } from '@nestjs/common';
import type { PublicConfigDto } from '@vo/shared';
import { sql } from 'drizzle-orm';
import { SsoService } from '../auth/sso.service';
import { Public } from '../common/auth-context';
import { DB, Db } from '../db/client';
import { SettingsService } from './settings.service';

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
      logoUrl: s.logoUrl,
      sessionTimeoutMinutes: s.sessionTimeoutMinutes,
      ssoProviders: this.sso.enabledProviders(),
    };
  }

  /** Liveness + database check for Azure App Service health probes. */
  @Get('health')
  async health() {
    await this.db.execute(sql`select 1`);
    return { status: 'ok', time: new Date().toISOString() };
  }
}
