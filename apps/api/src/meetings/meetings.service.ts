import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  AttendanceRowDto,
  buildIcs,
  CalendarFeedDto,
  currentOccurrence,
  expandOccurrences,
  IcsEvent,
  JOIN_EARLY_MINUTES,
  JOIN_LATE_MINUTES,
  JoinDto,
  MeetingDto,
  MeetingRange,
  MeetingSettingsDto,
  OccurrenceDto,
  RecordingDto,
  REMINDER_MINUTES,
  RING_SECONDS,
  Rsvp,
  ScheduleMeetingInput,
} from '@vo/shared';
import { and, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { WebhookEvent } from 'livekit-server-sdk';
import { createHash, randomBytes } from 'node:crypto';
import { decrypt, encrypt } from '../common/crypto';
import { env } from '../config/env';
import { DB, Db } from '../db/client';
import {
  calendarFeeds,
  Meeting,
  meetingAttendance,
  meetingInvitees,
  meetingNotifications,
  meetingRecordings,
  meetings,
  orgSettings,
  User,
  users,
} from '../db/schema';
import { actionEmail, MailService } from '../mail/mail.service';
import { PresenceService } from '../presence/presence.service';
import { RoomsService } from '../presence/rooms.service';
import { SettingsService } from '../settings/settings.service';
import { LiveKitService } from './livekit.service';
import { presignGet, storageConfigured } from './storage';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const MIN = 60_000;

interface Ring {
  callerId: string;
  callerName: string;
  pending: Set<string>;
  timer: NodeJS.Timeout;
}

type Invitee = { userId: string; fullName: string; email: string; response: Rsvp };

/**
 * Meetings: scheduled (on the calendar, with invites, repeats and reminders), instant calls started
 * from someone's card, and the ongoing call of each office meeting room. Video runs on LiveKit; its
 * webhooks feed the attendance log, the "In a meeting" status and recordings.
 */
@Injectable()
export class MeetingsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Meetings');
  /** LiveKit room name → identities in it right now (from webhooks) */
  private readonly live = new Map<string, Set<string>>();
  private readonly rings = new Map<string, Ring>();
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly livekit: LiveKitService,
    private readonly presence: PresenceService,
    private readonly rooms: RoomsService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  onApplicationBootstrap() {
    if (env().NODE_ENV === 'test') return; // tests call runReminders() directly
    this.timer = setInterval(() => void this.runReminders().catch((e) => this.log.error(`Reminders failed: ${e}`)), MIN);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    for (const r of this.rings.values()) clearTimeout(r.timer);
  }

  /* ================================================================ */
  /* Reading                                                           */
  /* ================================================================ */

  private async load(id: string): Promise<Meeting> {
    const [m] = await this.db.select().from(meetings).where(eq(meetings.id, id));
    if (!m) throw new NotFoundException('Meeting not found');
    return m;
  }

  private async invitees(meetingIds: string[]): Promise<Map<string, Invitee[]>> {
    const out = new Map<string, Invitee[]>();
    if (!meetingIds.length) return out;
    const rows = await this.db
      .select({ meetingId: meetingInvitees.meetingId, userId: users.id, fullName: users.fullName, email: users.email, response: meetingInvitees.response })
      .from(meetingInvitees)
      .innerJoin(users, eq(users.id, meetingInvitees.userId))
      .where(inArray(meetingInvitees.meetingId, meetingIds))
      .orderBy(users.fullName);
    for (const r of rows) out.set(r.meetingId, [...(out.get(r.meetingId) ?? []), { userId: r.userId, fullName: r.fullName, email: r.email, response: r.response }]);
    return out;
  }

  private async userById(id: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, id));
    return u;
  }

  /** Host, invitees and admins can see a meeting; for a room call, anyone standing in that room. */
  private canSee(m: Meeting, user: User, inv: Invitee[]): boolean {
    if (user.role === 'ADMIN' || m.hostId === user.id || inv.some((i) => i.userId === user.id)) return true;
    return m.kind === 'ROOM' && !!m.officeRoomId && this.presence.roomOf(user.id) === m.officeRoomId;
  }

  private liveCount(meetingId: string): number {
    let n = 0;
    for (const [room, ids] of this.live) if (room.startsWith(`m_${meetingId}_`)) n += ids.size;
    return n;
  }

  private async dto(m: Meeting, user: User, inv?: Invitee[]): Promise<MeetingDto> {
    const list = inv ?? (await this.invitees([m.id])).get(m.id) ?? [];
    const host = await this.userById(m.hostId);
    return {
      id: m.id,
      kind: m.kind,
      title: m.title,
      description: m.description,
      hostId: m.hostId,
      hostName: host?.fullName ?? 'Someone',
      startsAt: m.startsAt.toISOString(),
      durationMinutes: m.durationMinutes,
      timezone: m.timezone,
      recurrence: m.recurrence,
      recurrenceUntil: m.recurrenceUntil,
      officeRoomId: m.officeRoomId,
      status: m.status,
      invitees: list.map((i) => ({ userId: i.userId, fullName: i.fullName, response: i.response })),
      myResponse: list.find((i) => i.userId === user.id)?.response ?? null,
      canEdit: m.kind === 'SCHEDULED' && m.status === 'ACTIVE' && (m.hostId === user.id || user.role === 'ADMIN'),
      liveCount: this.liveCount(m.id),
    };
  }

  async get(user: User, id: string): Promise<MeetingDto> {
    const m = await this.load(id);
    const inv = (await this.invitees([id])).get(id) ?? [];
    if (!this.canSee(m, user, inv)) throw new NotFoundException('Meeting not found');
    return this.dto(m, user, inv);
  }

  /** Your calendar: scheduled meetings you host or were invited to, one entry per occurrence. */
  async list(user: User, range: MeetingRange): Promise<OccurrenceDto[]> {
    const from = new Date(range.from);
    const to = new Date(range.to);
    const fromDate = from.toISOString().slice(0, 10);
    const mine = this.db.select({ id: meetingInvitees.meetingId }).from(meetingInvitees).where(eq(meetingInvitees.userId, user.id));
    const rows = await this.db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.kind, 'SCHEDULED'),
          eq(meetings.status, 'ACTIVE'),
          or(eq(meetings.hostId, user.id), inArray(meetings.id, mine)),
          lt(meetings.startsAt, to),
          or(ne(meetings.recurrence, 'NONE'), gte(sql`${meetings.startsAt} + ${meetings.durationMinutes} * interval '1 minute'`, from)),
          or(isNull(meetings.recurrenceUntil), gte(meetings.recurrenceUntil, sql`${fromDate}::date - 1`)),
        ),
      );
    const inv = await this.invitees(rows.map((r) => r.id));
    const hosts = new Map((await this.db.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.hostId)), user.id]))).map((u) => [u.id, u.name]));
    const out: OccurrenceDto[] = [];
    for (const m of rows) {
      const list = inv.get(m.id) ?? [];
      for (const start of expandOccurrences(m, from, to)) {
        out.push({
          meetingId: m.id,
          start: start.toISOString(),
          end: new Date(start.getTime() + m.durationMinutes * MIN).toISOString(),
          title: m.title,
          kind: m.kind,
          hostName: hosts.get(m.hostId) ?? 'Someone',
          myResponse: list.find((i) => i.userId === user.id)?.response ?? null,
          isHost: m.hostId === user.id,
          inviteeCount: list.length,
          officeRoomId: m.officeRoomId,
          recurrence: m.recurrence,
          liveCount: this.live.get(this.livekit.roomName(m.id, start))?.size ?? 0,
        });
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }

  /* ================================================================ */
  /* Scheduling                                                        */
  /* ================================================================ */

  private async checkPeople(ids: string[], hostId: string): Promise<string[]> {
    const unique = [...new Set(ids)].filter((i) => i !== hostId);
    if (!unique.length) return [];
    const found = await this.db.select({ id: users.id }).from(users).where(and(inArray(users.id, unique), eq(users.status, 'ACTIVE')));
    if (found.length !== unique.length) {
      throw new BadRequestException({ message: 'Invite active people only', errors: { inviteeIds: ['Someone on the list is not an active user'] } });
    }
    return unique;
  }

  private async checkOfficeRoom(id: string | null) {
    if (id && !(await this.rooms.get(id))) throw new BadRequestException({ message: 'That office room no longer exists', errors: { officeRoomId: ['Not found'] } });
  }

  /**
   * A repeating meeting starts on its first real occurrence (a weekday meeting set for a Saturday starts
   * on Monday). Calendar apps treat the start as an occurrence even when the repeat rule skips that day.
   */
  private firstStart(input: ScheduleMeetingInput): Date {
    const start = new Date(input.startsAt);
    if (input.recurrence === 'NONE') return start;
    const [first] = expandOccurrences(
      { startsAt: start, durationMinutes: input.durationMinutes, timezone: input.timezone, recurrence: input.recurrence, recurrenceUntil: input.recurrenceUntil },
      start,
      new Date(start.getTime() + 8 * 86_400_000),
      1,
    );
    if (!first) throw new BadRequestException({ message: 'That repeat has no meetings before its last date', errors: { recurrenceUntil: ['No meetings fall on or before this date'] } });
    return first;
  }

  async create(host: User, input: ScheduleMeetingInput): Promise<MeetingDto> {
    input = { ...input, startsAt: this.firstStart(input).toISOString() };
    const invitees = await this.checkPeople(input.inviteeIds, host.id);
    await this.checkOfficeRoom(input.officeRoomId);
    const [m] = await this.db
      .insert(meetings)
      .values({
        kind: 'SCHEDULED',
        title: input.title,
        description: input.description,
        hostId: host.id,
        startsAt: new Date(input.startsAt),
        durationMinutes: input.durationMinutes,
        timezone: input.timezone,
        recurrence: input.recurrence,
        recurrenceUntil: input.recurrence === 'NONE' ? null : input.recurrenceUntil,
        officeRoomId: input.officeRoomId,
      })
      .returning();
    if (invitees.length) await this.db.insert(meetingInvitees).values(invitees.map((userId) => ({ meetingId: m.id, userId })));
    const inv = (await this.invitees([m.id])).get(m.id) ?? [];
    await this.emailInvites(m, host, inv, 'new');
    this.changed(m, inv);
    return this.dto(m, host, inv);
  }

  async update(user: User, id: string, input: ScheduleMeetingInput): Promise<MeetingDto> {
    const before = await this.load(id);
    if (before.kind !== 'SCHEDULED' || before.status !== 'ACTIVE') throw new ConflictException('This meeting can’t be changed any more.');
    if (before.hostId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException('Only the host can change this meeting.');
    input = { ...input, startsAt: this.firstStart(input).toISOString() };
    const host = (await this.userById(before.hostId))!;
    const invitees = await this.checkPeople(input.inviteeIds, before.hostId);
    await this.checkOfficeRoom(input.officeRoomId);
    const oldInv = (await this.invitees([id])).get(id) ?? [];
    const timeChanged =
      before.startsAt.getTime() !== new Date(input.startsAt).getTime() ||
      before.durationMinutes !== input.durationMinutes ||
      before.timezone !== input.timezone ||
      before.recurrence !== input.recurrence ||
      before.recurrenceUntil !== (input.recurrence === 'NONE' ? null : input.recurrenceUntil);

    const [m] = await this.db.transaction(async (tx) => {
      const keep = oldInv.filter((i) => invitees.includes(i.userId)).map((i) => i.userId);
      const removed = oldInv.filter((i) => !invitees.includes(i.userId)).map((i) => i.userId);
      const added = invitees.filter((u) => !oldInv.some((i) => i.userId === u));
      if (removed.length) await tx.delete(meetingInvitees).where(and(eq(meetingInvitees.meetingId, id), inArray(meetingInvitees.userId, removed)));
      if (added.length) await tx.insert(meetingInvitees).values(added.map((userId) => ({ meetingId: id, userId })));
      // a new time needs everyone to reply again
      if (timeChanged && keep.length) {
        await tx.update(meetingInvitees).set({ response: 'PENDING', respondedAt: null }).where(and(eq(meetingInvitees.meetingId, id), inArray(meetingInvitees.userId, keep)));
      }
      return tx
        .update(meetings)
        .set({
          title: input.title,
          description: input.description,
          startsAt: new Date(input.startsAt),
          durationMinutes: input.durationMinutes,
          timezone: input.timezone,
          recurrence: input.recurrence,
          recurrenceUntil: input.recurrence === 'NONE' ? null : input.recurrenceUntil,
          officeRoomId: input.officeRoomId,
          sequence: sql`${meetings.sequence} + 1`,
        })
        .where(eq(meetings.id, id))
        .returning();
    });
    const inv = (await this.invitees([id])).get(id) ?? [];
    const gone = oldInv.filter((i) => !invitees.includes(i.userId));
    await this.emailInvites(m, host, inv, 'updated');
    if (gone.length) await this.emailCancel(m, host, gone, inv);
    this.changed(m, [...inv, ...gone]);
    return this.dto(m, user, inv);
  }

  async cancel(user: User, id: string): Promise<void> {
    const m0 = await this.load(id);
    if (m0.kind !== 'SCHEDULED') throw new ConflictException('Only scheduled meetings can be cancelled.');
    if (m0.status !== 'ACTIVE') return;
    if (m0.hostId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException('Only the host can cancel this meeting.');
    const [m] = await this.db
      .update(meetings)
      .set({ status: 'CANCELLED', sequence: sql`${meetings.sequence} + 1` })
      .where(eq(meetings.id, id))
      .returning();
    const inv = (await this.invitees([id])).get(id) ?? [];
    const host = (await this.userById(m.hostId))!;
    await this.emailCancel(m, host, inv, inv);
    this.changed(m, inv);
  }

  async respond(user: User, id: string, response: Rsvp): Promise<MeetingDto> {
    const m = await this.load(id);
    const rows = await this.db
      .update(meetingInvitees)
      .set({ response, respondedAt: new Date() })
      .where(and(eq(meetingInvitees.meetingId, id), eq(meetingInvitees.userId, user.id)))
      .returning();
    if (!rows.length) throw new ForbiddenException('You’re not invited to this meeting.');
    this.presence.notify(m.hostId, 'meetings:changed', { meetingId: id });
    return this.get(user, id);
  }

  private changed(m: Meeting, inv: { userId: string }[]) {
    for (const id of new Set([m.hostId, ...inv.map((i) => i.userId)])) this.presence.notify(id, 'meetings:changed', { meetingId: m.id });
  }

  /* ================================================================ */
  /* Joining                                                           */
  /* ================================================================ */

  private async isRecording(meetingId: string, occurrenceStart: Date) {
    const [r] = await this.db
      .select({ id: meetingRecordings.id })
      .from(meetingRecordings)
      .where(and(eq(meetingRecordings.meetingId, meetingId), eq(meetingRecordings.occurrenceStart, occurrenceStart), inArray(meetingRecordings.status, ['STARTING', 'RECORDING'])));
    return !!r;
  }

  private async canRecord(m: Meeting, user: User) {
    const s = await this.settings.get();
    return s.recordingEnabled && storageConfigured() && this.livekit.configured() && (m.hostId === user.id || user.role === 'ADMIN');
  }

  private occurrenceFor(m: Meeting, now = new Date()): Date {
    if (m.kind !== 'SCHEDULED') return m.startsAt;
    const occ = currentOccurrence(m, now, JOIN_EARLY_MINUTES * MIN, JOIN_LATE_MINUTES * MIN);
    if (!occ) {
      throw new ConflictException({
        message: `This meeting isn’t on right now. You can join from ${JOIN_EARLY_MINUTES} minutes before it starts.`,
        code: 'NOT_STARTED',
      });
    }
    return occ;
  }

  async join(user: User, id: string, now = new Date()): Promise<JoinDto> {
    const m = await this.load(id);
    const inv = (await this.invitees([id])).get(id) ?? [];
    if (!this.canSee(m, user, inv)) throw new NotFoundException('Meeting not found');
    if (m.status === 'CANCELLED') throw new ConflictException({ message: 'This meeting was cancelled.', code: 'CANCELLED' });
    if (m.status === 'ENDED') throw new ConflictException({ message: 'This call has ended.', code: 'ENDED' });
    const occ = this.occurrenceFor(m, now);
    const isHost = m.hostId === user.id || user.role === 'ADMIN';
    const token = await this.livekit.token({ identity: user.id, name: user.fullName, room: this.livekit.roomName(m.id, occ), isHost });

    // answering a call stops it ringing on your other tabs
    const ring = this.rings.get(m.id);
    if (ring?.pending.delete(user.id)) {
      this.presence.notify(user.id, 'call:ended', { meetingId: m.id, reason: 'answered' });
      if (!ring.pending.size) this.stopRing(m.id);
    }

    return {
      url: this.livekit.clientUrl(),
      token,
      meetingId: m.id,
      occurrenceStart: occ.toISOString(),
      title: m.title,
      kind: m.kind,
      isHost,
      canRecord: await this.canRecord(m, user),
      recording: await this.isRecording(m.id, occ),
    };
  }

  /* ================================================================ */
  /* Instant calls                                                     */
  /* ================================================================ */

  async startCall(caller: User, userIds: string[]): Promise<JoinDto> {
    this.livekit.assertConfigured();
    const callees = await this.checkPeople(userIds, caller.id);
    if (!callees.length) throw new BadRequestException('Pick someone other than yourself to call.');
    const people = await this.db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, callees));
    const online = people.filter((p) => this.presence.isOnline(p.id));
    if (!online.length) {
      throw new ConflictException({ message: `${people.map((p) => p.fullName).join(', ')} ${people.length === 1 ? 'is' : 'are'} offline right now.`, code: 'OFFLINE' });
    }
    const title = people.length === 1 ? `${caller.fullName} and ${people[0].fullName}` : `Call with ${[caller, ...people].map((p) => p.fullName.split(' ')[0]).join(', ')}`;
    const [m] = await this.db
      .insert(meetings)
      .values({ kind: 'INSTANT', title, hostId: caller.id, startsAt: new Date(), durationMinutes: 60, timezone: caller.timezone })
      .returning();
    await this.db.insert(meetingInvitees).values(callees.map((userId) => ({ meetingId: m.id, userId, response: 'PENDING' as const })));

    const ring: Ring = {
      callerId: caller.id,
      callerName: caller.fullName,
      pending: new Set(online.map((p) => p.id)),
      timer: setTimeout(() => this.ringTimeout(m.id), RING_SECONDS * 1000),
    };
    ring.timer.unref?.();
    this.rings.set(m.id, ring);
    for (const p of online) {
      this.presence.notify(p.id, 'call:incoming', { meetingId: m.id, fromId: caller.id, fromName: caller.fullName, title, startedAt: m.startsAt.toISOString() });
    }
    return this.join(caller, m.id);
  }

  private stopRing(meetingId: string) {
    const r = this.rings.get(meetingId);
    if (!r) return;
    clearTimeout(r.timer);
    this.rings.delete(meetingId);
  }

  private ringTimeout(meetingId: string) {
    const r = this.rings.get(meetingId);
    if (!r) return;
    for (const id of r.pending) this.presence.notify(id, 'call:ended', { meetingId, reason: 'timeout' });
    if (r.pending.size) this.presence.notify(r.callerId, 'call:ended', { meetingId, reason: 'timeout' });
    this.stopRing(meetingId);
  }

  async declineCall(user: User, id: string) {
    const m = await this.load(id);
    if (m.kind !== 'INSTANT') throw new ConflictException('That isn’t a call.');
    const rows = await this.db
      .update(meetingInvitees)
      .set({ response: 'DECLINED', respondedAt: new Date() })
      .where(and(eq(meetingInvitees.meetingId, id), eq(meetingInvitees.userId, user.id)))
      .returning();
    if (!rows.length) throw new ForbiddenException('You weren’t called.');
    const r = this.rings.get(id);
    r?.pending.delete(user.id);
    this.presence.notify(user.id, 'call:ended', { meetingId: id, reason: 'declined' });
    this.presence.notify(m.hostId, 'call:ended', { meetingId: id, reason: 'declined', byName: user.fullName });
    if (r && !r.pending.size) this.stopRing(id);
  }

  /** The caller hung up before anyone answered. */
  async cancelCall(user: User, id: string) {
    const m = await this.load(id);
    if (m.kind !== 'INSTANT' || m.hostId !== user.id) throw new ForbiddenException('Only the caller can cancel the call.');
    const r = this.rings.get(id);
    for (const pid of r?.pending ?? []) this.presence.notify(pid, 'call:ended', { meetingId: id, reason: 'cancelled', byName: user.fullName });
    this.stopRing(id);
    if (this.liveCount(id) <= 1) await this.db.update(meetings).set({ status: 'ENDED', endedAt: new Date() }).where(eq(meetings.id, id));
  }

  /* ================================================================ */
  /* Office room calls                                                 */
  /* ================================================================ */

  async roomCall(user: User, officeRoomId: string): Promise<JoinDto> {
    const room = await this.rooms.get(officeRoomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.kind === 'OPEN' || room.kind === 'BREAK') throw new BadRequestException(`${room.name} doesn’t have a video call.`);
    if (this.presence.roomOf(user.id) !== officeRoomId) {
      throw new ForbiddenException({ message: `Walk into ${room.name} on the office floor first.`, code: 'NOT_IN_ROOM' });
    }
    let [m] = await this.db.select().from(meetings).where(and(eq(meetings.kind, 'ROOM'), eq(meetings.officeRoomId, officeRoomId)));
    if (!m) {
      [m] = await this.db
        .insert(meetings)
        .values({ kind: 'ROOM', title: `${room.name} call`, hostId: room.ownerId ?? user.id, startsAt: new Date(0), durationMinutes: 0, timezone: 'UTC', officeRoomId })
        .onConflictDoNothing()
        .returning();
      m ??= (await this.db.select().from(meetings).where(and(eq(meetings.kind, 'ROOM'), eq(meetings.officeRoomId, officeRoomId))))[0];
    }
    if (m.title !== `${room.name} call` || (room.ownerId && m.hostId !== room.ownerId)) {
      [m] = await this.db.update(meetings).set({ title: `${room.name} call`, hostId: room.ownerId ?? m.hostId }).where(eq(meetings.id, m.id)).returning();
    }
    return this.join(user, m.id);
  }

  /* ================================================================ */
  /* LiveKit webhooks: attendance, presence, recordings                */
  /* ================================================================ */

  async webhook(body: string, authorization: string | undefined) {
    let event: WebhookEvent;
    try {
      event = await this.livekit.receive(body, authorization);
    } catch {
      throw new HttpException({ message: 'Invalid signature', code: 'BAD_SIGNATURE' }, HttpStatus.UNAUTHORIZED);
    }
    await this.handleEvent(event);
  }

  async handleEvent(event: WebhookEvent) {
    const roomName = event.room?.name ?? event.egressInfo?.roomName ?? '';
    const parsed = this.livekit.parseRoomName(roomName);
    const now = new Date();
    switch (event.event) {
      case 'participant_joined': {
        const p = event.participant;
        if (!parsed || !p?.identity || !p.sid) return;
        const ids = this.live.get(roomName) ?? new Set<string>();
        ids.add(p.identity);
        this.live.set(roomName, ids);
        const joinedAt = p.joinedAt ? new Date(Number(p.joinedAt) * 1000) : now;
        const inserted = await this.db
          .insert(meetingAttendance)
          .values({ meetingId: parsed.meetingId, occurrenceStart: parsed.occurrenceStart, userId: p.identity, participantSid: p.sid, joinedAt })
          .onConflictDoNothing()
          .returning({ id: meetingAttendance.id })
          .catch((e) => {
            this.log.warn(`attendance insert failed: ${e}`);
            return [];
          });
        if (inserted.length) await this.presence.callPresence(p.identity, 1);
        const ring = this.rings.get(parsed.meetingId);
        if (ring?.pending.delete(p.identity)) {
          this.presence.notify(p.identity, 'call:ended', { meetingId: parsed.meetingId, reason: 'answered' });
          if (!ring.pending.size) this.stopRing(parsed.meetingId);
        }
        return;
      }
      case 'participant_left': {
        const p = event.participant;
        if (!parsed || !p?.identity || !p.sid) return;
        this.live.get(roomName)?.delete(p.identity);
        const closed = await this.db
          .update(meetingAttendance)
          .set({ leftAt: now })
          .where(and(eq(meetingAttendance.participantSid, p.sid), isNull(meetingAttendance.leftAt)))
          .returning({ id: meetingAttendance.id });
        if (closed.length) await this.presence.callPresence(p.identity, -1);
        return;
      }
      case 'room_finished': {
        if (!parsed) return;
        const left = this.live.get(roomName);
        this.live.delete(roomName);
        const closed = await this.db
          .update(meetingAttendance)
          .set({ leftAt: now })
          .where(and(eq(meetingAttendance.meetingId, parsed.meetingId), eq(meetingAttendance.occurrenceStart, parsed.occurrenceStart), isNull(meetingAttendance.leftAt)))
          .returning({ userId: meetingAttendance.userId });
        for (const c of closed) await this.presence.callPresence(c.userId, -1);
        void left;
        await this.db
          .update(meetings)
          .set({ status: 'ENDED', endedAt: now })
          .where(and(eq(meetings.id, parsed.meetingId), eq(meetings.kind, 'INSTANT'), eq(meetings.status, 'ACTIVE')));
        this.stopRing(parsed.meetingId);
        return;
      }
      case 'egress_started':
      case 'egress_updated':
      case 'egress_ended': {
        const info = event.egressInfo;
        if (!info?.egressId) return;
        // EgressStatus: 0 STARTING, 1 ACTIVE, 2 ENDING, 3 COMPLETE, 4 FAILED, 5 ABORTED, 6 LIMIT_REACHED
        const st = Number(info.status);
        const status = st === 0 ? 'STARTING' : st === 1 ? 'RECORDING' : st === 2 ? 'PROCESSING' : st === 3 ? 'READY' : 'FAILED';
        const file = info.fileResults?.[0];
        await this.db
          .update(meetingRecordings)
          .set({
            status,
            ...(st >= 2 ? { endedAt: info.endedAt && Number(info.endedAt) ? new Date(Number(info.endedAt) / 1e6) : now } : {}),
            ...(file ? { sizeBytes: Number(file.size) || null, durationSeconds: file.duration ? Math.round(Number(file.duration) / 1e9) : null } : {}),
            ...(info.error ? { error: info.error } : {}),
          })
          .where(eq(meetingRecordings.egressId, info.egressId));
        return;
      }
      default:
        return;
    }
  }

  /** Who joined, when and for how long. Host, admins and HR. */
  async attendance(user: User, id: string): Promise<AttendanceRowDto[]> {
    const m = await this.load(id);
    if (m.hostId !== user.id && user.role !== 'ADMIN' && user.role !== 'HR') throw new ForbiddenException('Only the host, HR and admins can see who attended.');
    const rows = await this.db
      .select({ a: meetingAttendance, fullName: users.fullName })
      .from(meetingAttendance)
      .innerJoin(users, eq(users.id, meetingAttendance.userId))
      .where(eq(meetingAttendance.meetingId, id))
      .orderBy(desc(meetingAttendance.occurrenceStart), meetingAttendance.joinedAt);
    const now = Date.now();
    const out = new Map<string, AttendanceRowDto>();
    for (const { a, fullName } of rows) {
      const key = `${a.occurrenceStart.toISOString()}|${a.userId}`;
      const secs = Math.max(0, Math.round(((a.leftAt?.getTime() ?? now) - a.joinedAt.getTime()) / 1000));
      const prev = out.get(key);
      if (!prev) {
        out.set(key, {
          userId: a.userId,
          fullName,
          occurrenceStart: a.occurrenceStart.toISOString(),
          firstJoinedAt: a.joinedAt.toISOString(),
          lastLeftAt: a.leftAt?.toISOString() ?? null,
          seconds: secs,
          joins: 1,
        });
      } else {
        prev.seconds += secs;
        prev.joins += 1;
        prev.lastLeftAt = a.leftAt && (!prev.lastLeftAt || a.leftAt.toISOString() > prev.lastLeftAt) ? a.leftAt.toISOString() : a.leftAt ? prev.lastLeftAt : null;
      }
    }
    return [...out.values()];
  }

  /* ================================================================ */
  /* Recordings                                                        */
  /* ================================================================ */

  async startRecording(user: User, id: string): Promise<RecordingDto> {
    const m = await this.load(id);
    if (!(await this.canRecord(m, user))) throw new ForbiddenException({ message: 'Recording isn’t available for this meeting.', code: 'RECORDING_OFF' });
    const occ = this.occurrenceFor(m);
    const room = this.livekit.roomName(m.id, occ);
    if (!this.live.get(room)?.size) throw new ConflictException({ message: 'Start the call first, then record.', code: 'NOT_LIVE' });
    if (await this.isRecording(m.id, occ)) throw new ConflictException({ message: 'This call is already being recorded.', code: 'ALREADY_RECORDING' });
    const key = `recordings/${m.id}/${occ.toISOString().replace(/[:.]/g, '-')}-${Date.now()}.mp4`;
    const egressId = await this.livekit.startRecording(room, key);
    const [r] = await this.db
      .insert(meetingRecordings)
      .values({ meetingId: m.id, occurrenceStart: occ, egressId, startedById: user.id, startedAt: new Date(), fileKey: key })
      .returning();
    return this.recordingDto(r, user.fullName);
  }

  async stopRecording(user: User, id: string): Promise<void> {
    const m = await this.load(id);
    if (m.hostId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException('Only the host can stop the recording.');
    const active = await this.db
      .select()
      .from(meetingRecordings)
      .where(and(eq(meetingRecordings.meetingId, id), inArray(meetingRecordings.status, ['STARTING', 'RECORDING'])));
    for (const r of active) {
      await this.livekit.stopRecording(r.egressId);
      await this.db.update(meetingRecordings).set({ status: 'PROCESSING' }).where(eq(meetingRecordings.id, r.id));
    }
  }

  private recordingDto(r: typeof meetingRecordings.$inferSelect, startedByName: string): RecordingDto {
    return {
      id: r.id,
      meetingId: r.meetingId,
      occurrenceStart: r.occurrenceStart.toISOString(),
      status: r.status,
      startedByName,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      sizeBytes: r.sizeBytes,
      durationSeconds: r.durationSeconds,
    };
  }

  async recordings(user: User, id: string): Promise<RecordingDto[]> {
    await this.get(user, id); // visibility check
    const rows = await this.db
      .select({ r: meetingRecordings, by: users.fullName })
      .from(meetingRecordings)
      .leftJoin(users, eq(users.id, meetingRecordings.startedById))
      .where(eq(meetingRecordings.meetingId, id))
      .orderBy(desc(meetingRecordings.startedAt));
    return rows.map(({ r, by }) => this.recordingDto(r, by ?? 'Someone'));
  }

  async downloadRecording(user: User, recordingId: string): Promise<{ url: string }> {
    const [r] = await this.db.select().from(meetingRecordings).where(eq(meetingRecordings.id, recordingId));
    if (!r) throw new NotFoundException('Recording not found');
    await this.get(user, r.meetingId);
    if (r.status !== 'READY' || !r.fileKey) throw new ConflictException('This recording isn’t ready yet.');
    if (!storageConfigured()) throw new ConflictException('Recording storage isn’t connected.');
    return { url: presignGet(r.fileKey) };
  }

  /* ================================================================ */
  /* Settings                                                          */
  /* ================================================================ */

  async getSettings(): Promise<MeetingSettingsDto> {
    const s = await this.settings.get();
    return { recordingEnabled: s.recordingEnabled, storageConfigured: storageConfigured(), videoConfigured: this.livekit.configured() };
  }

  async updateSettings(recordingEnabled: boolean): Promise<MeetingSettingsDto> {
    await this.db.update(orgSettings).set({ recordingEnabled }).where(eq(orgSettings.id, 1));
    this.settings.invalidate();
    return this.getSettings();
  }

  /* ================================================================ */
  /* Reminders                                                         */
  /* ================================================================ */

  /** Once a minute: remind people about meetings starting in REMINDER_MINUTES. Each reminder is sent once. */
  async runReminders(now = new Date()): Promise<number> {
    const windowStart = new Date(now.getTime() + (REMINDER_MINUTES - 1) * MIN);
    const windowEnd = new Date(now.getTime() + (REMINDER_MINUTES + 1) * MIN);
    const today = now.toISOString().slice(0, 10);
    const rows = await this.db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.kind, 'SCHEDULED'),
          eq(meetings.status, 'ACTIVE'),
          lt(meetings.startsAt, windowEnd),
          or(ne(meetings.recurrence, 'NONE'), gte(meetings.startsAt, windowStart)),
          or(isNull(meetings.recurrenceUntil), gte(meetings.recurrenceUntil, sql`${today}::date - 1`)),
        ),
      );
    let sent = 0;
    for (const m of rows) {
      for (const start of expandOccurrences(m, windowStart, windowEnd)) {
        if (start.getTime() < windowStart.getTime() || start.getTime() >= windowEnd.getTime()) continue;
        const ins = await this.db
          .insert(meetingNotifications)
          .values({ meetingId: m.id, occurrenceStart: start, kind: 'reminder' })
          .onConflictDoNothing()
          .returning();
        if (!ins.length) continue;
        const inv = ((await this.invitees([m.id])).get(m.id) ?? []).filter((i) => i.response !== 'DECLINED');
        const host = await this.userById(m.hostId);
        const people = [...(host ? [{ userId: host.id, fullName: host.fullName, email: host.email, timezone: host.timezone }] : []), ...(await this.withZones(inv))];
        const { companyName } = await this.settings.get();
        for (const p of people) {
          this.presence.notify(p.userId, 'meeting:reminder', { meetingId: m.id, title: m.title, start: start.toISOString() });
          const when = new Intl.DateTimeFormat('en-US', { timeZone: p.timezone, hour: 'numeric', minute: '2-digit' }).format(start);
          const mail = actionEmail({
            companyName,
            greeting: `Hi ${p.fullName.split(' ')[0]},`,
            body: `“${m.title}” starts at ${when} (in ${REMINDER_MINUTES} minutes).`,
            actionLabel: 'Join the meeting',
            actionUrl: this.meetingUrl(m.id),
            footer: 'You’re getting this because you’re invited to this meeting.',
          });
          await this.mail.send({ to: p.email, subject: `Starting soon: ${m.title}`, ...mail });
        }
        sent += 1;
      }
    }
    return sent;
  }

  private async withZones(inv: Invitee[]) {
    if (!inv.length) return [];
    const zones = new Map((await this.db.select({ id: users.id, tz: users.timezone }).from(users).where(inArray(users.id, inv.map((i) => i.userId)))).map((u) => [u.id, u.tz]));
    return inv.map((i) => ({ userId: i.userId, fullName: i.fullName, email: i.email, timezone: zones.get(i.userId) ?? 'UTC' }));
  }

  /* ================================================================ */
  /* Calendar files & emails                                           */
  /* ================================================================ */

  private meetingUrl(id: string) {
    return `${env().WEB_ORIGIN}/meetings?open=${id}`;
  }

  private async icsEvent(m: Meeting, host: User, inv: Invitee[]): Promise<IcsEvent> {
    const room = m.officeRoomId ? await this.rooms.get(m.officeRoomId) : undefined;
    const { companyName } = await this.settings.get();
    return {
      uid: `${m.id}@virtual-office`,
      sequence: m.sequence,
      title: m.title,
      description: m.description,
      url: this.meetingUrl(m.id),
      startsAt: m.startsAt,
      durationMinutes: m.durationMinutes,
      timezone: m.timezone,
      recurrence: m.recurrence,
      recurrenceUntil: m.recurrenceUntil,
      organizer: { name: host.fullName, email: host.email },
      attendees: inv.map((i) => ({ name: i.fullName, email: i.email, response: i.response })),
      cancelled: m.status === 'CANCELLED',
      location: room ? `${room.name}, ${companyName} Virtual Office` : `${companyName} Virtual Office`,
      updatedAt: m.updatedAt,
    };
  }

  async ics(user: User, id: string): Promise<string> {
    const m = await this.load(id);
    const inv = (await this.invitees([id])).get(id) ?? [];
    if (!this.canSee(m, user, inv)) throw new NotFoundException('Meeting not found');
    const host = (await this.userById(m.hostId))!;
    return buildIcs([await this.icsEvent(m, host, inv)], 'PUBLISH');
  }

  private when(m: Meeting, tz: string) {
    const start = m.startsAt;
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    return fmt.format(start);
  }

  private async emailInvites(m: Meeting, host: User, inv: Invitee[], kind: 'new' | 'updated') {
    if (!inv.length) return;
    const ics = buildIcs([await this.icsEvent(m, host, inv)], 'REQUEST');
    const { companyName } = await this.settings.get();
    const zones = new Map((await this.withZones(inv)).map((p) => [p.userId, p.timezone]));
    for (const i of inv) {
      const mail = actionEmail({
        companyName,
        greeting: `Hi ${i.fullName.split(' ')[0]},`,
        body:
          kind === 'new'
            ? `${host.fullName} invited you to “${m.title}” on ${this.when(m, zones.get(i.userId) ?? m.timezone)}.${m.description ? `\n\n${m.description}` : ''}`
            : `${host.fullName} changed “${m.title}”. It’s now on ${this.when(m, zones.get(i.userId) ?? m.timezone)}.`,
        actionLabel: 'Open the meeting',
        actionUrl: this.meetingUrl(m.id),
        footer: 'The attached calendar file adds it to Google Calendar or Outlook.',
      });
      await this.mail.send({
        to: i.email,
        subject: kind === 'new' ? `Invitation: ${m.title}` : `Updated: ${m.title}`,
        ...mail,
        attachments: [{ filename: 'invite.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=REQUEST' }],
        icalEvent: { method: 'REQUEST', content: ics },
      });
    }
  }

  private async emailCancel(m: Meeting, host: User, to: Invitee[], everyone: Invitee[]) {
    if (!to.length) return;
    const ics = buildIcs([{ ...(await this.icsEvent(m, host, everyone)), cancelled: true }], 'CANCEL');
    const { companyName } = await this.settings.get();
    for (const i of to) {
      const mail = actionEmail({
        companyName,
        greeting: `Hi ${i.fullName.split(' ')[0]},`,
        body: m.status === 'CANCELLED' ? `${host.fullName} cancelled “${m.title}”.` : `You’re no longer invited to “${m.title}”.`,
        actionLabel: 'Open your calendar',
        actionUrl: `${env().WEB_ORIGIN}/meetings`,
        footer: 'The attached calendar file removes it from Google Calendar or Outlook.',
      });
      await this.mail.send({
        to: i.email,
        subject: `Cancelled: ${m.title}`,
        ...mail,
        attachments: [{ filename: 'cancel.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=CANCEL' }],
        icalEvent: { method: 'CANCEL', content: ics },
      });
    }
  }

  /* ================================================================ */
  /* Calendar subscription (Google Calendar / Outlook)                 */
  /* ================================================================ */

  private feedUrl(token: string) {
    return `${env().WEB_ORIGIN}/api/calendar/feed/${token}.ics`;
  }

  async getFeed(user: User): Promise<CalendarFeedDto | null> {
    const [f] = await this.db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, user.id));
    return f ? { url: this.feedUrl(decrypt(f.tokenEnc)), createdAt: f.createdAt.toISOString() } : null;
  }

  /** Creates (or replaces) your private calendar link. The old link stops working. */
  async resetFeed(user: User): Promise<CalendarFeedDto> {
    const token = randomBytes(24).toString('base64url');
    const values = { userId: user.id, tokenHash: sha256(token), tokenEnc: encrypt(token), createdAt: new Date() };
    await this.db.insert(calendarFeeds).values(values).onConflictDoUpdate({ target: calendarFeeds.userId, set: values });
    return { url: this.feedUrl(token), createdAt: values.createdAt.toISOString() };
  }

  /** The .ics feed behind a private link: your scheduled meetings from 30 days ago onward. */
  async feed(token: string): Promise<string | null> {
    const [f] = await this.db.select().from(calendarFeeds).where(eq(calendarFeeds.tokenHash, sha256(token)));
    if (!f) return null;
    const [user] = await this.db.select().from(users).where(and(eq(users.id, f.userId), eq(users.status, 'ACTIVE')));
    if (!user) return null;
    const mine = this.db.select({ id: meetingInvitees.meetingId }).from(meetingInvitees).where(eq(meetingInvitees.userId, user.id));
    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await this.db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.kind, 'SCHEDULED'),
          or(eq(meetings.hostId, user.id), inArray(meetings.id, mine)),
          or(ne(meetings.recurrence, 'NONE'), gte(meetings.startsAt, since)),
        ),
      );
    const inv = await this.invitees(rows.map((r) => r.id));
    const hosts = new Map((await this.db.select().from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.hostId)), user.id]))).map((u) => [u.id, u]));
    const events: IcsEvent[] = [];
    for (const m of rows) {
      const list = inv.get(m.id) ?? [];
      if (list.find((i) => i.userId === user.id)?.response === 'DECLINED') continue;
      events.push(await this.icsEvent(m, hosts.get(m.hostId)!, list));
    }
    const { companyName } = await this.settings.get();
    return buildIcs(events, 'PUBLISH', `${companyName} meetings`);
  }
}
