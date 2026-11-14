import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ClockInput, ClockStateDto, MyDayDto, RangeQuery } from '@vo/shared';
import { addDays, dateRange, PUNCH_KIND_LABELS } from '@vo/shared';
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { DB, Db } from '../db/client';
import { attendanceDays, dailyReports, departments, User } from '../db/schema';
import { DayService } from './day.service';
import { toDayDto, toPunchDto } from './dto';
import { allowedActions } from './engine';

@Injectable()
export class ClockService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly days: DayService,
  ) {}

  /** The work date the clock card is about: a shift still open from yesterday, or today's. */
  private async currentWorkDate(user: User, now: Date): Promise<string> {
    const today = await this.days.today(now);
    const [open] = await this.db
      .select({ workDate: attendanceDays.workDate })
      .from(attendanceDays)
      .where(and(eq(attendanceDays.userId, user.id), isNotNull(attendanceDays.openSince), gte(attendanceDays.workDate, addDays(today, -1))))
      .orderBy(desc(attendanceDays.workDate))
      .limit(1);
    return open?.workDate ?? (await this.days.workDateFor(user.id, now));
  }

  async state(user: User, now = new Date()): Promise<ClockStateDto> {
    const tz = await this.days.companyTz();
    if (!user.attendanceTracked) {
      return { tracked: false, workDate: await this.days.today(now), timezone: tz, day: null, punches: [], allowed: [] };
    }
    const workDate = await this.currentWorkDate(user, now);
    const res = await this.days.recompute(user.id, workDate, now);
    const active = res?.punches.filter((r) => !r.punch.removedAt) ?? [];
    return {
      tracked: true,
      workDate,
      timezone: tz,
      day: res ? toDayDto(res.day) : null,
      punches: res ? res.punches.map((r) => toPunchDto(r, res.roles.get(r.punch.id))) : [],
      allowed: allowedActions(res?.result ?? null, active.length > 0),
    };
  }

  async clock(user: User, input: ClockInput, ip: string | null, now = new Date()): Promise<ClockStateDto> {
    if (!user.attendanceTracked) throw new ConflictException('Attendance isn’t tracked for you, so there’s no clock to use.');
    const state = await this.state(user, now);
    if (!state.allowed.includes(input.action)) {
      const label = PUNCH_KIND_LABELS[input.action].toLowerCase();
      throw new ConflictException({ message: `You can’t ${label} right now. Refresh to see your latest status.`, code: 'CLOCK_STATE' });
    }
    if (input.action === 'OUT') await this.requireDailyReport(user, state.workDate);
    // a fresh clock-in after yesterday's shift closed belongs to whatever date the rules pick
    const workDate = input.action === 'IN' && !state.day?.openSince ? await this.days.workDateFor(user.id, now) : state.workDate;
    await this.days.addPunch(
      {
        userId: user.id,
        workDate,
        source: 'WEB',
        kind: input.action,
        punchedAt: now,
        via: 'web',
        ip,
        location: 'Virtual Office',
        note: input.note ?? null,
        createdById: user.id,
      },
      now,
    );
    return this.state(user, now);
  }

  /** Phase 6: some departments ask for an end-of-day report before a web clock-out (biometric punches are never blocked). */
  private async requireDailyReport(user: User, workDate: string) {
    if (!user.departmentId) return;
    const [d] = await this.db.select({ required: departments.requireDailyReport }).from(departments).where(eq(departments.id, user.departmentId));
    if (!d?.required) return;
    const [r] = await this.db
      .select({ id: dailyReports.id })
      .from(dailyReports)
      .where(and(eq(dailyReports.userId, user.id), eq(dailyReports.workDate, workDate)));
    if (!r) throw new ConflictException({ message: 'Your team asks for an end-of-day report before you clock out.', code: 'DAILY_REPORT_REQUIRED', workDate });
  }

  /** My days in a date range (Attendance page), newest first. At most 62 days. */
  async myDays(user: User, q: RangeQuery, now = new Date()): Promise<MyDayDto[]> {
    const today = await this.days.today(now);
    const to = q.to > today ? today : q.to;
    const dates = dateRange(q.from, to).slice(-62);
    const out: MyDayDto[] = [];
    for (const date of dates) {
      const res = user.attendanceTracked ? await this.days.recompute(user.id, date, now) : null;
      out.push({ date, day: res ? toDayDto(res.day) : null, punches: res ? res.punches.map((r) => toPunchDto(r, res.roles.get(r.punch.id))) : [] });
    }
    return out.reverse();
  }
}
