import { Inject, Injectable } from '@nestjs/common';
import type { AuthEventDto, AuthEventType, ListAuthEventsQuery, Paged } from '@vo/shared';
import { and, count, desc, eq, gte, lte, SQL } from 'drizzle-orm';
import type { ClientInfo } from '../common/request-context';
import { DB, Db } from '../db/client';
import { authEvents, users } from '../db/schema';

export interface AuthEventInput {
  type: AuthEventType;
  userId?: string | null;
  email?: string | null;
  sessionId?: string | null;
  detail?: string | null;
  client?: Partial<ClientInfo> | null;
}

/** Login/logout history. Written for every sign-in attempt, sign-out, timeout and forced logout. */
@Injectable()
export class AuthEventsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async log(e: AuthEventInput) {
    await this.db.insert(authEvents).values({
      type: e.type,
      userId: e.userId ?? null,
      email: e.email ?? null,
      sessionId: e.sessionId ?? null,
      detail: e.detail ?? null,
      ip: e.client?.ip ?? null,
      userAgent: e.client?.userAgent ?? null,
      browser: e.client?.browser ?? null,
      os: e.client?.os ?? null,
    });
  }

  async list(q: ListAuthEventsQuery): Promise<Paged<AuthEventDto>> {
    const where: SQL[] = [];
    if (q.userId) where.push(eq(authEvents.userId, q.userId));
    if (q.type) where.push(eq(authEvents.type, q.type));
    if (q.from) where.push(gte(authEvents.createdAt, q.from));
    if (q.to) where.push(lte(authEvents.createdAt, q.to));
    const cond = where.length ? and(...where) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ ev: authEvents, userName: users.fullName, userEmail: users.email })
        .from(authEvents)
        .leftJoin(users, eq(users.id, authEvents.userId))
        .where(cond)
        .orderBy(desc(authEvents.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: count() }).from(authEvents).where(cond),
    ]);

    return {
      items: rows.map(({ ev, userName, userEmail }) => ({
        id: ev.id,
        userId: ev.userId,
        userName: userName ?? null,
        email: userEmail ?? ev.email,
        type: ev.type,
        ip: ev.ip,
        browser: ev.browser,
        os: ev.os,
        detail: ev.detail,
        createdAt: ev.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
