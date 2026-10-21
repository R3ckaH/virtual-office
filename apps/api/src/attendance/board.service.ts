import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  addDays,
  BoardDto,
  BoardRowDto,
  DAY_STATUS_LABELS,
  DayDetailDto,
  LivePunchDto,
  localDate,
  PUNCH_KIND_LABELS,
  WORKING_STATUSES,
  zonedToUtc,
} from '@vo/shared';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, SQL } from 'drizzle-orm';
import { DB, Db } from '../db/client';
import {
  AttendanceDay,
  attendanceDays,
  attendanceExceptions,
  correctionRequests,
  departments,
  deviceUserLinks,
  devices,
  punches,
  users,
} from '../db/schema';
import { DayService } from './day.service';
import { personRef, toDayDto, toPunchDto } from './dto';
import { clockTime } from './format';
import { PlannerService } from './planner.service';
import { RulesService } from './rules.service';

const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@Injectable()
export class BoardService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly days: DayService,
    private readonly planner: PlannerService,
    private readonly rules: RulesService,
  ) {}

  private peopleQuery(where: SQL) {
    return this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        title: users.title,
        avatarUrl: users.avatarUrl,
        departmentName: departments.name,
        workSetup: users.workSetup,
      })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(where)
      .orderBy(asc(users.fullName));
  }

  /** Today's board (or any date's): one row per tracked person. `userIds` limits it (managers' team view). */
  async board(date: string | undefined, userIds: string[] | null, now = new Date()): Promise<BoardDto> {
    const tz = await this.days.companyTz();
    const today = localDate(now, tz);
    const D = date ?? today;
    const prevD = addDays(D, -1);
    const scope = userIds ? [inArray(users.id, userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'])] : [];
    const people = await this.peopleQuery(and(eq(users.status, 'ACTIVE'), eq(users.attendanceTracked, true), ...scope)!);
    const untracked = userIds
      ? []
      : await this.db
          .select({ fullName: users.fullName })
          .from(users)
          .where(and(eq(users.status, 'ACTIVE'), eq(users.attendanceTracked, false)))
          .orderBy(asc(users.fullName));
    const ids = people.map((p) => p.id);
    const ctx = await this.planner.context(ids, prevD, D);

    const loadDays = async () =>
      ids.length
        ? this.db
            .select()
            .from(attendanceDays)
            .where(and(inArray(attendanceDays.userId, ids), inArray(attendanceDays.workDate, [prevD, D])))
        : [];
    let dayRows = await loadDays();
    // Statuses depend on the time ("no punch yet", "missing clock-out"), so refresh anything older than a minute.
    // The minute job usually has; this covers a fresh start or a paused job.
    if (D <= today && (D === today || addDays(D, 1) === today)) {
      const fresh = new Set(
        dayRows.filter((d) => now.getTime() - d.computedAt.getTime() < 60_000).map((d) => `${d.userId}|${d.workDate}`),
      );
      const existing = new Set(dayRows.map((d) => `${d.userId}|${d.workDate}`));
      let changed = false;
      for (const id of ids) {
        for (const date of [prevD, D]) {
          const key = `${id}|${date}`;
          if (fresh.has(key) || (date === prevD && !existing.has(key))) continue;
          await this.days.recompute(id, date, now, ctx);
          changed = true;
        }
      }
      if (changed) dayRows = await loadDays();
    } else {
      const has = new Set(dayRows.map((d) => `${d.userId}|${d.workDate}`));
      const missing = ids.filter((id) => !has.has(`${id}|${D}`));
      for (const id of missing) await this.days.recompute(id, D, now, ctx);
      if (missing.length) dayRows = await loadDays();
    }
    const dayMap = new Map(dayRows.map((d) => [`${d.userId}|${d.workDate}`, d]));

    const midnight = zonedToUtc(D, '00:00', tz);
    const pick = (userId: string): AttendanceDay | null => {
      const cur = dayMap.get(`${userId}|${D}`) ?? null;
      const prev = dayMap.get(`${userId}|${prevD}`) ?? null;
      const prevRunsIntoToday = !!prev && (!!prev.openSince || (!!prev.scheduleEnd && prev.scheduleEnd > midnight));
      const curNotStarted = !cur || (!cur.firstIn && (!cur.scheduleStart || now < cur.scheduleStart));
      if (D === today && prev && prevRunsIntoToday && curNotStarted && prev.firstIn) return prev;
      return cur;
    };

    const punchRows = ids.length
      ? await this.db
          .select({ userId: punches.userId, workDate: punches.workDate, at: punches.punchedAt, source: punches.source, removedAt: punches.removedAt })
          .from(punches)
          .where(and(inArray(punches.userId, ids), inArray(punches.workDate, [prevD, D])))
      : [];
    const linked = new Set(
      (await this.db.select({ userId: deviceUserLinks.userId }).from(deviceUserLinks)).map((l) => l.userId).filter(Boolean),
    );
    const rules = await this.rules.get();

    const rows: BoardRowDto[] = people.map((p) => {
      const day = pick(p.id);
      const plan = ctx.resolve(p.id, day?.workDate ?? D);
      const mine = day ? punchRows.filter((x) => x.userId === p.id && x.workDate === day.workDate && !x.removedAt) : [];
      const inPunch = day?.firstIn ? mine.find((x) => x.at.getTime() === day.firstIn!.getTime()) : undefined;
      const bothSources = mine.some((x) => x.source === 'WEB') && mine.some((x) => x.source === 'DEVICE');
      let note: string | null = day?.note ?? null;
      if (!note && plan.leaveNote) note = plan.leaveNote;
      if (!note && day && day.mergedCount > 0) note = `${day.mergedCount + 1} punches merged`;
      if (!note && day?.firstIn && day.scheduleStart && day.lateMinutes === 0 && day.firstIn > day.scheduleStart) {
        note = `Within ${rules.graceMinutes}-min grace`;
      }
      if (!note && p.workSetup !== 'REMOTE' && !linked.has(p.id)) note = 'No badge linked';
      return {
        user: personRef(p),
        workSetup: p.workSetup,
        scheduleLabel: plan.label,
        day: day ? toDayDto(day) : null,
        inSource: inPunch?.source ?? null,
        bothSources,
        note,
      };
    });

    const working = rows.filter((r) => r.day && WORKING_STATUSES.includes(r.day.status));
    const exceptionScope = userIds ? [inArray(attendanceExceptions.userId, ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])] : [];
    const [[{ openExceptions }], [{ pendingCorrections }]] = await Promise.all([
      this.db
        .select({ openExceptions: count() })
        .from(attendanceExceptions)
        .where(and(eq(attendanceExceptions.status, 'OPEN'), gte(attendanceExceptions.workDate, addDays(D, -7)), ...exceptionScope)),
      this.db.select({ pendingCorrections: count() }).from(correctionRequests).where(eq(correctionRequests.status, 'PENDING_HR')),
    ]);

    return {
      date: D,
      timezone: tz,
      generatedAt: now.toISOString(),
      kpis: {
        working: working.length,
        onsite: working.filter((r) => r.day!.onsite).length,
        remote: working.filter((r) => !r.day!.onsite).length,
        late: rows.filter((r) => r.day?.status === 'LATE' || r.day?.status === 'EXCUSED').length,
        noPunch: rows.filter((r) => r.day?.status === 'NO_PUNCH').length,
        onLeave: rows.filter((r) => r.day?.status === 'LEAVE').length,
        openExceptions,
        pendingCorrections,
      },
      rows,
      untracked: { count: untracked.length, names: untracked.map((u) => u.fullName) },
    };
  }

  /** The most recent punches, newest first (the "Live punches" strip). */
  async live(limit = 8, userIds: string[] | null = null): Promise<LivePunchDto[]> {
    const where: SQL[] = [isNull(punches.removedAt), eq(punches.merged, false)];
    if (userIds) where.push(inArray(punches.userId, userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']));
    const rows = await this.db
      .select({ punch: punches, name: users.fullName, deviceName: devices.name })
      .from(punches)
      .leftJoin(users, eq(users.id, punches.userId))
      .leftJoin(devices, eq(devices.id, punches.deviceId))
      .where(and(...where))
      .orderBy(desc(punches.punchedAt))
      .limit(limit);
    // label device punches by their place in the day: first = clock in, then break out / back
    const dayKeys = [...new Set(rows.filter((r) => r.punch.userId && !r.punch.kind).map((r) => `${r.punch.userId}|${r.punch.workDate}`))];
    const order = new Map<string, number>();
    const lastOut = new Map<string, number>();
    for (const key of dayKeys) {
      const [userId, workDate] = key.split('|');
      const ps = await this.db
        .select({ id: punches.id })
        .from(punches)
        .where(and(eq(punches.userId, userId), eq(punches.workDate, workDate), isNull(punches.removedAt), eq(punches.merged, false)))
        .orderBy(asc(punches.punchedAt));
      ps.forEach((x, i) => order.set(x.id, i));
      const [d] = await this.db
        .select({ lastOut: attendanceDays.lastOut })
        .from(attendanceDays)
        .where(and(eq(attendanceDays.userId, userId), eq(attendanceDays.workDate, workDate)));
      if (d?.lastOut) lastOut.set(key, d.lastOut.getTime());
    }
    return rows.map(({ punch: p, name, deviceName }) => {
      let what: string;
      if (!p.userId) what = 'Unlinked punch';
      else if (p.kind) what = PUNCH_KIND_LABELS[p.kind];
      else if (lastOut.get(`${p.userId}|${p.workDate}`) === p.punchedAt.getTime()) what = 'Clock out';
      else {
        const i = order.get(p.id) ?? 0;
        what = i === 0 ? 'Clock in' : i % 2 === 1 ? 'Break out' : 'Back from break';
      }
      return {
        id: p.id,
        at: p.punchedAt.toISOString(),
        userId: p.userId,
        name: name ?? `Badge ${p.deviceUserId}`,
        what,
        source: p.source,
        where: deviceName ?? p.location,
      };
    });
  }

  /** The person drawer: their day, punches and the last five days' hours. */
  async detail(userId: string, date: string | undefined, now = new Date()): Promise<DayDetailDto> {
    const [p] = await this.peopleQuery(eq(users.id, userId));
    if (!p) throw new NotFoundException('Person not found');
    const D = date ?? (await this.days.today(now));
    const res = await this.days.recompute(userId, D, now);
    const from = addDays(D, -4);
    const week = await this.db
      .select({ workDate: attendanceDays.workDate, workedMinutes: attendanceDays.workedMinutes, status: attendanceDays.status })
      .from(attendanceDays)
      .where(and(eq(attendanceDays.userId, userId), gte(attendanceDays.workDate, from), lte(attendanceDays.workDate, D)));
    const byDate = new Map(week.map((w) => [w.workDate, w]));
    const ctx = res ? null : await this.planner.context([userId], D, D);
    const plan = res?.plan ?? ctx!.resolve(userId, D);
    return {
      user: personRef(p),
      workSetup: p.workSetup,
      scheduleLabel: plan.label,
      day: res ? toDayDto(res.day) : null,
      punches: res ? res.punches.map((r) => toPunchDto(r, res.roles.get(r.punch.id))) : [],
      week: Array.from({ length: 5 }, (_, i) => {
        const d = addDays(from, i);
        const w = byDate.get(d);
        return { date: d, workedMinutes: w?.workedMinutes ?? 0, status: w?.status ?? null };
      }),
      leaveNote: plan.leaveNote,
    };
  }

  /** Timesheet CSV for payroll, one row per person per day, times in company time. */
  async exportCsv(from: string, to: string): Promise<string> {
    const tz = await this.days.companyTz();
    const rows = await this.db
      .select({ day: attendanceDays, name: users.fullName, email: users.email, dept: departments.name })
      .from(attendanceDays)
      .innerJoin(users, eq(users.id, attendanceDays.userId))
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(and(gte(attendanceDays.workDate, from), lte(attendanceDays.workDate, to)))
      .orderBy(asc(users.fullName), asc(attendanceDays.workDate));
    const t = (d: Date | null) => (d ? clockTime(d, tz) : '');
    const header = [
      'Employee',
      'Email',
      'Department',
      'Date',
      'Scheduled start',
      'Scheduled end',
      'Clock in',
      'Clock out',
      'Hours worked',
      'Break minutes',
      'Late minutes',
      'Status',
      'Excused',
      'Note',
    ];
    const lines = rows.map(({ day: d, name, email, dept }) =>
      [
        name,
        email,
        dept,
        d.workDate,
        t(d.scheduleStart),
        t(d.scheduleEnd),
        t(d.firstIn),
        t(d.lastOut),
        (d.workedMinutes / 60).toFixed(2),
        d.breakMinutes,
        d.lateMinutes,
        DAY_STATUS_LABELS[d.status],
        d.excused ? 'Yes' : '',
        d.note,
      ]
        .map(csvCell)
        .join(','),
    );
    return [header.join(','), ...lines].join('\r\n') + '\r\n';
  }
}
