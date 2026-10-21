import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { addDays } from '@vo/shared';
import { and, eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { env } from '../config/env';
import { DB, DB_POOL, Db } from '../db/client';
import { users } from '../db/schema';
import { DayService } from './day.service';
import { PlannerService } from './planner.service';

/** Any number; only one API instance holds it at a time. */
const LOCK_ID = 7_202_602;

/**
 * Once a minute: recompute today's and yesterday's days for everyone tracked. This is what raises
 * "no punch", "missing clock-out" and the 14-hour auto clock-out when nobody punches at all.
 * A Postgres advisory lock keeps it to one API instance at a time.
 */
@Injectable()
export class AttendanceJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('AttendanceJobs');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly days: DayService,
    private readonly planner: PlannerService,
  ) {}

  onApplicationBootstrap() {
    if (env().NODE_ENV === 'test') return; // tests call tick() directly
    this.timer = setInterval(() => void this.safeTick(), 60_000);
    setTimeout(() => void this.safeTick(), 5_000).unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async safeTick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`Attendance check failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Returns false when another instance is already running the check. */
  async tick(now = new Date()): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID]);
      if (!rows[0]?.ok) return false;
      try {
        const today = await this.days.today(now);
        const yesterday = addDays(today, -1);
        const ids = (
          await this.db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.status, 'ACTIVE'), eq(users.attendanceTracked, true)))
        ).map((u) => u.id);
        const ctx = await this.planner.context(ids, yesterday, today);
        for (const id of ids) {
          await this.days.recompute(id, yesterday, now, ctx);
          await this.days.recompute(id, today, now, ctx);
        }
        return true;
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
      }
    } finally {
      client.release();
    }
  }
}
