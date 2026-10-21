import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DeviceConfig } from './config';
import { AgentPunch, parseAttlog, zkTime } from './punches';

export interface Source {
  /** every punch the source can see (the agent filters to recent ones) */
  read(): Promise<AgentPunch[]>;
}

/** ZKTeco (and compatible) terminals over the office network, port 4370. */
export class ZkSource implements Source {
  constructor(private readonly c: Extract<DeviceConfig, { type: 'zkteco' }>) {}

  async read(): Promise<AgentPunch[]> {
    // loaded lazily so tests and folder-only setups don't need it
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Zkteco = require('zkteco-js');
    const device = new Zkteco(this.c.ip, this.c.port, this.c.timeoutMs, 4000);
    await device.createSocket();
    try {
      const res = (await device.getAttendances()) as { data?: { user_id: string | number; record_time: unknown }[] };
      const out: AgentPunch[] = [];
      for (const r of res.data ?? []) {
        const at = zkTime(r.record_time);
        const id = String(r.user_id ?? '').trim();
        if (at && id) out.push({ deviceUserId: id, at });
      }
      return out;
    } finally {
      await device.disconnect().catch(() => undefined);
    }
  }
}

/** A folder where exported attlog files (.dat/.txt) are dropped, e.g. from a USB stick. */
export class FolderSource implements Source {
  constructor(private readonly c: Extract<DeviceConfig, { type: 'folder' }>) {}

  async read(): Promise<AgentPunch[]> {
    const files = readdirSync(this.c.path).filter((f) => /\.(dat|txt|log)$/i.test(f));
    const out: AgentPunch[] = [];
    for (const f of files) {
      const full = join(this.c.path, f);
      if (statSync(full).size > 50 * 1024 * 1024) continue; // not an attendance log
      out.push(...parseAttlog(readFileSync(full, 'utf8')));
    }
    return out;
  }
}

export function sourceFor(c: DeviceConfig): Source {
  return c.type === 'zkteco' ? new ZkSource(c) : new FolderSource(c);
}
