import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  clockSchema,
  createCorrectionSchema,
  rangeQuerySchema,
  type ClockInput,
  type CreateCorrectionInput,
  type RangeQuery,
} from '@vo/shared';
import type { Request } from 'express';
import { CurrentUser } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import type { User } from '../db/schema';
import { ClockService } from './clock.service';
import { CorrectionsService } from './corrections.service';

/** Any signed-in person: their own clock, timesheet and correction requests. */
@Controller('me')
export class MeAttendanceController {
  constructor(
    private readonly clock: ClockService,
    private readonly corrections: CorrectionsService,
  ) {}

  @Get('clock')
  state(@CurrentUser() user: User) {
    return this.clock.state(user);
  }

  @Post('clock')
  punch(@Body(new ZodPipe(clockSchema)) body: ClockInput, @CurrentUser() user: User, @Req() req: Request) {
    return this.clock.clock(user, body, req.ip ?? null);
  }

  @Get('attendance')
  days(@Query(new ZodPipe(rangeQuerySchema)) q: RangeQuery, @CurrentUser() user: User) {
    return this.clock.myDays(user, q);
  }

  @Get('corrections')
  myCorrections(@CurrentUser() user: User) {
    return this.corrections.mine(user.id);
  }

  @Post('corrections')
  request(@Body(new ZodPipe(createCorrectionSchema)) body: CreateCorrectionInput, @CurrentUser() user: User, @Req() req: Request) {
    return this.corrections.create(body, user, req.ip ?? null);
  }

  @Post('corrections/:id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.corrections.cancel(id, user);
  }
}
