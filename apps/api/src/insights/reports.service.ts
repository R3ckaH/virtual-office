import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  AUTH_EVENT_LABELS,
  DAY_STATUS_LABELS,
  EARLY_OUT_MIN_MINUTES,
  hasPermission,
  LEAVE_STATUS_LABELS,
  OVERTIME_MIN_MINUTES,
  REPORT_INFO,
  ReportColumn,
  ReportDto,
  ReportKind,
  ReportQuery,
} from '@vo/shared';
import { and, asc, eq, gte, inArray, lt, lte, or, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DayService } from '../attendance/day.service';
import { DB, Db } from '../db/client';
import { attendanceDays, authEvents, departments, leaveRequests, leaveTypes, meetingAttendance, meetings, User, users } from '../db/schema';
import { zonedToUtc, addDays } from '@vo/shared';

const MIN = 60_000;
const mins = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MIN);
const fmtRange = (from: string, to: string) => {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  return from === to ? f(from, { month: 'short', day: 'numeric', year: 'numeric' }) : `${f(from, { month: 'short', day: 'numeric' })} – ${f(to, { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

interface Scope {
  ids: string[] | null; // null = everyone
  label: string;
}

/**
 * Admin and HR reports over any period (up to a year); managers get the same reports for their
 * direct reports. Login history is for admins (who can read the sign-in log) only.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly days: DayService,
  ) {}

  private all = (u: User) => u.role === 'ADMIN' || hasPermission(u.role, 'attendance.manage');

  private async scope(actor: User, q: ReportQuery): Promise<Scope> {
    const where: SQL[] = [];
    if (!this.all(actor)) where.push(eq(users.managerId, actor.id));
    if (q.departmentId) where.push(eq(users.departmentId, q.departmentId));
    if (q.userId) where.push(eq(users.id, q.userId));
    const parts: string[] = [];
    if (q.departmentId) {
      const [d] = await this.db.select({ name: departments.name }).from(departments).where(eq(departments.id, q.departmentId));
      parts.push(d?.name ?? 'Department');
    }
    if (q.userId) {
      const [u] = await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, q.userId));
      parts.push(u?.name ?? 'Person');
    }
    if (!this.all(actor)) parts.unshift('Your team');
    if (!where.length) return { ids: null, label: parts.join(' · ') || 'Everyone' };
    const rows = await this.db.select({ id: users.id }).from(users).where(and(...where));
    return { ids: rows.map((r) => r.id), label: parts.join(' · ') };
  }

  private people(ids: string[] | null) {
    return this.db
      .select({ id: users.id, fullName: users.fullName, email: users.email, departmentName: departments.name, tracked: users.attendanceTracked, status: users.status })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(ids ? inArray(users.id, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']) : undefined)
      .orderBy(asc(users.fullName));
  }

  private async daysFor(ids: string[] | null, from: string, to: string) {
    const where: SQL[] = [gte(attendanceDays.workDate, from), lte(attendanceDays.workDate, to)];
    if (ids) where.push(inArray(attendanceDays.userId, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']));
    return this.db.select().from(attendanceDays).where(and(...where)).orderBy(asc(attendanceDays.workDate));
  }

  async run(actor: User, kind: ReportKind, q: ReportQuery): Promise<ReportDto> {
    if (kind === 'logins' && !hasPermission(actor.role, 'authEvents.read')) throw new ForbiddenException('Only admins can see the login history.');
    const s = await this.scope(actor, q);
    const tz = await this.days.companyTz();
    const base = {
      kind,
      title: REPORT_INFO[kind].title,
      subtitle: `${fmtRange(q.from, q.to)} · ${s.label}`,
      timezone: tz,
      generatedAt: new Date().toISOString(),
    };
    switch (kind) {
      case 'attendance':
        return { ...base, ...(await this.attendance(s, q)) };
      case 'tardiness':
        return { ...base, ...(await this.tardiness(s, q)) };
      case 'overtime':
        return { ...base, ...(await this.overtime(s, q)) };
      case 'meetings':
        return { ...base, ...(await this.meetingAttendance(actor, s, q, tz)) };
      case 'logins':
        return { ...base, ...(await this.logins(s, q, tz)) };
      case 'leave':
        return { ...base, ...(await this.leave(s, q)) };
    }
  }

  /* ---------------- attendance summary ---------------- */

  private async attendance(s: Scope, q: ReportQuery) {
    const people = (await this.people(s.ids)).filter((p) => p.tracked);
    const days = await this.daysFor(people.map((p) => p.id), q.from, q.to);
    const columns: ReportColumn[] = [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'scheduled', label: 'Scheduled days', type: 'number' },
      { key: 'worked', label: 'Days worked', type: 'number' },
      { key: 'minutes', label: 'Time worked', type: 'minutes' },
      { key: 'late', label: 'Late days', type: 'number' },
      { key: 'lateMinutes', label: 'Time late', type: 'minutes' },
      { key: 'absent', label: 'Absences', type: 'number' },
      { key: 'leave', label: 'Leave days', type: 'number' },
      { key: 'overtime', label: 'Overtime', type: 'minutes' },
      { key: 'earlyOuts', label: 'Early outs', type: 'number' },
      { key: 'missingOut', label: 'Missing clock-outs', type: 'number' },
    ];
    const rows = people.map((p) => {
      const mine = days.filter((d) => d.userId === p.id);
      let overtime = 0;
      let early = 0;
      for (const d of mine) {
        if (!d.scheduleEnd || !d.lastOut) continue;
        const after = mins(d.scheduleEnd, d.lastOut);
        if (after >= OVERTIME_MIN_MINUTES) overtime += after;
        if (d.status === 'DONE' && -after >= EARLY_OUT_MIN_MINUTES) early += 1;
      }
      return {
        name: p.fullName,
        department: p.departmentName,
        scheduled: mine.filter((d) => d.scheduleStart && d.status !== 'LEAVE' && d.status !== 'DAY_OFF').length,
        worked: mine.filter((d) => d.firstIn).length,
        minutes: mine.reduce((n, d) => n + d.workedMinutes, 0),
        late: mine.filter((d) => d.lateMinutes > 0).length,
        lateMinutes: mine.reduce((n, d) => n + d.lateMinutes, 0),
        absent: mine.filter((d) => d.status === 'ABSENT').length,
        leave: mine.filter((d) => d.status === 'LEAVE').length,
        overtime,
        earlyOuts: early,
        missingOut: mine.filter((d) => d.status === 'MISSING_OUT').length,
      };
    });
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
    return {
      columns,
      rows,
      totals: rows.length
        ? {
            name: `${rows.length} people`,
            department: null,
            scheduled: sum('scheduled'),
            worked: sum('worked'),
            minutes: sum('minutes'),
            late: sum('late'),
            lateMinutes: sum('lateMinutes'),
            absent: sum('absent'),
            leave: sum('leave'),
            overtime: sum('overtime'),
            earlyOuts: sum('earlyOuts'),
            missingOut: sum('missingOut'),
          }
        : null,
    };
  }

  /* ---------------- tardiness ---------------- */

  private async tardiness(s: Scope, q: ReportQuery) {
    const people = new Map((await this.people(s.ids)).map((p) => [p.id, p]));
    const days = (await this.daysFor(s.ids, q.from, q.to)).filter((d) => d.lateMinutes > 0 && people.has(d.userId));
    const rows = days.map((d) => ({
      date: d.workDate,
      name: people.get(d.userId)!.fullName,
      department: people.get(d.userId)!.departmentName,
      shiftStart: d.scheduleStart?.toISOString() ?? null,
      firstIn: d.firstIn?.toISOString() ?? null,
      lateMinutes: d.lateMinutes,
      excused: d.excused || d.status === 'EXCUSED' ? 'Yes' : '',
    }));
    return {
      columns: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'department', label: 'Department', type: 'text' },
        { key: 'shiftStart', label: 'Shift start', type: 'datetime' },
        { key: 'firstIn', label: 'Clocked in', type: 'datetime' },
        { key: 'lateMinutes', label: 'Late by', type: 'minutes' },
        { key: 'excused', label: 'Excused', type: 'text' },
      ] satisfies ReportColumn[],
      rows,
      totals: rows.length ? { date: `${rows.length} late days`, lateMinutes: rows.reduce((n, r) => n + r.lateMinutes, 0) } : null,
    };
  }

  /* ---------------- overtime and early outs ---------------- */

  private async overtime(s: Scope, q: ReportQuery) {
    const people = new Map((await this.people(s.ids)).map((p) => [p.id, p]));
    const rows = [];
    for (const d of await this.daysFor(s.ids, q.from, q.to)) {
      if (!d.scheduleEnd || !d.lastOut || !people.has(d.userId)) continue;
      const after = mins(d.scheduleEnd, d.lastOut);
      const type = after >= OVERTIME_MIN_MINUTES ? 'Overtime' : d.status === 'DONE' && -after >= EARLY_OUT_MIN_MINUTES ? 'Early out' : null;
      if (!type) continue;
      rows.push({
        date: d.workDate,
        name: people.get(d.userId)!.fullName,
        department: people.get(d.userId)!.departmentName,
        type,
        shiftEnd: d.scheduleEnd.toISOString(),
        lastOut: d.lastOut.toISOString(),
        minutes: Math.abs(after),
        worked: d.workedMinutes,
      });
    }
    const ot = rows.filter((r) => r.type === 'Overtime');
    return {
      columns: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'department', label: 'Department', type: 'text' },
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'shiftEnd', label: 'Shift end', type: 'datetime' },
        { key: 'lastOut', label: 'Clocked out', type: 'datetime' },
        { key: 'minutes', label: 'Over / under by', type: 'minutes' },
        { key: 'worked', label: 'Worked that day', type: 'minutes' },
      ] satisfies ReportColumn[],
      rows,
      totals: rows.length ? { date: `${ot.length} overtime · ${rows.length - ot.length} early`, minutes: ot.reduce((n, r) => n + r.minutes, 0) } : null,
    };
  }

  /* ---------------- meeting attendance ---------------- */

  private async meetingAttendance(actor: User, s: Scope, q: ReportQuery, tz: string) {
    const from = zonedToUtc(q.from, '00:00', tz);
    const to = zonedToUtc(addDays(q.to, 1), '00:00', tz);
    const host = alias(users, 'host');
    const where: SQL[] = [gte(meetingAttendance.joinedAt, from), lt(meetingAttendance.joinedAt, to)];
    // managers: their people's attendance, plus everything in meetings they host
    if (s.ids) where.push(or(inArray(meetingAttendance.userId, s.ids.length ? s.ids : ['00000000-0000-0000-0000-000000000000']), this.all(actor) ? undefined : eq(meetings.hostId, actor.id))!);
    const raw = await this.db
      .select({
        meetingId: meetings.id,
        title: meetings.title,
        kind: meetings.kind,
        occurrence: meetingAttendance.occurrenceStart,
        hostName: host.fullName,
        userId: meetingAttendance.userId,
        name: users.fullName,
        department: departments.name,
        joinedAt: meetingAttendance.joinedAt,
        leftAt: meetingAttendance.leftAt,
      })
      .from(meetingAttendance)
      .innerJoin(meetings, eq(meetings.id, meetingAttendance.meetingId))
      .innerJoin(users, eq(users.id, meetingAttendance.userId))
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .leftJoin(host, eq(host.id, meetings.hostId))
      .where(and(...where))
      .orderBy(asc(meetingAttendance.joinedAt));
    // one row per person per meeting occurrence (rejoins summed)
    const grouped = new Map<string, { title: string; hostName: string | null; start: Date; name: string; department: string | null; first: Date; last: Date | null; minutes: number; joins: number }>();
    for (const r of raw) {
      const start = r.kind === 'SCHEDULED' ? r.occurrence : r.joinedAt;
      const key = `${r.meetingId}|${r.kind === 'SCHEDULED' ? r.occurrence.toISOString() : r.joinedAt.toISOString().slice(0, 10)}|${r.userId}`;
      const m = Math.max(0, mins(r.joinedAt, r.leftAt ?? new Date()));
      const g = grouped.get(key);
      if (g) {
        g.minutes += m;
        g.joins += 1;
        g.last = r.leftAt && (!g.last || r.leftAt > g.last) ? r.leftAt : g.last;
      } else grouped.set(key, { title: r.title, hostName: r.hostName, start, name: r.name, department: r.department, first: r.joinedAt, last: r.leftAt, minutes: m, joins: 1 });
    }
    const rows = [...grouped.values()].map((g) => ({
      meeting: g.title,
      host: g.hostName,
      start: g.start.toISOString(),
      name: g.name,
      department: g.department,
      joined: g.first.toISOString(),
      left: g.last?.toISOString() ?? null,
      minutes: g.minutes,
      joins: g.joins,
    }));
    return {
      columns: [
        { key: 'meeting', label: 'Meeting', type: 'text' },
        { key: 'host', label: 'Host', type: 'text' },
        { key: 'start', label: 'Meeting time', type: 'datetime' },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'department', label: 'Department', type: 'text' },
        { key: 'joined', label: 'Joined', type: 'datetime' },
        { key: 'left', label: 'Left', type: 'datetime' },
        { key: 'minutes', label: 'Time in call', type: 'minutes' },
        { key: 'joins', label: 'Joins', type: 'number' },
      ] satisfies ReportColumn[],
      rows,
      totals: rows.length ? { meeting: `${new Set(rows.map((r) => `${r.meeting}|${r.start}`)).size} meetings`, minutes: rows.reduce((n, r) => n + r.minutes, 0) } : null,
    };
  }

  /* ---------------- login history ---------------- */

  private async logins(s: Scope, q: ReportQuery, tz: string) {
    const where: SQL[] = [gte(authEvents.createdAt, zonedToUtc(q.from, '00:00', tz)), lt(authEvents.createdAt, zonedToUtc(addDays(q.to, 1), '00:00', tz))];
    if (s.ids) where.push(inArray(authEvents.userId, s.ids.length ? s.ids : ['00000000-0000-0000-0000-000000000000']));
    const rows = await this.db
      .select({ e: authEvents, name: users.fullName })
      .from(authEvents)
      .leftJoin(users, eq(users.id, authEvents.userId))
      .where(and(...where))
      .orderBy(asc(authEvents.createdAt))
      .limit(20_000);
    return {
      columns: [
        { key: 'at', label: 'Time', type: 'datetime' },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'event', label: 'Event', type: 'text' },
        { key: 'ip', label: 'IP address', type: 'text' },
        { key: 'device', label: 'Browser / device', type: 'text' },
      ] satisfies ReportColumn[],
      rows: rows.map(({ e, name }) => ({
        at: e.createdAt.toISOString(),
        name: name ?? '',
        email: e.email ?? '',
        event: AUTH_EVENT_LABELS[e.type] ?? e.type,
        ip: e.ip ?? '',
        device: [e.browser, e.os].filter(Boolean).join(' on ') || (e.userAgent ?? ''),
      })),
      totals: null,
    };
  }

  /* ---------------- leave ---------------- */

  private async leave(s: Scope, q: ReportQuery) {
    const decider = alias(users, 'decider');
    const where: SQL[] = [lte(leaveRequests.startDate, q.to), gte(leaveRequests.endDate, q.from)];
    if (s.ids) where.push(inArray(leaveRequests.userId, s.ids.length ? s.ids : ['00000000-0000-0000-0000-000000000000']));
    const rows = await this.db
      .select({ r: leaveRequests, name: users.fullName, department: departments.name, type: leaveTypes.name, paid: leaveTypes.paid, decidedBy: decider.fullName })
      .from(leaveRequests)
      .innerJoin(users, eq(users.id, leaveRequests.userId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.typeId))
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .leftJoin(decider, eq(decider.id, leaveRequests.decidedById))
      .where(and(...where))
      .orderBy(asc(leaveRequests.startDate), asc(users.fullName));
    const out = rows.map(({ r, ...x }) => ({
      name: x.name,
      department: x.department,
      type: `${x.type}${x.paid ? '' : ' (unpaid)'}`,
      start: r.startDate,
      end: r.endDate,
      days: r.days,
      status: LEAVE_STATUS_LABELS[r.status],
      decidedBy: x.decidedBy ?? '',
      reason: r.reason,
    }));
    return {
      columns: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'department', label: 'Department', type: 'text' },
        { key: 'type', label: 'Leave type', type: 'text' },
        { key: 'start', label: 'From', type: 'date' },
        { key: 'end', label: 'To', type: 'date' },
        { key: 'days', label: 'Days', type: 'number' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'decidedBy', label: 'Decided by', type: 'text' },
        { key: 'reason', label: 'Reason', type: 'text' },
      ] satisfies ReportColumn[],
      rows: out,
      totals: out.length ? { name: `${out.length} requests`, days: rows.filter((r) => r.r.status === 'APPROVED').reduce((n, r) => n + r.r.days, 0), status: 'approved days' } : null,
    };
  }

  /** for the status column in exports */
  static statusLabel = (s: keyof typeof DAY_STATUS_LABELS) => DAY_STATUS_LABELS[s];
}
