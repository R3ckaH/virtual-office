import { Inject, Injectable } from '@nestjs/common';
import type { SessionDto } from '@vo/shared';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { env } from '../config/env';
import { randomToken, sha256 } from '../common/crypto';
import type { ClientInfo } from '../common/request-context';
import { DB, Db } from '../db/client';
import { Session, sessions } from '../db/schema';
import { ACTIVITY_WRITE_INTERVAL_MS } from './session-policy';

@Injectable()
export class SessionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(userId: string, client: ClientInfo, authMethod: string) {
    const secret = randomToken(32);
    const [session] = await this.db
      .insert(sessions)
      .values({
        userId,
        refreshHash: sha256(secret),
        ip: client.ip,
        userAgent: client.userAgent,
        browser: client.browser,
        os: client.os,
        device: client.device,
        authMethod,
        expiresAt: new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      })
      .returning();
    return { session, refreshToken: `${session.id}.${secret}` };
  }

  byId(id: string): Promise<Session | undefined> {
    return this.db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  }

  /**
   * Issues a new refresh secret, but only if the presented one is still current (compare-and-swap),
   * so two tabs refreshing at the same moment can't both rotate and leave one holding a dead token.
   * Returns null when another request already rotated it; the caller then treats the call as in-grace.
   */
  async rotate(s: Session, presentedHash: string): Promise<string | null> {
    const secret = randomToken(32);
    const rows = await this.db
      .update(sessions)
      .set({ refreshHash: sha256(secret), previousRefreshHash: presentedHash, refreshRotatedAt: new Date() })
      .where(and(eq(sessions.id, s.id), eq(sessions.refreshHash, presentedHash)))
      .returning({ id: sessions.id });
    return rows.length ? `${s.id}.${secret}` : null;
  }

  async touch(s: Session, now = new Date()) {
    if (now.getTime() - s.lastActivityAt.getTime() < ACTIVITY_WRITE_INTERVAL_MS) return s.lastActivityAt;
    await this.db.update(sessions).set({ lastActivityAt: now }).where(eq(sessions.id, s.id));
    return now;
  }

  async revoke(id: string, reason: string, revokedById: string | null = null) {
    const rows = await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason, revokedById })
      .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return rows.length > 0;
  }

  /** Signs a user out everywhere (optionally keeping one session). Returns how many were revoked. */
  async revokeAllForUser(userId: string, reason: string, revokedById: string | null = null, exceptId?: string) {
    const rows = await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason, revokedById })
      .where(
        and(eq(sessions.userId, userId), isNull(sessions.revokedAt), exceptId ? ne(sessions.id, exceptId) : undefined),
      )
      .returning({ id: sessions.id });
    return rows.length;
  }

  async listActive(userId: string, currentSessionId?: string): Promise<SessionDto[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastActivityAt));
    return rows.map((s) => ({
      id: s.id,
      ip: s.ip,
      browser: s.browser,
      os: s.os,
      device: s.device,
      createdAt: s.createdAt.toISOString(),
      lastActivityAt: s.lastActivityAt.toISOString(),
      current: s.id === currentSessionId,
    }));
  }
}
