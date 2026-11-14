import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { addDays } from '@vo/shared';
import { DayService } from '../attendance/day.service';
import { env } from '../config/env';
import { NoticesService } from './notices.service';
import { TasksService } from './tasks.service';

/**
 * Every 5 minutes: remind people whose department requires an end-of-day report, once their shift
 * has ended, if they worked and haven't filed one. Each person is reminded once per day.
 */
@Injectable()
export class WorkJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('WorkJobs');
  private timer?: NodeJS.Timeout;
  private readonly reminded = new Set<string>();

  constructor(
    private readonly tasks: TasksService,
    private readonly days: DayService,
    private readonly notices: NoticesService,
  ) {}

  onApplicationBootstrap() {
    if (env().NODE_ENV === 'test') return; // tests call remindReports() directly
    this.timer = setInterval(() => void this.remindReports().catch((e) => this.log.error(`Report reminders failed: ${e}`)), 5 * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async remindReports(now = new Date()): Promise<number> {
    const today = await this.days.today(now);
    let sent = 0;
    for (const date of [addDays(today, -1), today]) {
      for (const p of await this.tasks.missingReports(date)) {
        const key = `${p.id}:${date}`;
        if (this.reminded.has(key) || !p.scheduleEnd) continue;
        const end = p.scheduleEnd.getTime();
        // from the end of the shift, for two hours
        if (now.getTime() < end || now.getTime() > end + 2 * 3_600_000) continue;
        this.reminded.add(key);
        sent += 1;
        await this.notices.send([p], {
          kind: 'dailyReportReminder',
          title: 'End-of-day report',
          body: 'Your shift has ended. Take a minute to file your end-of-day report: what you did, any blockers, and your plan for tomorrow.',
          link: '/tasks?report=1',
          actionLabel: 'Write my report',
          subject: 'Your end-of-day report',
          footer: 'Your team asks for a short report at the end of each work day.',
        });
      }
    }
    if (this.reminded.size > 10_000) this.reminded.clear();
    return sent;
  }
}
