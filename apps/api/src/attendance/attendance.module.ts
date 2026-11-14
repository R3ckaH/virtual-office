import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { BoardService } from './board.service';
import { ClockService } from './clock.service';
import { CorrectionsService } from './corrections.service';
import { DayService } from './day.service';
import { ExceptionsService } from './exceptions.service';
import { AttendanceJobs } from './jobs.service';
import { MeAttendanceController } from './me-attendance.controller';
import { PlannerService } from './planner.service';
import { RulesService } from './rules.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { TeamController } from './team.controller';

/** Phase 2: clock in/out, schedules, attendance days, exceptions and corrections. */
@Module({
  controllers: [MeAttendanceController, TeamController, AttendanceController, SchedulesController],
  providers: [
    RulesService,
    PlannerService,
    DayService,
    BoardService,
    ClockService,
    ExceptionsService,
    CorrectionsService,
    SchedulesService,
    AttendanceJobs,
  ],
  exports: [BoardService, CorrectionsService, ClockService, DayService, ExceptionsService, RulesService, PlannerService, AttendanceJobs],
})
export class AttendanceModule {}
