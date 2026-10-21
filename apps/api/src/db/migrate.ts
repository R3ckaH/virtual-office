import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from './client';
import 'dotenv/config';

/** Applies pending SQL migrations in /drizzle. Safe to run on every deploy. */
export async function runMigrations(url = process.env.DATABASE_URL!) {
  const pool = createPool(url);
  try {
    await migrate(createDb(pool), { migrationsFolder: path.join(__dirname, '..', '..', 'drizzle') });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => console.log('Migrations applied'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
