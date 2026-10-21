import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Agent, ApiClient, State } from './agent';
import { AgentConfig, configSchema } from './config';
import { parseAttlog, zkTime } from './punches';
import { FolderSource } from './sources';

describe('reading device times', () => {
  it('takes the wall clock from zkteco-js record_time text', () => {
    expect(zkTime('Thu Oct 01 2026 08:12:33 GMT+0800 (Philippine Standard Time)')).toBe('2026-10-01 08:12:33');
    expect(zkTime(new Date(2026, 9, 1, 8, 12, 33))).toBe('2026-10-01 08:12:33');
    expect(zkTime('garbage')).toBeNull();
  });
  it('parses attlog lines', () => {
    expect(parseAttlog('  47\t2026-10-01 8:12:33\t0\t1\t0\n0021\t2026-10-01 07:58:20\t0\t15\nnope\n')).toEqual([
      { deviceUserId: '47', at: '2026-10-01 08:12:33', verify: 'Fingerprint' },
      { deviceUserId: '0021', at: '2026-10-01 07:58:20', verify: 'Face' },
    ]);
  });
});

function fakeServer(opts: { status?: number } = {}) {
  const seen = new Set<string>();
  const calls: { path: string; body?: { punches: { deviceUserId: string; at: string }[] } }[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const path = url.replace('https://office.test/api', '');
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    if (opts.status) return new Response('{}', { status: opts.status });
    if (path === '/ingest/status') return Response.json({ name: 'x', syncRequested: false });
    let added = 0;
    for (const p of body.punches) {
      const k = `${p.deviceUserId}|${p.at}`;
      if (!seen.has(k)) {
        seen.add(k);
        added++;
      }
    }
    return Response.json({ added, duplicates: body.punches.length - added, unknownUserIds: [] });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const config = (devices: unknown[]): AgentConfig => configSchema.parse({ apiUrl: 'https://office.test/api/', devices });
const zk = { type: 'zkteco', name: 'Studio', token: 'vod_x', ip: '10.0.0.5' };

describe('agent', () => {
  const now = new Date(2026, 9, 1, 10, 0, 0);
  const punches = [
    { deviceUserId: '11', at: '2026-10-01 07:40:12' },
    { deviceUserId: '12', at: '2026-10-01 07:52:10' },
    { deviceUserId: '12', at: '2026-09-01 07:52:10' }, // a month old: not resent
  ];

  it('sends heartbeat + recent punches, then only new ones next time', async () => {
    const server = fakeServer();
    const state: State = { lastSent: {} };
    let list = punches;
    const agent = new Agent(config([zk]), new ApiClient('https://office.test/api', server.fetchFn), state, () => ({ read: async () => list }), () => {});
    const [r1] = await agent.runOnce(now);
    expect(r1).toMatchObject({ ok: true, read: 3, sent: 2, added: 2 });
    expect(server.calls[0].path).toBe('/ingest/status');
    expect(state.lastSent.Studio).toBe('2026-10-01 07:52:10');
    list = [...punches, { deviceUserId: '13', at: '2026-10-01 09:59:00' }];
    const [r2] = await agent.runOnce(now);
    expect(r2.added).toBe(1); // the overlap is resent, the server skips duplicates
  });

  it('keeps going when one device fails, and reports a rejected token clearly', async () => {
    const server = fakeServer();
    const agent = new Agent(
      config([zk, { ...zk, name: 'Lobby' }]),
      new ApiClient('https://office.test/api', server.fetchFn),
      { lastSent: {} },
      (d) => ({ read: async () => (d.name === 'Studio' ? Promise.reject(new Error('Device 10.0.0.5 did not answer')) : punches) }),
      () => {},
    );
    const r = await agent.runOnce(now);
    expect(r.map((x) => [x.device, x.ok])).toEqual([
      ['Studio', false],
      ['Lobby', true],
    ]);
    expect(r[0].message).toMatch(/did not answer/);

    const rejecting = new Agent(config([zk]), new ApiClient('https://office.test/api', fakeServer({ status: 401 }).fetchFn), { lastSent: {} }, () => ({ read: async () => punches }), () => {});
    expect((await rejecting.runOnce(now))[0].message).toMatch(/rejected the token/);
  });

  it('reads exported logs from a folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vo-agent-'));
    writeFileSync(join(dir, 'attlog.dat'), '0013\t2026-10-01 08:00:30\t0\t15\t0\t0\n');
    writeFileSync(join(dir, 'notes.docx'), 'ignored');
    expect(await new FolderSource({ type: 'folder', name: 'W', token: 'vod_x', path: dir }).read()).toEqual([
      { deviceUserId: '0013', at: '2026-10-01 08:00:30', verify: 'Face' },
    ]);
  });

  it('refuses plain http for anything but localhost', async () => {
    const { loadConfig } = await import('./config');
    const dir = mkdtempSync(join(tmpdir(), 'vo-agent-'));
    const p = join(dir, 'c.json');
    writeFileSync(p, JSON.stringify({ apiUrl: 'http://office.example.com/api', devices: [zk] }));
    expect(() => loadConfig(p)).toThrow(/https/);
    writeFileSync(p, JSON.stringify({ apiUrl: 'http://localhost:4000/api', devices: [zk] }));
    expect(loadConfig(p).apiUrl).toBe('http://localhost:4000/api');
  });
});
