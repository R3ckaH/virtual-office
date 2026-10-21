import { Client } from 'pg';
import 'dotenv/config';

/** DEV ONLY: drops and recreates the public schema. */
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await c.end();
  console.log('Database reset');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
