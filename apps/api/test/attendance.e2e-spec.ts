import { zonedToUtc, type BoardDto } from '@vo/shared';
import { AttendanceJobs } from '../src/attendance/jobs.service';
import { http, setup, signIn, Signed, TestCtx } from './helpers';

/**
 * Phase 2 end to end: web clock, biometric push / agent / file import, HR board and exceptions,
 * corrections, schedules, leave, RBAC. The clock is frozen at times on Thursday Oct 1 2026 (Manila),
 * the day the HR mockup shows.
 */
const TZ = 'Asia/Manila';
const DAY = '2026-10-01';
const at = (time: string, date = DAY) => zonedToUtc(date, time, TZ);
const iso = (time: string, date = DAY) => at(time, date).toISOString();

describe('Attendance (e2e)', () => {
  let ctx: TestCtx;
  const id = (email: string) => ctx.ids.get(email)!;
  const as: Record<string, Signed> = {};

  /** Moves the frozen clock and signs people in again (a jump of hours would otherwise time their sessions out). */
  async function clock(time: string, date = DAY, who = ['admin@acme.test', 'hr@acme.test', 'manager@acme.test', 'employee@acme.test']) {
    jest.setSystemTime(at(time, date));
    for (const email of who) as[email] = await signIn(ctx, email);
  }
  const hr = () => as['hr@acme.test'];
  const board = async (): Promise<BoardDto> => (await hr().agent.get(`/api/attendance/board?date=${DAY}`).set(hr().auth).expect(200)).body;
  const row = (b: BoardDto, email: string) => b.rows.find((r) => r.user.id === id(email))!;
  const exceptions = async () =>
    (await hr().agent.get(`/api/attendance/exceptions?date=${DAY}`).set(hr().auth).expect(200)).body as {
      id: string;
      type: string;
      status: string;
      userId: string | null;
      deviceUserId: string | null;
      title: string;
    }[];
  const adms = (body: string, sn = 'CCMAIN0001') =>
    http(ctx).post(`/iclock/cdata?SN=${sn}&table=ATTLOG&Stamp=9999`).set('Content-Type', 'text/plain').send(body);
  const deviceId = async (name: string) =>
    ((await hr().agent.get('/api/devices').set(hr().auth).expect(200)).body as { id: string; name: string }[]).find((d) => d.name === name)!.id;

  beforeAll(async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearInterval', 'clearTimeout', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance'],
      now: at('07:30'),
    });
    ctx = await setup();
    await clock('07:30');
  });
  afterAll(async () => {
    await ctx.close();
    jest.useRealTimers();
  });

  describe('who can see what', () => {
    it('blocks employees and managers from HR endpoints, and HR from admin-only ones', async () => {
      for (const path of ['/api/attendance/board', '/api/attendance/exceptions', '/api/schedules', '/api/devices', '/api/device-users']) {
        await as['employee@acme.test'].agent.get(path).set(as['employee@acme.test'].auth).expect(403);
        await as['manager@acme.test'].agent.get(path).set(as['manager@acme.test'].auth).expect(403);
        await hr().agent.get(path).set(hr().auth).expect(200);
      }
      await as['employee@acme.test'].agent.get('/api/team/board').set(as['employee@acme.test'].auth).expect(403);
      await hr().agent.get('/api/auth-events').set(hr().auth).expect(403);
      await hr().agent.get('/api/users').set(hr().auth).expect(200); // HR reads everyone
    });

    it('rejects device endpoints without a valid token or a registered serial number', async () => {
      await http(ctx).post('/api/ingest/punches').send({ punches: [] }).expect(401);
      await http(ctx).post('/api/ingest/punches').set('Authorization', 'Bearer vod_nope').send({ punches: [] }).expect(401);
      await http(ctx).get('/iclock/cdata?SN=NOTREAL').expect(401);
      await adms('0012\t2026-10-01 07:52:10\t0\t1', 'CCSTUDIO02').expect(401); // registered, but not a push device
    });

    it('the board leaves leaders out and says so', async () => {
      const b = await board();
      expect(b.untracked.count).toBe(5);
      expect(b.rows.find((r) => r.user.id === id('pastor@acme.test'))).toBeUndefined();
    });

    it('leaders have no clock', async () => {
      const pastor = await signIn(ctx, 'pastor@acme.test');
      const s = await pastor.agent.get('/api/me/clock').set(pastor.auth).expect(200);
      expect(s.body.tracked).toBe(false);
      await pastor.agent.post('/api/me/clock').set(pastor.auth).send({ action: 'IN' }).expect(409);
    });
  });

  describe('morning: web clock and cloud push', () => {
    it('remote web clock-in (Ana, 7:58)', async () => {
      await clock('07:58', DAY, ['employee@acme.test', 'hr@acme.test']);
      const ana = as['employee@acme.test'];
      const before = await ana.agent.get('/api/me/clock').set(ana.auth).expect(200);
      expect(before.body.allowed).toEqual(['IN']);
      const r = await ana.agent.post('/api/me/clock').set(ana.auth).send({ action: 'IN' }).expect(201);
      expect(r.body.day.status).toBe('ON_TIME');
      expect(r.body.allowed).toEqual(['BREAK_START', 'OUT']);
      const wrong = await ana.agent.post('/api/me/clock').set(ana.auth).send({ action: 'BREAK_END' });
      expect(wrong.status).toBe(409);
      expect(wrong.body.code).toBe('CLOCK_STATE');
    });

    it('takes an ADMS push, merges duplicates, flags lateness and an unlinked badge', async () => {
      await clock('10:24', DAY, ['hr@acme.test', 'manager@acme.test', 'admin@acme.test']);
      const hs = await http(ctx).get('/iclock/cdata?SN=CCMAIN0001&options=all').expect(200);
      expect(hs.text).toContain('GET OPTION FROM: CCMAIN0001');
      const log = [
        '0012\t2026-10-01 07:52:10\t0\t1\t0\t0', // Maria
        '0015\t2026-10-01 07:49:02\t0\t1\t0\t0', // Carlo x3
        '0015\t2026-10-01 07:49:31\t0\t1\t0\t0',
        '0015\t2026-10-01 07:50:05\t0\t1\t0\t0',
        '0018\t2026-10-01 08:14:40\t0\t1\t0\t0', // Liza, late
        '0047\t2026-10-01 08:12:00\t0\t1\t0\t0', // nobody
        '0021\t2026-10-01 07:58:00\t0\t15\t0\t0', // Grace in
        '0021\t2026-10-01 10:05:00\t0\t15\t0\t0', // Grace break
      ].join('\n');
      const r = await adms(log).expect(200);
      expect(r.text).toBe('OK: 8');
      const again = await adms(log).expect(200); // resent by the device: nothing doubles
      expect(again.text).toBe('OK: 8');
      const [{ n }] = await ctx.sql<{ n: string }>('SELECT count(*) AS n FROM punches WHERE device_id IS NOT NULL');
      expect(Number(n)).toBe(8);

      const b = await board();
      expect(row(b, 'admin@acme.test').day!.status).toBe('ON_TIME');
      expect(row(b, 'carlo.mendoza@acme.test').day!.mergedCount).toBe(2);
      expect(row(b, 'carlo.mendoza@acme.test').note).toBe('3 punches merged');
      expect(row(b, 'invited@acme.test').day).toMatchObject({ status: 'LATE', lateMinutes: 14 });
      expect(row(b, 'hr@acme.test').day!.status).toBe('ON_BREAK');
      expect(row(b, 'kevin.lim@acme.test').day!.status).toBe('NO_PUNCH');
      expect(row(b, 'employee@acme.test').day!.status).toBe('ON_TIME');
      expect(b.kpis.late).toBe(1);

      const ex = await exceptions();
      const unlinked = ex.find((e) => e.type === 'UNLINKED_BADGE')!;
      expect(unlinked.deviceUserId).toBe('0047');
      expect(unlinked.title).toBe('Badge 0047 punched in at 8:12 AM but isn’t linked to anyone');
      expect(ex.find((e) => e.type === 'LATE' && e.userId === id('invited@acme.test'))!.title).toBe('Liza Garcia badged in 14 minutes late');
      expect(ex.some((e) => e.type === 'DUPLICATES' && e.userId === id('carlo.mendoza@acme.test'))).toBe(true);
      expect(ex.some((e) => e.type === 'NO_PUNCH' && e.userId === id('kevin.lim@acme.test'))).toBe(true);

      const live = await hr().agent.get('/api/attendance/live').set(hr().auth).expect(200);
      expect(live.body[0]).toMatchObject({ name: 'Grace Lim', what: 'Break out' });
    });

    it('linking badge 0047 to Kevin moves the punch to him (12 minutes late)', async () => {
      const e = (await exceptions()).find((x) => x.type === 'UNLINKED_BADGE')!;
      const r = await hr()
        .agent.post(`/api/attendance/exceptions/${e.id}/resolve`)
        .set(hr().auth)
        .send({ action: 'LINK_BADGE', userId: id('kevin.lim@acme.test') })
        .expect(201);
      expect(r.body.status).toBe('RESOLVED');
      const b = await board();
      expect(row(b, 'kevin.lim@acme.test').day).toMatchObject({ status: 'LATE', lateMinutes: 12 });
      const kevinNoPunch = (await exceptions()).find((x) => x.type === 'NO_PUNCH' && x.userId === id('kevin.lim@acme.test'))!;
      expect(kevinNoPunch.status).toBe('DISMISSED');
    });

    it('excusing Liza and keeping Kevin as late', async () => {
      const ex = await exceptions();
      const liza = ex.find((x) => x.type === 'LATE' && x.userId === id('invited@acme.test'))!;
      await hr().agent.post(`/api/attendance/exceptions/${liza.id}/resolve`).set(hr().auth).send({ action: 'SET_CLOCK_OUT', at: iso('17:00') }).expect(400);
      await hr().agent.post(`/api/attendance/exceptions/${liza.id}/resolve`).set(hr().auth).send({ action: 'EXCUSE' }).expect(201);
      await hr().agent.post(`/api/attendance/exceptions/${liza.id}/resolve`).set(hr().auth).send({ action: 'EXCUSE' }).expect(409);
      const kevin = ex.find((x) => x.type === 'LATE' && x.userId === id('kevin.lim@acme.test'))!;
      await hr().agent.post(`/api/attendance/exceptions/${kevin.id}/resolve`).set(hr().auth).send({ action: 'KEEP' }).expect(201);
      const b = await board();
      expect(row(b, 'invited@acme.test').day!.status).toBe('EXCUSED');
      expect(row(b, 'kevin.lim@acme.test').day!.status).toBe('LATE');
      const audit = await ctx.sql<{ action: string }>("SELECT action FROM audit_logs WHERE action LIKE 'attendance.exception.%'");
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['attendance.exception.excuse', 'attendance.exception.keep']));
    });

    it('hybrid: Jose clocked in from home at 7:55, badged in at 8:31 → mismatch; HR keeps the web time', async () => {
      await ctx.sql(
        `INSERT INTO punches (user_id, work_date, source, kind, punched_at, via, location) VALUES ($1, $2, 'WEB', 'IN', $3, 'web', 'Virtual Office')`,
        [id('manager@acme.test'), DAY, at('07:55')],
      );
      await adms('0033\t2026-10-01 08:31:00\t0\t15\t0\t0').expect(200);
      let b = await board();
      expect(row(b, 'manager@acme.test').day!.status).toBe('MISMATCH');
      const e = (await exceptions()).find((x) => x.type === 'MISMATCH')!;
      expect(e.title).toBe('Jose Reyes clocked in on the web at 7:55 AM, then badged in at 8:31 AM');
      await hr().agent.post(`/api/attendance/exceptions/${e.id}/resolve`).set(hr().auth).send({ action: 'USE_WEB' }).expect(201);
      b = await board();
      expect(row(b, 'manager@acme.test').day).toMatchObject({ status: 'ON_TIME', lateMinutes: 0 });
    });

    it('managers see only their direct reports', async () => {
      const m = as['manager@acme.test'];
      const t = await m.agent.get(`/api/team/board?date=${DAY}`).set(m.auth).expect(200);
      const names = t.body.rows.map((r: { user: { fullName: string } }) => r.user.fullName).sort();
      expect(names).toEqual(['Ana Cruz', 'Bea Villanueva', 'Emily Carter', 'Nico Ramos', 'Paolo Aquino', 'Tess Bautista']);
      await m.agent.get(`/api/team/people/${id('employee@acme.test')}/day?date=${DAY}`).set(m.auth).expect(200);
      await m.agent.get(`/api/team/people/${id('carlo.mendoza@acme.test')}/day?date=${DAY}`).set(m.auth).expect(404);
    });
  });

  describe('sync agent and file import', () => {
    it('agent uploads with its token; a rotated token stops the old one; Sync now reaches it', async () => {
      const studio = await deviceId('2F Studio terminal');
      const { token } = (await hr().agent.post(`/api/devices/${studio}/token`).set(hr().auth).expect(201)).body;
      expect(token).toMatch(/^vod_/);
      const auth = { Authorization: `Bearer ${token}` };
      const up = await http(ctx)
        .post('/api/ingest/punches')
        .set(auth)
        .send({ punches: [{ deviceUserId: '0011', at: '2026-10-01 07:40:00', verify: 'Face' }, { deviceUserId: '0099', at: '2026-10-01 09:00:00' }] })
        .expect(200);
      expect(up.body).toEqual({ added: 2, duplicates: 0, unknownUserIds: ['0099'] });
      const future = await http(ctx).post('/api/ingest/punches').set(auth).send({ punches: [{ deviceUserId: '0011', at: '2026-10-01 23:00:00' }] }).expect(200);
      expect(future.body.added).toBe(0);

      await hr().agent.post(`/api/devices/${studio}/sync`).set(hr().auth).expect(201);
      expect((await http(ctx).get('/api/ingest/status').set(auth).expect(200)).body.syncRequested).toBe(true);
      expect((await http(ctx).get('/api/ingest/status').set(auth).expect(200)).body.syncRequested).toBe(false);
      const devices = (await hr().agent.get('/api/devices').set(hr().auth).expect(200)).body;
      expect(devices.find((d: { id: string }) => d.id === studio)).toMatchObject({ online: true, punchesToday: 2 });

      const { token: newer } = (await hr().agent.post(`/api/devices/${studio}/token`).set(hr().auth).expect(201)).body;
      await http(ctx).get('/api/ingest/status').set(auth).expect(401);
      await http(ctx).get('/api/ingest/status').set({ Authorization: `Bearer ${newer}` }).expect(200);
      expect(row(await board(), 'paolo.aquino@acme.test').day!.status).toBe('ON_TIME');
    });

    it('imports a USB log file; re-importing skips duplicates', async () => {
      const wh = await deviceId('Warehouse unit');
      const file = Buffer.from('0013\t2026-10-01 08:00:00\t0\t15\t0\t0\n0013\t2026-09-30 08:01:00\t0\t15\t0\t0\n0013\t2026-09-30 17:02:00\t0\t15\t0\t0\n0077\t2026-09-30 08:30:00\t0\t1\t0\t0\n');
      const r1 = await hr().agent.post(`/api/devices/${wh}/import`).set(hr().auth).attach('file', file, 'attlog.dat').expect(201);
      expect(r1.body).toMatchObject({ total: 4, added: 4, duplicates: 0, unknownUserIds: ['0077'] });
      const r2 = await hr().agent.post(`/api/devices/${wh}/import`).set(hr().auth).attach('file', file, 'attlog.dat').expect(201);
      expect(r2.body).toMatchObject({ added: 0, duplicates: 4 });
      const bad = await hr().agent.post(`/api/devices/${wh}/import`).set(hr().auth).attach('file', Buffer.from('x'), 'photo.png').expect(201);
      expect(bad.body.errors[0]).toMatch(/Use a .dat/);
      const kim = await hr().agent.get(`/api/attendance/people/${id('kim.navarro@acme.test')}/day?date=2026-09-30`).set(hr().auth).expect(200);
      expect(kim.body.day).toMatchObject({ status: 'DONE', workedMinutes: 541 });
      const users = (await hr().agent.get('/api/device-users').set(hr().auth).expect(200)).body as { deviceUserId: string; userId: string | null }[];
      expect(users.find((u) => u.deviceUserId === '0077')!.userId).toBeNull();
    });
  });

  describe('corrections: employee → manager → HR', () => {
    it('runs the two-step approval and updates the timesheet', async () => {
      await clock('10:30');
      const ana = as['employee@acme.test'];
      const req = await ana.agent
        .post('/api/me/corrections')
        .set(ana.auth)
        .send({ date: '2026-09-30', action: 'ADD', kind: 'OUT', at: iso('17:10', '2026-09-30'), reason: 'Forgot to clock out before logging off.' })
        .expect(201);
      expect(req.body.status).toBe('PENDING_MANAGER');
      expect(req.body.summary).toBe('Add a clock out at 5:10 PM');
      await ana.agent.post('/api/me/corrections').set(ana.auth).send({ date: '2026-09-30', action: 'ADD', kind: 'IN', at: iso('08:00', '2026-09-30'), reason: 'Another one' }).expect(409);
      await ana.agent.post('/api/me/corrections').set(ana.auth).send({ date: '2026-10-05', action: 'ADD', kind: 'IN', at: iso('08:00', '2026-10-05'), reason: 'Future day' }).expect(400);

      // HR can't skip the manager; Ana can't approve her own; another manager can't see it
      await hr().agent.post(`/api/attendance/corrections/${req.body.id}/decision`).set(hr().auth).send({ approve: true }).expect(409);
      const daniel = await signIn(ctx, 'sales.manager@acme.test');
      await daniel.agent.post(`/api/team/corrections/${req.body.id}/decision`).set(daniel.auth).send({ approve: true }).expect(404);

      const m = as['manager@acme.test'];
      const pending = await m.agent.get('/api/team/corrections?status=PENDING_MANAGER').set(m.auth).expect(200);
      expect(pending.body.map((c: { id: string }) => c.id)).toContain(req.body.id);
      const mgr = await m.agent.post(`/api/team/corrections/${req.body.id}/decision`).set(m.auth).send({ approve: true }).expect(201);
      expect(mgr.body.status).toBe('PENDING_HR');

      ctx.mail.outbox.length = 0;
      const done = await hr().agent.post(`/api/attendance/corrections/${req.body.id}/decision`).set(hr().auth).send({ approve: true }).expect(201);
      expect(done.body.status).toBe('APPROVED');
      expect(ctx.mail.outbox[0].subject).toBe('Time correction approved');
      const [p] = await ctx.sql<{ source: string; kind: string }>('SELECT source, kind FROM punches WHERE user_id = $1 AND work_date = $2', [id('employee@acme.test'), '2026-09-30']);
      expect(p).toEqual({ source: 'HR', kind: 'OUT' });
    });

    it('an approved clock-out replaces an automatic clock-out', async () => {
      const ana = as['employee@acme.test'];
      await ctx.sql(
        `INSERT INTO punches (user_id, work_date, source, kind, punched_at, via) VALUES ($1, '2026-09-28', 'WEB', 'IN', $2, 'web'), ($1, '2026-09-28', 'SYSTEM', 'OUT', $3, 'auto')`,
        [id('employee@acme.test'), at('08:00', '2026-09-28'), at('17:00', '2026-09-28')],
      );
      const req = await ana.agent
        .post('/api/me/corrections')
        .set(ana.auth)
        .send({ date: '2026-09-28', action: 'ADD', kind: 'OUT', at: iso('17:30', '2026-09-28'), reason: 'Forgot to clock out' })
        .expect(201);
      await as['manager@acme.test'].agent.post(`/api/team/corrections/${req.body.id}/decision`).set(as['manager@acme.test'].auth).send({ approve: true }).expect(201);
      await hr().agent.post(`/api/attendance/corrections/${req.body.id}/decision`).set(hr().auth).send({ approve: true }).expect(201);
      const d = await hr().agent.get(`/api/attendance/people/${id('employee@acme.test')}/day?date=2026-09-28`).set(hr().auth).expect(200);
      expect(d.body.day).toMatchObject({ status: 'DONE', workedMinutes: 570 });
      const ex = (await hr().agent.get('/api/attendance/exceptions?date=2026-09-28').set(hr().auth).expect(200)).body;
      expect(ex.filter((e: { type: string; status: string }) => e.type === 'MISSING_OUT' && e.status === 'OPEN')).toEqual([]);
    });

    it('HR people can’t approve their own requests', async () => {
      const g = hr();
      const own = await g.agent
        .post('/api/me/corrections')
        .set(g.auth)
        .send({ date: '2026-09-29', action: 'ADD', kind: 'IN', at: iso('08:00', '2026-09-29'), reason: 'Device was down' })
        .expect(201);
      const admin = as['admin@acme.test'];
      await admin.agent.post(`/api/team/corrections/${own.body.id}/decision`).set(admin.auth).send({ approve: true }).expect(201);
      await g.agent.post(`/api/attendance/corrections/${own.body.id}/decision`).set(g.auth).send({ approve: true }).expect(403);
    });
  });

  describe('the minute job: missing clock-out and auto clock-out', () => {
    it('flags Emily’s missing clock-out, auto clocks her out at 14 hours, then HR sets the real time', async () => {
      await clock('20:57', '2026-09-30', ['emily.carter@acme.test']);
      const em = as['emily.carter@acme.test'];
      await em.agent.post('/api/me/clock').set(em.auth).send({ action: 'IN' }).expect(201);

      await clock('10:24', DAY, ['hr@acme.test']);
      const jobs = ctx.app.get(AttendanceJobs);
      expect(await jobs.tick()).toBe(true);
      let ex = (await hr().agent.get('/api/attendance/exceptions?date=2026-09-30').set(hr().auth).expect(200)).body;
      const missing = ex.find((e: { type: string; userId: string }) => e.type === 'MISSING_OUT' && e.userId === id('emily.carter@acme.test'));
      expect(missing.title).toBe('Emily Carter has been clocked in for 13h 27m');
      expect(row(await board(), 'emily.carter@acme.test').day!.status).toBe('MISSING_OUT'); // last night's shift shows on today's board

      await clock('11:00', DAY, ['hr@acme.test']);
      await jobs.tick();
      const [auto] = await ctx.sql<{ punched_at: Date }>("SELECT punched_at FROM punches WHERE user_id = $1 AND source = 'SYSTEM'", [id('emily.carter@acme.test')]);
      expect(auto.punched_at.toISOString()).toBe(iso('06:00'));
      ex = (await hr().agent.get('/api/attendance/exceptions?date=2026-09-30').set(hr().auth).expect(200)).body;
      const flagged = ex.find((e: { type: string; userId: string }) => e.type === 'MISSING_OUT' && e.userId === id('emily.carter@acme.test'));
      expect(flagged.status).toBe('OPEN');
      expect(flagged.title).toBe('Emily Carter was clocked out automatically');

      await hr().agent.post(`/api/attendance/exceptions/${flagged.id}/resolve`).set(hr().auth).send({ action: 'SET_CLOCK_OUT', at: iso('06:05') }).expect(201);
      const d = await hr().agent.get(`/api/attendance/people/${id('emily.carter@acme.test')}/day?date=2026-09-30`).set(hr().auth).expect(200);
      expect(d.body.day).toMatchObject({ status: 'DONE', workedMinutes: 548 });
      expect(d.body.punches.map((p: { role: string; source: string }) => `${p.source}:${p.role}`)).toEqual(['WEB:IN', 'SYSTEM:REMOVED', 'HR:OUT']);
    });

    it('raises "no punch" 2 hours after the start', async () => {
      const ex = await exceptions();
      expect(ex.some((e) => e.type === 'NO_PUNCH' && e.userId === id('tess.bautista@acme.test'))).toBe(true);
    });
  });

  describe('schedules, leave, notes and export', () => {
    it('leave stops "no punch" and shows On leave', async () => {
      await hr()
        .agent.put('/api/attendance/overrides')
        .set(hr().auth)
        .send({ userId: id('sam.porter@acme.test'), date: DAY, kind: 'LEAVE', note: 'Vacation leave, Sep 30 – Oct 2' })
        .expect(200);
      await hr().agent.put('/api/attendance/overrides').set(hr().auth).send({ userId: id('tess.bautista@acme.test'), date: DAY, kind: 'LEAVE' }).expect(200);
      const b = await board();
      expect(row(b, 'tess.bautista@acme.test').day!.status).toBe('LEAVE');
      expect(b.kpis.onLeave).toBeGreaterThanOrEqual(1);
      const tess = (await exceptions()).find((e) => e.type === 'NO_PUNCH' && e.userId === id('tess.bautista@acme.test'))!;
      expect(tess.status).toBe('DISMISSED');
    });

    it('schedules: create, assign, and refuse to delete one in use', async () => {
      const s = await hr()
        .agent.post('/api/schedules')
        .set(hr().auth)
        .send({ name: 'Saturday half day', timezone: TZ, days: [{ weekday: 6, start: '08:00', end: '12:00', onsite: true }] })
        .expect(201);
      expect(s.body.label).toBe('Sat 8:00 AM – 12:00 PM');
      await hr().agent.post('/api/schedules').set(hr().auth).send({ name: 'Saturday half day', timezone: TZ, days: [] }).expect(409);
      await hr().agent.post('/api/schedules').set(hr().auth).send({ name: 'Bad', timezone: 'Mars/Base', days: [] }).expect(400);
      await hr().agent.patch(`/api/attendance/people/${id('kim.navarro@acme.test')}`).set(hr().auth).send({ scheduleId: s.body.id, effectiveFrom: '2026-10-03' }).expect(200);
      await hr().agent.delete(`/api/schedules/${s.body.id}`).set(hr().auth).expect(409);
      const people = (await hr().agent.get('/api/attendance/people').set(hr().auth).expect(200)).body;
      expect(people.find((p: { user: { id: string } }) => p.user.id === id('kim.navarro@acme.test')).scheduleName).toBe('Day shift'); // the change starts Oct 3
    });

    it('adjust times replaces the punches and is audited; export is CSV with formulas neutralised', async () => {
      const r = await hr()
        .agent.put(`/api/attendance/days/${id('ryan.torres@acme.test')}/${DAY}/times`)
        .set(hr().auth)
        .send({ in: iso('07:58'), out: null, reason: 'Guard logbook shows 7:58' })
        .expect(200);
      expect(r.body.day.status).toBe('ON_TIME');
      await hr().agent.patch(`/api/attendance/days/${id('ryan.torres@acme.test')}/${DAY}/note`).set(hr().auth).send({ note: '=HYPERLINK("http://x")' }).expect(200);
      const csv = await hr().agent.get(`/api/attendance/export?from=${DAY}&to=${DAY}`).set(hr().auth).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Employee,Email,Department,Date');
      expect(csv.text).toContain(`"'=HYPERLINK(""http://x"")"`);
      expect(csv.text).toContain('Ryan Torres');
    });

    it('rules can be changed by HR', async () => {
      const r = await hr().agent.get('/api/attendance/settings').set(hr().auth).expect(200);
      expect(r.body.graceMinutes).toBe(5);
      await hr().agent.put('/api/attendance/settings').set(hr().auth).send({ ...r.body, graceMinutes: 999 }).expect(400);
      const u = await hr().agent.put('/api/attendance/settings').set(hr().auth).send({ ...r.body, graceMinutes: 10 }).expect(200);
      expect(u.body.graceMinutes).toBe(10);
      await hr().agent.put('/api/attendance/settings').set(hr().auth).send(r.body).expect(200);
    });
  });
});
