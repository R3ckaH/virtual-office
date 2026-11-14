import { Client, Pool } from 'pg';
import { bootstrap } from '../src/db/bootstrap';
import { runMigrations } from '../src/db/migrate';

// Runs against its own empty database (a real first deploy), so it never touches vo_test's seed data.
const mainUrl = process.env.DATABASE_URL!;
const DB_NAME = 'vo_test_bootstrap';
const url = (() => {
  const u = new URL(mainUrl);
  u.pathname = `/${DB_NAME}`;
  return u.toString();
})();

async function admin(sql: string) {
  const c = new Client({ connectionString: mainUrl });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

describe('first-admin bootstrap', () => {
  let pool: Pool;
  const base = { DATABASE_URL: url, BOOTSTRAP_ADMIN_EMAIL: 'Pastor@Covenant.test', BOOTSTRAP_ADMIN_NAME: 'Senior Pastor', BOOTSTRAP_ADMIN_PASSWORD: 'Covenant-Strong-2026!', BOOTSTRAP_COMPANY_NAME: 'Covenant Creators' };

  beforeEach(async () => {
    await pool?.end();
    await admin(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin(`CREATE DATABASE ${DB_NAME}`);
    await runMigrations(url);
    pool = new Pool({ connectionString: url });
  });
  afterAll(async () => {
    await pool?.end();
    await admin(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  });

  it('does nothing without BOOTSTRAP_ADMIN_EMAIL', async () => {
    expect(await bootstrap({ DATABASE_URL: url })).toBe('skipped');
    expect((await pool.query('select 1 from users')).rowCount).toBe(0);
  });

  it('creates the first admin and names the company, once', async () => {
    expect(await bootstrap(base)).toBe('created');
    const { rows } = await pool.query('select email, role, password_hash from users');
    expect(rows).toEqual([expect.objectContaining({ email: 'pastor@covenant.test', role: 'ADMIN' })]);
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect((await pool.query('select company_name from org_settings where id = 1')).rows[0].company_name).toBe('Covenant Creators');
    expect((await pool.query("select 1 from audit_logs where action = 'system.bootstrap_admin'")).rowCount).toBe(1);
    // a new copy starts with neutral room names
    const names = (await pool.query('select name from rooms')).rows.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['Director’s office', 'Leadership room', 'Lobby']));
    expect(names.join()).not.toMatch(/Pastor|CEO/);

    expect(await bootstrap({ ...base, BOOTSTRAP_ADMIN_EMAIL: 'someone.else@covenant.test' })).toBe('exists');
    expect((await pool.query('select 1 from users')).rowCount).toBe(1);
  });

  it('keeps room names an office already changed, and never renames on a later start', async () => {
    await pool.query("update rooms set name = 'Founders' where spot = 'ceo'");
    expect(await bootstrap(base)).toBe('created');
    await pool.query("update rooms set name = 'CEO Strategy Room' where spot = 'ceo'");
    expect(await bootstrap(base)).toBe('exists');
    expect((await pool.query("select name from rooms where spot = 'ceo'")).rows[0].name).toBe('CEO Strategy Room');
  });

  it('rejects a weak password before touching the database', async () => {
    await expect(bootstrap({ ...base, BOOTSTRAP_ADMIN_PASSWORD: 'short' })).rejects.toThrow('BOOTSTRAP_ADMIN_PASSWORD');
  });
});
