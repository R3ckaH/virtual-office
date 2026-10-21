import { Controller, Get, NotFoundException, Param, Query, Req, Res } from '@nestjs/common';
import { SSO_PROVIDERS, SsoProvider } from '@vo/shared';
import type { Request, Response } from 'express';
import { Public } from '../common/auth-context';
import { clientInfo } from '../common/request-context';
import { env, isProd } from '../config/env';
import { AuthEventsService } from './auth-events.service';
import { AuthService } from './auth.service';
import { setAuthCookies } from './cookies';
import { SsoError, SsoService } from './sso.service';

const STATE_COOKIE = 'vo_sso';

@Public()
@Controller('auth/sso')
export class SsoController {
  constructor(
    private readonly sso: SsoService,
    private readonly auth: AuthService,
    private readonly events: AuthEventsService,
  ) {}

  private provider(p: string): SsoProvider {
    if (!(SSO_PROVIDERS as readonly string[]).includes(p) || !this.sso.enabledProviders().includes(p as SsoProvider)) {
      throw new NotFoundException('Sign-in provider not available');
    }
    return p as SsoProvider;
  }

  @Get(':provider/start')
  start(@Param('provider') p: string, @Query('returnTo') returnTo = '/', @Res() res: Response) {
    const { url, stateCookie } = this.sso.start(this.provider(p), returnTo);
    // Lax so the cookie comes back on the provider's top-level redirect to our callback.
    res.cookie(STATE_COOKIE, stateCookie, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax',
      path: '/api/auth/sso',
      maxAge: 600_000,
    });
    res.redirect(302, url);
  }

  @Get(':provider/callback')
  async callback(
    @Param('provider') p: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const provider = this.provider(p);
    const client = clientInfo(req);
    const st = this.sso.readState(req.cookies?.[STATE_COOKIE]);
    res.clearCookie(STATE_COOKIE, { path: '/api/auth/sso' });
    const fail = (codeName: string) => res.redirect(302, `${env().WEB_ORIGIN}/login?error=${codeName}`);

    if (!st || st.provider !== provider || !code || state !== st.state) return fail('sso_failed');
    try {
      const user = await this.sso.complete(provider, code, st);
      const issued = await this.auth.completeLogin(user, client, `sso:${provider}`);
      setAuthCookies(res, issued.refreshToken, issued.csrfToken);
      // The web app restores the session through /auth/refresh on load.
      return res.redirect(302, `${env().WEB_ORIGIN}${st.returnTo}`);
    } catch (e) {
      const reason = e instanceof SsoError ? e.code : 'sso_failed';
      await this.events.log({ type: 'LOGIN_FAILED', detail: `${provider}: ${reason}`, client });
      return fail(reason);
    }
  }
}
