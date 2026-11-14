import { Inject, Injectable } from '@nestjs/common';
import { addDays, isoWeekday, WorkSetup, zonedToUtc } from '@vo/shared';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { DB, Db } from '../db/client';
import { dayOverrides, holidays, leaveRequests, leaveTypes, scheduleAssignments, scheduleDays, users, workSchedules } from '../db/schema';
import { SettingsService } from '../settings/settings.service';
import type { DayPlan, Shift } from './engine';
import { shiftLabel } from './format';

export interface ResolvedPlan {
  plan: DayPlan;
  onsite: boolean;
  /** the time zone the person's schedule is written in */
  tz: string;
  /** '8:00 AM – 5:00 PM', or null when there's no shift */
  label: string | null;
  leaveNote: string | null;
  scheduleName: string | null;
}

interface ScheduleInfo {
  id: string;
  name: string;
  tz: string;
  days: Map<number, { startTime: string; endTime: string; onsite: boolean }>;
}

export function makeShift(date: string, startTime: string, endTime: string, tz: string): Shift {
  const start = zonedToUtc(date, startTime, tz);
  let end = zonedToUtc(date, endTime, tz);
  if (end <= start) end = zonedToUtc(addDays(date, 1), endTime, tz);
  return { start, end };
}

/** Everything needed to work out who should be working when, for a set of people and dates. */
export class PlanContext {
  constructor(
    private readonly setups: Map<string, WorkSetup>,
    private readonly assignments: Map<string, { scheduleId: string | null; effectiveFrom: string }[]>,
    private readonly schedules: Map<string, ScheduleInfo>,
    private readonly overrides: Map<string, typeof dayOverrides.$inferSelect>,
    readonly companyTz: string,
    /** approved leave by "userId:date" → leave type name */
    private readonly leave: Map<string, string> = new Map(),
    /** company holidays by date → name */
    readonly holidays: Map<string, string> = new Map(),
  ) {}

  /** The working plan from the schedule alone (no leave, no holidays): is this a work day? */
  isScheduledWorkday(userId: string, date: string): boolean {
    const o = this.overrides.get(`${userId}:${date}`);
    if (o?.kind === 'DAY_OFF') return false;
    if (o?.kind === 'SHIFT') return true;
    const sched = this.schedule(userId, date);
    if (sched) return !!sched.days.get(isoWeekday(date));
    return isoWeekday(date) <= 5; // no schedule: Monday to Friday
  }

  schedule(userId: string, date: string): ScheduleInfo | null {
    const list = this.assignments.get(userId) ?? [];
    const a = list.find((x) => x.effectiveFrom <= date); // sorted newest first
    return a?.scheduleId ? (this.schedules.get(a.scheduleId) ?? null) : null;
  }

  tz(userId: string, date: string): string {
    return this.schedule(userId, date)?.tz ?? this.companyTz;
  }

  resolve(userId: string, date: string): ResolvedPlan {
    const setup = this.setups.get(userId) ?? 'ONSITE';
    const sched = this.schedule(userId, date);
    const tz = sched?.tz ?? this.companyTz;
    const day = sched?.days.get(isoWeekday(date));
    const onsiteFor = (dayOnsite: boolean | null | undefined) =>
      setup === 'ONSITE' ? true : setup === 'REMOTE' ? false : (dayOnsite ?? true);
    const o = this.overrides.get(`${userId}:${date}`);
    if (o?.kind === 'LEAVE' || o?.kind === 'DAY_OFF') {
      return { plan: { kind: o.kind, note: o.note }, onsite: onsiteFor(day?.onsite), tz, label: null, leaveNote: o.note, scheduleName: sched?.name ?? null };
    }
    // company holidays, then approved leave (an HR override above wins over both)
    const holiday = this.holidays.get(date);
    if (holiday && o?.kind !== 'SHIFT') {
      return { plan: { kind: 'DAY_OFF', note: holiday }, onsite: onsiteFor(day?.onsite), tz, label: null, leaveNote: holiday, scheduleName: sched?.name ?? null };
    }
    const leave = this.leave.get(`${userId}:${date}`);
    if (leave && o?.kind !== 'SHIFT' && this.isScheduledWorkday(userId, date)) {
      return { plan: { kind: 'LEAVE', note: leave }, onsite: onsiteFor(day?.onsite), tz, label: null, leaveNote: leave, scheduleName: sched?.name ?? null };
    }
    if (o?.kind === 'SHIFT' && o.startTime && o.endTime) {
      return {
        plan: { kind: 'WORK', shift: makeShift(date, o.startTime, o.endTime, tz) },
        onsite: onsiteFor(o.onsite ?? day?.onsite),
        tz,
        label: shiftLabel(o.startTime, o.endTime),
        leaveNote: null,
        scheduleName: sched?.name ?? null,
      };
    }
    if (day) {
      return {
        plan: { kind: 'WORK', shift: makeShift(date, day.startTime, day.endTime, tz) },
        onsite: onsiteFor(day.onsite),
        tz,
        label: shiftLabel(day.startTime, day.endTime),
        leaveNote: null,
        scheduleName: sched!.name,
      };
    }
    return { plan: { kind: 'UNSCHEDULED' }, onsite: setup !== 'REMOTE', tz, label: null, leaveNote: null, scheduleName: sched?.name ?? null };
  }
}

@Injectable()
export class PlannerService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly settings: SettingsService,
  ) {}

  async context(userIds: string[], from: string, to: string): Promise<PlanContext> {
    const companyTz = (await this.settings.get()).defaultTimezone;
    const hols = await this.db.select().from(holidays).where(and(gte(holidays.date, from), lte(holidays.date, to)));
    const holidayMap = new Map(hols.map((h) => [h.date, h.name]));
    if (userIds.length === 0) return new PlanContext(new Map(), new Map(), new Map(), new Map(), companyTz, new Map(), holidayMap);
    const [people, assigns, overrides, leaves] = await Promise.all([
      this.db.select({ id: users.id, workSetup: users.workSetup }).from(users).where(inArray(users.id, userIds)),
      this.db.select().from(scheduleAssignments).where(inArray(scheduleAssignments.userId, userIds)),
      this.db
        .select()
        .from(dayOverrides)
        .where(and(inArray(dayOverrides.userId, userIds), gte(dayOverrides.workDate, from), lte(dayOverrides.workDate, to))),
      this.db
        .select({ userId: leaveRequests.userId, start: leaveRequests.startDate, end: leaveRequests.endDate, type: leaveTypes.name })
        .from(leaveRequests)
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.typeId))
        .where(and(inArray(leaveRequests.userId, userIds), eq(leaveRequests.status, 'APPROVED'), lte(leaveRequests.startDate, to), gte(leaveRequests.endDate, from))),
    ]);
    const leaveMap = new Map<string, string>();
    for (const l of leaves) {
      for (let d = l.start < from ? from : l.start; d <= l.end && d <= to; d = addDays(d, 1)) leaveMap.set(`${l.userId}:${d}`, l.type);
    }
    const scheduleIds = [...new Set(assigns.map((a) => a.scheduleId).filter((x): x is string => !!x))];
    const [scheds, days] = scheduleIds.length
      ? await Promise.all([
          this.db.select().from(workSchedules).where(inArray(workSchedules.id, scheduleIds)),
          this.db.select().from(scheduleDays).where(inArray(scheduleDays.scheduleId, scheduleIds)),
        ])
      : [[], []];

    const schedules = new Map<string, ScheduleInfo>();
    for (const s of scheds) schedules.set(s.id, { id: s.id, name: s.name, tz: s.timezone, days: new Map() });
    for (const d of days) schedules.get(d.scheduleId)?.days.set(d.weekday, d);

    const assignments = new Map<string, { scheduleId: string | null; effectiveFrom: string }[]>();
    for (const a of assigns) {
      const list = assignments.get(a.userId) ?? [];
      list.push({ scheduleId: a.scheduleId, effectiveFrom: a.effectiveFrom });
      assignments.set(a.userId, list);
    }
    for (const list of assignments.values()) list.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

    return new PlanContext(
      new Map(people.map((p) => [p.id, p.workSetup])),
      assignments,
      schedules,
      new Map(overrides.map((o) => [`${o.userId}:${o.workDate}`, o])),
      companyTz,
      leaveMap,
      holidayMap,
    );
  }
}
