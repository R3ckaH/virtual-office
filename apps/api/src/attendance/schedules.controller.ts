import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { scheduleSchema, type ScheduleInput } from '@vo/shared';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import type { User } from '../db/schema';
import { SchedulesService } from './schedules.service';

@Controller('schedules')
@RequirePermissions('attendance.manage')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  list() {
    return this.schedules.list();
  }

  @Post()
  create(@Body(new ZodPipe(scheduleSchema)) body: ScheduleInput, @CurrentUser() actor: User, @Req() req: Request) {
    return this.schedules.create(body, actor, req.ip ?? null);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(scheduleSchema)) body: ScheduleInput,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    return this.schedules.update(id, body, actor, req.ip ?? null);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User, @Req() req: Request) {
    await this.schedules.remove(id, actor, req.ip ?? null);
    return { ok: true };
  }
}
