import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DepartmentDto, DepartmentInput } from '@vo/shared';
import { asc, count, eq, sql } from 'drizzle-orm';
import { AuditService, diff } from '../audit/audit.service';
import { DB, Db } from '../db/client';
import { departments, User, users } from '../db/schema';

@Injectable()
export class DepartmentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<DepartmentDto[]> {
    const memberCounts = this.db
      .select({ departmentId: users.departmentId, n: count().as('n') })
      .from(users)
      .where(eq(users.status, 'ACTIVE'))
      .groupBy(users.departmentId)
      .as('mc');
    const rows = await this.db
      .select({ d: departments, headUserName: users.fullName, n: memberCounts.n })
      .from(departments)
      .leftJoin(users, eq(users.id, departments.headUserId))
      .leftJoin(memberCounts, eq(memberCounts.departmentId, departments.id))
      .orderBy(asc(departments.name));
    return rows.map(({ d, headUserName, n }) => ({
      id: d.id,
      name: d.name,
      headUserId: d.headUserId,
      headUserName: headUserName ?? null,
      memberCount: Number(n ?? 0),
    }));
  }

  private async validate(input: DepartmentInput, id?: string) {
    const clash = await this.db.query.departments.findFirst({
      where: sql`lower(${departments.name}) = lower(${input.name})`,
    });
    if (clash && clash.id !== id) {
      throw new ConflictException({ message: 'A department with this name already exists', errors: { name: ['Already exists'] } });
    }
    if (input.headUserId) {
      const head = await this.db.query.users.findFirst({ where: eq(users.id, input.headUserId) });
      if (!head || head.status !== 'ACTIVE') {
        throw new BadRequestException({ message: 'Department head must be an active user', errors: { headUserId: ['Not found'] } });
      }
    }
  }

  async create(input: DepartmentInput, actor: User, ip: string | null) {
    await this.validate(input);
    const [d] = await this.db
      .insert(departments)
      .values({ name: input.name, headUserId: input.headUserId ?? null })
      .returning();
    await this.audit.record({
      actorId: actor.id,
      action: 'department.create',
      entityType: 'department',
      entityId: d.id,
      after: { name: d.name, headUserId: d.headUserId },
      ip,
    });
    return d;
  }

  async update(id: string, input: DepartmentInput, actor: User, ip: string | null) {
    const before = await this.db.query.departments.findFirst({ where: eq(departments.id, id) });
    if (!before) throw new NotFoundException('Department not found');
    await this.validate(input, id);
    const [after] = await this.db
      .update(departments)
      .set({ name: input.name, headUserId: input.headUserId ?? null })
      .where(eq(departments.id, id))
      .returning();
    const d = diff({ name: before.name, headUserId: before.headUserId }, { name: after.name, headUserId: after.headUserId });
    if (d.changed) {
      await this.audit.record({ actorId: actor.id, action: 'department.update', entityType: 'department', entityId: id, ...d, ip });
    }
    return after;
  }

  /** Members are kept; they simply have no department afterwards. */
  async remove(id: string, actor: User, ip: string | null) {
    const [d] = await this.db.delete(departments).where(eq(departments.id, id)).returning();
    if (!d) throw new NotFoundException('Department not found');
    await this.audit.record({
      actorId: actor.id,
      action: 'department.delete',
      entityType: 'department',
      entityId: id,
      before: { name: d.name, headUserId: d.headUserId },
      ip,
    });
  }
}
