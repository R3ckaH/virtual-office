import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Paths that are called straight on the Railway domain, never through Vercel, so they can't carry
 * the secret: the health check (Railway itself), biometric terminals pushing over ADMS, and the
 * office sync agent. Each has its own check: device serial/IP for ADMS, a device token for ingest.
 */
const DIRECT_EXACT = new Set(['/api/health']);
const DIRECT_PREFIXES = ['/iclock/', '/api/ingest/'];
export const isDirectPath = (path: string) => DIRECT_EXACT.has(path) || DIRECT_PREFIXES.some((p) => path.startsWith(p));

function sameSecret(given: string, expected: Buffer): boolean {
  const g = Buffer.from(given);
  return g.length === expected.length && timingSafeEqual(g, expected);
}

/**
 * The client IP Vercel saw. Vercel overwrites x-forwarded-for on its edge, so the
 * first entry is the real client; the hosting proxy may append its own hop after it.
 */
function edgeClientIp(req: Request): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  if (first) return first;
  const real = req.headers['x-real-ip'];
  return (Array.isArray(real) ? real[0] : real)?.trim() || undefined;
}

/**
 * When ORIGIN_SECRET is set, the API only answers requests that came through the
 * Vercel proxy (which adds x-origin-secret). Those requests carry the real client IP
 * in forwarding headers, and we trust them only after the secret matches, so rate
 * limits, lockouts and login history see each user, not Vercel's address.
 */
export function edgeGuard(secret: string) {
  const expected = Buffer.from(secret);
  return (req: Request, res: Response, next: NextFunction) => {
    if (isDirectPath(req.path)) return next(); // req.ip comes from 'trust proxy' (Railway's edge)
    const given = req.headers['x-origin-secret'];
    if (typeof given !== 'string' || !sameSecret(given, expected)) {
      res.status(403).json({ statusCode: 403, message: 'Direct access is not allowed' });
      return;
    }
    const ip = edgeClientIp(req);
    if (ip) Object.defineProperty(req, 'ip', { value: ip, configurable: true });
    next();
  };
}

/** API responses are per-user; never let a CDN or browser cache them. */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
