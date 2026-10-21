import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from '../config/env';
import { createDb, createPool, DB, DB_POOL } from './client';

@Global()
@Module({
  providers: [
    { provide: DB_POOL, useFactory: () => createPool(env().DATABASE_URL) },
    { provide: DB, inject: [DB_POOL], useFactory: (pool: Pool) => createDb(pool) },
  ],
  exports: [DB, DB_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
