import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Patch, Query, Req } from '@nestjs/common';
import {
  dailyReportSchema,
  holidaySchema,
  leaveAdjustmentSchema,
  leaveCalendarSchema,
  leaveDecisionSchema,
  leaveListSchema,
  leavePreviewSchema,
  leaveRequestSchema,
  leaveTypeSchema,
  taskSchema,
  tasksQuerySchema,
  teamReportsSchema,
  updateTaskSchema,
  type DailyReportInput,
  type HolidayInput,
  type LeaveAdjustmentInput,
  type LeaveCalendarQuery,
  type LeaveDecisionInput,
  type LeaveListQuery,
  type LeavePreviewQuery,
  type LeaveRequestInput,
  type LeaveTypeInput,
  type TaskInput,
  type TasksQuery,
  type TeamReportsQuery,
  type UpdateTaskInput,
} from '@vo/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import type { User } from '../db/schema';
import { LeaveService } from './leave.service';
import { TasksService } from './tasks.service';

const balanceQuery = z.object({ userId: z.string().uuid().optional(), year: z.coerce.number().int().min(2020).max(2100).optional() });
const holidaysQuery = z.object({ year: z.coerce.number().int().min(2020).max(2100).optional(), from: z.string().optional(), to: z.string().optional() });
const reportQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

@Controller()
export class WorkController {
  constructor(
    private readonly leave: LeaveService,
    private readonly tasks: TasksService,
  ) {}

  /* ---------------- leave ---------------- */

  @Get('leave/types')
  types(@CurrentUser() me: User) {
    return this.leave.types(me);
  }

  @Post('leave/types')
  @RequirePermissions('leave.manage')
  createType(@CurrentUser() me: User, @Body(new ZodPipe(leaveTypeSchema)) body: LeaveTypeInput, @Req() req: Request) {
    return this.leave.createType(me, body, req.ip ?? null);
  }

  @Put('leave/types/:id')
  @RequirePermissions('leave.manage')
  updateType(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(leaveTypeSchema)) body: LeaveTypeInput, @Req() req: Request) {
    return this.leave.updateType(me, id, body, req.ip ?? null);
  }

  @Delete('leave/types/:id')
  @HttpCode(204)
  @RequirePermissions('leave.manage')
  deleteType(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.leave.deleteType(me, id, req.ip ?? null);
  }

  @Get('leave/balances')
  async balances(@CurrentUser() me: User, @Query(new ZodPipe(balanceQuery)) q: z.infer<typeof balanceQuery>) {
    return this.leave.balances(me, q.userId ?? me.id, q.year ?? new Date().getFullYear());
  }

  @Get('leave/adjustments')
  adjustments(@CurrentUser() me: User, @Query(new ZodPipe(balanceQuery)) q: z.infer<typeof balanceQuery>) {
    return this.leave.adjustments(me, q.userId ?? me.id, q.year ?? new Date().getFullYear());
  }

  @Post('leave/adjustments')
  @RequirePermissions('leave.manage')
  adjust(@CurrentUser() me: User, @Body(new ZodPipe(leaveAdjustmentSchema)) body: LeaveAdjustmentInput, @Req() req: Request) {
    return this.leave.adjust(me, body, req.ip ?? null);
  }

  @Get('leave/preview')
  preview(@CurrentUser() me: User, @Query(new ZodPipe(leavePreviewSchema)) q: LeavePreviewQuery) {
    return this.leave.preview(me, q.typeId, q.startDate, q.endDate, q.userId);
  }

  @Get('leave/calendar')
  calendar(@CurrentUser() me: User, @Query(new ZodPipe(leaveCalendarSchema)) q: LeaveCalendarQuery) {
    return this.leave.calendar(me, q);
  }

  @Get('leave/requests')
  list(@CurrentUser() me: User, @Query(new ZodPipe(leaveListSchema)) q: LeaveListQuery) {
    return this.leave.list(me, q);
  }

  @Post('leave/requests')
  create(@CurrentUser() me: User, @Body(new ZodPipe(leaveRequestSchema)) body: LeaveRequestInput, @Req() req: Request) {
    return this.leave.create(me, body, req.ip ?? null);
  }

  @Get('leave/requests/:id')
  get(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.get(me, id);
  }

  @Post('leave/requests/:id/decision')
  @HttpCode(200)
  decide(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(leaveDecisionSchema)) body: LeaveDecisionInput, @Req() req: Request) {
    return this.leave.decide(me, id, body, req.ip ?? null);
  }

  @Post('leave/requests/:id/cancel')
  @HttpCode(204)
  cancel(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.leave.cancel(me, id, req.ip ?? null);
  }

  /* ---------------- holidays ---------------- */

  @Get('holidays')
  holidays(@Query(new ZodPipe(holidaysQuery)) q: z.infer<typeof holidaysQuery>) {
    const year = q.year ?? new Date().getFullYear();
    return this.leave.holidays(q.from ?? `${year}-01-01`, q.to ?? `${year}-12-31`);
  }

  @Post('holidays')
  @RequirePermissions('attendance.manage')
  addHoliday(@CurrentUser() me: User, @Body(new ZodPipe(holidaySchema)) body: HolidayInput, @Req() req: Request) {
    return this.leave.saveHoliday(me, body, req.ip ?? null);
  }

  @Put('holidays/:id')
  @RequirePermissions('attendance.manage')
  updateHoliday(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(holidaySchema)) body: HolidayInput, @Req() req: Request) {
    return this.leave.saveHoliday(me, body, req.ip ?? null, id);
  }

  @Delete('holidays/:id')
  @HttpCode(204)
  @RequirePermissions('attendance.manage')
  deleteHoliday(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.leave.deleteHoliday(me, id, req.ip ?? null);
  }

  /* ---------------- tasks ---------------- */

  @Get('tasks')
  listTasks(@CurrentUser() me: User, @Query(new ZodPipe(tasksQuerySchema)) q: TasksQuery) {
    return this.tasks.list(me, q);
  }

  @Post('tasks')
  createTask(@CurrentUser() me: User, @Body(new ZodPipe(taskSchema)) body: TaskInput) {
    return this.tasks.create(me, body);
  }

  @Patch('tasks/:id')
  updateTask(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateTaskSchema)) body: UpdateTaskInput) {
    return this.tasks.update(me, id, body);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  deleteTask(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.remove(me, id);
  }

  /* ---------------- end-of-day reports ---------------- */

  @Get('daily-reports/me')
  myReport(@CurrentUser() me: User, @Query(new ZodPipe(reportQuery)) q: z.infer<typeof reportQuery>) {
    return this.tasks.myReport(me, q.date);
  }

  @Put('daily-reports/me')
  submitReport(@CurrentUser() me: User, @Body(new ZodPipe(dailyReportSchema)) body: DailyReportInput) {
    return this.tasks.submit(me, body);
  }

  @Get('daily-reports/team')
  teamReports(@CurrentUser() me: User, @Query(new ZodPipe(teamReportsSchema)) q: TeamReportsQuery) {
    return this.tasks.team(me, q);
  }
}
