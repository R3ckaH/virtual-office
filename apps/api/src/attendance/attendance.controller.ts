import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import {
  adjustTimesSchema,
  attendanceRulesSchema,
  dateQuerySchema,
  dateSchema,
  dayNoteSchema,
  dayOverrideSchema,
  decisionSchema,
  listCorrectionsQuerySchema,
  listExceptionsQuerySchema,
  personSetupSchema,
  rangeQuerySchema,
  resolveExceptionSchema,
  type AdjustTimesInput,
  type AttendanceRules,
  type DateQuery,
  type DayNoteInput,
  type DayOverrideInput,
  type DecisionInput,
  type ListCorrectionsQuery,
  type ListExceptionsQuery,
  type PersonSetupInput,
  type RangeQuery,
  type ResolveExceptionInput,
} from '@vo/shared';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import type { User } from '../db/schema';
import { BoardService } from './board.service';
import { CorrectionsService } from './corrections.service';
import { toDayDto, toPunchDto } from './dto';
import { ExceptionsService } from './exceptions.service';
import { RulesService } from './rules.service';
import { SchedulesService } from './schedules.service';

const dateParam = new ZodPipe(dateSchema);

/** HR: the attendance board, exceptions, corrections (final approval), people setup, leave marks and rules. */
@Controller('attendance')
@RequirePermissions('attendance.manage')
export class AttendanceController {
  constructor(
    private readonly board: BoardService,
    private readonly exceptions: ExceptionsService,
    private readonly corrections: CorrectionsService,
    private readonly schedules: SchedulesService,
    private readonly rules: RulesService,
    private readonly audit: AuditService,
  ) {}

  @Get('board')
  getBoard(@Query(new ZodPipe(dateQuerySchema)) q: DateQuery) {
    return this.board.board(q.date, null);
  }

  @Get('live')
  live() {
    return this.board.live(8);
  }

  @Get('people')
  people() {
    return this.schedules.people();
  }

  @Patch('people/:userId')
  setup(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodPipe(personSetupSchema)) body: PersonSetupInput,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    return this.schedules.updatePerson(userId, body, actor, req.ip ?? null);
  }

  @Get('people/:userId/day')
  day(@Param('userId', ParseUUIDPipe) userId: string, @Query(new ZodPipe(dateQuerySchema)) q: DateQuery) {
    return this.board.detail(userId, q.date);
  }

  @Put('days/:userId/:date/times')
  async adjust(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('date', dateParam) date: string,
    @Body(new ZodPipe(adjustTimesSchema)) body: AdjustTimesInput,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    const r = await this.exceptions.adjustTimes(userId, date, body, actor, req.ip ?? null);
    return { day: toDayDto(r.day), punches: r.punches.map((p) => toPunchDto(p, r.roles.get(p.punch.id))) };
  }

  @Patch('days/:userId/:date/note')
  async note(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('date', dateParam) date: string,
    @Body(new ZodPipe(dayNoteSchema)) body: DayNoteInput,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    const r = await this.exceptions.setNote(userId, date, body.note, actor, req.ip ?? null);
    return r ? toDayDto(r.day) : null;
  }

  @Get('exceptions')
  listExceptions(@Query(new ZodPipe(listExceptionsQuerySchema)) q: ListExceptionsQuery) {
    return this.exceptions.list(q);
  }

  @Post('exceptions/:id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(resolveExceptionSchema)) body: ResolveExceptionInput,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    return this.exceptions.resolve(id, body, actor, req.ip ?? null);
  }

  @Get('corrections')
  listCorrections(@Query(new ZodPipe(listCorrectionsQuerySchema)) q: ListCorrectionsQuery) {
    return this.corrections.forHr(q.status);
  }

  @Post('corrections/:id/decision')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decisionSchema)) body: DecisionInput,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    return this.corrections.hrDecision(id, body, actor, req.ip ?? null);
  }

  @Get('settings')
  getRules() {
    return this.rules.get();
  }

  @Put('settings')
  async setRules(@Body(new ZodPipe(attendanceRulesSchema)) body: AttendanceRules, @CurrentUser() actor: User, @Req() req: Request) {
    const before = await this.rules.get();
    const after = await this.rules.update(body);
    await this.audit.record({ actorId: actor.id, action: 'attendance.rules', entityType: 'settings', entityId: 'attendance', before, after, ip: req.ip ?? null });
    return after;
  }

  @Get('overrides')
  overrides(@Query(new ZodPipe(rangeQuerySchema)) q: RangeQuery) {
    return this.schedules.overrides(q);
  }

  @Put('overrides')
  setOverride(@Body(new ZodPipe(dayOverrideSchema)) body: DayOverrideInput, @CurrentUser() actor: User, @Req() req: Request) {
    return this.schedules.setOverride(body, actor, req.ip ?? null);
  }

  @Delete('overrides/:id')
  async removeOverride(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User, @Req() req: Request) {
    await this.schedules.removeOverride(id, actor, req.ip ?? null);
    return { ok: true };
  }

  @Get('export')
  async export(@Query(new ZodPipe(rangeQuerySchema)) q: RangeQuery, @Res() res: Response) {
    const csv = await this.board.exportCsv(q.from, q.to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${q.from}-to-${q.to}.csv"`);
    res.send('﻿' + csv); // BOM so Excel reads UTF-8 names correctly
  }
}
