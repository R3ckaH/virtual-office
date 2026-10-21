import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull } from 'drizzle-orm';
import { AuthedRequest, IS_PUBLIC } from '../common/auth-context';
import { clientInfo } from '../common/request-context';
import { DB, Db } from '../db/client';
import { sessions, users } from '../db/schema';
import { SettingsService } from '../settings/settings.service';
import { AuthEventsService } from './auth-events.service';
import { sessionState } from './session-policy';
import { TokensService } from './tokens.service';

/**
 * Global authentication guard. Every endpoint requires a valid access token unless marked @Public().
 * The session row is checked on every request, so force-logout, deactivation and the inactivity
 * timeout take effect immediately rather than when the access token expires.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly settings: SettingsService,
    private readonly events: AuthEventsService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ message: 'Please sign in', code: 'UNAUTHENTICATED' });
    }
    const claims = this.tokens.verifyAccess(header.slice(7));

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
        await this.events.log({
          type: 'SESSION_TIMEOUT',
          userId: user.id,
          sessionId: session.id,
          client: clientInfo(req),
        });
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

    req.auth = { user, session };
    return true;
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
