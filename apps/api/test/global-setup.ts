import { Client } from 'pg';
import './env';

/** Rebuilds the test database from the migrations once per `jest` run. */
export default async function globalSetup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await c.end();
  const { runMigrations } = await import('../src/db/migrate');
  await runMigrations(process.env.DATABASE_URL);
}
