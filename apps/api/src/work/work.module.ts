import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { PresenceModule } from '../presence/presence.module';
import { LeaveService } from './leave.service';
import { NoticesService } from './notices.service';
import { TasksService } from './tasks.service';
import { WorkController } from './work.controller';
import { WorkJobs } from './work.jobs';

/** Phase 6: leave, holidays, tasks and end-of-day reports. */
@Module({
  imports: [AttendanceModule, PresenceModule],
  controllers: [WorkController],
  providers: [NoticesService, LeaveService, TasksService, WorkJobs],
  exports: [LeaveService, TasksService, NoticesService],
})
export class WorkModule {}
