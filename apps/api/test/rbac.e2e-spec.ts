import { SEED_USERS } from '../src/db/seed';
import { http, setup, signIn, Signed, SEED_PASSWORD, TestCtx } from './helpers';

describe('RBAC, user management, departments, logs (e2e)', () => {
  let ctx: TestCtx;
  let admin: Signed;
  let manager: Signed;
  let employee: Signed;

  beforeAll(async () => {
    ctx = await setup();
    admin = await signIn(ctx, 'admin@acme.test');
    manager = await signIn(ctx, 'manager@acme.test');
    employee = await signIn(ctx, 'employee@acme.test');
  });
  afterAll(() => ctx.close());

  const id = (email: string) => ctx.ids.get(email)!;

  describe('role checks on every endpoint', () => {
    const adminOnly: [string, string][] = [
      ['get', '/api/auth-events'],
      ['get', '/api/audit-logs'],
      ['get', '/api/users/manager-options'],
      ['post', '/api/users'],
      ['post', '/api/departments'],
    ];

    it.each(adminOnly)('employee gets 403 on %s %s', async (method, url) => {
      const res = await (employee.agent as any)[method](url).set(employee.auth).send({});
      expect(res.status).toBe(403);
    });

    it.each(adminOnly)('manager gets 403 on %s %s', async (method, url) => {
      const res = await (manager.agent as any)[method](url).set(manager.auth).send({});
      expect(res.status).toBe(403);
    });

    it('employee cannot list users but can read departments and their own profile', async () => {
      await employee.agent.get('/api/users').set(employee.auth).expect(403);
      await employee.agent.get('/api/departments').set(employee.auth).expect(200);
      const me = await employee.agent.get('/api/me').set(employee.auth).expect(200);
      expect(me.body.permissions).toEqual([]);
    });

    it('manager sees only their direct reports', async () => {
      const res = await manager.agent.get('/api/users').set(manager.auth).expect(200);
      const emails = res.body.items.map((u: { email: string }) => u.email).sort();
      expect(emails).toEqual(SEED_USERS.filter((u) => u.manager === 'manager@acme.test' && !u.deactivated).map((u) => u.email).sort());
      await manager.agent.get(`/api/users/${id('employee@acme.test')}`).set(manager.auth).expect(200);
      await manager.agent.get(`/api/users/${id('carlo.mendoza@acme.test')}`).set(manager.auth).expect(404);
    });

    it('admin sees everyone, with filters and search', async () => {
      const all = await admin.agent.get('/api/users').set(admin.auth).expect(200);
      expect(all.body.total).toBe(SEED_USERS.length);
      const mgrs = await admin.agent.get('/api/users?role=MANAGER').set(admin.auth).expect(200);
      expect(mgrs.body.items).toHaveLength(SEED_USERS.filter((u) => u.role === 'MANAGER').length);
      const search = await admin.agent.get('/api/users?search=carter').set(admin.auth).expect(200);
      expect(search.body.items.map((u: { fullName: string }) => u.fullName)).toEqual(['Emily Carter']);
      const off = await admin.agent.get('/api/users?status=DEACTIVATED').set(admin.auth).expect(200);
      expect(off.body.items[0].email).toBe('former@acme.test');
    });

    it('role changes apply on the very next request (role is read from the DB, not the token)', async () => {
      const temp = await signIn(ctx, 'hr@acme.test');
      await temp.agent.get('/api/auth-events').set(temp.auth).expect(403);
      await admin.agent.patch(`/api/users/${id('hr@acme.test')}`).set(admin.auth).send({ role: 'ADMIN' }).expect(200);
      await temp.agent.get('/api/auth-events').set(temp.auth).expect(200);
      await admin.agent.patch(`/api/users/${id('hr@acme.test')}`).set(admin.auth).send({ role: 'HR' }).expect(200);
      await temp.agent.get('/api/auth-events').set(temp.auth).expect(403);
    });
  });

  describe('user management (admin)', () => {
    let newId: string;

    it('creates a user, emails an invite, and writes an audit entry', async () => {
      ctx.mail.outbox.length = 0;
      const res = await admin.agent
        .post('/api/users')
        .set(admin.auth)
        .send({
          email: 'New.Hire@acme.test',
          fullName: 'Paolo Aquino',
          role: 'EMPLOYEE',
          timezone: 'Asia/Manila',
          departmentId: null,
          managerId: id('manager@acme.test'),
        })
        .expect(201);
      newId = res.body.id;
      expect(res.body).toMatchObject({ email: 'new.hire@acme.test', managerName: 'Jose Reyes', status: 'ACTIVE' });
      expect(ctx.mail.outbox[0].subject).toMatch(/invited/i);

      const [audit] = await ctx.sql<{ action: string; actor_id: string }>(
        `select * from audit_logs where entity_id = $1 and action = 'user.create'`,
        [newId],
      );
      expect(audit.actor_id).toBe(admin.userId);

      // The invite link sets a password and the new hire can sign in.
      const token = decodeURIComponent(/token=([^\s"&]+)/.exec(ctx.mail.outbox[0].text)![1]);
      const v = await http(ctx).post('/api/auth/reset-password/validate').send({ token }).expect(200);
      expect(v.body.purpose).toBe('INVITE');
      await http(ctx).post('/api/auth/reset-password').send({ token, password: 'PaoloFirstDay2026' }).expect(200);
      await signIn(ctx, 'new.hire@acme.test', 'PaoloFirstDay2026');
    });

    it('rejects duplicates, bad time zones, and non-manager managers', async () => {
      const dup = await admin.agent
        .post('/api/users')
        .set(admin.auth)
        .send({ email: 'admin@acme.test', fullName: 'X', role: 'EMPLOYEE', timezone: 'Asia/Manila' });
      expect(dup.status).toBe(409);
      expect(dup.body.errors.email).toBeDefined();

      const tz = await admin.agent
        .post('/api/users')
        .set(admin.auth)
        .send({ email: 'tz@acme.test', fullName: 'X', role: 'EMPLOYEE', timezone: 'Mars/Olympus' });
      expect(tz.status).toBe(400);
      expect(tz.body.errors.timezone).toBeDefined();

      const mgr = await admin.agent
        .post('/api/users')
        .set(admin.auth)
        .send({ email: 'm@acme.test', fullName: 'X', role: 'EMPLOYEE', timezone: 'Asia/Manila', managerId: id('employee@acme.test') });
      expect(mgr.status).toBe(400);
    });

    it('records only changed fields in the audit log', async () => {
      await admin.agent
        .patch(`/api/users/${newId}`)
        .set(admin.auth)
        .send({ title: 'Junior Engineer', timezone: 'Asia/Manila' })
        .expect(200);
      const [row] = await ctx.sql<{ before: object; after: object }>(
        `select before, after from audit_logs where entity_id = $1 and action = 'user.update'`,
        [newId],
      );
      expect(row.before).toEqual({ title: null });
      expect(row.after).toEqual({ title: 'Junior Engineer' });
    });

    it('prevents reporting loops', async () => {
      // Jose reports to Maria; making Maria report to Jose would be a loop.
      const res = await admin.agent
        .patch(`/api/users/${id('admin@acme.test')}`)
        .set(admin.auth)
        .send({ managerId: id('manager@acme.test') });
      expect(res.status).toBe(400);
    });

    it('protects the admin from removing their own access', async () => {
      await admin.agent.post(`/api/users/${admin.userId}/deactivate`).set(admin.auth).expect(403);
      // with another admin around, changing your own role is still blocked
      await admin.agent.patch(`/api/users/${admin.userId}`).set(admin.auth).send({ role: 'EMPLOYEE' }).expect(403);
      // as the only active admin, it's blocked as "last admin"
      await admin.agent.post(`/api/users/${id('pastor@acme.test')}/deactivate`).set(admin.auth).expect(201);
      await admin.agent.patch(`/api/users/${admin.userId}`).set(admin.auth).send({ role: 'EMPLOYEE' }).expect(409);
      await admin.agent.post(`/api/users/${id('pastor@acme.test')}/activate`).set(admin.auth).expect(201);
    });

    it('force logout ends every session for that user at once', async () => {
      const a = await signIn(ctx, 'carlo.mendoza@acme.test');
      const b = await signIn(ctx, 'carlo.mendoza@acme.test');
      const res = await admin.agent.post(`/api/users/${id('carlo.mendoza@acme.test')}/force-logout`).set(admin.auth).expect(201);
      expect(res.body.sessionsEnded).toBe(2);
      const after = await a.agent.get('/api/me').set(a.auth);
      expect(after.status).toBe(401);
      expect(after.body.code).toBe('FORCED_LOGOUT');
      await b.agent.post('/api/auth/refresh').set('x-csrf-token', b.csrf).expect(401);
      const [ev] = await ctx.sql<{ detail: string }>(
        `select detail from auth_events where type = 'FORCED_LOGOUT' and user_id = $1`,
        [id('carlo.mendoza@acme.test')],
      );
      expect(ev.detail).toContain('Maria Santos');
    });

    it('deactivation signs the user out and blocks login; reactivation restores it', async () => {
      const s = await signIn(ctx, 'hr@acme.test');
      await admin.agent.post(`/api/users/${id('hr@acme.test')}/deactivate`).set(admin.auth).expect(201);
      await s.agent.get('/api/me').set(s.auth).expect(401);
      await http(ctx).post('/api/auth/login').send({ email: 'hr@acme.test', password: SEED_PASSWORD }).expect(403);
      await admin.agent.post(`/api/users/${id('hr@acme.test')}/activate`).set(admin.auth).expect(201);
      await signIn(ctx, 'hr@acme.test');
    });

    it('admin can view a user’s active sessions and send a reset link', async () => {
      await signIn(ctx, 'emily.carter@acme.test');
      const res = await admin.agent.get(`/api/users/${id('emily.carter@acme.test')}/sessions`).set(admin.auth).expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      ctx.mail.outbox.length = 0;
      const link = await admin.agent.post(`/api/users/${id('emily.carter@acme.test')}/send-password-link`).set(admin.auth).expect(201);
      expect(link.body.sent).toBe('PASSWORD_RESET');
      expect(ctx.mail.outbox).toHaveLength(1);
    });
  });

  describe('departments', () => {
    it('creates, renames, and deletes with audit entries; names are unique (case-insensitive)', async () => {
      const created = await admin.agent.post('/api/departments').set(admin.auth).send({ name: 'Finance' }).expect(201);
      await admin.agent.post('/api/departments').set(admin.auth).send({ name: 'finance' }).expect(409);
      await admin.agent.patch(`/api/departments/${created.body.id}`).set(admin.auth).send({ name: 'Finance & Admin', headUserId: id('hr@acme.test') }).expect(200);
      const list = await employee.agent.get('/api/departments').set(employee.auth).expect(200);
      expect(list.body.find((d: { name: string }) => d.name === 'Finance & Admin')).toMatchObject({ headUserName: 'Grace Lim', memberCount: 0 });
      const eng = list.body.find((d: { name: string }) => d.name === 'Engineering');
      expect(eng.memberCount).toBeGreaterThanOrEqual(3);
      await admin.agent.delete(`/api/departments/${created.body.id}`).set(admin.auth).expect(204);
      const actions = await ctx.sql<{ action: string }>(
        `select action from audit_logs where entity_type = 'department' and entity_id = $1 order by created_at`,
        [created.body.id],
      );
      expect(actions.map((a) => a.action)).toEqual(['department.create', 'department.update', 'department.delete']);
    });
  });

  describe('login history and audit log', () => {
    it('lists login events with filters', async () => {
      const res = await admin.agent
        .get(`/api/auth-events?type=LOGIN_SUCCESS&userId=${id('manager@acme.test')}`)
        .set(admin.auth)
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.items[0]).toMatchObject({ type: 'LOGIN_SUCCESS', userName: 'Jose Reyes', email: 'manager@acme.test' });
    });

    it('lists audit entries with the actor name', async () => {
      const res = await admin.agent.get('/api/audit-logs?entityType=user').set(admin.auth).expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items[0].actorName).toBe('Maria Santos');
    });
  });
});
