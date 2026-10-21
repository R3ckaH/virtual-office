import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AdjustTimesInput, ExceptionDto, ExceptionType, ListExceptionsQuery, ResolveExceptionInput } from '@vo/shared';
import { addDays, localDate } from '@vo/shared';
import { and, desc, eq, gte, inArray, isNull, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service';
import { DB, Db } from '../db/client';
import { attendanceDays, attendanceExceptions, deviceUserLinks, punches, User, users } from '../db/schema';
import { DayService } from './day.service';
import { toExceptionDto } from './dto';
import { clockTime } from './format';
import { RulesService } from './rules.service';

const resolver = alias(users, 'resolver');

/** Which resolve actions make sense for which exception type. */
const ALLOWED: Record<ExceptionType, ResolveExceptionInput['action'][]> = {
  LATE: ['EXCUSE', 'KEEP'],
  NO_PUNCH: ['ACK'],
  MISSING_OUT: ['SET_CLOCK_OUT', 'ACK'],
  MISMATCH: ['USE_DEVICE', 'USE_WEB'],
  DUPLICATES: ['ACK'],
  UNLINKED_BADGE: ['LINK_BADGE', 'ACK'],
};

@Injectable()
export class ExceptionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly days: DayService,
    private readonly rules: RulesService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListExceptionsQuery, userIds: string[] | null = null, now = new Date()): Promise<ExceptionDto[]> {
    const tz = await this.days.companyTz();
    const today = localDate(now, tz);
    const where: SQL[] = [];
    if (q.status) where.push(eq(attendanceExceptions.status, q.status));
    if (q.date) where.push(eq(attendanceExceptions.workDate, q.date));
    else where.push(gte(attendanceExceptions.workDate, addDays(today, -14)));
    if (userIds) where.push(inArray(attendanceExceptions.userId, userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']));
    const rows = await this.db
      .select({ e: attendanceExceptions, userName: users.fullName, resolvedByName: resolver.fullName })
      .from(attendanceExceptions)
      .leftJoin(users, eq(users.id, attendanceExceptions.userId))
      .leftJoin(resolver, eq(resolver.id, attendanceExceptions.resolvedById))
      .where(and(...where))
      .orderBy(desc(attendanceExceptions.workDate), desc(attendanceExceptions.createdAt))
      .limit(300);
    const rules = await this.rules.get();
    const order: ExceptionType[] = ['UNLINKED_BADGE', 'MISSING_OUT', 'MISMATCH', 'NO_PUNCH', 'LATE', 'DUPLICATES'];
    return rows
      .map((r) => toExceptionDto(r.e, { userName: r.userName ?? null, resolvedByName: r.resolvedByName ?? null }, { tz, rules, now }))
      .sort((a, b) => (a.status === b.status ? order.indexOf(a.type) - order.indexOf(b.type) : a.status === 'OPEN' ? -1 : 1));
  }

  private async load(id: string) {
    const [e] = await this.db.select().from(attendanceExceptions).where(eq(attendanceExceptions.id, id));
    if (!e) throw new NotFoundException('Exception not found');
    return e;
  }

  private async markResolved(id: string, resolution: string, actor: User) {
    await this.db
      .update(attendanceExceptions)
      .set({ status: 'RESOLVED', resolution, resolvedById: actor.id, resolvedAt: new Date() })
      .where(eq(attendanceExceptions.id, id));
  }

  private async ensureDay(userId: string, workDate: string) {
    const res = await this.days.recompute(userId, workDate);
    if (!res) throw new ConflictException('Attendance isn’t tracked for this person');
    return res;
  }

  async resolve(id: string, input: ResolveExceptionInput, actor: User, ip: string | null, now = new Date()): Promise<ExceptionDto> {
    const e = await this.load(id);
    if (e.status === 'RESOLVED') throw new ConflictException('This was already handled');
    if (!ALLOWED[e.type].includes(input.action)) throw new BadRequestException(`That action doesn’t apply to this exception`);
    const tz = await this.days.companyTz();
    const extra = input.note ? ` ${input.note}` : '';
    let resolution = '';

    switch (input.action) {
      case 'EXCUSE':
      case 'KEEP': {
        await this.ensureDay(e.userId!, e.workDate);
        if (input.action === 'EXCUSE') {
          await this.db
            .update(attendanceDays)
            .set({ excused: true })
            .where(and(eq(attendanceDays.userId, e.userId!), eq(attendanceDays.workDate, e.workDate)));
        }
        resolution = input.action === 'EXCUSE' ? 'Late arrival excused.' : 'Kept as late.';
        break;
      }
      case 'ACK':
        resolution = 'Noted.';
        break;
      case 'SET_CLOCK_OUT': {
        const at = new Date(input.at);
        const { punches: rows } = await this.ensureDay(e.userId!, e.workDate);
        const first = rows.find((r) => !r.punch.removedAt);
        if (first && at <= first.punch.punchedAt) throw new BadRequestException({ message: 'Clock-out must be after the clock-in', errors: { at: ['Too early'] } });
        // an automatic clock-out is replaced by the real time
        const auto = rows.filter((r) => r.punch.source === 'SYSTEM' && !r.punch.removedAt).map((r) => r.punch.id);
        if (auto.length) await this.db.update(punches).set({ removedAt: now, removedById: actor.id }).where(inArray(punches.id, auto));
        await this.db.insert(punches).values({
          userId: e.userId!,
          workDate: e.workDate,
          source: 'HR',
          kind: 'OUT',
          punchedAt: at,
          via: 'hr',
          note: `Clock-out set by ${actor.fullName}`,
          createdById: actor.id,
        });
        resolution = `Clock-out set to ${clockTime(at, tz)}.`;
        break;
      }
      case 'USE_DEVICE':
      case 'USE_WEB': {
        await this.ensureDay(e.userId!, e.workDate);
        await this.db
          .update(attendanceDays)
          .set({ preferSource: input.action === 'USE_DEVICE' ? 'DEVICE' : 'WEB' })
          .where(and(eq(attendanceDays.userId, e.userId!), eq(attendanceDays.workDate, e.workDate)));
        const d = e.data as { webAt?: string; deviceAt?: string };
        const chosen = input.action === 'USE_DEVICE' ? d.deviceAt : d.webAt;
        resolution = `Using the ${input.action === 'USE_DEVICE' ? 'biometric' : 'web'} time${chosen ? `, ${clockTime(new Date(chosen), tz)}` : ''}.`;
        break;
      }
      case 'LINK_BADGE': {
        const target = await this.linkBadge(e.deviceUserId!, input.userId, null, actor, ip);
        resolution = `Badge ${e.deviceUserId} linked to ${target.fullName}. Their punches now count.`;
        break;
      }
    }

    await this.markResolved(e.id, resolution + extra, actor);
    if (e.userId) await this.days.recompute(e.userId, e.workDate, now);
    await this.audit.record({
      actorId: actor.id,
      action: `attendance.exception.${input.action.toLowerCase()}`,
      entityType: 'user',
      entityId: e.userId ?? null,
      before: { exception: e.type, workDate: e.workDate, deviceUserId: e.deviceUserId },
      after: { resolution: resolution + extra },
      ip,
    });
    const [row] = await this.db
      .select({ e: attendanceExceptions, userName: users.fullName, resolvedByName: resolver.fullName })
      .from(attendanceExceptions)
      .leftJoin(users, eq(users.id, attendanceExceptions.userId))
      .leftJoin(resolver, eq(resolver.id, attendanceExceptions.resolvedById))
      .where(eq(attendanceExceptions.id, e.id));
    return toExceptionDto(row.e, { userName: row.userName ?? null, resolvedByName: row.resolvedByName ?? null }, {
      tz,
      rules: await this.rules.get(),
      now,
    });
  }

  /**
   * Links a device user ID (badge) to a person. Punches that badge made while unlinked move to them,
   * and the "unlinked badge" exceptions for it are closed. Punches already credited to someone stay put.
   */
  async linkBadge(deviceUserId: string, userId: string | null, enrolledWith: string | null | undefined, actor: User, ip: string | null) {
    let target: User | undefined;
    if (userId) {
      [target] = await this.db.select().from(users).where(eq(users.id, userId));
      if (!target) throw new BadRequestException({ message: 'Person not found', errors: { userId: ['Not found'] } });
      const [taken] = await this.db.select().from(deviceUserLinks).where(eq(deviceUserLinks.userId, userId));
      if (taken && taken.deviceUserId !== deviceUserId) {
        throw new ConflictException({
          message: `${target.fullName} is already linked to device user ${taken.deviceUserId}`,
          errors: { userId: ['Already linked to another badge'] },
        });
      }
    }
    const [before] = await this.db.select().from(deviceUserLinks).where(eq(deviceUserLinks.deviceUserId, deviceUserId));
    const values = {
      deviceUserId,
      userId: userId ?? null,
      enrolledWith: enrolledWith === undefined ? (before?.enrolledWith ?? null) : enrolledWith,
      linkedById: actor.id,
    };
    await this.db.insert(deviceUserLinks).values(values).onConflictDoUpdate({ target: deviceUserLinks.deviceUserId, set: values });

    if (userId) {
      const orphans = await this.db
        .select()
        .from(punches)
        .where(and(eq(punches.deviceUserId, deviceUserId), isNull(punches.userId)))
        .orderBy(punches.punchedAt);
      const touched: string[] = [];
      const resolve = orphans.length
        ? await this.days.workDateResolver([userId], orphans[0].punchedAt, orphans[orphans.length - 1].punchedAt)
        : null;
      for (const p of orphans) {
        const workDate = resolve!(userId, p.punchedAt);
        await this.db.update(punches).set({ userId, workDate }).where(eq(punches.id, p.id));
        touched.push(`${userId}|${workDate}`);
      }
      await this.db
        .update(attendanceExceptions)
        .set({ status: 'RESOLVED', resolution: `Linked to ${target!.fullName}.`, resolvedById: actor.id, resolvedAt: new Date() })
        .where(and(eq(attendanceExceptions.type, 'UNLINKED_BADGE'), eq(attendanceExceptions.deviceUserId, deviceUserId), eq(attendanceExceptions.status, 'OPEN')));
      await this.days.recomputeMany(touched);
    }
    await this.audit.record({
      actorId: actor.id,
      action: userId ? 'device_user.link' : 'device_user.unlink',
      entityType: 'user',
      entityId: userId ?? before?.userId ?? null,
      before: { deviceUserId, userId: before?.userId ?? null },
      after: { deviceUserId, userId: userId ?? null },
      ip,
    });
    return target ?? ({ fullName: 'nobody' } as User);
  }

  /** "Adjust times": replaces the day's punches with an HR clock-in (and clock-out). The old punches are kept, marked removed. */
  async adjustTimes(userId: string, workDate: string, input: AdjustTimesInput, actor: User, ip: string | null, now = new Date()) {
    const before = await this.ensureDay(userId, workDate);
    const active = before.punches.filter((r) => !r.punch.removedAt).map((r) => r.punch.id);
    if (active.length) await this.db.update(punches).set({ removedAt: now, removedById: actor.id }).where(inArray(punches.id, active));
    const note = `Adjusted by ${actor.fullName}: ${input.reason}`;
    await this.db.insert(punches).values([
      { userId, workDate, source: 'HR', kind: 'IN', punchedAt: new Date(input.in), via: 'hr', note, createdById: actor.id },
      ...(input.out
        ? [{ userId, workDate, source: 'HR' as const, kind: 'OUT' as const, punchedAt: new Date(input.out), via: 'hr', note, createdById: actor.id }]
        : []),
    ]);
    const after = await this.days.recompute(userId, workDate, now);
    await this.audit.record({
      actorId: actor.id,
      action: 'attendance.adjust_times',
      entityType: 'user',
      entityId: userId,
      before: { workDate, firstIn: before.day.firstIn, lastOut: before.day.lastOut },
      after: { workDate, firstIn: input.in, lastOut: input.out, reason: input.reason },
      ip,
    });
    return after!;
  }

  async setNote(userId: string, workDate: string, note: string | null, actor: User, ip: string | null) {
    const before = await this.ensureDay(userId, workDate);
    await this.db
      .update(attendanceDays)
      .set({ note: note || null })
      .where(and(eq(attendanceDays.userId, userId), eq(attendanceDays.workDate, workDate)));
    await this.audit.record({
      actorId: actor.id,
      action: 'attendance.note',
      entityType: 'user',
      entityId: userId,
      before: { workDate, note: before.day.note },
      after: { workDate, note: note || null },
      ip,
    });
    return this.days.recompute(userId, workDate);
  }
}
