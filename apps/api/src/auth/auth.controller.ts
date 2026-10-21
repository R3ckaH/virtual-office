import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  loginSchema,
  mfaDisableSchema,
  mfaEnableSchema,
  mfaLoginSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type MfaLoginInput,
  type ResetPasswordInput,
} from '@vo/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthContext, CurrentAuth, Public } from '../common/auth-context';
import { clientInfo } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { AuthEventsService } from './auth-events.service';
import { AuthService, IssuedSession } from './auth.service';
import { clearAuthCookies, csrfOk, CSRF_COOKIE, REFRESH_COOKIE, setAuthCookies } from './cookies';
import { SessionsService } from './sessions.service';

const authLimit = { default: { limit: () => env().AUTH_RATE_LIMIT_PER_MIN, ttl: 60_000 } };

const logoutSchema = z.object({ reason: z.enum(['user', 'timeout']).default('user') });
const tokenOnlySchema = z.object({ token: z.string().min(20).max(200) });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly events: AuthEventsService,
  ) {}

  private respond(res: Response, issued: IssuedSession) {
    setAuthCookies(res, issued.refreshToken, issued.csrfToken);
    return issued.body;
  }

  @Public()
  @Throttle(authLimit)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body, clientInfo(req));
    return 'mfaRequired' in result ? result : this.respond(res, result);
  }

  @Public()
  @Throttle(authLimit)
  @Post('login/mfa')
  @HttpCode(200)
  async loginMfa(
    @Body(new ZodPipe(mfaLoginSchema)) body: MfaLoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.loginMfa(body.mfaToken, body.code, clientInfo(req)));
  }

  /** Restores a session on page load and renews the access token. Needs the CSRF header. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!csrfOk(req)) throw new ForbiddenException({ message: 'Invalid request', code: 'CSRF' });
    try {
      const { body, refreshToken } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], clientInfo(req));
      if (refreshToken) setAuthCookies(res, refreshToken, req.cookies[CSRF_COOKIE]);
      return body;
    } catch (e) {
      if (e instanceof UnauthorizedException) clearAuthCookies(res);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodPipe(logoutSchema)) body: z.infer<typeof logoutSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (csrfOk(req)) await this.auth.logout(req.cookies?.[REFRESH_COOKIE], body.reason, clientInfo(req));
    clearAuthCookies(res);
  }

  @Public()
  @Throttle(authLimit)
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body(new ZodPipe(forgotPasswordSchema)) body: ForgotPasswordInput, @Req() req: Request) {
    await this.auth.forgotPassword(body.email, clientInfo(req));
    return { message: 'If that email belongs to an active account, a reset link is on its way.' };
  }

  @Public()
  @Throttle(authLimit)
  @Post('reset-password/validate')
  @HttpCode(200)
  validateReset(@Body(new ZodPipe(tokenOnlySchema)) body: { token: string }) {
    return this.auth.validateResetToken(body.token);
  }

  @Public()
  @Throttle(authLimit)
  @Post('reset-password')
  @HttpCode(200)
  reset(@Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput, @Req() req: Request) {
    return this.auth.resetPassword(body, clientInfo(req));
  }

  /* ----- signed-in endpoints ----- */

  /** Session timing for the idle-warning dialog. Does NOT count as activity. */
  @Get('session')
  status(@CurrentAuth() a: AuthContext) {
    return this.auth.sessionStatus(a.session);
  }

  /** Called by the browser (throttled) while the user is actually using the app. */
  @Post('activity')
  @HttpCode(200)
  activity(@CurrentAuth() a: AuthContext) {
    return this.auth.recordActivity(a.session);
  }

  @Get('sessions')
  mySessions(@CurrentAuth() a: AuthContext) {
    return this.sessions.listActive(a.user.id, a.session.id);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeMine(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const s = await this.sessions.byId(id);
    if (!s || s.userId !== a.user.id) throw new NotFoundException('Session not found');
    if (await this.sessions.revoke(id, 'logout', a.user.id)) {
      await this.events.log({
        type: 'LOGOUT',
        userId: a.user.id,
        sessionId: id,
        detail: id === a.session.id ? null : 'signed out from another device',
        client: clientInfo(req),
      });
    }
  }

  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@CurrentAuth() a: AuthContext) {
    return this.auth.mfaSetup(a.user);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  mfaEnable(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(mfaEnableSchema)) body: { code: string }, @Req() req: Request) {
    return this.auth.mfaEnable(a.user, body.code, clientInfo(req));
  }

  @Post('mfa/disable')
  @HttpCode(204)
  async mfaDisable(
    @CurrentAuth() a: AuthContext,
    @Body(new ZodPipe(mfaDisableSchema)) body: { password: string; code: string },
    @Req() req: Request,
  ) {
    await this.auth.mfaDisable(a.user, body.password, body.code, clientInfo(req));
  }
}
