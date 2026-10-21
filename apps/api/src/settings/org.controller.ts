import { Controller, Get, Inject } from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';
import { DB, Db } from '../db/client';
import { users } from '../db/schema';

/** Company-wide facts every signed-in person can see. */
@Controller('org')
export class OrgController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Time zones the team works in (most common first), for the clocks in the top bar. */
  @Get('timezones')
  async timezones() {
    return this.db
      .select({ timezone: users.timezone, people: count() })
      .from(users)
      .where(eq(users.status, 'ACTIVE'))
      .groupBy(users.timezone)
      .orderBy(desc(count()));
  }
}
