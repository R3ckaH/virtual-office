import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export const DB = Symbol('DB');
export const DB_POOL = Symbol('DB_POOL');

export function createPool(url: string) {
  return new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema });
}
