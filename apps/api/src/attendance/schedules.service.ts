import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  DayOverrideDto,
  DayOverrideInput,
  PersonSetupDto,
  PersonSetupInput,
  RangeQuery,
  ScheduleDto,
  ScheduleInput,
} from '@vo/shared';
import { and, asc, count, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DB, Db } from '../db/client';
import { dayOverrides, departments, scheduleAssignments, scheduleDays, User, users, workSchedules } from '../db/schema';
import { DayService } from './day.service';
import { personRef } from './dto';
import { scheduleLabel } from './format';
import { PlannerService } from './planner.service';

@Injectable()
export class SchedulesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly days: DayService,
    private readonly planner: PlannerService,
  ) {}

  async list(): Promise<ScheduleDto[]> {
    const scheds = await this.db.select().from(workSchedules).orderBy(asc(workSchedules.name));
    if (!scheds.length) return [];
    const days = await this.db.select().from(scheduleDays);
    const today = await this.days.today();
    const active = (await this.db.select({ id: users.id }).from(users).where(eq(users.status, 'ACTIVE'))).map((u) => u.id);
    const ctx = await this.planner.context(active, today, today);
    const members = new Map<string, number>();
    for (const id of active) {
      const s = ctx.schedule(id, today);
      if (s) members.set(s.id, (members.get(s.id) ?? 0) + 1);
    }
    return scheds.map((s) => {
      const mine = days.filter((d) => d.scheduleId === s.id).sort((a, b) => a.weekday - b.weekday);
      return {
        id: s.id,
        name: s.name,
        timezone: s.timezone,
        days: mine.map((d) => ({ weekday: d.weekday, start: d.startTime, end: d.endTime, onsite: d.onsite })),
        memberCount: members.get(s.id) ?? 0,
        label: scheduleLabel(mine),
      };
    });
  }

  private async get(id: string) {
    const s = (await this.list()).find((x) => x.id === id);
    if (!s) throw new NotFoundException('Schedule not found');
    return s;
  }

  private async assertName(name: string, id?: string) {
    const [dup] = await this.db
      .select({ id: workSchedules.id })
      .from(workSchedules)
      .where(id ? and(eq(workSchedules.name, name), ne(workSchedules.id, id)) : eq(workSchedules.name, name));
    if (dup) throw new ConflictException({ message: 'A schedule with this name already exists', errors: { name: ['Already in use'] } });
  }

  async create(input: ScheduleInput, actor: User, ip: string | null) {
    await this.assertName(input.name);
    const [s] = await this.db.insert(workSchedules).values({ name: input.name, timezone: input.timezone }).returning();
    if (input.days.length) {
      await this.db.insert(scheduleDays).values(
        input.days.map((d) => ({ scheduleId: s.id, weekday: d.weekday, startTime: d.start, endTime: d.end, onsite: d.onsite })),
      );
    }
    await this.audit.record({ actorId: actor.id, action: 'schedule.create', entityType: 'schedule', entityId: s.id, after: { ...input }, ip });
    return this.get(s.id);
  }

  async update(id: string, input: ScheduleInput, actor: User, ip: string | null) {
    const before = await this.get(id);
    await this.assertName(input.name, id);
    await this.db.transaction(async (tx) => {
      await tx.update(workSchedules).set({ name: input.name, timezone: input.timezone }).where(eq(workSchedules.id, id));
      await tx.delete(scheduleDays).where(eq(scheduleDays.scheduleId, id));
      if (input.days.length) {
        await tx
          .insert(scheduleDays)
          .values(input.days.map((d) => ({ scheduleId: id, weekday: d.weekday, startTime: d.start, endTime: d.end, onsite: d.onsite })));
      }
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'schedule.update',
      entityType: 'schedule',
      entityId: id,
      before: { name: before.name, timezone: before.timezone, days: before.days },
      after: { name: input.name, timezone: input.timezone, days: input.days },
      ip,
    });
    await this.refreshToday(id);
    return this.get(id);
  }

  async remove(id: string, actor: User, ip: string | null) {
    const before = await this.get(id);
    const [{ n }] = await this.db.select({ n: count() }).from(scheduleAssignments).where(eq(scheduleAssignments.scheduleId, id));
    if (n > 0) throw new ConflictException('People are (or were) on this schedule. Move them to another schedule first.');
    await this.db.delete(workSchedules).where(eq(workSchedules.id, id));
    await this.audit.record({ actorId: actor.id, action: 'schedule.delete', entityType: 'schedule', entityId: id, before: { name: before.name }, ip });
  }

  /** Recompute today's record for everyone on a schedule after it changes. */
  private async refreshToday(scheduleId: string) {
    const today = await this.days.today();
    const assigned = await this.db
      .selectDistinct({ userId: scheduleAssignments.userId })
      .from(scheduleAssignments)
      .where(eq(scheduleAssignments.scheduleId, scheduleId));
    await this.days.recomputeMany(assigned.map((a) => `${a.userId}|${today}`));
  }

  /* ---------------- people ---------------- */

  async people(): Promise<PersonSetupDto[]> {
    const rows = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        title: users.title,
        avatarUrl: users.avatarUrl,
        departmentName: departments.name,
        role: users.role,
        status: users.status,
        workSetup: users.workSetup,
        attendanceTracked: users.attendanceTracked,
      })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(eq(users.status, 'ACTIVE'))
      .orderBy(asc(users.fullName));
    const today = await this.days.today();
    const ids = rows.map((r) => r.id);
    const ctx = await this.planner.context(ids, today, today);
    const assigns = ids.length
      ? await this.db.select().from(scheduleAssignments).where(and(inArray(scheduleAssignments.userId, ids), lte(scheduleAssignments.effectiveFrom, today)))
      : [];
    return rows.map((r) => {
      const s = ctx.schedule(r.id, today);
      const current = assigns.filter((a) => a.userId === r.id).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      return {
        user: personRef(r),
        role: r.role,
        status: r.status,
        workSetup: r.workSetup,
        attendanceTracked: r.attendanceTracked,
        scheduleId: s?.id ?? null,
        scheduleName: s?.name ?? null,
        effectiveFrom: current?.effectiveFrom ?? null,
      };
    });
  }

  async updatePerson(userId: string, input: PersonSetupInput, actor: User, ip: string | null) {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) throw new NotFoundException('Person not found');
    const today = await this.days.today();
    const patch: Partial<typeof users.$inferInsert> = {};
    if (input.workSetup) patch.workSetup = input.workSetup;
    if (input.attendanceTracked !== undefined) patch.attendanceTracked = input.attendanceTracked;
    if (Object.keys(patch).length) await this.db.update(users).set(patch).where(eq(users.id, userId));
    if (input.scheduleId !== undefined) {
      if (input.scheduleId) {
        const [s] = await this.db.select({ id: workSchedules.id }).from(workSchedules).where(eq(workSchedules.id, input.scheduleId));
        if (!s) throw new BadRequestException({ message: 'Schedule not found', errors: { scheduleId: ['Not found'] } });
      }
      const from = input.effectiveFrom ?? today;
      await this.db
        .insert(scheduleAssignments)
        .values({ userId, scheduleId: input.scheduleId, effectiveFrom: from, createdById: actor.id })
        .onConflictDoUpdate({ target: [scheduleAssignments.userId, scheduleAssignments.effectiveFrom], set: { scheduleId: input.scheduleId, createdById: actor.id } });
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'attendance.person_setup',
      entityType: 'user',
      entityId: userId,
      before: { workSetup: u.workSetup, attendanceTracked: u.attendanceTracked },
      after: { ...input },
      ip,
    });
    await this.days.recompute(userId, today);
    return (await this.people()).find((p) => p.user.id === userId)!;
  }

  /* ---------------- leave / day off / one-off shifts ---------------- */

  async overrides(q: RangeQuery): Promise<DayOverrideDto[]> {
    const rows = await this.db
      .select({ o: dayOverrides, userName: users.fullName })
      .from(dayOverrides)
      .innerJoin(users, eq(users.id, dayOverrides.userId))
      .where(and(gte(dayOverrides.workDate, q.from), lte(dayOverrides.workDate, q.to)))
      .orderBy(asc(dayOverrides.workDate), asc(users.fullName));
    return rows.map(({ o, userName }) => ({
      id: o.id,
      userId: o.userId,
      userName,
      date: o.workDate,
      kind: o.kind,
      start: o.startTime,
      end: o.endTime,
      onsite: o.onsite,
      note: o.note,
    }));
  }

  async setOverride(input: DayOverrideInput, actor: User, ip: string | null) {
    const [u] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, input.userId));
    if (!u) throw new BadRequestException({ message: 'Person not found', errors: { userId: ['Not found'] } });
    const values = {
      userId: input.userId,
      workDate: input.date,
      kind: input.kind,
      startTime: input.kind === 'SHIFT' ? input.start! : null,
      endTime: input.kind === 'SHIFT' ? input.end! : null,
      onsite: input.onsite ?? null,
      note: input.note ?? null,
      createdById: actor.id,
    };
    await this.db.insert(dayOverrides).values(values).onConflictDoUpdate({ target: [dayOverrides.userId, dayOverrides.workDate], set: values });
    await this.audit.record({ actorId: actor.id, action: 'attendance.override.set', entityType: 'user', entityId: input.userId, after: { ...input }, ip });
    await this.days.recompute(input.userId, input.date);
    return (await this.overrides({ from: input.date, to: input.date })).find((o) => o.userId === input.userId)!;
  }

  async removeOverride(id: string, actor: User, ip: string | null) {
    const [o] = await this.db.select().from(dayOverrides).where(eq(dayOverrides.id, id));
    if (!o) throw new NotFoundException('Not found');
    await this.db.delete(dayOverrides).where(eq(dayOverrides.id, id));
    await this.audit.record({ actorId: actor.id, action: 'attendance.override.remove', entityType: 'user', entityId: o.userId, before: { date: o.workDate, kind: o.kind }, ip });
    await this.days.recompute(o.userId, o.workDate);
  }
}
