import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  ChangePasswordInput,
  LoginInput,
  LoginResponse,
  MfaChallengeResponse,
  ResetPasswordInput,
} from '@vo/shared';
import * as argon2 from 'argon2';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { decrypt, encrypt, generateRecoveryCode, randomToken, safeEqual, sha256 } from '../common/crypto';
import type { ClientInfo } from '../common/request-context';
import { DB, Db } from '../db/client';
import { mfaRecoveryCodes, oneTimeTokens, Session, User, users } from '../db/schema';
import { actionEmail, MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { UserReader } from '../users/user-reader';
import { AuthEventsService } from './auth-events.service';
import { parseRefreshToken, REFRESH_GRACE_MS, sessionState } from './session-policy';
import { SessionsService } from './sessions.service';
import { TokensService } from './tokens.service';

authenticator.options = { window: 1 }; // accept the previous/next 30s code for clock drift

const ARGON_OPTS: argon2.Options =
  process.env.NODE_ENV === 'test'
    ? { type: argon2.argon2id, memoryCost: 4096, timeCost: 2 } // fast in tests only
    : { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 }; // OWASP baseline

export const hashPassword = (plain: string) => argon2.hash(plain, ARGON_OPTS);

const INVALID_CREDENTIALS = 'Incorrect email or password';
const RESET_TTL_MS = 60 * 60_000; // 1 hour
export const INVITE_TTL_MS = 7 * 86_400_000; // 7 days

export interface IssuedSession {
  body: LoginResponse;
  refreshToken: string;
  csrfToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly tokens: TokensService,
    private readonly sessions: SessionsService,
    private readonly events: AuthEventsService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly userReader: UserReader,
  ) {}

  /* ------------------------------ login ------------------------------ */

  async login(input: LoginInput, client: ClientInfo): Promise<IssuedSession | MfaChallengeResponse> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, input.email) });

    if (!user || !user.passwordHash) {
      // Spend the same time as a real check so response timing doesn't reveal which emails exist.
      await argon2.verify(await this.getDummyHash(), input.password).catch(() => false);
      await this.events.log({ type: 'LOGIN_FAILED', userId: user?.id, email: input.email, detail: user ? 'no password set' : 'unknown email', client });
      throw new UnauthorizedException({ message: INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' });
    }

    this.assertNotLocked(user);

    const ok = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) {
      await this.registerFailure(user, client, 'wrong password');
      throw new UnauthorizedException({ message: INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' });
    }

    if (user.status !== 'ACTIVE') {
      await this.events.log({ type: 'LOGIN_FAILED', userId: user.id, email: user.email, detail: 'account deactivated', client });
      throw new ForbiddenException({ message: 'This account is deactivated. Contact your administrator.', code: 'ACCOUNT_DEACTIVATED' });
    }

    if (user.mfaEnabled) {
      return { mfaRequired: true, mfaToken: this.tokens.signMfa(user.id) };
    }
    return this.completeLogin(user, client, 'password');
  }

  async loginMfa(mfaToken: string, code: string, client: ClientInfo): Promise<IssuedSession> {
    const userId = this.tokens.verifyMfa(mfaToken);
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user || user.status !== 'ACTIVE' || !user.mfaEnabled || !user.mfaSecretEnc) {
      throw new UnauthorizedException({ message: 'That sign-in attempt expired. Please start again.', code: 'MFA_EXPIRED' });
    }
    this.assertNotLocked(user);

    const method = await this.verifySecondFactor(user, code);
    if (!method) {
      await this.events.log({ type: 'MFA_FAILED', userId: user.id, email: user.email, client });
      await this.registerFailure(user, client, 'wrong 2FA code', false);
      throw new UnauthorizedException({ message: 'That code is not valid. Try again.', code: 'MFA_INVALID' });
    }
    return this.completeLogin(user, client, method === 'recovery' ? 'password+recovery_code' : 'password+totp');
  }

  /** Creates the session, logs LOGIN_SUCCESS and returns what the controller needs to set cookies. */
  async completeLogin(user: User, client: ClientInfo, method: string): Promise<IssuedSession> {
    const { session, refreshToken } = await this.sessions.create(user.id, client, method);
    await this.db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
    await this.events.log({
      type: 'LOGIN_SUCCESS',
      userId: user.id,
      email: user.email,
      sessionId: session.id,
      detail: method,
      client,
    });
    return {
      body: await this.sessionBody(user.id, session.id),
      refreshToken,
      csrfToken: randomToken(24),
    };
  }

  private async sessionBody(userId: string, sessionId: string): Promise<LoginResponse> {
    const [me, s] = await Promise.all([this.userReader.me(userId), this.settings.get()]);
    return {
      mfaRequired: false,
      accessToken: this.tokens.signAccess(userId, sessionId),
      expiresIn: env().ACCESS_TOKEN_TTL_SECONDS,
      user: me!,
      sessionTimeoutMinutes: s.sessionTimeoutMinutes,
    };
  }

  private assertNotLocked(user: User) {
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        {
          message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`,
          code: 'ACCOUNT_LOCKED',
        },
        HttpStatus.LOCKED,
      );
    }
  }

  private async registerFailure(user: User, client: ClientInfo, detail: string, logFailure = true) {
    const e = env();
    const count = user.failedLoginCount + 1;
    const lock = count >= e.LOGIN_MAX_FAILED_ATTEMPTS;
    await this.db
      .update(users)
      .set({
        failedLoginCount: lock ? 0 : count,
        lockedUntil: lock ? new Date(Date.now() + e.LOGIN_LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
      })
      .where(eq(users.id, user.id));
    if (logFailure) await this.events.log({ type: 'LOGIN_FAILED', userId: user.id, email: user.email, detail, client });
    if (lock) {
      await this.events.log({
        type: 'LOGIN_LOCKED',
        userId: user.id,
        email: user.email,
        detail: `locked for ${e.LOGIN_LOCKOUT_MINUTES} minutes after ${e.LOGIN_MAX_FAILED_ATTEMPTS} failed attempts`,
        client,
      });
    }
  }

  private async verifySecondFactor(user: User, code: string): Promise<'totp' | 'recovery' | null> {
    const trimmed = code.trim().toLowerCase();
    if (/^\d{6}$/.test(trimmed)) {
      return authenticator.check(trimmed, decrypt(user.mfaSecretEnc!)) ? 'totp' : null;
    }
    const [used] = await this.db
      .update(mfaRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(mfaRecoveryCodes.userId, user.id),
          eq(mfaRecoveryCodes.codeHash, sha256(trimmed)),
          isNull(mfaRecoveryCodes.usedAt),
        ),
      )
      .returning({ id: mfaRecoveryCodes.id });
    return used ? 'recovery' : null;
  }

  private getDummyHash() {
    this.dummyHash ??= hashPassword(randomToken(16));
    return this.dummyHash;
  }

  /* ------------------------- refresh & logout ------------------------ */

  /** Exchanges the refresh cookie for a new access token (and rotates the cookie). */
  async refresh(rawToken: unknown, client: ClientInfo): Promise<{ body: LoginResponse; refreshToken: string | null }> {
    const parsed = parseRefreshToken(rawToken);
    if (!parsed) throw new UnauthorizedException({ message: 'Please sign in', code: 'UNAUTHENTICATED' });

    const session = await this.sessions.byId(parsed.sessionId);
    if (!session) throw new UnauthorizedException({ message: 'Please sign in', code: 'UNAUTHENTICATED' });

    const hash = sha256(parsed.secret);
    const isCurrent = safeEqual(hash, session.refreshHash);
    const inGrace =
      !isCurrent &&
      !!session.previousRefreshHash &&
      safeEqual(hash, session.previousRefreshHash) &&
      !!session.refreshRotatedAt &&
      Date.now() - session.refreshRotatedAt.getTime() < REFRESH_GRACE_MS;

    if (!isCurrent && !inGrace) {
      // A stale token was replayed: assume it was stolen and end the session.
      if (await this.sessions.revoke(session.id, 'token_reuse')) {
        await this.events.log({ type: 'REFRESH_TOKEN_REUSE', userId: session.userId, sessionId: session.id, client });
      }
      throw new UnauthorizedException({ message: 'Your session has ended. Please sign in again.', code: 'SESSION_ENDED' });
    }

    const user = await this.db.query.users.findFirst({ where: eq(users.id, session.userId) });
    if (!user || user.status !== 'ACTIVE') {
      await this.sessions.revoke(session.id, 'deactivated');
      throw new UnauthorizedException({ message: 'Your account is deactivated', code: 'ACCOUNT_DEACTIVATED' });
    }

    await this.assertSessionUsable(session, user, client);
    // In grace (or if a parallel request rotated first) the browser already has the newer cookie: don't set one.
    const refreshToken = isCurrent ? await this.sessions.rotate(session, hash) : null;
    return { body: await this.sessionBody(user.id, session.id), refreshToken };
  }

  private async assertSessionUsable(session: Session, user: User, client: ClientInfo) {
    const { sessionTimeoutMinutes } = await this.settings.get();
    const state = sessionState(session, sessionTimeoutMinutes);
    if (state === 'idle_timeout') {
      if (await this.sessions.revoke(session.id, 'timeout')) {
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
  }

  /** Ends the session identified by the refresh cookie. `reason: timeout` is sent by the idle timer. */
  async logout(rawToken: unknown, reason: 'user' | 'timeout', client: ClientInfo) {
    const parsed = parseRefreshToken(rawToken);
    if (!parsed) return;
    const session = await this.sessions.byId(parsed.sessionId);
    if (!session) return;
    const hash = sha256(parsed.secret);
    const matches =
      safeEqual(hash, session.refreshHash) ||
      (!!session.previousRefreshHash && safeEqual(hash, session.previousRefreshHash));
    if (!matches) return;
    if (await this.sessions.revoke(session.id, reason === 'timeout' ? 'timeout' : 'logout')) {
      await this.events.log({
        type: reason === 'timeout' ? 'SESSION_TIMEOUT' : 'LOGOUT',
        userId: session.userId,
        sessionId: session.id,
        client,
      });
    }
  }

  /* ------------------------ inactivity tracking ----------------------- */

  async recordActivity(session: Session) {
    const last = await this.sessions.touch(session);
    return this.sessionStatus({ ...session, lastActivityAt: last });
  }

  async sessionStatus(session: Session) {
    const { sessionTimeoutMinutes } = await this.settings.get();
    return {
      lastActivityAt: session.lastActivityAt.toISOString(),
      expiresAt: new Date(session.lastActivityAt.getTime() + sessionTimeoutMinutes * 60_000).toISOString(),
      sessionTimeoutMinutes,
    };
  }

  /* ------------------------- password reset -------------------------- */

  /** Always succeeds from the caller's point of view (no account enumeration). */
  async forgotPassword(email: string, client: ClientInfo) {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user || user.status !== 'ACTIVE') {
      this.logger.log(`Password reset requested for unknown/inactive email`);
      return;
    }
    const token = await this.issueToken(user.id, 'PASSWORD_RESET', RESET_TTL_MS);
    const { companyName } = await this.settings.get();
    const url = `${env().WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      to: user.email,
      subject: `Reset your ${companyName} Virtual Office password`,
      ...actionEmail({
        companyName,
        greeting: `Hi ${user.fullName},`,
        body: 'We received a request to reset your password. This link works once and expires in 1 hour.',
        actionLabel: 'Reset password',
        actionUrl: url,
        footer: "If you didn't ask for this, you can ignore this email. Your password won't change.",
      }),
    });
    await this.events.log({ type: 'PASSWORD_RESET_REQUESTED', userId: user.id, email: user.email, client });
  }

  async issueToken(userId: string, purpose: 'PASSWORD_RESET' | 'INVITE', ttlMs: number) {
    const token = randomToken(32);
    // Only one live token per purpose: older links stop working.
    await this.db
      .update(oneTimeTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(oneTimeTokens.userId, userId), eq(oneTimeTokens.purpose, purpose), isNull(oneTimeTokens.usedAt)));
    await this.db.insert(oneTimeTokens).values({
      userId,
      purpose,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return token;
  }

  private async findLiveToken(token: string) {
    const [row] = await this.db
      .select({ token: oneTimeTokens, user: users })
      .from(oneTimeTokens)
      .innerJoin(users, eq(users.id, oneTimeTokens.userId))
      .where(
        and(
          eq(oneTimeTokens.tokenHash, sha256(token)),
          isNull(oneTimeTokens.usedAt),
          gt(oneTimeTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!row || row.user.status !== 'ACTIVE') {
      throw new UnauthorizedException({ message: 'This link is invalid or has expired. Request a new one.', code: 'TOKEN_INVALID' });
    }
    return row;
  }

  async validateResetToken(token: string) {
    const { token: t, user } = await this.findLiveToken(token);
    return { email: user.email, fullName: user.fullName, purpose: t.purpose };
  }

  async resetPassword(input: ResetPasswordInput, client: ClientInfo) {
    const { token, user } = await this.findLiveToken(input.token);
    const passwordHash = await hashPassword(input.password);
    await this.db.transaction(async (tx) => {
      await tx.update(oneTimeTokens).set({ usedAt: new Date() }).where(eq(oneTimeTokens.id, token.id));
      await tx
        .update(users)
        .set({ passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
    });
    const revoked = await this.sessions.revokeAllForUser(user.id, 'password_reset');
    await this.events.log({
      type: 'PASSWORD_RESET',
      userId: user.id,
      email: user.email,
      detail: token.purpose === 'INVITE' ? 'account setup from invite' : `signed out of ${revoked} session(s)`,
      client,
    });
    return { purpose: token.purpose };
  }

  async changePassword(user: User, session: Session, input: ChangePasswordInput, client: ClientInfo) {
    const ok = user.passwordHash && (await argon2.verify(user.passwordHash, input.currentPassword).catch(() => false));
    if (!ok) {
      throw new ForbiddenException({ message: 'Your current password is incorrect', errors: { currentPassword: ['Incorrect password'] } });
    }
    if (input.currentPassword === input.newPassword) {
      throw new ConflictException({ message: 'Choose a password you have not just used', errors: { newPassword: ['Must be different'] } });
    }
    await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date() })
      .where(eq(users.id, user.id));
    const revoked = await this.sessions.revokeAllForUser(user.id, 'password_changed', user.id, session.id);
    await this.events.log({
      type: 'PASSWORD_CHANGED',
      userId: user.id,
      sessionId: session.id,
      detail: `signed out of ${revoked} other session(s)`,
      client,
    });
    return { otherSessionsSignedOut: revoked };
  }

  /* ------------------------------- 2FA -------------------------------- */

  async mfaSetup(user: User) {
    if (user.mfaEnabled) throw new ConflictException('Two-factor authentication is already on');
    const secret = authenticator.generateSecret(20);
    await this.db.update(users).set({ mfaSecretEnc: encrypt(secret) }).where(eq(users.id, user.id));
    const { companyName } = await this.settings.get();
    const otpauthUrl = authenticator.keyuri(user.email, `${companyName} Virtual Office`, secret);
    return { secret, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }) };
  }

  async mfaEnable(user: User, code: string, client: ClientInfo) {
    if (user.mfaEnabled) throw new ConflictException('Two-factor authentication is already on');
    if (!user.mfaSecretEnc) throw new ConflictException('Start setup first');
    if (!authenticator.check(code, decrypt(user.mfaSecretEnc))) {
      throw new ForbiddenException({ message: 'That code is not valid. Check your authenticator app and try again.', errors: { code: ['Invalid code'] } });
    }
    const codes = Array.from({ length: 10 }, generateRecoveryCode);
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ mfaEnabled: true }).where(eq(users.id, user.id));
      await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, user.id));
      await tx.insert(mfaRecoveryCodes).values(codes.map((c) => ({ userId: user.id, codeHash: sha256(c) })));
    });
    await this.events.log({ type: 'MFA_ENABLED', userId: user.id, client });
    return { recoveryCodes: codes };
  }

  async mfaDisable(user: User, password: string, code: string, client: ClientInfo) {
    if (!user.mfaEnabled) throw new ConflictException('Two-factor authentication is not on');
    const pwOk = user.passwordHash && (await argon2.verify(user.passwordHash, password).catch(() => false));
    const codeOk = pwOk && (await this.verifySecondFactor(user, code));
    if (!pwOk || !codeOk) {
      throw new ForbiddenException({ message: 'Password or code is incorrect' });
    }
    await this.clearMfa(user.id);
    await this.events.log({ type: 'MFA_DISABLED', userId: user.id, client });
  }

  async clearMfa(userId: string) {
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ mfaEnabled: false, mfaSecretEnc: null }).where(eq(users.id, userId));
      await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    });
  }
}
