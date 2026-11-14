import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { addDays, hasPermission, isoWeekday, MyDashboardDto, TeamDashboardDto, TeamPersonDto } from '@vo/shared';
import { and, asc, count, eq, gte, inArray, lte, ne, SQL } from 'drizzle-orm';
import { BoardService } from '../attendance/board.service';
import { DayService } from '../attendance/day.service';
import { DB, Db } from '../db/client';
import { attendanceDays, correctionRequests, dailyReports, departments, User, users } from '../db/schema';
import { MeetingsService } from '../meetings/meetings.service';
import { PresenceService } from '../presence/presence.service';
import { LeaveService } from '../work/leave.service';
import { TasksService } from '../work/tasks.service';

const MIN = 60_000;
type DayRow = typeof attendanceDays.$inferSelect;
const worked = (d: DayRow | undefined, now: Date) => (d ? d.workedMinutes + (d.openSince ? Math.max(0, Math.floor((now.getTime() - d.openSince.getTime()) / MIN)) : 0) : 0);
const scheduled = (d: DayRow) => (d.scheduleStart && d.scheduleEnd && d.status !== 'LEAVE' && d.status !== 'DAY_OFF' ? Math.round((d.scheduleEnd.getTime() - d.scheduleStart.getTime()) / MIN) : 0);

/** Home screen numbers: yours, and for managers/HR/admins, the team's. */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly days: DayService,
    private readonly board: BoardService,
    private readonly meetings: MeetingsService,
    private readonly leave: LeaveService,
    private readonly tasks: TasksService,
    private readonly presence: PresenceService,
  ) {}

  private week(today: string) {
    const from = addDays(today, 1 - isoWeekday(today));
    return { from, to: addDays(from, 6) };
  }

  async mine(user: User, now = new Date()): Promise<MyDashboardDto> {
    const today = await this.days.today(now);
    const { from, to } = this.week(today);
    const rows = user.attendanceTracked
      ? await this.db
          .select()
          .from(attendanceDays)
          .where(and(eq(attendanceDays.userId, user.id), gte(attendanceDays.workDate, from), lte(attendanceDays.workDate, to)))
      : [];
    const t = rows.find((r) => r.workDate === today);
    const myTasks = await this.tasks.list(user, { scope: 'mine', includeOldDone: false });
    const open = myTasks.filter((x) => x.status !== 'DONE' && x.assigneeId === user.id);
    const report = await this.tasks.myReport(user);
    const upcoming = (await this.meetings.list(user, { from: now.toISOString(), to: new Date(now.getTime() + 7 * 86_400_000).toISOString() }))
      .filter((o) => o.myResponse !== 'DECLINED' && Date.parse(o.end) > now.getTime())
      .slice(0, 4);
    return {
      today: { workDate: today, workedMinutes: worked(t, now), status: t?.status ?? null, scheduledMinutes: t ? scheduled(t) || null : null },
      week: {
        from,
        to,
        workedMinutes: rows.reduce((s, r) => s + worked(r, now), 0),
        scheduledMinutes: rows.reduce((s, r) => s + scheduled(r), 0),
        daysWorked: rows.filter((r) => r.firstIn).length,
      },
      upcomingMeetings: upcoming,
      tasks: {
        open: open.length,
        dueSoon: [...open].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.position - b.position).slice(0, 5),
      },
      leave: (await this.leave.balances(user, user.id, Number(today.slice(0, 4)))).filter((b) => b.allowance !== null),
      dailyReport: { required: report.required, submitted: !!report.report },
    };
  }

  /** Managers: their direct reports. HR and admins: everyone, or one department. */
  async team(actor: User, departmentId?: string, now = new Date()): Promise<TeamDashboardDto> {
    const all = actor.role === 'ADMIN' || hasPermission(actor.role, 'attendance.manage');
    if (!all && !hasPermission(actor.role, 'team.read')) throw new ForbiddenException('Only managers, HR and admins have a team view.');
    const where: SQL[] = [eq(users.status, 'ACTIVE'), eq(users.attendanceTracked, true)];
    if (!all) where.push(eq(users.managerId, actor.id));
    if (departmentId) where.push(eq(users.departmentId, departmentId));
    const people = await this.db
      .select({ userId: users.id, fullName: users.fullName, departmentName: departments.name })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(and(...where))
      .orderBy(asc(users.fullName));
    const ids = people.map((p) => p.userId);
    const byId = new Map(people.map((p) => [p.userId, p]));
    const today = await this.days.today(now);
    const { from, to } = this.week(today);
    let scopeLabel = all ? 'Everyone' : 'Your team';
    if (departmentId) {
      const [d] = await this.db.select({ name: departments.name }).from(departments).where(eq(departments.id, departmentId));
      scopeLabel = d?.name ?? 'Department';
    }
    const empty: TeamDashboardDto = {
      scopeLabel,
      date: today,
      headcount: 0,
      online: [],
      late: [],
      absent: [],
      notIn: [],
      onLeave: [],
      week: { from, to, people: [] },
      pending: { leave: 0, corrections: 0, reportsMissingYesterday: 0 },
    };
    if (!ids.length) return empty;

    const board = await this.board.board(today, ids, now);
    const late: TeamDashboardDto['late'] = [];
    const absent: TeamPersonDto[] = [];
    const notIn: TeamPersonDto[] = [];
    const leaveIds: string[] = [];
    for (const r of board.rows) {
      const p = byId.get(r.user.id);
      if (!p || !r.day) continue;
      if (r.day.lateMinutes > 0 && r.day.firstIn) late.push({ ...p, lateMinutes: r.day.lateMinutes, firstIn: r.day.firstIn });
      if (r.day.status === 'ABSENT') absent.push(p);
      if (r.day.status === 'NO_PUNCH') notIn.push(p);
      if (r.day.status === 'LEAVE') leaveIds.push(p.userId);
    }
    const leaveToday = leaveIds.length
      ? await this.leave.calendar(actor, { from: today, to: today }).then((l) => l.filter((x) => x.status === 'APPROVED'))
      : [];

    const weekRows = await this.db
      .select()
      .from(attendanceDays)
      .where(and(inArray(attendanceDays.userId, ids), gte(attendanceDays.workDate, from), lte(attendanceDays.workDate, to)));
    const weekPeople = people.map((p) => {
      const mine = weekRows.filter((r) => r.userId === p.userId);
      return {
        ...p,
        workedMinutes: mine.reduce((s, r) => s + worked(r, now), 0),
        scheduledMinutes: mine.reduce((s, r) => s + scheduled(r), 0),
        lateDays: mine.filter((r) => r.lateMinutes > 0).length,
      };
    });

    // things waiting for this person
    const decidable = await this.leave.list(actor, { scope: 'approvals', status: 'PENDING' });
    const corr = all
      ? await this.db.select({ n: count() }).from(correctionRequests).where(eq(correctionRequests.status, 'PENDING_HR'))
      : await this.db.select({ n: count() }).from(correctionRequests).where(and(eq(correctionRequests.status, 'PENDING_MANAGER'), eq(correctionRequests.managerId, actor.id)));
    const yesterday = addDays(today, -1);
    const required = await this.db
      .select({ userId: users.id })
      .from(users)
      .innerJoin(departments, eq(departments.id, users.departmentId))
      .innerJoin(attendanceDays, and(eq(attendanceDays.userId, users.id), eq(attendanceDays.workDate, yesterday), ne(attendanceDays.workedMinutes, 0)))
      .where(and(inArray(users.id, ids), eq(departments.requireDailyReport, true)));
    const filed = required.length
      ? await this.db
          .select({ userId: dailyReports.userId })
          .from(dailyReports)
          .where(and(inArray(dailyReports.userId, required.map((r) => r.userId)), eq(dailyReports.workDate, yesterday)))
      : [];

    return {
      scopeLabel,
      date: today,
      headcount: people.length,
      online: people.filter((p) => this.presence.isOnline(p.userId)),
      late: late.sort((a, b) => b.lateMinutes - a.lateMinutes),
      absent,
      notIn,
      onLeave: leaveIds.map((id) => ({ ...byId.get(id)!, typeName: leaveToday.find((l) => l.userId === id)?.typeName ?? null })),
      week: { from, to, people: weekPeople.sort((a, b) => b.workedMinutes - a.workedMinutes) },
      pending: { leave: decidable.length, corrections: Number(corr[0]?.n ?? 0), reportsMissingYesterday: required.length - filed.length },
    };
  }
}
