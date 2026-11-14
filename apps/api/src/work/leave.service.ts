import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  addDays,
  formatDays,
  hasPermission,
  HolidayDto,
  HolidayInput,
  LEAVE_MAX_AHEAD_DAYS,
  LEAVE_MAX_BACK_DAYS,
  LEAVE_MAX_SPAN_DAYS,
  LeaveAdjustmentDto,
  LeaveAdjustmentInput,
  LeaveBalanceDto,
  LeaveCalendarEntryDto,
  LeaveCalendarQuery,
  LeaveDayDto,
  LeaveDecisionInput,
  LeaveListQuery,
  LeavePreviewDto,
  LeaveRequestDto,
  LeaveRequestInput,
  LeaveTypeDto,
  LeaveTypeInput,
} from '@vo/shared';
import { and, asc, desc, eq, gte, inArray, lte, ne, or, SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DayService } from '../attendance/day.service';
import { PlannerService } from '../attendance/planner.service';
import { AuditService } from '../audit/audit.service';
import { DB, Db } from '../db/client';
import { departments, holidays, LeaveRequest, leaveAdjustments, leaveRequests, leaveTypes, User, users } from '../db/schema';
import { PresenceService } from '../presence/presence.service';
import { NoticesService } from './notices.service';

const yearOf = (date: string) => Number(date.slice(0, 4));
const human = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const range = (a: string, b: string) => (a === b ? human(a) : `${human(a)} to ${human(b)}`);

/**
 * Leave: types and yearly allowances, requests with manager approval, balances and adjustments,
 * company holidays, and the team calendar. Approved leave turns those days into LEAVE on the
 * timesheet (see PlanContext), so nobody is flagged absent.
 */
@Injectable()
export class LeaveService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly planner: PlannerService,
    private readonly days: DayService,
    private readonly audit: AuditService,
    private readonly notices: NoticesService,
    private readonly presence: PresenceService,
  ) {}

  private canManage = (u: User) => hasPermission(u.role, 'leave.manage');

  /* ================================================================ */
  /* Types                                                             */
  /* ================================================================ */

  async types(actor: User): Promise<LeaveTypeDto[]> {
    const used = this.db.select({ id: leaveRequests.typeId }).from(leaveRequests);
    const rows = await this.db
      .select({ t: leaveTypes, inUse: sql<boolean>`${leaveTypes.id} IN (${used})` })
      .from(leaveTypes)
      .where(this.canManage(actor) ? undefined : eq(leaveTypes.active, true))
      .orderBy(asc(leaveTypes.name));
    return rows.map(({ t, inUse }) => ({ id: t.id, name: t.name, color: t.color, paid: t.paid, yearlyDays: t.yearlyDays, active: t.active, inUse: !!inUse }));
  }

  private async nameFree(name: string, id?: string) {
    const [clash] = await this.db.select({ id: leaveTypes.id }).from(leaveTypes).where(sql`lower(${leaveTypes.name}) = lower(${name})`);
    if (clash && clash.id !== id) throw new ConflictException({ message: 'A leave type with that name already exists', errors: { name: ['Already exists'] } });
  }

  async createType(actor: User, input: LeaveTypeInput, ip: string | null) {
    await this.nameFree(input.name);
    const [t] = await this.db.insert(leaveTypes).values(input).returning();
    await this.audit.record({ actorId: actor.id, action: 'leave.type.create', entityType: 'leave_type', entityId: t.id, after: input, ip });
    return (await this.types(actor)).find((x) => x.id === t.id)!;
  }

  async updateType(actor: User, id: string, input: LeaveTypeInput, ip: string | null) {
    const [before] = await this.db.select().from(leaveTypes).where(eq(leaveTypes.id, id));
    if (!before) throw new NotFoundException('Leave type not found');
    await this.nameFree(input.name, id);
    await this.db.update(leaveTypes).set(input).where(eq(leaveTypes.id, id));
    await this.audit.record({ actorId: actor.id, action: 'leave.type.update', entityType: 'leave_type', entityId: id, before: { ...before }, after: input, ip });
    return (await this.types(actor)).find((x) => x.id === id)!;
  }

  async deleteType(actor: User, id: string, ip: string | null) {
    const [t] = (await this.types(actor)).filter((x) => x.id === id);
    if (!t) throw new NotFoundException('Leave type not found');
    if (t.inUse) throw new ConflictException('People have filed this type of leave. Turn it off instead, so their history stays.');
    await this.db.delete(leaveTypes).where(eq(leaveTypes.id, id));
    await this.audit.record({ actorId: actor.id, action: 'leave.type.delete', entityType: 'leave_type', entityId: id, before: { name: t.name }, ip });
  }

  /* ================================================================ */
  /* Days, balances                                                    */
  /* ================================================================ */

  /** Which dates count as leave days for this person: rest days and holidays don't. */
  async countDays(userId: string, start: string, end: string): Promise<{ days: number; dates: LeaveDayDto[] }> {
    const ctx = await this.planner.context([userId], start, end);
    const dates: LeaveDayDto[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const holiday = ctx.holidays.get(d);
      if (holiday) dates.push({ date: d, counted: false, note: holiday });
      else if (!ctx.isScheduledWorkday(userId, d)) dates.push({ date: d, counted: false, note: 'Rest day' });
      else dates.push({ date: d, counted: true, note: null });
    }
    return { days: dates.filter((x) => x.counted).length, dates };
  }

  async balances(actor: User, userId: string, year: number): Promise<LeaveBalanceDto[]> {
    await this.mayView(actor, userId);
    const types = await this.db.select().from(leaveTypes).orderBy(asc(leaveTypes.name));
    const adj = await this.db
      .select({ typeId: leaveAdjustments.typeId, days: sql<number>`sum(${leaveAdjustments.days})::float` })
      .from(leaveAdjustments)
      .where(and(eq(leaveAdjustments.userId, userId), eq(leaveAdjustments.year, year)))
      .groupBy(leaveAdjustments.typeId);
    const reqs = await this.db
      .select({ typeId: leaveRequests.typeId, status: leaveRequests.status, days: sql<number>`sum(${leaveRequests.days})::float` })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.userId, userId), inArray(leaveRequests.status, ['APPROVED', 'PENDING']), sql`extract(year from ${leaveRequests.startDate}) = ${year}`))
      .groupBy(leaveRequests.typeId, leaveRequests.status);
    return types
      .filter((t) => t.active || reqs.some((r) => r.typeId === t.id) || adj.some((a) => a.typeId === t.id))
      .map((t) => {
        const adjustments = adj.find((a) => a.typeId === t.id)?.days ?? 0;
        const used = reqs.find((r) => r.typeId === t.id && r.status === 'APPROVED')?.days ?? 0;
        const pending = reqs.find((r) => r.typeId === t.id && r.status === 'PENDING')?.days ?? 0;
        return {
          typeId: t.id,
          typeName: t.name,
          color: t.color,
          paid: t.paid,
          year,
          allowance: t.yearlyDays,
          adjustments,
          used,
          pending,
          remaining: t.yearlyDays === null ? null : t.yearlyDays + adjustments - used,
        };
      });
  }

  async adjustments(actor: User, userId: string, year: number): Promise<LeaveAdjustmentDto[]> {
    await this.mayView(actor, userId);
    const by = alias(users, 'by');
    const rows = await this.db
      .select({ a: leaveAdjustments, typeName: leaveTypes.name, byName: by.fullName })
      .from(leaveAdjustments)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveAdjustments.typeId))
      .leftJoin(by, eq(by.id, leaveAdjustments.createdById))
      .where(and(eq(leaveAdjustments.userId, userId), eq(leaveAdjustments.year, year)))
      .orderBy(desc(leaveAdjustments.createdAt));
    return rows.map(({ a, typeName, byName }) => ({ id: a.id, typeName, year: a.year, days: a.days, note: a.note, byName, createdAt: a.createdAt.toISOString() }));
  }

  async adjust(actor: User, input: LeaveAdjustmentInput, ip: string | null) {
    const [u] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, input.userId));
    const [t] = await this.db.select().from(leaveTypes).where(eq(leaveTypes.id, input.typeId));
    if (!u || !t) throw new BadRequestException('Pick a person and a leave type.');
    if (t.yearlyDays === null) throw new BadRequestException({ message: `${t.name} doesn’t keep a balance.`, errors: { typeId: ['No balance kept for this type'] } });
    await this.db.insert(leaveAdjustments).values({ ...input, createdById: actor.id });
    await this.audit.record({ actorId: actor.id, action: 'leave.adjust', entityType: 'user', entityId: input.userId, after: input, ip });
    return this.balances(actor, input.userId, input.year);
  }

  /* ================================================================ */
  /* Who sees and approves                                             */
  /* ================================================================ */

  /** The person's manager approves; with no manager, or for leaders (not attendance-tracked), HR does. */
  private async approverOf(u: User): Promise<User | null> {
    if (!u.managerId || !u.attendanceTracked) return null;
    const [m] = await this.db.select().from(users).where(eq(users.id, u.managerId));
    return m && m.status === 'ACTIVE' && m.id !== u.id ? m : null;
  }

  private async mayView(actor: User, userId: string) {
    if (actor.id === userId || this.canManage(actor)) return;
    const [u] = await this.db.select({ managerId: users.managerId }).from(users).where(eq(users.id, userId));
    if (u?.managerId === actor.id) return;
    throw new ForbiddenException('You can see leave for yourself and the people you manage.');
  }

  private canDecide(actor: User, r: { userId: string; managerId: string | null; tracked: boolean }) {
    if (actor.id === r.userId) return false;
    if (this.canManage(actor)) return true;
    return r.tracked && r.managerId === actor.id;
  }

  /* ================================================================ */
  /* Requests                                                          */
  /* ================================================================ */

  private query() {
    const owner = alias(users, 'owner');
    const decider = alias(users, 'decider');
    const mgr = alias(users, 'mgr');
    return this.db
      .select({
        r: leaveRequests,
        userName: owner.fullName,
        managerId: owner.managerId,
        tracked: owner.attendanceTracked,
        departmentName: departments.name,
        typeName: leaveTypes.name,
        color: leaveTypes.color,
        decidedByName: decider.fullName,
        managerName: mgr.fullName,
        managerStatus: mgr.status,
      })
      .from(leaveRequests)
      .innerJoin(owner, eq(owner.id, leaveRequests.userId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.typeId))
      .leftJoin(departments, eq(departments.id, owner.departmentId))
      .leftJoin(decider, eq(decider.id, leaveRequests.decidedById))
      .leftJoin(mgr, eq(mgr.id, owner.managerId))
      .$dynamic();
  }

  private toDto(actor: User, today: string, row: Awaited<ReturnType<ReturnType<LeaveService['query']>['execute']>>[number]): LeaveRequestDto {
    const { r } = row;
    const hasManager = row.tracked && !!row.managerName && row.managerStatus === 'ACTIVE';
    const mine = r.userId === actor.id;
    return {
      id: r.id,
      userId: r.userId,
      userName: row.userName,
      departmentName: row.departmentName,
      typeId: r.typeId,
      typeName: row.typeName,
      color: row.color,
      startDate: r.startDate,
      endDate: r.endDate,
      days: r.days,
      reason: r.reason,
      status: r.status,
      approverName: hasManager ? row.managerName! : 'HR',
      decidedByName: row.decidedByName,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt.toISOString(),
      canDecide: r.status === 'PENDING' && this.canDecide(actor, { userId: r.userId, managerId: hasManager ? row.managerId : null, tracked: row.tracked }),
      canCancel:
        (mine && (r.status === 'PENDING' || (r.status === 'APPROVED' && r.startDate > today))) || (this.canManage(actor) && !mine && r.status === 'APPROVED'),
    };
  }

  async list(actor: User, q: LeaveListQuery): Promise<LeaveRequestDto[]> {
    const where: SQL[] = [];
    if (q.scope === 'mine') where.push(eq(leaveRequests.userId, actor.id));
    else if (q.scope === 'approvals') {
      const reports = this.db.select({ id: users.id }).from(users).where(and(eq(users.managerId, actor.id), eq(users.attendanceTracked, true)));
      if (!this.canManage(actor)) where.push(inArray(leaveRequests.userId, reports));
      where.push(ne(leaveRequests.userId, actor.id));
    } else {
      if (!this.canManage(actor)) {
        const reports = this.db.select({ id: users.id }).from(users).where(eq(users.managerId, actor.id));
        where.push(or(eq(leaveRequests.userId, actor.id), inArray(leaveRequests.userId, reports))!);
      }
    }
    if (q.userId) {
      await this.mayView(actor, q.userId);
      where.push(eq(leaveRequests.userId, q.userId));
    }
    if (q.status) where.push(eq(leaveRequests.status, q.status));
    if (q.year) where.push(sql`extract(year from ${leaveRequests.startDate}) = ${q.year}`);
    const rows = await this.query()
      .where(and(...where))
      .orderBy(q.scope === 'approvals' ? asc(leaveRequests.createdAt) : desc(leaveRequests.startDate))
      .limit(500);
    const today = await this.days.today();
    let out = rows.map((row) => this.toDto(actor, today, row));
    // HR sees everything in "approvals", but only what they can act on
    if (q.scope === 'approvals') out = out.filter((r) => r.status !== 'PENDING' || r.canDecide);
    return out;
  }

  private async one(actor: User, id: string) {
    const [row] = await this.query().where(eq(leaveRequests.id, id));
    if (!row) throw new NotFoundException('Leave request not found');
    await this.mayView(actor, row.r.userId);
    return row;
  }

  async get(actor: User, id: string) {
    return this.toDto(actor, await this.days.today(), await this.one(actor, id));
  }

  private async overlapping(userId: string, start: string, end: string, exceptId?: string) {
    return this.db
      .select({ id: leaveRequests.id, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, typeName: leaveTypes.name, status: leaveRequests.status })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.typeId))
      .where(
        and(
          eq(leaveRequests.userId, userId),
          inArray(leaveRequests.status, ['PENDING', 'APPROVED']),
          lte(leaveRequests.startDate, end),
          gte(leaveRequests.endDate, start),
          exceptId ? ne(leaveRequests.id, exceptId) : undefined,
        ),
      );
  }

  async preview(actor: User, typeId: string, start: string, end: string, userId = actor.id): Promise<LeavePreviewDto> {
    await this.mayView(actor, userId);
    if (end < start) throw new BadRequestException({ message: 'The last day must be on or after the first day', errors: { endDate: ['Before the first day'] } });
    if (Date.parse(end) - Date.parse(start) > LEAVE_MAX_SPAN_DAYS * 86_400_000) throw new BadRequestException(`Leave can cover up to ${LEAVE_MAX_SPAN_DAYS} days at a time.`);
    const { days, dates } = await this.countDays(userId, start, end);
    const bal = (await this.balances(actor, userId, yearOf(start))).find((b) => b.typeId === typeId);
    return {
      days,
      dates,
      remainingAfter: bal?.remaining == null ? null : bal.remaining - bal.pending - days,
      overlaps: await this.overlapping(userId, start, end),
    };
  }

  async create(actor: User, input: LeaveRequestInput, ip: string | null): Promise<LeaveRequestDto> {
    const [type] = await this.db.select().from(leaveTypes).where(eq(leaveTypes.id, input.typeId));
    if (!type || !type.active) throw new BadRequestException({ message: 'Pick a leave type', errors: { typeId: ['Not available'] } });
    const today = await this.days.today();
    if (input.startDate < addDays(today, -LEAVE_MAX_BACK_DAYS)) {
      throw new BadRequestException({ message: `Leave can be filed up to ${LEAVE_MAX_BACK_DAYS} days back. Ask HR for older dates.`, errors: { startDate: ['Too far back'] } });
    }
    if (input.endDate > addDays(today, LEAVE_MAX_AHEAD_DAYS)) throw new BadRequestException({ message: 'That’s more than a year ahead.', errors: { endDate: ['Too far ahead'] } });
    const p = await this.preview(actor, input.typeId, input.startDate, input.endDate);
    if (p.days === 0) throw new BadRequestException({ message: 'Those dates are all rest days or holidays, so there’s nothing to file.', errors: { endDate: ['No working days'] } });
    if (p.overlaps.length) {
      const o = p.overlaps[0];
      throw new ConflictException({ message: `You already have ${o.typeName.toLowerCase()} on ${range(o.startDate, o.endDate)}. Cancel or change that one first.`, code: 'OVERLAP' });
    }
    if (p.remainingAfter !== null && p.remainingAfter < 0) {
      const left = p.remainingAfter + p.days;
      throw new BadRequestException({ message: `Not enough ${type.name.toLowerCase()} left: ${formatDays(Math.max(0, left))} available (including requests waiting for approval).`, code: 'BALANCE' });
    }
    const [r] = await this.db.insert(leaveRequests).values({ ...input, userId: actor.id, days: p.days }).returning();
    await this.audit.record({ actorId: actor.id, action: 'leave.request', entityType: 'leave_request', entityId: r.id, after: { ...input, days: p.days }, ip });

    const approver = await this.approverOf(actor);
    const to = approver ? [approver] : await this.notices.hrPeople();
    await this.notices.send(
      to.filter((u) => u.id !== actor.id),
      {
        kind: 'leaveRequests',
        title: `${actor.fullName} filed leave`,
        body: `${actor.fullName} asked for ${type.name.toLowerCase()}, ${range(input.startDate, input.endDate)} (${formatDays(p.days)}): “${input.reason}”`,
        link: `/leave?open=${r.id}`,
        actionLabel: 'Review the request',
        subject: `Leave request from ${actor.fullName}`,
        footer: 'You get this email because you approve this person’s leave.',
      },
    );
    for (const u of to) this.presence.notify(u.id, 'leave:changed', { id: r.id });
    return this.get(actor, r.id);
  }

  async decide(actor: User, id: string, input: LeaveDecisionInput, ip: string | null): Promise<LeaveRequestDto> {
    const row = await this.one(actor, id);
    const dto = this.toDto(actor, await this.days.today(), row);
    if (!dto.canDecide) throw new ForbiddenException(row.r.status !== 'PENDING' ? 'This request was already decided.' : 'You can’t decide this request.');
    if (input.approve) {
      // re-check: things may have changed since it was filed
      const overlap = await this.overlapping(row.r.userId, row.r.startDate, row.r.endDate, id);
      if (overlap.some((o) => o.status === 'APPROVED')) throw new ConflictException('These dates overlap leave that’s already approved.');
    }
    const [r] = await this.db
      .update(leaveRequests)
      .set({ status: input.approve ? 'APPROVED' : 'REJECTED', decidedById: actor.id, decidedAt: new Date(), decisionNote: input.note || null })
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, 'PENDING')))
      .returning();
    if (!r) throw new ConflictException('This request was already decided.');
    await this.audit.record({ actorId: actor.id, action: input.approve ? 'leave.approve' : 'leave.reject', entityType: 'leave_request', entityId: id, after: { note: input.note ?? null }, ip });
    if (input.approve) await this.refreshTimesheet(r);
    const [owner] = await this.db.select().from(users).where(eq(users.id, r.userId));
    if (owner) {
      await this.notices.send([owner], {
        kind: 'leaveDecisions',
        title: input.approve ? 'Leave approved' : 'Leave not approved',
        body: `${actor.fullName} ${input.approve ? 'approved' : 'did not approve'} your ${row.typeName.toLowerCase()} for ${range(r.startDate, r.endDate)}.${input.note ? ` Note: ${input.note}` : ''}`,
        link: `/leave?open=${r.id}`,
        actionLabel: 'Open Leave',
        subject: input.approve ? `Leave approved: ${range(r.startDate, r.endDate)}` : `Leave not approved: ${range(r.startDate, r.endDate)}`,
        footer: 'You get this email when leave you filed is decided.',
      });
      this.presence.notify(owner.id, 'leave:changed', { id });
    }
    return this.get(actor, id);
  }

  async cancel(actor: User, id: string, ip: string | null) {
    const row = await this.one(actor, id);
    const dto = this.toDto(actor, await this.days.today(), row);
    if (!dto.canCancel) throw new ForbiddenException(row.r.status === 'APPROVED' ? 'Leave that has started can only be cancelled by HR.' : 'This request can’t be cancelled.');
    const wasApproved = row.r.status === 'APPROVED';
    await this.db.update(leaveRequests).set({ status: 'CANCELLED', decidedById: actor.id === row.r.userId ? row.r.decidedById : actor.id }).where(eq(leaveRequests.id, id));
    await this.audit.record({ actorId: actor.id, action: 'leave.cancel', entityType: 'leave_request', entityId: id, before: { status: row.r.status }, ip });
    if (wasApproved) await this.refreshTimesheet(row.r);
    this.presence.notify(row.r.userId, 'leave:changed', { id });
  }

  /** Recompute the timesheet for days of this leave up to today. */
  private async refreshTimesheet(r: Pick<LeaveRequest, 'userId' | 'startDate' | 'endDate'>) {
    const today = await this.days.today();
    const pairs: string[] = [];
    for (let d = r.startDate; d <= r.endDate && d <= today; d = addDays(d, 1)) pairs.push(`${r.userId}|${d}`);
    await this.days.recomputeMany(pairs);
  }

  /* ================================================================ */
  /* Team calendar                                                     */
  /* ================================================================ */

  async calendar(actor: User, q: LeaveCalendarQuery): Promise<LeaveCalendarEntryDto[]> {
    if (Date.parse(q.to) - Date.parse(q.from) > 62 * 86_400_000) throw new BadRequestException('Pick up to two months.');
    const where: SQL[] = [inArray(leaveRequests.status, ['APPROVED', 'PENDING']), lte(leaveRequests.startDate, q.to), gte(leaveRequests.endDate, q.from)];
    const manage = this.canManage(actor);
    if (q.departmentId) {
      const inDept = this.db.select({ id: users.id }).from(users).where(eq(users.departmentId, q.departmentId));
      where.push(inArray(leaveRequests.userId, inDept));
    }
    if (!manage) {
      const visible = this.db
        .select({ id: users.id })
        .from(users)
        .where(or(eq(users.managerId, actor.id), actor.departmentId ? eq(users.departmentId, actor.departmentId) : sql`false`, eq(users.id, actor.id)));
      where.push(inArray(leaveRequests.userId, visible));
    }
    const rows = await this.query().where(and(...where)).orderBy(asc(leaveRequests.startDate));
    return rows
      .map(({ r, ...x }) => {
        const close = manage || r.userId === actor.id || x.managerId === actor.id;
        // peers see approved leave only, without the type
        if (!close && r.status !== 'APPROVED') return null;
        return {
          id: r.id,
          userId: r.userId,
          userName: x.userName,
          departmentName: x.departmentName,
          startDate: r.startDate,
          endDate: r.endDate,
          typeName: close ? x.typeName : null,
          color: close ? x.color : '#64748b',
          status: r.status,
        };
      })
      .filter((x): x is LeaveCalendarEntryDto => !!x);
  }

  /* ================================================================ */
  /* Holidays                                                          */
  /* ================================================================ */

  async holidays(from: string, to: string): Promise<HolidayDto[]> {
    const rows = await this.db.select().from(holidays).where(and(gte(holidays.date, from), lte(holidays.date, to))).orderBy(asc(holidays.date));
    return rows.map((h) => ({ id: h.id, date: h.date, name: h.name, kind: h.kind }));
  }

  async saveHoliday(actor: User, input: HolidayInput, ip: string | null, id?: string): Promise<HolidayDto> {
    const [clash] = await this.db.select().from(holidays).where(eq(holidays.date, input.date));
    if (clash && clash.id !== id) throw new ConflictException({ message: `${human(input.date)} is already ${clash.name}.`, errors: { date: ['Already a holiday'] } });
    let before: string | null = null;
    let h;
    if (id) {
      const [old] = await this.db.select().from(holidays).where(eq(holidays.id, id));
      if (!old) throw new NotFoundException('Holiday not found');
      before = old.date;
      [h] = await this.db.update(holidays).set(input).where(eq(holidays.id, id)).returning();
    } else [h] = await this.db.insert(holidays).values(input).returning();
    await this.audit.record({ actorId: actor.id, action: id ? 'holiday.update' : 'holiday.create', entityType: 'holiday', entityId: h.id, after: input, ip });
    await this.holidayChanged([input.date, ...(before && before !== input.date ? [before] : [])]);
    return { id: h.id, date: h.date, name: h.name, kind: h.kind };
  }

  async deleteHoliday(actor: User, id: string, ip: string | null) {
    const [h] = await this.db.delete(holidays).where(eq(holidays.id, id)).returning();
    if (!h) throw new NotFoundException('Holiday not found');
    await this.audit.record({ actorId: actor.id, action: 'holiday.delete', entityType: 'holiday', entityId: id, before: { date: h.date, name: h.name }, ip });
    await this.holidayChanged([h.date]);
  }

  /** A holiday moved: recount leave that covers it, and refresh past timesheets for that date. */
  private async holidayChanged(dates: string[]) {
    const today = await this.days.today();
    for (const date of dates) {
      const affected = await this.db
        .select()
        .from(leaveRequests)
        .where(and(inArray(leaveRequests.status, ['PENDING', 'APPROVED']), lte(leaveRequests.startDate, date), gte(leaveRequests.endDate, date)));
      for (const r of affected) {
        const { days } = await this.countDays(r.userId, r.startDate, r.endDate);
        if (days !== r.days) await this.db.update(leaveRequests).set({ days }).where(eq(leaveRequests.id, r.id));
      }
      if (date <= today) {
        const people = await this.db.select({ id: users.id }).from(users).where(and(eq(users.status, 'ACTIVE'), eq(users.attendanceTracked, true)));
        await this.days.recomputeMany(people.map((p) => `${p.id}|${date}`));
      }
    }
  }
}
