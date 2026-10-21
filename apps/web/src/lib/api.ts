import type { ApiErrorBody } from '@vo/shared';

/** Thrown for any non-2xx response. `fieldErrors` maps form fields to messages. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

type SessionEndHandler = (code: string, message: string) => void;

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionEnd: SessionEndHandler = () => {};
let refresher: () => Promise<boolean> = async () => false;

export const tokenStore = {
  get: () => accessToken,
  set: (t: string | null) => {
    accessToken = t;
  },
};

export function configureApi(opts: { onSessionEnd: SessionEndHandler; refresh: () => Promise<boolean> }) {
  onSessionEnd = opts.onSessionEnd;
  refresher = opts.refresh;
}

export function readCookie(name: string): string {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

/** Codes meaning "this session is over": don't try to refresh, send the user to sign in. */
const TERMINAL = new Set(['SESSION_TIMEOUT', 'FORCED_LOGOUT', 'SESSION_ENDED', 'ACCOUNT_DEACTIVATED']);

async function raw(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const csrf = readCookie('vo_csrf');
  if (csrf) headers.set('x-csrf-token', csrf);
  return fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
}

async function toError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody & { code: string }> = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  return new ApiError(res.status, body.message ?? `Request failed (${res.status})`, body.code, body.errors ?? {});
}

/** JSON request with automatic access-token renewal. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401) {
    const err = await toError(res.clone());
    if (err.code && TERMINAL.has(err.code)) {
      onSessionEnd(err.code, err.message);
      throw err;
    }
    if (accessToken || err.code === 'TOKEN_INVALID') {
      refreshInFlight ??= refresher().finally(() => (refreshInFlight = null));
      if (await refreshInFlight) res = await raw(path, init);
    }
  }
  if (!res.ok) {
    const err = await toError(res);
    if (res.status === 401 && err.code && TERMINAL.has(err.code)) onSessionEnd(err.code, err.message);
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Low-level call without the renewal logic (used by the auth layer itself). */
export async function apiRaw<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const res = await raw(path, init);
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
