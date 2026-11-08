import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { ClientInfo } from '../common/request-context';
import { DB, Db } from '../db/client';
import { Session, sessions, User, users } from '../db/schema';
import { SettingsService } from '../settings/settings.service';
import { AuthEventsService } from './auth-events.service';
import { sessionState } from './session-policy';
import { TokensService } from './tokens.service';

/**
 * Turns an access token into a signed-in person, checking the session row every time, so
 * force-logout, deactivation and the inactivity timeout apply at once. Used by the HTTP guard
 * and by the live (Socket.IO) connection.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly tokens: TokensService,
    private readonly settings: SettingsService,
    private readonly events: AuthEventsService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async authenticate(token: string, client: ClientInfo): Promise<{ user: User; session: Session }> {
    const claims = this.tokens.verifyAccess(token);

    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, claims.sid))
      .limit(1);

    if (!row || row.user.id !== claims.sub) {
      throw new UnauthorizedException({ message: 'Please sign in', code: 'UNAUTHENTICATED' });
    }
    const { session, user } = row;

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException({ message: 'Your account is deactivated', code: 'ACCOUNT_DEACTIVATED' });
    }

    const { sessionTimeoutMinutes } = await this.settings.get();
    const state = sessionState(session, sessionTimeoutMinutes);
    if (state === 'idle_timeout') {
      if (await this.revokeForTimeout(session.id)) {
        await this.events.log({ type: 'SESSION_TIMEOUT', userId: user.id, sessionId: session.id, client });
      }
      throw new UnauthorizedException({ message: 'You were signed out after a period of inactivity', code: 'SESSION_TIMEOUT' });
    }
    if (state !== 'active') {
      const forced = session.revokedReason === 'forced' || session.revokedReason === 'deactivated';
      throw new UnauthorizedException({
        message: forced ? 'An administrator signed you out' : 'Your session has ended. Please sign in again.',
        code: forced ? 'FORCED_LOGOUT' : 'SESSION_ENDED',
      });
    }
    return { user, session };
  }

  private async revokeForTimeout(sessionId: string) {
    const rows = await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: 'timeout' })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return rows.length > 0;
  }
}
