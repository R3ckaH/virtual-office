import { Inject, Injectable } from '@nestjs/common';
import type { AuditLogDto, ListAuditLogsQuery, Paged } from '@vo/shared';
import { and, count, desc, eq, gte, lte, sql, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, Db } from '../db/client';
import { auditLogs, departments, users } from '../db/schema';

const subject = alias(users, 'subject');

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Keeps only the fields that actually changed, so audit rows stay readable. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (after[key] === undefined) continue;
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      b[key] = before[key] ?? null;
      a[key] = after[key] ?? null;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async record(entry: AuditEntry, tx: Pick<Db, 'insert'> = this.db) {
    await tx.insert(auditLogs).values({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
    });
  }

  async list(q: ListAuditLogsQuery): Promise<Paged<AuditLogDto>> {
    const where: SQL[] = [];
    if (q.actorId) where.push(eq(auditLogs.actorId, q.actorId));
    if (q.entityType) where.push(eq(auditLogs.entityType, q.entityType));
    if (q.from) where.push(gte(auditLogs.createdAt, q.from));
    if (q.to) where.push(lte(auditLogs.createdAt, q.to));
    const cond = where.length ? and(...where) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          log: auditLogs,
          actorName: users.fullName,
          subjectName: subject.fullName,
          departmentName: departments.name,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorId))
        .leftJoin(subject, and(eq(auditLogs.entityType, 'user'), eq(sql`${subject.id}::text`, auditLogs.entityId)))
        .leftJoin(departments, and(eq(auditLogs.entityType, 'department'), eq(sql`${departments.id}::text`, auditLogs.entityId)))
        .where(cond)
        .orderBy(desc(auditLogs.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: count() }).from(auditLogs).where(cond),
    ]);
    return {
      items: rows.map(({ log, actorName, subjectName, departmentName }) => ({
        id: log.id,
        actorId: log.actorId,
        actorName: actorName ?? null,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        entityName:
          subjectName ??
          departmentName ??
          ((log.after as { name?: string } | null)?.name ?? (log.before as { name?: string } | null)?.name ?? null),
        before: log.before,
        after: log.after,
        ip: log.ip,
        createdAt: log.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
