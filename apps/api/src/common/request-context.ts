import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
}

/** Summarizes the caller's IP and browser/OS/device for session and login logs. */
export function clientInfo(req: Request): ClientInfo {
  const ua = (req.headers['user-agent'] ?? '').slice(0, 512) || null;
  const r = ua ? new UAParser(ua).getResult() : null;
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ') || null;
  return {
    ip: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: ua,
    browser: r ? join(r.browser.name, r.browser.major) : null,
    os: r ? join(r.os.name, r.os.version) : null,
    device: r ? (r.device.type ?? 'desktop') : null,
  };
}
