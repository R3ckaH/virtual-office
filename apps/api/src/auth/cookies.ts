import type { CookieOptions, Request, Response } from 'express';
import { env, isProd } from '../config/env';
import { safeEqual } from '../common/crypto';

export const REFRESH_COOKIE = 'vo_rt';
export const CSRF_COOKIE = 'vo_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const base = (): CookieOptions => ({ secure: isProd(), sameSite: 'strict', path: '/' });

export function setAuthCookies(res: Response, refreshToken: string, csrfToken: string) {
  const maxAge = env().REFRESH_TOKEN_TTL_DAYS * 86_400_000;
  // httpOnly: never readable by JS (XSS can't steal it). Scoped to the auth routes only.
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base(), httpOnly: true, path: '/api/auth', maxAge });
  // Readable by JS on purpose: double-submit CSRF token echoed in the X-CSRF-Token header.
  res.cookie(CSRF_COOKIE, csrfToken, { ...base(), httpOnly: false, maxAge });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...base(), httpOnly: true, path: '/api/auth' });
  res.clearCookie(CSRF_COOKIE, { ...base(), httpOnly: false });
}

/** Double-submit check for the cookie-authenticated endpoints (refresh, logout). */
export function csrfOk(req: Request): boolean {
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.headers[CSRF_HEADER];
  return typeof cookie === 'string' && typeof header === 'string' && cookie.length > 0 && safeEqual(cookie, header);
}
