import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  addDays,
  DailyReportDto,
  DailyReportInput,
  hasPermission,
  MyDailyReportDto,
  TaskDto,
  TaskInput,
  TasksQuery,
  TeamReportsDto,
  TeamReportsQuery,
  UpdateTaskInput,
  zonedToUtc,
} from '@vo/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DayService } from '../attendance/day.service';
import { DB, Db } from '../db/client';
import { attendanceDays, dailyReports, departments, Task, tasks, User, users } from '../db/schema';
import { PresenceService } from '../presence/presence.service';

const DONE_KEEP_DAYS = 14;

/**
 * Tasks (personal and team boards: To do / In progress / Done) and end-of-day reports.
 *
 * Who sees a task: the person it's assigned to, whoever created it, the assignee's manager, everyone in
 * the task's department (team tasks), and admins. Personal tasks (no department) stay between the
 * person, their manager and whoever assigned it.
 */
@Injectable()
export class TasksService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly days: DayService,
    private readonly presence: PresenceService,
  ) {}

  private isAdmin = (u: User) => u.role === 'ADMIN';
  private isLead = (u: User) => u.role === 'ADMIN' || u.role === 'HR' || u.role === 'MANAGER';

  /* ================================================================ */
  /* Tasks                                                             */
  /* ================================================================ */

  private query() {
    const assignee = alias(users, 'assignee');
    const creator = alias(users, 'creator');
    return this.db
      .select({ t: tasks, assigneeName: assignee.fullName, assigneeManagerId: assignee.managerId, creatorName: creator.fullName, departmentName: departments.name })
      .from(tasks)
      .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .leftJoin(creator, eq(creator.id, tasks.createdById))
      .leftJoin(departments, eq(departments.id, tasks.departmentId))
      .$dynamic();
  }

  /** What an actor can see, as SQL. */
  private visible(actor: User): SQL | undefined {
    if (this.isAdmin(actor)) return undefined;
    const reports = this.db.select({ id: users.id }).from(users).where(eq(users.managerId, actor.id));
    return or(
      eq(tasks.assigneeId, actor.id),
      eq(tasks.createdById, actor.id),
      inArray(tasks.assigneeId, reports),
      actor.departmentId ? eq(tasks.departmentId, actor.departmentId) : sql`false`,
    );
  }

  private toDto(actor: User, row: Awaited<ReturnType<ReturnType<TasksService['query']>['execute']>>[number]): TaskDto {
    const { t } = row;
    const managesAssignee = !!t.assigneeId && row.assigneeManagerId === actor.id;
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      assigneeId: t.assigneeId,
      assigneeName: row.assigneeName,
      createdById: t.createdById,
      createdByName: row.creatorName,
      departmentId: t.departmentId,
      departmentName: row.departmentName,
      dueDate: t.dueDate,
      completedAt: t.completedAt?.toISOString() ?? null,
      position: t.position,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      canEdit: true,
      canDelete: t.createdById === actor.id || managesAssignee || this.isAdmin(actor) || (!t.createdById && t.assigneeId === actor.id),
    };
  }

  async list(actor: User, q: TasksQuery): Promise<TaskDto[]> {
    const where: (SQL | undefined)[] = [this.visible(actor)];
    if (q.scope === 'mine') {
      where.push(or(eq(tasks.assigneeId, actor.id), and(eq(tasks.createdById, actor.id), isNull(tasks.assigneeId), isNull(tasks.departmentId))));
    } else if (q.scope === 'team') {
      const dept = q.departmentId ?? actor.departmentId;
      if (!dept) return [];
      if (dept !== actor.departmentId && !this.isLead(actor)) throw new ForbiddenException('You can see your own department’s board.');
      where.push(eq(tasks.departmentId, dept));
    } else {
      if (!q.userId) throw new BadRequestException('Pick a person.');
      const [u] = await this.db.select({ managerId: users.managerId }).from(users).where(eq(users.id, q.userId));
      if (!u || (u.managerId !== actor.id && !this.isAdmin(actor) && actor.role !== 'HR' && q.userId !== actor.id)) {
        throw new ForbiddenException('You can see tasks for the people you manage.');
      }
      where[0] = undefined; // HR may look at anyone's assigned tasks
      where.push(eq(tasks.assigneeId, q.userId));
    }
    if (!q.includeOldDone) {
      where.push(or(ne(tasks.status, 'DONE'), gte(tasks.completedAt, new Date(Date.now() - DONE_KEEP_DAYS * 86_400_000))));
    }
    const rows = await this.query()
      .where(and(...where))
      .orderBy(asc(tasks.position), asc(tasks.createdAt))
      .limit(500);
    return rows.map((r) => this.toDto(actor, r));
  }

  private async one(actor: User, id: string) {
    const [row] = await this.query().where(and(eq(tasks.id, id), this.visible(actor)));
    if (!row) throw new NotFoundException('Task not found');
    return row;
  }

  /** Assigning to someone else: leads (in their reach) or anyone in the same department. */
  private async checkAssign(actor: User, assigneeId: string | null, departmentId: string | null) {
    if (departmentId && departmentId !== actor.departmentId && !this.isLead(actor)) {
      throw new ForbiddenException({ message: 'You can add tasks to your own department’s board.', errors: { departmentId: ['Not your department'] } });
    }
    if (departmentId) {
      const [d] = await this.db.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentId));
      if (!d) throw new BadRequestException({ message: 'That team no longer exists', errors: { departmentId: ['Not found'] } });
    }
    if (!assigneeId || assigneeId === actor.id) return null;
    const [a] = await this.db.select().from(users).where(eq(users.id, assigneeId));
    if (!a || a.status !== 'ACTIVE') throw new BadRequestException({ message: 'Assign the task to an active person', errors: { assigneeId: ['Not active'] } });
    const ok =
      this.isAdmin(actor) ||
      actor.role === 'HR' ||
      a.managerId === actor.id ||
      (!!actor.departmentId && a.departmentId === actor.departmentId) ||
      (actor.role === 'MANAGER' && !!departmentId && a.departmentId === departmentId);
    if (!ok) throw new ForbiddenException({ message: 'You can assign tasks to people on your team.', errors: { assigneeId: ['Not on your team'] } });
    return a;
  }

  private notifyAssignee(actor: User, assignee: User | null, task: Pick<Task, 'id' | 'title'>) {
    if (!assignee || assignee.id === actor.id) return;
    this.presence.notify(assignee.id, 'notice', { title: 'New task for you', body: `${actor.fullName} assigned you “${task.title}”.`, link: `/tasks?open=${task.id}` });
    this.presence.notify(assignee.id, 'tasks:changed', { id: task.id });
  }

  async create(actor: User, input: TaskInput): Promise<TaskDto> {
    const assignee = await this.checkAssign(actor, input.assigneeId, input.departmentId);
    // a personal task with nobody named is yours
    const assigneeId = input.assigneeId ?? (input.departmentId ? null : actor.id);
    const [t] = await this.db
      .insert(tasks)
      .values({ ...input, assigneeId, createdById: actor.id, position: Date.now() / 1000, completedAt: input.status === 'DONE' ? new Date() : null })
      .returning();
    this.notifyAssignee(actor, assignee, t);
    return this.toDto(actor, await this.one(actor, t.id));
  }

  async update(actor: User, id: string, input: UpdateTaskInput): Promise<TaskDto> {
    const before = (await this.one(actor, id)).t;
    const assigneeChanged = input.assigneeId !== undefined && input.assigneeId !== before.assigneeId;
    let assignee: User | null = null;
    if (assigneeChanged || (input.departmentId !== undefined && input.departmentId !== before.departmentId)) {
      assignee = await this.checkAssign(actor, input.assigneeId === undefined ? before.assigneeId : input.assigneeId, input.departmentId === undefined ? before.departmentId : input.departmentId);
    }
    const statusChanged = input.status && input.status !== before.status;
    await this.db
      .update(tasks)
      .set({
        ...input,
        ...(statusChanged ? { completedAt: input.status === 'DONE' ? new Date() : null } : {}),
        // moved to another column without a position: put it at the bottom
        ...(statusChanged && input.position === undefined ? { position: Date.now() / 1000 } : {}),
      })
      .where(eq(tasks.id, id));
    if (assigneeChanged) this.notifyAssignee(actor, assignee, before);
    return this.toDto(actor, await this.one(actor, id));
  }

  async remove(actor: User, id: string) {
    const row = await this.one(actor, id);
    if (!this.toDto(actor, row).canDelete) throw new ForbiddenException('Only whoever created the task, the assignee’s manager or an admin can delete it.');
    await this.db.delete(tasks).where(eq(tasks.id, id));
  }

  /** Tasks someone finished on a work day (in their time zone). */
  async doneOn(userId: string, date: string, tz: string) {
    const from = zonedToUtc(date, '00:00', tz);
    const to = zonedToUtc(addDays(date, 1), '00:00', tz);
    return this.db
      .select({ id: tasks.id, title: tasks.title, userId: tasks.assigneeId })
      .from(tasks)
      .where(and(eq(tasks.assigneeId, userId), eq(tasks.status, 'DONE'), gte(tasks.completedAt, from), lt(tasks.completedAt, to)))
      .orderBy(asc(tasks.completedAt));
  }

  /* ================================================================ */
  /* End-of-day reports                                                */
  /* ================================================================ */

  private async required(user: Pick<User, 'departmentId' | 'attendanceTracked'>) {
    if (!user.departmentId || !user.attendanceTracked) return false;
    const [d] = await this.db.select({ r: departments.requireDailyReport }).from(departments).where(eq(departments.id, user.departmentId));
    return !!d?.r;
  }

  private async reportDto(r: typeof dailyReports.$inferSelect, userName: string, tz: string): Promise<DailyReportDto> {
    return {
      id: r.id,
      userId: r.userId,
      userName,
      workDate: r.workDate,
      accomplished: r.accomplished,
      blockers: r.blockers,
      plan: r.plan,
      submittedAt: r.submittedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      tasksDone: (await this.doneOn(r.userId, r.workDate, tz)).map(({ id, title }) => ({ id, title })),
    };
  }

  async myReport(user: User, date?: string): Promise<MyDailyReportDto> {
    const tz = await this.days.companyTz();
    const workDate = date ?? (await this.currentWorkDate(user));
    const [r] = await this.db.select().from(dailyReports).where(and(eq(dailyReports.userId, user.id), eq(dailyReports.workDate, workDate)));
    return {
      workDate,
      required: await this.required(user),
      report: r ? await this.reportDto(r, user.fullName, tz) : null,
      tasksDone: (await this.doneOn(user.id, workDate, tz)).map(({ id, title }) => ({ id, title })),
    };
  }

  /** The day a report is about: a shift still open from yesterday (night shift), else today. */
  private async currentWorkDate(user: User) {
    const today = await this.days.today();
    const yesterday = addDays(today, -1);
    const [d] = await this.db
      .select({ open: attendanceDays.openSince })
      .from(attendanceDays)
      .where(and(eq(attendanceDays.userId, user.id), eq(attendanceDays.workDate, yesterday)));
    return d?.open ? yesterday : today;
  }

  async submit(user: User, input: DailyReportInput): Promise<MyDailyReportDto> {
    const today = await this.days.today();
    const workDate = input.workDate ?? (await this.currentWorkDate(user));
    if (workDate > today || workDate < addDays(today, -7)) throw new BadRequestException({ message: 'Reports can be filed for the last 7 days.', errors: { workDate: ['Out of range'] } });
    const values = { userId: user.id, workDate, accomplished: input.accomplished, blockers: input.blockers, plan: input.plan };
    await this.db
      .insert(dailyReports)
      .values(values)
      .onConflictDoUpdate({ target: [dailyReports.userId, dailyReports.workDate], set: { accomplished: input.accomplished, blockers: input.blockers, plan: input.plan } });
    if (user.managerId) this.presence.notify(user.managerId, 'tasks:changed', { id: `report:${user.id}` });
    return this.myReport(user, workDate);
  }

  /** A manager's team (or HR/Admin: a department or everyone) for one day: who reported, who didn't. */
  async team(actor: User, q: TeamReportsQuery): Promise<TeamReportsDto> {
    const date = q.date ?? (await this.days.today());
    const tz = await this.days.companyTz();
    const all = hasPermission(actor.role, 'attendance.manage') || actor.role === 'ADMIN';
    if (!all && !hasPermission(actor.role, 'team.read')) throw new ForbiddenException('Only managers, HR and admins see team reports.');
    const where: SQL[] = [eq(users.status, 'ACTIVE'), eq(users.attendanceTracked, true)];
    if (!all) where.push(eq(users.managerId, actor.id));
    if (q.departmentId) where.push(eq(users.departmentId, q.departmentId));
    const people = await this.db
      .select({ id: users.id, fullName: users.fullName, departmentName: departments.name, required: departments.requireDailyReport })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(and(...where))
      .orderBy(asc(users.fullName));
    if (!people.length) return { date, rows: [] };
    const ids = people.map((p) => p.id);
    const [reports, worked] = await Promise.all([
      this.db.select().from(dailyReports).where(and(inArray(dailyReports.userId, ids), eq(dailyReports.workDate, date))),
      this.db
        .select({ userId: attendanceDays.userId })
        .from(attendanceDays)
        .where(and(inArray(attendanceDays.userId, ids), eq(attendanceDays.workDate, date), sql`${attendanceDays.firstIn} IS NOT NULL`)),
    ]);
    const workedSet = new Set(worked.map((w) => w.userId));
    const rows = [];
    for (const p of people) {
      const r = reports.find((x) => x.userId === p.id);
      rows.push({ userId: p.id, fullName: p.fullName, departmentName: p.departmentName, worked: workedSet.has(p.id), required: !!p.required, report: r ? await this.reportDto(r, p.fullName, tz) : null });
    }
    // people who filed or worked first
    rows.sort((a, b) => Number(!!b.report) - Number(!!a.report) || Number(b.worked) - Number(a.worked) || a.fullName.localeCompare(b.fullName));
    return { date, rows };
  }

  /** Who in a department that requires reports worked today and hasn't filed (for reminders). */
  async missingReports(date: string) {
    return this.db
      .select({ id: users.id, email: users.email, fullName: users.fullName, scheduleEnd: attendanceDays.scheduleEnd, lastOut: attendanceDays.lastOut })
      .from(users)
      .innerJoin(departments, eq(departments.id, users.departmentId))
      .innerJoin(attendanceDays, and(eq(attendanceDays.userId, users.id), eq(attendanceDays.workDate, date)))
      .leftJoin(dailyReports, and(eq(dailyReports.userId, users.id), eq(dailyReports.workDate, date)))
      .where(and(eq(departments.requireDailyReport, true), eq(users.status, 'ACTIVE'), eq(users.attendanceTracked, true), sql`${attendanceDays.firstIn} IS NOT NULL`, isNull(dailyReports.id)));
  }
}
