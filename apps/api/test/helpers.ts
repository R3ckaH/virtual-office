import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import { createApp } from '../src/app.factory';
import { DB_POOL } from '../src/db/client';
import { seed, SEED_PASSWORD } from '../src/db/seed';
import { MailService } from '../src/mail/mail.service';
import { SettingsService } from '../src/settings/settings.service';

export { SEED_PASSWORD };

export interface TestCtx {
  app: INestApplication;
  pool: Pool;
  mail: MailService;
  sql: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;
  ids: Map<string, string>;
  close: () => Promise<void>;
}

/** Fresh seed data + a running app for one test file. */
export async function setup(): Promise<TestCtx> {
  const pool0 = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool0.query(
    'TRUNCATE sessions, auth_events, audit_logs, one_time_tokens, mfa_recovery_codes, sso_identities, punches, attendance_days, attendance_exceptions, correction_requests, day_overrides, import_batches, device_user_links, presence, meetings, calendar_feeds, channels, chat_files, leave_types, holidays, tasks, daily_reports CASCADE',
  );
  await pool0.query("UPDATE departments SET require_daily_report = false");
  await pool0.query("UPDATE org_settings SET recording_enabled = false, notifications = DEFAULT, company_name = 'Acme Corp', primary_color = '#2563eb', logo_url = NULL, session_timeout_minutes = 30",
  );
  await pool0.end();
  const { users } = await seed(process.env.DATABASE_URL);

  const app = await createApp();
  await app.init();
  const pool = app.get<Pool>(DB_POOL);
  const mail = app.get(MailService);
  app.get(SettingsService).invalidate();
  return {
    app,
    pool,
    mail,
    ids: users,
    sql: async (text, params) => (await pool.query(text, params)).rows,
    close: () => app.close(),
  };
}

export interface Signed {
  agent: TestAgent;
  token: string;
  csrf: string;
  /** the refresh cookie value issued at login */
  refreshToken: string;
  sessionId: string;
  userId: string;
  auth: { Authorization: string };
}

export function cookieFrom(res: request.Response, name: string): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const c = cookies.find((x) => x.startsWith(`${name}=`));
  return c ? decodeURIComponent(c.split(';')[0].slice(name.length + 1)) : '';
}

export const csrfFrom = (res: request.Response) => cookieFrom(res, 'vo_csrf');

export async function signIn(ctx: TestCtx, email: string, password = SEED_PASSWORD, ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'): Promise<Signed> {
  const agent = request.agent(ctx.app.getHttpServer());
  const res = await agent.post('/api/auth/login').set('user-agent', ua).send({ email, password });
  if (res.status !== 200 || res.body.mfaRequired) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const payload = JSON.parse(Buffer.from(res.body.accessToken.split('.')[1], 'base64url').toString());
  return {
    agent,
    token: res.body.accessToken,
    csrf: csrfFrom(res),
    refreshToken: cookieFrom(res, 'vo_rt'),
    sessionId: payload.sid,
    userId: payload.sub,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

export const http = (ctx: TestCtx) => request(ctx.app.getHttpServer());
