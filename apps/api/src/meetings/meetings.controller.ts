import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  meetingRangeSchema,
  meetingSettingsSchema,
  respondSchema,
  scheduleMeetingSchema,
  startCallSchema,
  type MeetingRange,
  type MeetingSettingsInput,
  type RespondInput,
  type ScheduleMeetingInput,
  type StartCallInput,
} from '@vo/shared';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Public, RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import type { User } from '../db/schema';
import { MeetingsService } from './meetings.service';

@Controller()
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly audit: AuditService,
  ) {}

  /* ---- calendar ---- */

  @Get('meetings')
  list(@CurrentUser() me: User, @Query(new ZodPipe(meetingRangeSchema)) q: MeetingRange) {
    return this.meetings.list(me, q);
  }

  @Get('meetings/:id')
  get(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.get(me, id);
  }

  @Post('meetings')
  @RequirePermissions('meetings.schedule')
  create(@CurrentUser() me: User, @Body(new ZodPipe(scheduleMeetingSchema)) body: ScheduleMeetingInput) {
    return this.meetings.create(me, body);
  }

  @Put('meetings/:id')
  update(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(scheduleMeetingSchema)) body: ScheduleMeetingInput) {
    return this.meetings.update(me, id, body);
  }

  @Post('meetings/:id/cancel')
  @HttpCode(204)
  cancel(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.cancel(me, id);
  }

  @Post('meetings/:id/respond')
  @HttpCode(200)
  respond(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(respondSchema)) body: RespondInput) {
    return this.meetings.respond(me, id, body.response);
  }

  @Post('meetings/:id/join')
  @HttpCode(200)
  join(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.join(me, id);
  }

  @Get('meetings/:id/attendance')
  attendance(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.attendance(me, id);
  }

  @Get('meetings/:id/ics')
  async ics(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const body = await this.meetings.ics(me, id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="meeting.ics"');
    res.send(body);
  }

  /* ---- recordings ---- */

  @Get('meetings/:id/recordings')
  recordings(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.recordings(me, id);
  }

  @Post('meetings/:id/recording/start')
  async startRecording(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const r = await this.meetings.startRecording(me, id);
    await this.audit.record({ actorId: me.id, action: 'meeting.recording_started', entityType: 'meeting', entityId: id, ip: req.ip ?? null });
    return r;
  }

  @Post('meetings/:id/recording/stop')
  @HttpCode(204)
  stopRecording(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.stopRecording(me, id);
  }

  @Get('recordings/:id/download')
  download(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.downloadRecording(me, id);
  }

  /* ---- instant & room calls ---- */

  @Post('calls')
  @HttpCode(200)
  startCall(@CurrentUser() me: User, @Body(new ZodPipe(startCallSchema)) body: StartCallInput) {
    return this.meetings.startCall(me, body.userIds);
  }

  @Post('calls/:id/decline')
  @HttpCode(204)
  decline(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.declineCall(me, id);
  }

  @Post('calls/:id/cancel')
  @HttpCode(204)
  cancelCall(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.cancelCall(me, id);
  }

  @Post('rooms/:id/call')
  @HttpCode(200)
  roomCall(@CurrentUser() me: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.roomCall(me, id);
  }

  /* ---- calendar subscription ---- */

  @Get('me/calendar-feed')
  feed(@CurrentUser() me: User) {
    return this.meetings.getFeed(me);
  }

  @Post('me/calendar-feed')
  @HttpCode(200)
  resetFeed(@CurrentUser() me: User) {
    return this.meetings.resetFeed(me);
  }

  @Public()
  @Get('calendar/feed/:file')
  async feedFile(@Param('file') file: string, @Res() res: Response) {
    const token = file.replace(/\.ics$/, '');
    const body = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? await this.meetings.feed(token) : null;
    if (!body) throw new NotFoundException('This calendar link doesn’t work any more.');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(body);
  }

  /* ---- admin ---- */

  @Get('admin/meeting-settings')
  @RequirePermissions('settings.manage')
  settings() {
    return this.meetings.getSettings();
  }

  @Patch('admin/meeting-settings')
  @RequirePermissions('settings.manage')
  async updateSettings(@CurrentUser() me: User, @Body(new ZodPipe(meetingSettingsSchema)) body: MeetingSettingsInput, @Req() req: Request) {
    const r = await this.meetings.updateSettings(body.recordingEnabled);
    await this.audit.record({ actorId: me.id, action: 'settings.meetings_updated', entityType: 'settings', entityId: null, ip: req.ip ?? null, after: body });
    return r;
  }

  /* ---- LiveKit ---- */

  /** LiveKit calls this when people join or leave and when recordings change. Signed with the API secret. */
  @Public()
  @SkipThrottle()
  @Post('livekit/webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request, @Headers('authorization') auth: string | undefined) {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    await this.meetings.webhook(body, auth);
    return { ok: true };
  }
}
