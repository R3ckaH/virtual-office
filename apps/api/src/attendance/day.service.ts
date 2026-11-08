import { Inject, Injectable } from '@nestjs/common';
import { addDays, AttendanceRules, localDate } from '@vo/shared';
import { and, asc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DomainEvents } from '../common/domain-events';
import { DB, Db } from '../db/client';
import { AttendanceDay, attendanceDays, attendanceExceptions, devices, Punch, punches, users } from '../db/schema';
import { SettingsService } from '../settings/settings.service';
import { DesiredException, assignWorkDate, computeDay, EngineResult, PunchRole } from './engine';
import { PunchRow } from './dto';
import { PlanContext, PlannerService, ResolvedPlan } from './planner.service';
import { RulesService } from './rules.service';

const creator = alias(users, 'creator');

export interface RecomputeResult {
  day: AttendanceDay;
  roles: Map<string, PunchRole>;
  plan: ResolvedPlan;
  punches: PunchRow[];
  result: EngineResult;
}

type NewPunch = typeof punches.$inferInsert;

/** Rebuilds attendance days from punches and keeps each day's exceptions in step. */
@Injectable()
export class DayService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly planner: PlannerService,
    private readonly rules: RulesService,
    private readonly settings: SettingsService,
    private readonly domain: DomainEvents,
  ) {}

  async companyTz(): Promise<string> {
    return (await this.settings.get()).defaultTimezone;
  }

  async today(now = new Date()): Promise<string> {
    return localDate(now, await this.companyTz());
  }

  /** Punches for one person and work date, with device and creator names. */
  async punchRows(userId: string, workDate: string): Promise<PunchRow[]> {
    const rows = await this.db
      .select({ punch: punches, deviceName: devices.name, createdByName: creator.fullName })
      .from(punches)
      .leftJoin(devices, eq(devices.id, punches.deviceId))
      .leftJoin(creator, eq(creator.id, punches.createdById))
      .where(and(eq(punches.userId, userId), eq(punches.workDate, workDate)))
      .orderBy(asc(punches.punchedAt));
    return rows.map((r) => ({ punch: r.punch, deviceName: r.deviceName ?? null, createdByName: r.createdByName ?? null }));
  }

  /** Recomputes one person's day. Returns null for people whose attendance isn't tracked. */
  async recompute(userId: string, workDate: string, now = new Date(), ctx?: PlanContext): Promise<RecomputeResult | null> {
    const [user] = await this.db
      .select({ tracked: users.attendanceTracked, status: users.status })
      .from(users)
      .where(eq(users.id, userId));
    if (!user || !user.tracked) return null;

    ctx ??= await this.planner.context([userId], workDate, workDate);
    const plan = ctx.resolve(userId, workDate);
    const rules = await this.rules.get();
    let rows = await this.punchRows(userId, workDate);
    const [existing] = await this.db
      .select()
      .from(attendanceDays)
      .where(and(eq(attendanceDays.userId, userId), eq(attendanceDays.workDate, workDate)));

    const run = () =>
      computeDay({
        now,
        plan: plan.plan,
        onsite: plan.onsite,
        punches: rows.map((r) => ({
          id: r.punch.id,
          at: r.punch.punchedAt,
          source: r.punch.source,
          kind: r.punch.kind,
          removed: !!r.punch.removedAt,
        })),
        rules,
        excused: existing?.excused ?? false,
        preferSource: existing?.preferSource ?? null,
      });

    let result = run();
    if (result.autoClockOutAt) {
      await this.db.insert(punches).values({
        userId,
        workDate,
        source: 'SYSTEM',
        kind: 'OUT',
        punchedAt: result.autoClockOutAt,
        via: 'auto',
        note: `Automatic clock-out after ${rules.autoClockOutHours} hours with no clock-out`,
      });
      rows = await this.punchRows(userId, workDate);
      result = run();
    }

    // keep the stored "merged" flag in step with the rules
    const merged = new Set(result.mergedIds);
    const flip = rows.filter((r) => r.punch.merged !== merged.has(r.punch.id));
    for (const r of flip) {
      await this.db.update(punches).set({ merged: !r.punch.merged }).where(eq(punches.id, r.punch.id));
      r.punch.merged = !r.punch.merged;
    }

    const shift = plan.plan.kind === 'WORK' ? plan.plan.shift : null;
    const values = {
      userId,
      workDate,
      status: result.status,
      scheduleStart: shift?.start ?? null,
      scheduleEnd: shift?.end ?? null,
      onsite: plan.onsite,
      firstIn: result.firstIn,
      lastOut: result.lastOut,
      openSince: result.openSince,
      workedMinutes: result.workedMinutes,
      breakMinutes: result.breakMinutes,
      lateMinutes: result.lateMinutes,
      mergedCount: result.mergedIds.length,
      computedAt: now,
    };
    const [day] = await this.db
      .insert(attendanceDays)
      .values(values)
      .onConflictDoUpdate({ target: [attendanceDays.userId, attendanceDays.workDate], set: values })
      .returning();

    await this.syncExceptions(userId, workDate, this.enrich(result.exceptions, result, rows, plan), rules);
    return { day, roles: result.roles, plan, punches: rows, result };
  }

  /** Adds the schedule and punch details the exception texts need. */
  private enrich(desired: DesiredException[], r: EngineResult, rows: PunchRow[], plan: ResolvedPlan): DesiredException[] {
    const shift = plan.plan.kind === 'WORK' ? plan.plan.shift : null;
    const base = {
      scheduleLabel: plan.label,
      scheduleStart: shift?.start.toISOString() ?? null,
      scheduleEnd: shift?.end.toISOString() ?? null,
    };
    const byTime = (at: Date | null) => (at ? rows.find((x) => x.punch.punchedAt.getTime() === at.getTime()) : undefined);
    const where = (row?: PunchRow) => row?.punch.location ?? row?.deviceName ?? null;
    return desired.map((d) => {
      const data: Record<string, unknown> = { ...base, ...d.data };
      if (d.type === 'LATE') {
        const first = byTime(r.firstIn);
        data.source = first?.punch.source ?? null;
        data.where = where(first);
      }
      if (d.type === 'MISMATCH') {
        data.webWhere = where(byTime(r.firstWebAt));
        data.deviceWhere = where(byTime(r.firstDeviceAt));
      }
      if (d.type === 'MISSING_OUT') {
        const auto = rows.find((x) => x.punch.source === 'SYSTEM' && !x.punch.removedAt);
        if (auto) data.autoOutAt = auto.punch.punchedAt.toISOString();
      }
      return { type: d.type, data };
    });
  }

  private async syncExceptions(userId: string, workDate: string, desired: DesiredException[], _rules: AttendanceRules) {
    const existing = await this.db
      .select()
      .from(attendanceExceptions)
      .where(
        and(
          eq(attendanceExceptions.userId, userId),
          eq(attendanceExceptions.workDate, workDate),
          ne(attendanceExceptions.type, 'UNLINKED_BADGE'),
        ),
      );
    const byType = new Map(existing.map((e) => [e.type, e]));
    for (const d of desired) {
      const e = byType.get(d.type);
      if (!e) {
        await this.db
          .insert(attendanceExceptions)
          .values({ key: `${d.type}:${userId}:${workDate}`, type: d.type, userId, workDate, data: d.data })
          .onConflictDoNothing();
      } else if (e.status === 'OPEN' || e.status === 'DISMISSED') {
        await this.db.update(attendanceExceptions).set({ status: 'OPEN', data: d.data }).where(eq(attendanceExceptions.id, e.id));
      }
    }
    const wanted = new Set(desired.map((d) => d.type));
    const stale = existing.filter((e) => e.status === 'OPEN' && !wanted.has(e.type)).map((e) => e.id);
    if (stale.length) {
      await this.db
        .update(attendanceExceptions)
        .set({ status: 'DISMISSED', resolution: 'No longer applies' })
        .where(inArray(attendanceExceptions.id, stale));
    }
  }

  /**
   * Builds a function that gives the work date for (person, time), loading schedules and yesterday's
   * open shifts once for the whole time range (used by imports and badge links).
   */
  async workDateResolver(userIds: string[], from: Date, to: Date): Promise<(userId: string, at: Date) => string> {
    const companyTz = await this.companyTz();
    const lo = addDays(localDate(from, companyTz), -2);
    const hi = addDays(localDate(to, companyTz), 1);
    const ctx = await this.planner.context(userIds, lo, hi);
    const rules = await this.rules.get();
    const open = userIds.length
      ? await this.db
          .select({ userId: attendanceDays.userId, workDate: attendanceDays.workDate, openSince: attendanceDays.openSince, firstIn: attendanceDays.firstIn })
          .from(attendanceDays)
          .where(and(inArray(attendanceDays.userId, userIds), gte(attendanceDays.workDate, lo), lte(attendanceDays.workDate, hi)))
      : [];
    const openFirstIn = new Map(open.filter((d) => d.openSince).map((d) => [`${d.userId}|${d.workDate}`, d.firstIn]));
    return (userId, at) => {
      const date = localDate(at, ctx.tz(userId, localDate(at, companyTz)));
      const prevDate = addDays(date, -1);
      const prev = ctx.resolve(userId, prevDate);
      const today = ctx.resolve(userId, date);
      return assignWorkDate({
        at,
        date,
        prevDate,
        prevShift: prev.plan.kind === 'WORK' ? prev.plan.shift : null,
        prevOpenFirstIn: openFirstIn.get(`${userId}|${prevDate}`) ?? null,
        todayShift: today.plan.kind === 'WORK' ? today.plan.shift : null,
        rules,
      });
    };
  }

  /** The work date a punch at `at` belongs to for this person. */
  async workDateFor(userId: string, at: Date): Promise<string> {
    return (await this.workDateResolver([userId], at, at))(userId, at);
  }

  /** Inserts a punch for a known person (work date worked out if not given) and recomputes that day. */
  async addPunch(p: Omit<NewPunch, 'workDate'> & { userId: string; workDate?: string }, now = new Date()) {
    const workDate = p.workDate ?? (await this.workDateFor(p.userId, p.punchedAt));
    const [row] = await this.db.insert(punches).values({ ...p, workDate }).returning();
    const res = await this.recompute(p.userId, workDate, now);
    this.domain.emit('punch', { userId: p.userId, kind: row.kind, punchedAt: row.punchedAt });
    return { punch: row as Punch, workDate, res };
  }

  /** Recomputes several (person, date) pairs, e.g. after an import or a badge link. */
  async recomputeMany(pairs: Iterable<string>, now = new Date()) {
    for (const key of new Set(pairs)) {
      const [userId, date] = key.split('|');
      await this.recompute(userId, date, now);
    }
  }
}
