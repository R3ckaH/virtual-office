import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CorrectionDto, CorrectionStatus, CreateCorrectionInput, DecisionInput, PunchKind } from '@vo/shared';
import { localDate, PUNCH_KIND_LABELS } from '@vo/shared';
import { and, desc, eq, inArray, isNull, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import { env } from '../config/env';
import { DB, Db } from '../db/client';
import { CorrectionRequest, correctionRequests, punches, User, users } from '../db/schema';
import { actionEmail, MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { DayService } from './day.service';
import { clockTime, dayLabel } from './format';

const requester = alias(users, 'requester');
const mgr = alias(users, 'mgr');
const hr = alias(users, 'hr');

@Injectable()
export class CorrectionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly days: DayService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  private query(where?: SQL) {
    return this.db
      .select({ c: correctionRequests, userName: requester.fullName, managerName: mgr.fullName, hrName: hr.fullName })
      .from(correctionRequests)
      .innerJoin(requester, eq(requester.id, correctionRequests.userId))
      .leftJoin(mgr, eq(mgr.id, correctionRequests.managerId))
      .leftJoin(hr, eq(hr.id, correctionRequests.hrId))
      .where(where)
      .orderBy(desc(correctionRequests.createdAt))
      .limit(200);
  }

  private async toDtos(rows: Awaited<ReturnType<CorrectionsService['query']>>): Promise<CorrectionDto[]> {
    const tz = await this.days.companyTz();
    return rows.map(({ c, userName, managerName, hrName }) => ({
      id: c.id,
      userId: c.userId,
      userName,
      workDate: c.workDate,
      action: c.action,
      kind: c.kind,
      punchId: c.punchId,
      originalAt: c.originalAt?.toISOString() ?? null,
      requestedAt: c.requestedAt?.toISOString() ?? null,
      summary: summarize(c, tz),
      reason: c.reason,
      status: c.status,
      managerId: c.managerId,
      managerName: managerName ?? null,
      managerDecidedAt: c.managerDecidedAt?.toISOString() ?? null,
      managerNote: c.managerNote,
      hrName: hrName ?? null,
      hrDecidedAt: c.hrDecidedAt?.toISOString() ?? null,
      hrNote: c.hrNote,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  private async one(id: string) {
    const rows = await this.query(eq(correctionRequests.id, id));
    if (!rows.length) throw new NotFoundException('Request not found');
    return (await this.toDtos(rows))[0];
  }

  async mine(userId: string) {
    return this.toDtos(await this.query(eq(correctionRequests.userId, userId)));
  }

  async forManager(managerId: string, status?: CorrectionStatus) {
    const where: SQL[] = [eq(correctionRequests.managerId, managerId)];
    if (status) where.push(eq(correctionRequests.status, status));
    return this.toDtos(await this.query(and(...where)));
  }

  async forHr(status?: CorrectionStatus) {
    return this.toDtos(await this.query(status ? eq(correctionRequests.status, status) : undefined));
  }

  async create(input: CreateCorrectionInput, actor: User, ip: string | null, now = new Date()): Promise<CorrectionDto> {
    if (!actor.attendanceTracked) throw new ConflictException('Attendance isn’t tracked for you');
    const tz = await this.days.companyTz();
    if (input.date > localDate(now, tz)) throw new BadRequestException({ message: 'That day hasn’t happened yet', errors: { date: ['In the future'] } });
    if (input.at && new Date(input.at) > now) throw new BadRequestException({ message: 'The corrected time is in the future', errors: { at: ['In the future'] } });

    let originalAt: Date | null = null;
    let kind: PunchKind | null = input.kind ?? null;
    if (input.punchId) {
      const [p] = await this.db.select().from(punches).where(eq(punches.id, input.punchId));
      if (!p || p.userId !== actor.id || p.workDate !== input.date || p.removedAt) {
        throw new BadRequestException({ message: 'Pick one of your punches from that day', errors: { punchId: ['Not found'] } });
      }
      originalAt = p.punchedAt;
      kind ??= p.kind;
    }
    const [open] = await this.db
      .select({ id: correctionRequests.id })
      .from(correctionRequests)
      .where(
        and(
          eq(correctionRequests.userId, actor.id),
          eq(correctionRequests.workDate, input.date),
          inArray(correctionRequests.status, ['PENDING_MANAGER', 'PENDING_HR']),
        ),
      );
    if (open) throw new ConflictException('You already have a pending request for that day. Cancel it first to change it.');

    // First approval goes to the person's manager; with no manager it goes straight to HR.
    let managerId: string | null = null;
    if (actor.managerId) {
      const [m] = await this.db.select().from(users).where(eq(users.id, actor.managerId));
      if (m && m.status === 'ACTIVE' && (m.role === 'MANAGER' || m.role === 'ADMIN')) managerId = m.id;
    }
    const [c] = await this.db
      .insert(correctionRequests)
      .values({
        userId: actor.id,
        workDate: input.date,
        action: input.action,
        punchId: input.punchId ?? null,
        kind,
        originalAt,
        requestedAt: input.at ? new Date(input.at) : null,
        reason: input.reason,
        status: managerId ? 'PENDING_MANAGER' : 'PENDING_HR',
        managerId,
      })
      .returning();
    await this.audit.record({ actorId: actor.id, action: 'attendance.correction.request', entityType: 'user', entityId: actor.id, after: { workDate: c.workDate, action: c.action }, ip });
    return this.one(c.id);
  }

  async cancel(id: string, actor: User) {
    const [c] = await this.db.select().from(correctionRequests).where(eq(correctionRequests.id, id));
    if (!c || c.userId !== actor.id) throw new NotFoundException('Request not found');
    if (c.status !== 'PENDING_MANAGER' && c.status !== 'PENDING_HR') throw new ConflictException('Only pending requests can be cancelled');
    await this.db.update(correctionRequests).set({ status: 'CANCELLED' }).where(eq(correctionRequests.id, id));
    return this.one(id);
  }

  /** First step: the requester's manager (or an admin) approves or rejects. */
  async managerDecision(id: string, input: DecisionInput, actor: User, ip: string | null) {
    const [c] = await this.db.select().from(correctionRequests).where(eq(correctionRequests.id, id));
    if (!c) throw new NotFoundException('Request not found');
    if (c.managerId !== actor.id && actor.role !== 'ADMIN') throw new NotFoundException('Request not found');
    if (c.userId === actor.id) throw new ForbiddenException('You can’t approve your own request');
    if (c.status !== 'PENDING_MANAGER') throw new ConflictException('This request isn’t waiting for a manager');
    await this.db
      .update(correctionRequests)
      .set({
        status: input.approve ? 'PENDING_HR' : 'REJECTED',
        managerId: actor.id,
        managerDecidedAt: new Date(),
        managerNote: input.note ?? null,
      })
      .where(eq(correctionRequests.id, id));
    await this.audit.record({ actorId: actor.id, action: `attendance.correction.manager_${input.approve ? 'approve' : 'reject'}`, entityType: 'user', entityId: c.userId, after: { workDate: c.workDate, note: input.note ?? null }, ip });
    if (!input.approve) await this.notify(c, false, input.note);
    return this.one(id);
  }

  /** Final step: HR approves (the timesheet changes) or rejects. */
  async hrDecision(id: string, input: DecisionInput, actor: User, ip: string | null, now = new Date()) {
    const [c] = await this.db.select().from(correctionRequests).where(eq(correctionRequests.id, id));
    if (!c) throw new NotFoundException('Request not found');
    if (c.userId === actor.id) throw new ForbiddenException('You can’t approve your own request');
    if (c.status !== 'PENDING_HR') throw new ConflictException(c.status === 'PENDING_MANAGER' ? 'The manager hasn’t approved this yet' : 'This request was already decided');
    if (input.approve) await this.apply(c, actor, now);
    await this.db
      .update(correctionRequests)
      .set({ status: input.approve ? 'APPROVED' : 'REJECTED', hrId: actor.id, hrDecidedAt: now, hrNote: input.note ?? null })
      .where(eq(correctionRequests.id, id));
    await this.audit.record({ actorId: actor.id, action: `attendance.correction.hr_${input.approve ? 'approve' : 'reject'}`, entityType: 'user', entityId: c.userId, after: { workDate: c.workDate, note: input.note ?? null }, ip });
    await this.notify(c, input.approve, input.note);
    return this.one(id);
  }

  private async apply(c: CorrectionRequest, actor: User, now: Date) {
    const note = `Correction approved by ${actor.fullName}`;
    if (c.action !== 'ADD' && c.punchId) {
      await this.db.update(punches).set({ removedAt: now, removedById: actor.id }).where(eq(punches.id, c.punchId));
    }
    if (c.action !== 'REMOVE' && c.requestedAt && c.kind === 'OUT') {
      // a real clock-out replaces the automatic one
      await this.db
        .update(punches)
        .set({ removedAt: now, removedById: actor.id })
        .where(and(eq(punches.userId, c.userId), eq(punches.workDate, c.workDate), eq(punches.source, 'SYSTEM'), isNull(punches.removedAt)));
    }
    if (c.action !== 'REMOVE' && c.requestedAt) {
      await this.db.insert(punches).values({
        userId: c.userId,
        workDate: c.workDate,
        source: 'HR',
        kind: c.kind,
        punchedAt: c.requestedAt,
        via: 'hr',
        note,
        createdById: actor.id,
      });
    }
    await this.days.recompute(c.userId, c.workDate, now);
  }

  private async notify(c: CorrectionRequest, approved: boolean, note?: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, c.userId));
    if (!u) return;
    const company = (await this.settings.get()).companyName;
    const body = approved
      ? `Your time correction for ${dayLabel(c.workDate)} was approved and your timesheet was updated.`
      : `Your time correction for ${dayLabel(c.workDate)} was not approved.${note ? ` Note: ${note}` : ''}`;
    const mail = actionEmail({
      companyName: company,
      greeting: `Hi ${u.fullName.split(' ')[0]},`,
      body,
      actionLabel: 'Open Attendance',
      actionUrl: `${env().WEB_ORIGIN}/attendance`,
      footer: 'You get this email when a time correction you asked for is decided.',
    });
    await this.mail.send({ to: u.email, subject: approved ? 'Time correction approved' : 'Time correction not approved', ...mail });
  }
}

function summarize(c: CorrectionRequest, tz: string): string {
  const kind = c.kind ? PUNCH_KIND_LABELS[c.kind].toLowerCase() : 'punch';
  const t = (d: Date | null) => (d ? clockTime(d, tz) : '');
  if (c.action === 'ADD') return `Add a ${kind} at ${t(c.requestedAt)}`;
  if (c.action === 'REMOVE') return `Remove the ${kind} at ${t(c.originalAt)}`;
  return `Change ${kind} from ${t(c.originalAt)} to ${t(c.requestedAt)}`;
}
