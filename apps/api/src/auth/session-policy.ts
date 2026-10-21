/** Pure rules for session validity; kept separate so they are easy to unit test. */

export type SessionState = 'active' | 'revoked' | 'expired' | 'idle_timeout';

export interface SessionLike {
  revokedAt: Date | null;
  expiresAt: Date;
  lastActivityAt: Date;
}

export function sessionState(s: SessionLike, timeoutMinutes: number, now = new Date()): SessionState {
  if (s.revokedAt) return 'revoked';
  if (s.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (now.getTime() - s.lastActivityAt.getTime() > timeoutMinutes * 60_000) return 'idle_timeout';
  return 'active';
}

/** Refresh cookie format: `<sessionId>.<secret>` */
export function parseRefreshToken(value: unknown): { sessionId: string; secret: string } | null {
  if (typeof value !== 'string') return null;
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32,})$/.exec(value);
  return m ? { sessionId: m[1], secret: m[2] } : null;
}

/** How long the previous refresh token keeps working after rotation (parallel tabs). */
export const REFRESH_GRACE_MS = 30_000;

/** Don't write last_activity_at more often than this. */
export const ACTIVITY_WRITE_INTERVAL_MS = 30_000;
