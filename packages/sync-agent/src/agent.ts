import { readFileSync, writeFileSync } from 'node:fs';
import type { AgentConfig, DeviceConfig } from './config';
import { after, AgentPunch } from './punches';
import { Source, sourceFor } from './sources';

type Fetch = typeof fetch;

export interface State {
  /** per device name: the newest punch time already uploaded */
  lastSent: Record<string, string>;
}

export interface RunResult {
  device: string;
  ok: boolean;
  read: number;
  sent: number;
  added: number;
  message?: string;
}

const BATCH = 500;

export class ApiClient {
  constructor(
    private readonly apiUrl: string,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  private async call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.fetchFn(`${this.apiUrl}${path}`, {
          ...init,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
        });
        if (res.status === 401) throw Object.assign(new Error('The server rejected the token. Create a new one in Biometric devices → Settings.'), { fatal: true });
        if (!res.ok) throw new Error(`Server answered ${res.status}`);
        return (await res.json()) as T;
      } catch (e) {
        lastErr = e;
        if ((e as { fatal?: boolean }).fatal) throw e;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    throw lastErr;
  }

  status(token: string) {
    return this.call<{ name: string; syncRequested: boolean }>('/ingest/status', token);
  }

  async upload(token: string, punches: AgentPunch[]) {
    let added = 0;
    for (let i = 0; i < punches.length; i += BATCH) {
      const r = await this.call<{ added: number }>('/ingest/punches', token, {
        method: 'POST',
        body: JSON.stringify({ punches: punches.slice(i, i + BATCH) }),
      });
      added += r.added;
    }
    return added;
  }
}

/** Wall-clock text for "now minus N hours", in this PC's local time (the same clock the devices use). */
function since(lastSent: string | undefined, overlapHours: number, now: Date): string {
  const d = new Date(now.getTime() - overlapHours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const floor = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  return lastSent && lastSent < floor ? lastSent : floor;
}

export class Agent {
  constructor(
    private readonly config: AgentConfig,
    private readonly api: ApiClient,
    private readonly state: State,
    private readonly sources: (c: DeviceConfig) => Source = sourceFor,
    private readonly log: (msg: string) => void = (m) => console.log(`[${new Date().toISOString()}] ${m}`),
  ) {}

  /** Reads every device once and uploads what's new. One failing device doesn't stop the others. */
  async runOnce(now = new Date()): Promise<RunResult[]> {
    const results: RunResult[] = [];
    for (const d of this.config.devices) {
      try {
        await this.api.status(d.token); // heartbeat: shows the device as online
        const all = await this.sources(d).read();
        const from = since(this.state.lastSent[d.name], this.config.overlapHours, now);
        const fresh = all.filter((p) => after(p, from)).sort((a, b) => a.at.localeCompare(b.at));
        const added = fresh.length ? await this.api.upload(d.token, fresh) : 0;
        if (fresh.length) this.state.lastSent[d.name] = fresh[fresh.length - 1].at;
        results.push({ device: d.name, ok: true, read: all.length, sent: fresh.length, added });
        if (added) this.log(`${d.name}: ${added} new punch${added === 1 ? '' : 'es'} uploaded`);
      } catch (e) {
        const message = (e as Error).message;
        results.push({ device: d.name, ok: false, read: 0, sent: 0, added: 0, message });
        this.log(`${d.name}: ${message}`);
      }
    }
    return results;
  }

  /** True when HR pressed "Sync now" for any device since the last check. */
  async syncRequested(): Promise<boolean> {
    for (const d of this.config.devices) {
      try {
        if ((await this.api.status(d.token)).syncRequested) return true;
      } catch {
        /* reported on the next run */
      }
    }
    return false;
  }
}

export function loadState(path: string): State {
  try {
    const s = JSON.parse(readFileSync(path, 'utf8')) as State;
    return { lastSent: s.lastSent ?? {} };
  } catch {
    return { lastSent: {} };
  }
}

export function saveState(path: string, s: State) {
  writeFileSync(path, JSON.stringify(s, null, 2));
}
