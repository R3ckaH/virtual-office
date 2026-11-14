import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { PresenceModule } from '../presence/presence.module';
import { WorkModule } from '../work/work.module';
import { DashboardService } from './dashboard.service';
import { InsightsController } from './insights.controller';
import { ReportsService } from './reports.service';

/** Phase 7: dashboards, reports and exports, company settings. */
@Module({
  imports: [AttendanceModule, MeetingsModule, PresenceModule, WorkModule],
  controllers: [InsightsController],
  providers: [DashboardService, ReportsService],
})
export class InsightsModule {}
