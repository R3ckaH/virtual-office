import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseEnumPipe, Patch, Put, Query, Req, Res } from '@nestjs/common';
import {
  companySettingsSchema,
  DEFAULT_NOTIFICATIONS,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  REPORT_KINDS,
  reportQuerySchema,
  teamDashboardSchema,
  type CompanySettingsDto,
  type CompanySettingsInput,
  type ReportKind,
  type ReportQuery,
} from '@vo/shared';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import { DB, Db } from '../db/client';
import { orgSettings, User } from '../db/schema';
import { mailConfigured, MailService } from '../mail/mail.service';
import { logoLink } from '../settings/public.controller';
import { SettingsService } from '../settings/settings.service';
import { DashboardService } from './dashboard.service';
import { toCsv, toPdf, toXlsx } from './export';
import { ReportsService } from './reports.service';

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

@Controller()
export class InsightsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly dashboard: DashboardService,
    private readonly reports: ReportsService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------- dashboards ---------------- */

  @Get('dashboard/me')
  mine(@CurrentUser() me: User) {
    return this.dashboard.mine(me);
  }

  @Get('dashboard/team')
  team(@CurrentUser() me: User, @Query(new ZodPipe(teamDashboardSchema)) q: z.infer<typeof teamDashboardSchema>) {
    return this.dashboard.team(me, q.departmentId);
  }

  /* ---------------- reports ---------------- */

  @Get('reports/:kind')
  @RequirePermissions('reports.read')
  async report(
    @CurrentUser() me: User,
    @Param('kind', new ParseEnumPipe(REPORT_KINDS)) kind: ReportKind,
    @Query(new ZodPipe(reportQuerySchema)) q: ReportQuery,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const r = await this.reports.run(me, kind, q);
    if (!q.format) return r;
    const { companyName } = await this.settings.get();
    const name = `${kind}-${q.from}-to-${q.to}`;
    await this.audit.record({ actorId: me.id, action: 'report.export', entityType: 'report', entityId: null, after: { kind, ...q }, ip: req.ip ?? null });
    res.setHeader('Cache-Control', 'no-store');
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
      res.end(toCsv(r));
    } else if (q.format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
      res.end(await toXlsx(r, companyName));
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
      res.end(await toPdf(r, companyName));
    }
  }

  /* ---------------- company settings ---------------- */

  private async company(): Promise<CompanySettingsDto> {
    const s = await this.settings.get();
    return {
      companyName: s.companyName,
      primaryColor: s.primaryColor,
      defaultTimezone: s.defaultTimezone,
      sessionTimeoutMinutes: s.sessionTimeoutMinutes,
      notifications: { ...DEFAULT_NOTIFICATIONS, ...(s.notifications ?? {}) },
      logoUrl: logoLink(s.logoUrl),
      mailConfigured: mailConfigured(),
    };
  }

  @Get('admin/company')
  @RequirePermissions('settings.manage')
  getCompany() {
    return this.company();
  }

  @Patch('admin/company')
  @RequirePermissions('settings.manage')
  async updateCompany(@CurrentUser() me: User, @Body(new ZodPipe(companySettingsSchema)) body: CompanySettingsInput, @Req() req: Request) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: body.defaultTimezone });
    } catch {
      throw new BadRequestException({ message: 'Pick a time zone from the list', errors: { defaultTimezone: ['Unknown time zone'] } });
    }
    const before = await this.company();
    await this.db.update(orgSettings).set(body).where(eq(orgSettings.id, 1));
    this.settings.invalidate();
    await this.audit.record({ actorId: me.id, action: 'settings.company.update', entityType: 'settings', entityId: null, before: { ...before, logoUrl: undefined }, after: body, ip: req.ip ?? null });
    return this.company();
  }

  /** The raw image is the body; its type is the Content-Type header. */
  @Put('admin/company/logo')
  @RequirePermissions('settings.manage')
  async uploadLogo(@CurrentUser() me: User, @Req() req: Request) {
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim();
    const body = req.body as Buffer;
    if (!LOGO_TYPES.includes(type) || !Buffer.isBuffer(body)) throw new BadRequestException('Use a PNG, JPG or WebP image.');
    if (body.length > LOGO_MAX_BYTES) throw new BadRequestException(`Keep the logo under ${LOGO_MAX_BYTES / 1024} KB.`);
    if (!SIGNATURES[type](body)) throw new BadRequestException('That file isn’t a valid image.');
    await this.db.update(orgSettings).set({ logoUrl: `data:${type};base64,${body.toString('base64')}` }).where(eq(orgSettings.id, 1));
    this.settings.invalidate();
    await this.audit.record({ actorId: me.id, action: 'settings.logo.update', entityType: 'settings', entityId: null, after: { type, bytes: body.length }, ip: req.ip ?? null });
    return this.company();
  }

  @Delete('admin/company/logo')
  @HttpCode(200)
  @RequirePermissions('settings.manage')
  async removeLogo(@CurrentUser() me: User, @Req() req: Request) {
    await this.db.update(orgSettings).set({ logoUrl: null }).where(eq(orgSettings.id, 1));
    this.settings.invalidate();
    await this.audit.record({ actorId: me.id, action: 'settings.logo.remove', entityType: 'settings', entityId: null, ip: req.ip ?? null });
    return this.company();
  }
}
