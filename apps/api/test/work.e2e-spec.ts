/**
 * Phases 6 and 7 end to end: leave (types, balances, approval, timesheet effect, holidays, calendar),
 * tasks, end-of-day reports (incl. the clock-out gate), dashboards, reports with exports, and
 * company settings.
 */
import type { LeaveBalanceDto, LeaveRequestDto, LeaveTypeDto, ReportDto, TaskDto } from '@vo/shared';
import { addDays } from '@vo/shared';
import { DayService } from '../src/attendance/day.service';
import { WorkJobs } from '../src/work/work.jobs';
import { http, setup, signIn, Signed, TestCtx } from './helpers';

describe('Phases 6 and 7: leave, tasks, reports, dashboards, settings', () => {
  let ctx: TestCtx;
  let today: string;
  const users = new Map<string, Signed>();
  const EMAILS = ['admin@acme.test', 'manager@acme.test', 'employee@acme.test', 'emily.carter@acme.test', 'hr@acme.test', 'andrew.tan@acme.test', 'nico.ramos@acme.test', 'carlo.mendoza@acme.test', 'pastor@acme.test'];

  beforeAll(async () => {
    ctx = await setup();
    today = await ctx.app.get(DayService).today();
    for (const e of EMAILS) users.set(e, await signIn(ctx, e));
  });
  afterAll(() => ctx.close());

  const id = (email: string) => ctx.ids.get(email)!;
  const api = (email: string) => {
    const a = users.get(email)!.auth;
    return {
      get: (p: string) => http(ctx).get(`/api${p}`).set(a),
      post: (p: string, body?: object) => http(ctx).post(`/api${p}`).set(a).send(body ?? {}),
      put: (p: string, body: object) => http(ctx).put(`/api${p}`).set(a).send(body),
      patch: (p: string, body: object) => http(ctx).patch(`/api${p}`).set(a).send(body),
      del: (p: string) => http(ctx).delete(`/api${p}`).set(a),
    };
  };

  // the next Monday at least two weeks out, so leave dates are in the future and weekday-aligned
  const monday = (() => {
    let d = addDays(new Date().toISOString().slice(0, 10), 14);
    while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
    return d;
  })();
  let vacation: LeaveTypeDto;
  let unpaid: LeaveTypeDto;

  describe('leave types and balances', () => {
    it('HR sets up leave types; employees can’t', async () => {
      expect((await api('employee@acme.test').post('/leave/types', { name: 'Vacation', color: '#16a34a', yearlyDays: 15 })).status).toBe(403);
      const v = await api('hr@acme.test').post('/leave/types', { name: 'Vacation', color: '#16a34a', paid: true, yearlyDays: 15 });
      expect(v.status).toBe(201);
      vacation = v.body;
      unpaid = (await api('hr@acme.test').post('/leave/types', { name: 'Unpaid', color: '#64748b', paid: false, yearlyDays: null })).body;
      expect((await api('hr@acme.test').post('/leave/types', { name: 'vacation', color: '#16a34a', yearlyDays: 1 })).status).toBe(409);
      expect((await api('hr@acme.test').post('/leave/types', { name: 'Half', color: '#16a34a', yearlyDays: 1.3 })).status).toBe(400);
      const list = (await api('employee@acme.test').get('/leave/types')).body as LeaveTypeDto[];
      expect(list.map((t) => t.name)).toEqual(['Unpaid', 'Vacation']);
    });

    it('everyone starts with the yearly allowance; HR can adjust it', async () => {
      const year = Number(monday.slice(0, 4));
      const b = (await api('employee@acme.test').get(`/leave/balances?year=${year}`)).body as LeaveBalanceDto[];
      expect(b.find((x) => x.typeName === 'Vacation')).toMatchObject({ allowance: 15, used: 0, pending: 0, remaining: 15 });
      expect(b.find((x) => x.typeName === 'Unpaid')).toMatchObject({ allowance: null, remaining: null });
      const adj = await api('hr@acme.test').post('/leave/adjustments', { userId: id('employee@acme.test'), typeId: vacation.id, year, days: 2.5, note: 'Carried over' });
      expect(adj.status).toBe(201);
      expect(adj.body.find((x: LeaveBalanceDto) => x.typeName === 'Vacation').remaining).toBe(17.5);
      expect((await api('manager@acme.test').post('/leave/adjustments', { userId: id('employee@acme.test'), typeId: vacation.id, year, days: 5, note: 'x' })).status).toBe(403);
      // a manager can see their report's balance, but not someone else's
      expect((await api('manager@acme.test').get(`/leave/balances?userId=${id('employee@acme.test')}&year=${year}`)).status).toBe(200);
      expect((await api('manager@acme.test').get(`/leave/balances?userId=${id('carlo.mendoza@acme.test')}&year=${year}`)).status).toBe(403);
    });
  });

  describe('requests', () => {
    let req: LeaveRequestDto;

    it('counts working days only (skips weekends and holidays)', async () => {
      const wed = addDays(monday, 2);
      expect((await api('employee@acme.test').post('/holidays', { date: wed, name: 'Company anniversary' })).status).toBe(403);
      expect((await api('hr@acme.test').post('/holidays', { date: wed, name: 'Company anniversary', kind: 'SPECIAL' })).status).toBe(201);
      // Monday to next Monday: 6 weekdays, minus the holiday = 5
      const p = await api('employee@acme.test').get(`/leave/preview?typeId=${vacation.id}&startDate=${monday}&endDate=${addDays(monday, 7)}`);
      expect(p.status).toBe(200);
      expect(p.body.days).toBe(5);
      expect(p.body.dates.find((d: { date: string }) => d.date === wed)).toMatchObject({ counted: false, note: 'Company anniversary' });
      expect(p.body.dates.find((d: { date: string }) => d.date === addDays(monday, 5))).toMatchObject({ counted: false, note: 'Rest day' });
      expect(p.body.remainingAfter).toBe(12.5);
    });

    it('files leave, tells the manager, and refuses overlaps and overdrafts', async () => {
      ctx.mail.outbox.length = 0;
      const r = await api('employee@acme.test').post('/leave/requests', { typeId: vacation.id, startDate: monday, endDate: addDays(monday, 7), reason: 'Family trip' });
      expect(r.status).toBe(201);
      req = r.body;
      expect(req).toMatchObject({ days: 5, status: 'PENDING', approverName: 'Jose Reyes', canCancel: true, canDecide: false });
      expect(ctx.mail.outbox.find((m) => m.to === 'manager@acme.test')?.subject).toBe('Leave request from Ana Cruz');

      const overlap = await api('employee@acme.test').post('/leave/requests', { typeId: unpaid.id, startDate: addDays(monday, 1), endDate: addDays(monday, 1), reason: 'x' });
      expect(overlap.status).toBe(409);
      const tooMuch = await api('employee@acme.test').post('/leave/requests', { typeId: vacation.id, startDate: addDays(monday, 14), endDate: addDays(monday, 35), reason: 'Long trip' });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.code).toBe('BALANCE');
      const weekend = await api('employee@acme.test').post('/leave/requests', { typeId: vacation.id, startDate: addDays(monday, 5), endDate: addDays(monday, 6), reason: 'x' });
      expect(weekend.status).toBe(400);
    });

    it('only the manager (or HR) decides; the employee is told', async () => {
      expect((await api('nico.ramos@acme.test').post(`/leave/requests/${req.id}/decision`, { approve: true })).status).toBe(403);
      expect((await api('carlo.mendoza@acme.test').get(`/leave/requests/${req.id}`)).status).toBe(403);
      const queue = (await api('manager@acme.test').get('/leave/requests?scope=approvals&status=PENDING')).body as LeaveRequestDto[];
      expect(queue.map((x) => x.id)).toEqual([req.id]);
      expect(queue[0].canDecide).toBe(true);
      ctx.mail.outbox.length = 0;
      const ok = await api('manager@acme.test').post(`/leave/requests/${req.id}/decision`, { approve: true, note: 'Enjoy!' });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ status: 'APPROVED', decidedByName: 'Jose Reyes', decisionNote: 'Enjoy!' });
      expect(ctx.mail.outbox.find((m) => m.to === 'employee@acme.test')?.subject).toMatch(/^Leave approved/);
      expect((await api('manager@acme.test').post(`/leave/requests/${req.id}/decision`, { approve: false })).status).toBe(403);

      const year = Number(monday.slice(0, 4));
      const b = (await api('employee@acme.test').get(`/leave/balances?year=${year}`)).body as LeaveBalanceDto[];
      expect(b.find((x) => x.typeName === 'Vacation')).toMatchObject({ used: 5, remaining: 12.5 });
    });

    it('approved leave shows on the team calendar (type hidden from peers)', async () => {
      const q = `/leave/calendar?from=${monday}&to=${addDays(monday, 10)}`;
      const peer = (await api('nico.ramos@acme.test').get(q)).body;
      expect(peer).toEqual([expect.objectContaining({ userName: 'Ana Cruz', typeName: null })]);
      const mgr = (await api('manager@acme.test').get(q)).body;
      expect(mgr[0].typeName).toBe('Vacation');
      expect((await api('carlo.mendoza@acme.test').get(q)).body).toEqual([]); // another department
    });

    it('leaders’ leave goes to HR', async () => {
      const r = await api('andrew.tan@acme.test').post('/leave/requests', { typeId: unpaid.id, startDate: monday, endDate: monday, reason: 'Conference' });
      expect(r.body.approverName).toBe('HR');
      expect((await api('pastor@acme.test').get('/leave/requests?scope=approvals&status=PENDING')).body.map((x: LeaveRequestDto) => x.id)).toContain(r.body.id);
      expect((await api('hr@acme.test').post(`/leave/requests/${r.body.id}/decision`, { approve: false, note: 'Busy week' })).body.status).toBe('REJECTED');
    });

    it('approved leave keeps people from being marked absent', async () => {
      // file and approve leave for the latest past weekday (filed on return), then that day shows as LEAVE
      let day = addDays(today, -1);
      while ([0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())) day = addDays(day, -1);
      const todayLeave = await api('nico.ramos@acme.test').post('/leave/requests', { typeId: unpaid.id, startDate: day, endDate: day, reason: 'Sick' });
      expect(todayLeave.status).toBe(201);
      await api('manager@acme.test').post(`/leave/requests/${todayLeave.body.id}/decision`, { approve: true });
      const board = await api('hr@acme.test').get(`/attendance/board?date=${day}`);
      const row = board.body.rows.find((r: { user: { id: string } }) => r.user.id === id('nico.ramos@acme.test'));
      expect(row.day.status).toBe('LEAVE');
      // HR cancels it: back to a normal day
      expect((await api('hr@acme.test').post(`/leave/requests/${todayLeave.body.id}/cancel`)).status).toBe(204);
      const after = await api('hr@acme.test').get(`/attendance/board?date=${day}`);
      expect(after.body.rows.find((r: { user: { id: string } }) => r.user.id === id('nico.ramos@acme.test')).day.status).not.toBe('LEAVE');
    });

    it('a type in use can only be turned off', async () => {
      expect((await api('hr@acme.test').del(`/leave/types/${vacation.id}`)).status).toBe(409);
      const off = await api('hr@acme.test').put(`/leave/types/${vacation.id}`, { name: 'Vacation', color: '#16a34a', paid: true, yearlyDays: 15, active: false });
      expect(off.body.active).toBe(false);
      expect((await api('employee@acme.test').get('/leave/types')).body.map((t: LeaveTypeDto) => t.name)).toEqual(['Unpaid']);
      await api('hr@acme.test').put(`/leave/types/${vacation.id}`, { name: 'Vacation', color: '#16a34a', paid: true, yearlyDays: 15, active: true });
    });
  });

  describe('tasks', () => {
    it('personal tasks stay private; team tasks are shared with the department', async () => {
      const mine = (await api('employee@acme.test').post('/tasks', { title: 'Update resume' })).body as TaskDto;
      expect(mine).toMatchObject({ assigneeName: 'Ana Cruz', status: 'TODO', departmentId: null, canDelete: true });
      const team = (await api('employee@acme.test').post('/tasks', { title: 'Fix login bug', departmentId: (await api('admin@acme.test').get('/departments')).body.find((d: { name: string }) => d.name === 'Engineering').id })).body as TaskDto;
      expect(team).toMatchObject({ assigneeId: null, departmentName: 'Engineering' });

      const nicoTeam = (await api('nico.ramos@acme.test').get('/tasks?scope=team')).body as TaskDto[];
      expect(nicoTeam.map((t) => t.title)).toEqual(['Fix login bug']);
      expect((await api('nico.ramos@acme.test').patch(`/tasks/${mine.id}`, { status: 'DONE' })).status).toBe(404);
      expect((await api('carlo.mendoza@acme.test').get('/tasks?scope=team')).body.some((t: TaskDto) => t.id === team.id)).toBe(false);

      // a colleague picks it up and moves it along
      const picked = await api('nico.ramos@acme.test').patch(`/tasks/${team.id}`, { assigneeId: id('nico.ramos@acme.test'), status: 'IN_PROGRESS' });
      expect(picked.body).toMatchObject({ assigneeName: 'Nico Ramos', status: 'IN_PROGRESS' });
      const done = await api('nico.ramos@acme.test').patch(`/tasks/${team.id}`, { status: 'DONE' });
      expect(done.body.completedAt).toBeTruthy();
      expect((await api('nico.ramos@acme.test').del(`/tasks/${team.id}`)).status).toBe(403); // not the creator
      // the manager sees Nico's tasks
      expect((await api('manager@acme.test').get(`/tasks?scope=person&userId=${id('nico.ramos@acme.test')}`)).body.map((t: TaskDto) => t.title)).toContain('Fix login bug');
      expect((await api('carlo.mendoza@acme.test').get(`/tasks?scope=person&userId=${id('nico.ramos@acme.test')}`)).status).toBe(403);
    });

    it('managers assign work to their team; others can’t assign outside it', async () => {
      const t = await api('manager@acme.test').post('/tasks', { title: 'Write release notes', assigneeId: id('emily.carter@acme.test'), dueDate: addDays(today, 2) });
      expect(t.status).toBe(201);
      expect((await api('emily.carter@acme.test').get('/tasks?scope=mine')).body.map((x: TaskDto) => x.title)).toContain('Write release notes');
      expect((await api('employee@acme.test').post('/tasks', { title: 'x', assigneeId: id('carlo.mendoza@acme.test') })).status).toBe(403);
    });
  });

  describe('end-of-day reports', () => {
    it('can be required before a web clock-out', async () => {
      const eng = (await api('admin@acme.test').get('/departments')).body.find((d: { name: string }) => d.name === 'Engineering');
      expect((await api('admin@acme.test').patch(`/departments/${eng.id}`, { name: 'Engineering', headUserId: eng.headUserId, requireDailyReport: true })).status).toBe(200);
      expect((await api('admin@acme.test').get('/departments')).body.find((d: { name: string }) => d.name === 'Engineering').requireDailyReport).toBe(true);

      const me = await api('emily.carter@acme.test').get('/daily-reports/me');
      expect(me.body).toMatchObject({ required: true, report: null });

      expect((await api('emily.carter@acme.test').post('/me/clock', { action: 'IN' })).status).toBe(201);
      const blocked = await api('emily.carter@acme.test').post('/me/clock', { action: 'OUT' });
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('DAILY_REPORT_REQUIRED');

      expect((await api('emily.carter@acme.test').put('/daily-reports/me', { accomplished: '' })).status).toBe(400);
      const filed = await api('emily.carter@acme.test').put('/daily-reports/me', { accomplished: 'Tested the release', blockers: 'None', plan: 'Regression suite' });
      expect(filed.status).toBe(200);
      expect(filed.body.report).toMatchObject({ accomplished: 'Tested the release', plan: 'Regression suite' });
      expect((await api('emily.carter@acme.test').post('/me/clock', { action: 'OUT' })).status).toBe(201);
    });

    it('managers see who reported and who didn’t', async () => {
      const team = await api('manager@acme.test').get('/daily-reports/team');
      expect(team.status).toBe(200);
      const emily = team.body.rows.find((r: { fullName: string }) => r.fullName === 'Emily Carter');
      expect(emily.report.accomplished).toBe('Tested the release');
      expect(team.body.rows.some((r: { fullName: string }) => r.fullName === 'Carlo Mendoza')).toBe(false);
      expect((await api('employee@acme.test').get('/daily-reports/team')).status).toBe(403);
      expect(typeof (await ctx.app.get(WorkJobs).remindReports())).toBe('number');
    });
  });

  describe('dashboards', () => {
    it('shows your day, week, tasks, meetings and leave', async () => {
      const d = await api('employee@acme.test').get('/dashboard/me');
      expect(d.status).toBe(200);
      expect(d.body.today.workDate).toBe(today);
      expect(d.body.tasks.open).toBeGreaterThanOrEqual(1);
      expect(d.body.leave.map((l: LeaveBalanceDto) => l.typeName)).toEqual(['Vacation']);
      expect(d.body.dailyReport).toEqual({ required: true, submitted: false });
    });

    it('managers see their team; HR sees everyone; employees have no team view', async () => {
      const m = await api('manager@acme.test').get('/dashboard/team');
      expect(m.status).toBe(200);
      expect(m.body.scopeLabel).toBe('Your team');
      expect(m.body.week.people.map((p: { fullName: string }) => p.fullName)).toContain('Ana Cruz');
      expect(m.body.week.people.map((p: { fullName: string }) => p.fullName)).not.toContain('Carlo Mendoza');
      const hr = await api('hr@acme.test').get('/dashboard/team');
      expect(hr.body.scopeLabel).toBe('Everyone');
      expect(hr.body.headcount).toBeGreaterThan(m.body.headcount);
      expect((await api('employee@acme.test').get('/dashboard/team')).status).toBe(403);
    });
  });

  describe('reports and exports', () => {
    const range = () => `from=${addDays(today, -30)}&to=${addDays(monday, 10)}`;

    it('builds each report, scoped to the reader', async () => {
      for (const kind of ['attendance', 'tardiness', 'overtime', 'meetings', 'leave']) {
        const r = await api('hr@acme.test').get(`/reports/${kind}?${range()}`);
        expect(r.status).toBe(200);
        expect((r.body as ReportDto).columns.length).toBeGreaterThan(3);
      }
      const leave = (await api('hr@acme.test').get(`/reports/leave?${range()}`)).body as ReportDto;
      expect(leave.rows.some((r) => r.name === 'Ana Cruz' && r.status === 'Approved' && r.days === 5)).toBe(true);
      const mgr = (await api('manager@acme.test').get(`/reports/attendance?${range()}`)).body as ReportDto;
      expect(mgr.subtitle).toMatch(/Your team/);
      expect(mgr.rows.map((r) => r.name)).not.toContain('Carlo Mendoza');
      expect((await api('employee@acme.test').get(`/reports/attendance?${range()}`)).status).toBe(403);
      expect((await api('hr@acme.test').get(`/reports/logins?${range()}`)).status).toBe(403);
      expect((await api('admin@acme.test').get(`/reports/logins?${range()}`)).body.rows.length).toBeGreaterThan(0);
      expect((await api('hr@acme.test').get(`/reports/attendance?from=2026-01-01&to=2027-06-01`)).status).toBe(400);
    });

    it('exports CSV, Excel and PDF', async () => {
      const csv = await api('hr@acme.test').get(`/reports/leave?${range()}&format=csv`);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Name,Department,Leave type');
      expect(csv.text).toContain('Ana Cruz');
      const xlsx = await api('hr@acme.test').get(`/reports/attendance?${range()}&format=xlsx`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(xlsx.status).toBe(200);
      expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
      const pdf = await api('hr@acme.test').get(`/reports/attendance?${range()}&format=pdf`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('company settings', () => {
    it('admins change name, color, time zone, timeout, emails and logo', async () => {
      expect((await api('hr@acme.test').get('/admin/company')).status).toBe(403);
      const s = (await api('admin@acme.test').get('/admin/company')).body;
      const next = { ...s, companyName: 'Covenant Creators', primaryColor: '#7c3aed', notifications: { ...s.notifications, meetingReminders: false } };
      delete next.logoUrl;
      delete next.mailConfigured;
      const saved = await api('admin@acme.test').patch('/admin/company', next);
      expect(saved.status).toBe(200);
      expect(saved.body).toMatchObject({ companyName: 'Covenant Creators', primaryColor: '#7c3aed' });
      expect((await api('admin@acme.test').patch('/admin/company', { ...next, defaultTimezone: 'Mars/Base' })).status).toBe(400);
      const pub = (await http(ctx).get('/api/config')).body;
      expect(pub).toMatchObject({ companyName: 'Covenant Creators', primaryColor: '#7c3aed' });

      const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a0e1f6d70000000049454e44ae426082', 'hex');
      const logo = await http(ctx).put('/api/admin/company/logo').set(users.get('admin@acme.test')!.auth).set('Content-Type', 'image/png').send(png);
      expect(logo.status).toBe(200);
      expect(logo.body.logoUrl).toMatch(/^\/api\/branding\/logo\?v=/);
      const img = await http(ctx).get(logo.body.logoUrl);
      expect(img.headers['content-type']).toBe('image/png');
      expect((await http(ctx).put('/api/admin/company/logo').set(users.get('admin@acme.test')!.auth).set('Content-Type', 'image/png').send(Buffer.from('nope'))).status).toBe(400);
      expect((await api('admin@acme.test').del('/admin/company/logo')).body.logoUrl).toBeNull();
    });
  });
});
