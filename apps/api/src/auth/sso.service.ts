import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SsoProvider } from '@vo/shared';
import { and, eq } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { createHash } from 'node:crypto';
import { env } from '../config/env';
import { randomToken } from '../common/crypto';
import { DB, Db } from '../db/client';
import { ssoIdentities, User, users } from '../db/schema';

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  scope: string;
  issuerOk: (iss: string, payload: JWTPayload) => boolean;
}

export interface SsoState {
  provider: SsoProvider;
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

export class SsoError extends Error {
  constructor(readonly code: 'sso_failed' | 'sso_no_account' | 'sso_deactivated' | 'sso_unverified_email') {
    super(code);
  }
}

/**
 * Google / Microsoft sign-in (OpenID Connect, authorization code + PKCE).
 * SSO only signs in people who already have an account here: accounts are provisioned by an Admin,
 * and the first SSO sign-in links the provider identity to the user with the same verified email.
 * The identity provider's own MFA applies to SSO sign-ins.
 */
@Injectable()
export class SsoService {
  private readonly logger = new Logger('SSO');
  private readonly jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
  ) {}

  private config(provider: SsoProvider): ProviderConfig | null {
    const e = env();
    if (provider === 'google' && e.GOOGLE_CLIENT_ID) {
      return {
        clientId: e.GOOGLE_CLIENT_ID,
        clientSecret: e.GOOGLE_CLIENT_SECRET,
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
        scope: 'openid email profile',
        issuerOk: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
      };
    }
    if (provider === 'microsoft' && e.MICROSOFT_CLIENT_ID) {
      const tenant = e.MICROSOFT_TENANT;
      return {
        clientId: e.MICROSOFT_CLIENT_ID,
        clientSecret: e.MICROSOFT_CLIENT_SECRET,
        authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        jwksUrl: `https://login.microsoftonline.com/common/discovery/v2.0/keys`,
        scope: 'openid email profile',
        // Multi-tenant endpoints issue tokens from the user's own tenant.
        issuerOk: (iss, p) =>
          typeof p.tid === 'string' && iss === `https://login.microsoftonline.com/${p.tid}/v2.0` &&
          (['common', 'organizations'].includes(tenant) || p.tid === tenant),
      };
    }
    return null;
  }

  enabledProviders(): SsoProvider[] {
    return (['google', 'microsoft'] as const).filter((p) => this.config(p));
  }

  redirectUri(provider: SsoProvider) {
    return `${env().API_ORIGIN}/api/auth/sso/${provider}/callback`;
  }

  /** Builds the provider URL and the signed state that goes into a short-lived cookie. */
  start(provider: SsoProvider, returnTo: string) {
    const cfg = this.config(provider);
    if (!cfg) throw new SsoError('sso_failed');
    const st: SsoState = {
      provider,
      state: randomToken(16),
      nonce: randomToken(16),
      verifier: randomToken(48),
      returnTo: returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/',
    };
    const url = new URL(cfg.authorizeUrl);
    url.search = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri(provider),
      scope: cfg.scope,
      state: st.state,
      nonce: st.nonce,
      code_challenge: createHash('sha256').update(st.verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return { url: url.toString(), stateCookie: this.jwt.sign({ ...st, typ: 'sso' }, { expiresIn: 600 }) };
  }

  readState(cookie: unknown): SsoState | null {
    if (typeof cookie !== 'string') return null;
    try {
      const p = this.jwt.verify<SsoState & { typ: string }>(cookie);
      return p.typ === 'sso' ? p : null;
    } catch {
      return null;
    }
  }

  /** Exchanges the code, verifies the ID token, and returns the matching active user. */
  async complete(provider: SsoProvider, code: string, st: SsoState): Promise<User> {
    const cfg = this.config(provider);
    if (!cfg) throw new SsoError('sso_failed');

    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(provider),
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code_verifier: st.verifier,
      }),
    });
    if (!tokenRes.ok) {
      this.logger.warn(`${provider} token exchange failed: ${tokenRes.status}`);
      throw new SsoError('sso_failed');
    }
    const { id_token } = (await tokenRes.json()) as { id_token?: string };
    if (!id_token) throw new SsoError('sso_failed');

    let jwks = this.jwks.get(cfg.jwksUrl);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(cfg.jwksUrl));
      this.jwks.set(cfg.jwksUrl, jwks);
    }
    const { payload } = await jwtVerify(id_token, jwks, { audience: cfg.clientId }).catch(() => {
      throw new SsoError('sso_failed');
    });
    if (!payload.iss || !cfg.issuerOk(payload.iss, payload) || payload.nonce !== st.nonce || !payload.sub) {
      throw new SsoError('sso_failed');
    }

    const email = String(payload.email ?? payload.preferred_username ?? '').toLowerCase();
    // Google says whether the email is verified; Microsoft work accounts are verified by the tenant.
    const verified = provider === 'google' ? payload.email_verified === true : !!email;
    return this.resolveUser(provider, payload.sub, email, verified);
  }

  async resolveUser(provider: SsoProvider, subject: string, email: string, emailVerified: boolean): Promise<User> {
    const [linked] = await this.db
      .select({ user: users })
      .from(ssoIdentities)
      .innerJoin(users, eq(users.id, ssoIdentities.userId))
      .where(and(eq(ssoIdentities.provider, provider), eq(ssoIdentities.subject, subject)))
      .limit(1);

    let user: User | undefined = linked?.user;
    if (!user) {
      if (!emailVerified || !email) throw new SsoError('sso_unverified_email');
      const byEmail = await this.db.query.users.findFirst({ where: eq(users.email, email) });
      if (!byEmail) throw new SsoError('sso_no_account');
      user = byEmail;
      await this.db.insert(ssoIdentities).values({ userId: user.id, provider, subject }).onConflictDoNothing();
    }
    if (user.status !== 'ACTIVE') throw new SsoError('sso_deactivated');
    return user;
  }
}
