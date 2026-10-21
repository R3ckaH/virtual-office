import { Inject, Injectable } from '@nestjs/common';
import { AttendanceRules } from '@vo/shared';
import { eq } from 'drizzle-orm';
import { DB, Db } from '../db/client';
import { attendanceSettings } from '../db/schema';

/** The attendance rules row (grace period, duplicate window, ...). Cached briefly. */
@Injectable()
export class RulesService {
  private cache?: { value: AttendanceRules; at: number };

  constructor(@Inject(DB) private readonly db: Db) {}

  async get(): Promise<AttendanceRules> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.value;
    let [row] = await this.db.select().from(attendanceSettings).where(eq(attendanceSettings.id, 1));
    if (!row) {
      await this.db.insert(attendanceSettings).values({ id: 1 }).onConflictDoNothing();
      [row] = await this.db.select().from(attendanceSettings).where(eq(attendanceSettings.id, 1));
    }
    const value: AttendanceRules = {
      graceMinutes: row.graceMinutes,
      duplicateWindowMinutes: row.duplicateWindowMinutes,
      mismatchMinutes: row.mismatchMinutes,
      noPunchAfterMinutes: row.noPunchAfterMinutes,
      missingOutAfterMinutes: row.missingOutAfterMinutes,
      autoClockOutHours: row.autoClockOutHours,
      deviceWinsOnsite: row.deviceWinsOnsite,
    };
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(input: AttendanceRules): Promise<AttendanceRules> {
    await this.get();
    await this.db.update(attendanceSettings).set(input).where(eq(attendanceSettings.id, 1));
    this.cache = undefined;
    return this.get();
  }

  invalidate() {
    this.cache = undefined;
  }
}
