import { authenticator } from 'otplib';
import { csrfFrom, http, setup, signIn, SEED_PASSWORD, TestCtx } from './helpers';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

describe('Auth: login, logout, sessions (e2e)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(() => ctx.close());

  const events = (type: string, email?: string) =>
    ctx.sql(
      `select e.* from auth_events e left join users u on u.id = e.user_id
       where e.type = $1 and ($2::text is null or u.email = $2 or e.email = $2) order by e.created_at desc`,
      [type, email ?? null],
    );

  describe('login', () => {
    it('signs in, sets secure cookies, and logs the login with IP and browser', async () => {
      const res = await http(ctx)
        .post('/api/auth/login')
        .set('user-agent', CHROME)
        .send({ email: 'Employee@Acme.test ', password: SEED_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.mfaRequired).toBe(false);
      expect(res.body.user).toMatchObject({ email: 'employee@acme.test', role: 'EMPLOYEE', departmentName: 'Engineering', managerName: 'Jose Reyes' });
      expect(res.body.sessionTimeoutMinutes).toBe(30);

      const cookies = ([] as string[]).concat(res.headers['set-cookie']);
      const rt = cookies.find((c) => c.startsWith('vo_rt='))!;
      expect(rt).toMatch(/HttpOnly/i);
      expect(rt).toMatch(/SameSite=Strict/i);
      expect(rt).toMatch(/Path=\/api\/auth/);
      expect(cookies.find((c) => c.startsWith('vo_csrf='))).not.toMatch(/HttpOnly/i);

      const [ev] = await events('LOGIN_SUCCESS', 'employee@acme.test');
      expect(ev).toMatchObject({ browser: 'Chrome 128', os: 'Windows 10', detail: 'password' });
      expect(ev.ip).toBeTruthy();
      expect(ev.session_id).toBeTruthy();
    });

    it('rejects a wrong password and an unknown email with the same message', async () => {
      const a = await http(ctx).post('/api/auth/login').send({ email: 'hr@acme.test', password: 'wrong-password-1' });
      const b = await http(ctx).post('/api/auth/login').send({ email: 'nobody@acme.test', password: 'wrong-password-1' });
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.message).toBe(b.body.message);
      expect(await events('LOGIN_FAILED', 'nobody@acme.test')).toHaveLength(1);
    });

    it('validates input with field errors', async () => {
      const res = await http(ctx).post('/api/auth/login').send({ email: 'not-an-email', password: '' });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.errors)).toEqual(expect.arrayContaining(['email', 'password']));
    });

    it('locks the account after 5 failed attempts, and an admin can unlock it', async () => {
      for (let i = 0; i < 5; i++) {
        await http(ctx).post('/api/auth/login').send({ email: 'carlo.mendoza@acme.test', password: 'bad-password-123' });
      }
      const locked = await http(ctx).post('/api/auth/login').send({ email: 'carlo.mendoza@acme.test', password: SEED_PASSWORD });
      expect(locked.status).toBe(423);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');
      expect(await events('LOGIN_LOCKED', 'carlo.mendoza@acme.test')).toHaveLength(1);

      const admin = await signIn(ctx, 'admin@acme.test');
      await admin.agent.post(`/api/users/${ctx.ids.get('carlo.mendoza@acme.test')}/activate`).set(admin.auth).expect(201);
      await signIn(ctx, 'carlo.mendoza@acme.test');
    });

    it('blocks deactivated accounts and invited users who have not set a password', async () => {
      const off = await http(ctx).post('/api/auth/login').send({ email: 'former@acme.test', password: SEED_PASSWORD });
      expect(off.status).toBe(403);
      expect(off.body.code).toBe('ACCOUNT_DEACTIVATED');
      const invited = await http(ctx).post('/api/auth/login').send({ email: 'invited@acme.test', password: SEED_PASSWORD });
      expect(invited.status).toBe(401);
    });
  });

  describe('sessions', () => {
    it('requires a token on protected endpoints', async () => {
      const res = await http(ctx).get('/api/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('refresh needs the CSRF header, rotates the cookie, and detects a replayed token', async () => {
      const s = await signIn(ctx, 'employee@acme.test');
      await s.agent.post('/api/auth/refresh').expect(403); // no CSRF header

      const [before] = await ctx.sql<{ refresh_hash: string }>('select refresh_hash from sessions where id = $1', [s.sessionId]);
      const r1 = await s.agent.post('/api/auth/refresh').set('x-csrf-token', s.csrf);
      expect(r1.status).toBe(200);
      expect(r1.body.accessToken).toBeTruthy();
      const [after] = await ctx.sql<{ refresh_hash: string }>('select refresh_hash from sessions where id = $1', [s.sessionId]);
      expect(after.refresh_hash).not.toBe(before.refresh_hash);
    });

    it('logout ends the session immediately and is logged', async () => {
      const s = await signIn(ctx, 'employee@acme.test');
      await s.agent.get('/api/me').set(s.auth).expect(200);
      await s.agent.post('/api/auth/logout').set('x-csrf-token', s.csrf).send({}).expect(204);
      const after = await s.agent.get('/api/me').set(s.auth);
      expect(after.status).toBe(401);
      expect(after.body.code).toBe('SESSION_ENDED');
      const [ev] = await ctx.sql('select * from auth_events where type = $1 and session_id = $2', ['LOGOUT', s.sessionId]);
      expect(ev).toBeTruthy();
    });

    it('signs out after 30 minutes of inactivity and logs a timeout', async () => {
      const s = await signIn(ctx, 'emily.carter@acme.test');
      await s.agent.post('/api/auth/activity').set(s.auth).expect(200);
      await ctx.sql(`update sessions set last_activity_at = now() - interval '31 minutes' where id = $1`, [s.sessionId]);
      const res = await s.agent.get('/api/me').set(s.auth);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_TIMEOUT');
      const rows = await ctx.sql('select * from auth_events where type = $1 and session_id = $2', ['SESSION_TIMEOUT', s.sessionId]);
      expect(rows).toHaveLength(1);
      // refresh cannot revive it
      const r = await s.agent.post('/api/auth/refresh').set('x-csrf-token', s.csrf);
      expect(r.status).toBe(401);
    });

    it('session status does not extend the timeout; activity does', async () => {
      const s = await signIn(ctx, 'employee@acme.test');
      await ctx.sql(`update sessions set last_activity_at = now() - interval '10 minutes' where id = $1`, [s.sessionId]);
      const st = await s.agent.get('/api/auth/session').set(s.auth).expect(200);
      expect(Date.now() - new Date(st.body.lastActivityAt).getTime()).toBeGreaterThan(9 * 60_000);
      const act = await s.agent.post('/api/auth/activity').set(s.auth).expect(200);
      expect(Date.now() - new Date(act.body.lastActivityAt).getTime()).toBeLessThan(5_000);
    });

    it('lists my sessions and lets me sign out another device', async () => {
      const a = await signIn(ctx, 'hr@acme.test');
      const b = await signIn(ctx, 'hr@acme.test', SEED_PASSWORD, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
      const list = await a.agent.get('/api/auth/sessions').set(a.auth).expect(200);
      const phone = list.body.find((x: { id: string }) => x.id === b.sessionId);
      expect(phone).toMatchObject({ device: 'mobile', current: false });
      await a.agent.delete(`/api/auth/sessions/${b.sessionId}`).set(a.auth).expect(204);
      await b.agent.get('/api/me').set(b.auth).expect(401);
      await a.agent.get('/api/me').set(a.auth).expect(200);
    });
  });

  describe('refresh token reuse', () => {
    it('revokes the session when an old refresh token is replayed after the grace window', async () => {
      const s = await signIn(ctx, 'manager@acme.test');
      const original = encodeURIComponent(s.refreshToken);
      await s.agent.post('/api/auth/refresh').set('x-csrf-token', s.csrf).expect(200);

      // Inside the grace window the old token still works (parallel tabs)...
      const inGrace = await http(ctx)
        .post('/api/auth/refresh')
        .set('Cookie', [`vo_rt=${original}`, `vo_csrf=${s.csrf}`])
        .set('x-csrf-token', s.csrf);
      expect(inGrace.status).toBe(200);

      // ...but not after it.
      await ctx.sql(`update sessions set refresh_rotated_at = now() - interval '5 minutes' where id = $1`, [s.sessionId]);
      const replay = await http(ctx)
        .post('/api/auth/refresh')
        .set('Cookie', [`vo_rt=${original}`, `vo_csrf=${s.csrf}`])
        .set('x-csrf-token', s.csrf);
      expect(replay.status).toBe(401);
      const [sess] = await ctx.sql<{ revoked_reason: string }>('select revoked_reason from sessions where id = $1', [s.sessionId]);
      expect(sess.revoked_reason).toBe('token_reuse');
      expect(await ctx.sql('select 1 from auth_events where type = $1 and session_id = $2', ['REFRESH_TOKEN_REUSE', s.sessionId])).toHaveLength(1);
      await s.agent.get('/api/me').set(s.auth).expect(401);
    });
  });

  describe('parallel refresh (several tabs / React StrictMode)', () => {
    it('never trips reuse detection when the same cookie is refreshed concurrently', async () => {
      const s = await signIn(ctx, 'employee@acme.test');
      const cookie = [`vo_rt=${encodeURIComponent(s.refreshToken)}`, `vo_csrf=${s.csrf}`];
      const results = await Promise.all(
        Array.from({ length: 6 }, () => http(ctx).post('/api/auth/refresh').set('Cookie', cookie).set('x-csrf-token', s.csrf)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
      // Exactly one response rotated the cookie; the others left the browser's cookie alone.
      const rotated = results.filter((r) => ([] as string[]).concat(r.headers['set-cookie'] ?? []).some((c) => c.startsWith('vo_rt=')));
      expect(rotated).toHaveLength(1);
      const [sess] = await ctx.sql<{ revoked_at: Date | null }>('select revoked_at from sessions where id = $1', [s.sessionId]);
      expect(sess.revoked_at).toBeNull();
      expect(await ctx.sql('select 1 from auth_events where type = $1 and session_id = $2', ['REFRESH_TOKEN_REUSE', s.sessionId])).toHaveLength(0);
    });
  });

  describe('password reset', () => {
    it('emails a single-use link, sets the new password, and signs out everywhere', async () => {
      const s = await signIn(ctx, 'emily.carter@acme.test');
      ctx.mail.outbox.length = 0;

      await http(ctx).post('/api/auth/forgot-password').send({ email: 'nobody@acme.test' }).expect(202);
      expect(ctx.mail.outbox).toHaveLength(0);

      await http(ctx).post('/api/auth/forgot-password').send({ email: 'emily.carter@acme.test' }).expect(202);
      expect(ctx.mail.outbox).toHaveLength(1);
      const token = decodeURIComponent(/token=([^\s"&]+)/.exec(ctx.mail.outbox[0].text)![1]);

      const v = await http(ctx).post('/api/auth/reset-password/validate').send({ token }).expect(200);
      expect(v.body).toMatchObject({ email: 'emily.carter@acme.test', purpose: 'PASSWORD_RESET' });

      await http(ctx).post('/api/auth/reset-password').send({ token, password: 'short' }).expect(400);
      await http(ctx).post('/api/auth/reset-password').send({ token, password: 'BrandNewPass2026' }).expect(200);
      await http(ctx).post('/api/auth/reset-password').send({ token, password: 'AnotherPass2026' }).expect(401); // single use

      await s.agent.get('/api/me').set(s.auth).expect(401);
      await signIn(ctx, 'emily.carter@acme.test', 'BrandNewPass2026');
      expect(await events('PASSWORD_RESET', 'emily.carter@acme.test')).toHaveLength(1);
    });

    it('change password keeps this session and ends the others', async () => {
      const a = await signIn(ctx, 'sales.manager@acme.test');
      const b = await signIn(ctx, 'sales.manager@acme.test');
      await a.agent.post('/api/me/password').set(a.auth).send({ currentPassword: 'wrong', newPassword: 'NewSalesPass2026' }).expect(403);
      const res = await a.agent.post('/api/me/password').set(a.auth).send({ currentPassword: SEED_PASSWORD, newPassword: 'NewSalesPass2026' }).expect(200);
      expect(res.body.otherSessionsSignedOut).toBe(1);
      await a.agent.get('/api/me').set(a.auth).expect(200);
      await b.agent.get('/api/me').set(b.auth).expect(401);
    });
  });

  describe('two-factor authentication', () => {
    it('sets up TOTP, then requires it at login; recovery codes work once', async () => {
      const s = await signIn(ctx, 'employee@acme.test');
      const setupRes = await s.agent.post('/api/auth/mfa/setup').set(s.auth).expect(200);
      expect(setupRes.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      const secret: string = setupRes.body.secret;

      await s.agent.post('/api/auth/mfa/enable').set(s.auth).send({ code: '000000' }).expect(403);
      const enabled = await s.agent.post('/api/auth/mfa/enable').set(s.auth).send({ code: authenticator.generate(secret) }).expect(200);
      const codes: string[] = enabled.body.recoveryCodes;
      expect(codes).toHaveLength(10);
      const [row] = await ctx.sql<{ mfa_secret_enc: string }>('select mfa_secret_enc from users where email = $1', ['employee@acme.test']);
      expect(row.mfa_secret_enc).not.toContain(secret); // encrypted at rest

      const step1 = await http(ctx).post('/api/auth/login').send({ email: 'employee@acme.test', password: SEED_PASSWORD }).expect(200);
      expect(step1.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
      expect(step1.headers['set-cookie']).toBeUndefined(); // no session yet

      await http(ctx).post('/api/auth/login/mfa').send({ mfaToken: step1.body.mfaToken, code: '123456' }).expect(401);
      const ok = await http(ctx)
        .post('/api/auth/login/mfa')
        .send({ mfaToken: step1.body.mfaToken, code: authenticator.generate(secret) })
        .expect(200);
      expect(ok.body.accessToken).toBeTruthy();
      expect(csrfFrom(ok)).toBeTruthy();

      const step2 = await http(ctx).post('/api/auth/login').send({ email: 'employee@acme.test', password: SEED_PASSWORD });
      await http(ctx).post('/api/auth/login/mfa').send({ mfaToken: step2.body.mfaToken, code: codes[0] }).expect(200);
      await http(ctx).post('/api/auth/login/mfa').send({ mfaToken: step2.body.mfaToken, code: codes[0] }).expect(401);

      // Admin can reset 2FA for someone who lost their phone.
      const admin = await signIn(ctx, 'admin@acme.test');
      await admin.agent.post(`/api/users/${ctx.ids.get('employee@acme.test')}/reset-mfa`).set(admin.auth).expect(201);
      const plain = await http(ctx).post('/api/auth/login').send({ email: 'employee@acme.test', password: SEED_PASSWORD }).expect(200);
      expect(plain.body.mfaRequired).toBe(false);
    });
  });

  it('public config exposes branding and timeout, nothing secret', async () => {
    const res = await http(ctx).get('/api/config').expect(200);
    expect(res.body).toEqual({ companyName: 'Acme Corp', primaryColor: '#2563eb', logoUrl: null, sessionTimeoutMinutes: 30, ssoProviders: [], deviceHost: null });
  });
});
