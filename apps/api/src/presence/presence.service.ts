import { HttpStatus, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  assignSeats,
  deriveStatus,
  FloorSnapshotDto,
  KnockDto,
  ManualStatus,
  MeetingDto,
  PresencePersonDto,
  RoomDto,
  roomAccess,
  ServerEvents,
  SummonDto,
} from '@vo/shared';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { ClockService } from '../attendance/clock.service';
import { sessionState } from '../auth/session-policy';
import { DomainEvents } from '../common/domain-events';
import { DB, Db } from '../db/client';
import { departments, presence, sessions, User, users } from '../db/schema';
import { SettingsService } from '../settings/settings.service';
import { RoomsService } from './rooms.service';

/** A friendly, user-facing refusal. The gateway turns it into `{ ok: false, message, code }`. */
export class PresenceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = HttpStatus.CONFLICT,
  ) {
    super(message);
  }
}

/** How the presence service reaches connected browsers (implemented by the gateway). */
export interface PresenceOutbox {
  toAll<E extends keyof ServerEvents>(event: E, data: ServerEvents[E]): void;
  toUser<E extends keyof ServerEvents>(userId: string, event: E, data: ServerEvents[E]): void;
  disconnect(socketIds: string[], reason: ServerEvents['session:ended']): void;
}

interface Conn {
  sessionId: string;
  idle: boolean;
}

interface Person {
  userId: string;
  fullName: string;
  title: string | null;
  departmentId: string | null;
  departmentName: string | null;
  timezone: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  roomId: string | null;
  enteredAt: Date | null;
  manual: ManualStatus | null;
  message: string | null;
  lastSeenAt: Date | null;
  onClockBreak: boolean;
  /** where to go back to when the break ends */
  breakReturnRoomId: string | null;
  conns: Map<string, Conn>;
}

interface Knock extends KnockDto {
  expiresAt: number;
}

interface Summon extends SummonDto {
  userId: string;
  expiresAt: number;
}

interface Meeting {
  roomId: string;
  hostId: string;
  startedAt: Date;
  /** summoned and not answered yet */
  pending: Set<string>;
  /** where each person who came to the meeting was before */
  returnTo: Map<string, string | null>;
}

const KNOCK_TTL_MS = 60_000;
const SUMMON_TTL_MS = 10 * 60_000;
const SWEEP_MS = 60_000;

/**
 * Live presence for the office floor. Who is connected, idle state, knocks and summons live in
 * memory (one API instance); the room each person is in and the status they chose are saved to
 * the `presence` table so they survive restarts. Scaling to several instances needs a shared
 * store (e.g. the Socket.IO Redis adapter) — see docs/phase-3.md.
 */
@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Presence');
  private readonly people = new Map<string, Person>();
  private readonly socketOwner = new Map<string, string>();
  private readonly knocks = new Map<string, Knock>();
  private readonly summons = new Map<string, Summon>();
  private readonly meetings = new Map<string, Meeting>();
  private outbox: PresenceOutbox | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;
  private loaded: Promise<void> | null = null;
  private roomKindCache = new Map<string, RoomDto['kind']>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly rooms: RoomsService,
    private readonly clock: ClockService,
    private readonly settings: SettingsService,
    private readonly domain: DomainEvents,
  ) {}

  onModuleInit() {
    this.domain.on('punch', ({ userId }) => this.refreshBreak(userId));
    this.domain.on('sessionsEnded', ({ userId }) => this.checkSessions([userId]));
    this.domain.on('userChanged', ({ userId }) => this.reloadPerson(userId));
    this.rooms.onChange((all) => this.roomsChanged(all));
    this.sweepTimer = setInterval(() => void this.sweep().catch((e) => this.log.error(e)), SWEEP_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  attach(outbox: PresenceOutbox) {
    this.outbox = outbox;
  }

  /* ---------------- loading ---------------- */

  private ensureLoaded(): Promise<void> {
    this.loaded ??= this.loadAll().catch((e) => {
      this.loaded = null;
      throw e;
    });
    return this.loaded;
  }

  private async loadAll() {
    const rows = await this.db
      .select({ user: users, departmentName: departments.name, p: presence })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .leftJoin(presence, eq(presence.userId, users.id))
      .where(eq(users.status, 'ACTIVE'));
    for (const r of rows) this.people.set(r.user.id, this.toPerson(r.user, r.departmentName, r.p, this.people.get(r.user.id)));
    this.cacheKinds(await this.rooms.list());
  }

  private cacheKinds(all: RoomDto[]) {
    this.roomKindCache = new Map(all.map((r) => [r.id, r.kind]));
  }

  private toPerson(u: User, departmentName: string | null, p: typeof presence.$inferSelect | null, prev?: Person): Person {
    return {
      userId: u.id,
      fullName: u.fullName,
      title: u.title,
      departmentId: u.departmentId,
      departmentName,
      timezone: u.timezone,
      avatarUrl: u.avatarUrl,
      isAdmin: u.role === 'ADMIN',
      roomId: prev?.roomId ?? p?.roomId ?? null,
      enteredAt: prev?.enteredAt ?? p?.enteredAt ?? null,
      manual: prev?.manual ?? p?.manualStatus ?? null,
      message: prev?.message ?? p?.message ?? null,
      lastSeenAt: prev?.lastSeenAt ?? p?.lastSeenAt ?? null,
      onClockBreak: prev?.onClockBreak ?? false,
      breakReturnRoomId: prev?.breakReturnRoomId ?? null,
      conns: prev?.conns ?? new Map(),
    };
  }

  private async reloadPerson(userId: string) {
    await this.ensureLoaded();
    const [r] = await this.db
      .select({ user: users, departmentName: departments.name, p: presence })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .leftJoin(presence, eq(presence.userId, users.id))
      .where(eq(users.id, userId));
    const prev = this.people.get(userId);
    if (!r || r.user.status !== 'ACTIVE') {
      if (prev) {
        this.outbox?.disconnect([...prev.conns.keys()], { code: 'ACCOUNT_DEACTIVATED', message: 'Your account is deactivated' });
        this.people.delete(userId);
        this.forgetPerson(userId);
        this.outbox?.toAll('presence:update', { ...this.dto(prev), status: 'OFFLINE', roomId: null });
      }
      return;
    }
    const person = this.toPerson(r.user, r.departmentName, r.p, prev);
    this.people.set(userId, person);
    this.broadcast(person);
  }

  /* ---------------- connections ---------------- */

  async connect(user: User, sessionId: string, socketId: string): Promise<FloorSnapshotDto> {
    await this.ensureLoaded();
    if (!this.people.has(user.id)) await this.reloadPerson(user.id);
    const p = this.people.get(user.id);
    if (!p) throw new PresenceError('Your account is not active', 'ACCOUNT_DEACTIVATED', HttpStatus.FORBIDDEN);
    const firstConnection = p.conns.size === 0;
    p.conns.set(socketId, { sessionId, idle: false });
    this.socketOwner.set(socketId, user.id);

    if (firstConnection) {
      p.onClockBreak = await this.isOnBreak(user);
      const rooms = await this.rooms.list();
      const home = await this.homeRoom(p, rooms);
      p.roomId = home;
      p.enteredAt = new Date();
      p.lastSeenAt = new Date();
      await this.save(p);
    }
    this.broadcast(p);
    return this.snapshot(user.id);
  }

  async disconnect(socketId: string) {
    const userId = this.socketOwner.get(socketId);
    this.socketOwner.delete(socketId);
    if (!userId) return;
    const p = this.people.get(userId);
    if (!p) return;
    p.conns.delete(socketId);
    if (p.conns.size > 0) return this.broadcast(p);
    p.lastSeenAt = new Date();
    await this.save(p);
    this.forgetPerson(userId);
    this.broadcast(p);
  }

  /** Drops knocks, summons and meeting invites that involve someone who just left. */
  private forgetPerson(userId: string) {
    for (const [id, k] of this.knocks) {
      if (k.fromId === userId) this.closeKnock(id);
    }
    for (const [id, s] of this.summons) {
      if (s.userId === userId) this.summons.delete(id);
    }
    let changed = false;
    for (const m of this.meetings.values()) {
      if (m.pending.delete(userId)) changed = true;
    }
    if (changed) this.broadcastMeetings();
  }

  setIdle(socketId: string, idle: boolean) {
    const p = this.bySocket(socketId);
    const c = p.conns.get(socketId);
    if (!c || c.idle === idle) return;
    c.idle = idle;
    this.broadcast(p);
  }

  /* ---------------- rooms ---------------- */

  /** Where someone appears when they connect: the break room when on a break, their own office, their department, the open area. */
  private async homeRoom(p: Person, rooms: RoomDto[]): Promise<string | null> {
    if (p.onClockBreak) {
      const brk = rooms.find((r) => r.kind === 'BREAK' && this.hasSeat(r, p.userId));
      if (brk) return brk.id;
    }
    const candidates = [
      rooms.find((r) => r.kind === 'PRIVATE' && r.ownerId === p.userId),
      p.departmentId ? rooms.find((r) => r.kind === 'DEPARTMENT' && r.departmentId === p.departmentId) : undefined,
      ...rooms.filter((r) => r.kind === 'OPEN'),
      ...rooms.filter((r) => r.kind === 'DEPARTMENT'),
    ];
    return candidates.find((r) => r && this.hasSeat(r, p.userId))?.id ?? null;
  }

  private occupants(roomId: string, exceptUserId?: string): Person[] {
    return [...this.people.values()].filter((p) => p.roomId === roomId && p.conns.size > 0 && p.userId !== exceptUserId);
  }

  private hasSeat(room: RoomDto, userId: string) {
    return this.occupants(room.id, userId).length < room.capacity;
  }

  /** Walk into a room. `admitted` skips the access check (after a knock is answered or a summons accepted). */
  async enter(userId: string, roomId: string, admitted = false) {
    const p = this.mustBeOnline(userId);
    const room = await this.rooms.get(roomId);
    if (!room) throw new PresenceError('That room no longer exists.', 'ROOM_NOT_FOUND', HttpStatus.NOT_FOUND);
    if (p.roomId === roomId) return;
    if (!this.hasSeat(room, userId)) throw new PresenceError(`${room.name} is full right now.`, 'ROOM_FULL');
    if (!admitted) {
      const access = roomAccess({ ...room, occupantCount: this.occupants(roomId, userId).length }, userId);
      if (access === 'knock') throw new PresenceError(`Knock first — someone in ${room.name} has to let you in.`, 'KNOCK_REQUIRED', HttpStatus.FORBIDDEN);
    }
    await this.moveTo(p, room);
  }

  private async moveTo(p: Person, room: RoomDto | null) {
    const prevRoom = p.roomId;
    p.roomId = room?.id ?? null;
    p.enteredAt = new Date();
    // walking out of the break room by hand ends the "take me back" memory
    if (p.breakReturnRoomId && room?.kind !== 'BREAK') p.breakReturnRoomId = null;
    // leaving a meeting you were brought to: forget where to send you back
    for (const m of this.meetings.values()) {
      if (prevRoom === m.roomId && room?.id !== m.roomId) m.returnTo.delete(p.userId);
    }
    await this.save(p);
    this.broadcast(p);
  }

  private async roomsChanged(all: RoomDto[]) {
    await this.ensureLoaded();
    this.cacheKinds(all);
    // people in a room that disappeared go back to their home room
    for (const p of this.people.values()) {
      if (p.roomId && !all.some((r) => r.id === p.roomId)) {
        p.roomId = p.conns.size ? await this.homeRoom(p, all) : null;
        await this.save(p);
        this.broadcast(p);
      }
    }
    this.outbox?.toAll('rooms:update', all);
  }

  /* ---------------- status ---------------- */

  async setStatus(userId: string, manual: ManualStatus | null, message: string | null) {
    const p = this.mustBeOnline(userId);
    p.manual = manual;
    p.message = message;
    await this.save(p);
    this.broadcast(p);
  }

  private async isOnBreak(user: User): Promise<boolean> {
    if (!user.attendanceTracked) return false;
    try {
      const s = await this.clock.state(user);
      return s.allowed.includes('BREAK_END');
    } catch (e) {
      this.log.warn(`Could not read clock state for ${user.id}: ${e}`);
      return false;
    }
  }

  /** After any punch: follow the timesheet's break. Starting a break walks you to the break room and back. */
  private async refreshBreak(userId: string) {
    await this.ensureLoaded();
    const p = this.people.get(userId);
    if (!p) return;
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) return;
    const onBreak = await this.isOnBreak(u);
    if (onBreak === p.onClockBreak) return;
    p.onClockBreak = onBreak;
    if (p.conns.size === 0) return this.broadcast(p);
    const all = await this.rooms.list();
    const current = all.find((r) => r.id === p.roomId);
    if (onBreak && current?.kind !== 'BREAK') {
      const brk = all.find((r) => r.kind === 'BREAK' && this.hasSeat(r, userId));
      if (brk) {
        const back = p.roomId;
        await this.moveTo(p, brk);
        p.breakReturnRoomId = back;
        return;
      }
    }
    if (!onBreak && current?.kind === 'BREAK' && p.breakReturnRoomId) {
      const back = all.find((r) => r.id === p.breakReturnRoomId);
      p.breakReturnRoomId = null;
      if (back && this.hasSeat(back, userId)) return this.moveTo(p, back);
    }
    this.broadcast(p);
  }

  /* ---------------- knocks ---------------- */

  async knock(userId: string, roomId: string): Promise<KnockDto> {
    const p = this.mustBeOnline(userId);
    const room = await this.rooms.get(roomId);
    if (!room) throw new PresenceError('That room no longer exists.', 'ROOM_NOT_FOUND', HttpStatus.NOT_FOUND);
    if (p.roomId === roomId) throw new PresenceError(`You're already in ${room.name}.`, 'ALREADY_HERE');
    const inside = this.occupants(roomId, userId);
    if (roomAccess({ ...room, occupantCount: inside.length }, userId) === 'enter') {
      throw new PresenceError(`No need to knock — you can walk into ${room.name}.`, 'NO_KNOCK_NEEDED');
    }
    if (!inside.length) throw new PresenceError(`No one is in ${room.name} right now, so there's no one to let you in.`, 'NO_ONE_IN');
    if (!this.hasSeat(room, userId)) throw new PresenceError(`${room.name} is full right now.`, 'ROOM_FULL');
    for (const [id, k] of this.knocks) if (k.fromId === userId) this.closeKnock(id);

    const k: Knock = {
      id: randomUUID(),
      roomId,
      fromId: userId,
      fromName: p.fullName,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + KNOCK_TTL_MS,
    };
    this.knocks.set(k.id, k);
    const dto = this.knockDto(k);
    for (const o of inside) this.outbox?.toUser(o.userId, 'knock:incoming', dto);
    return dto;
  }

  async answerKnock(userId: string, knockId: string, accept: boolean) {
    const k = this.knocks.get(knockId);
    if (!k || k.expiresAt < Date.now()) throw new PresenceError('That knock has already been answered or timed out.', 'KNOCK_GONE', HttpStatus.GONE);
    const p = this.mustBeOnline(userId);
    if (p.roomId !== k.roomId) throw new PresenceError('Only someone inside the room can answer the door.', 'NOT_INSIDE', HttpStatus.FORBIDDEN);
    // tell the knocker first, so their browser knows why the knock closed (and doesn't walk them away from the door)
    this.outbox?.toUser(k.fromId, 'knock:answered', { id: k.id, roomId: k.roomId, accepted: accept, byName: p.fullName });
    this.closeKnock(knockId);
    if (accept) {
      try {
        await this.enter(k.fromId, k.roomId, true);
      } catch (e) {
        if (!(e instanceof PresenceError)) throw e;
      }
    }
  }

  private closeKnock(id: string) {
    const k = this.knocks.get(id);
    if (!k) return;
    this.knocks.delete(id);
    for (const o of this.occupants(k.roomId)) this.outbox?.toUser(o.userId, 'knock:closed', { id });
    this.outbox?.toUser(k.fromId, 'knock:closed', { id });
  }

  private knockDto(k: Knock): KnockDto {
    return { id: k.id, roomId: k.roomId, fromId: k.fromId, fromName: k.fromName, createdAt: k.createdAt };
  }

  /* ---------------- summons & meetings ---------------- */

  private canHost(p: Person, room: RoomDto) {
    return room.ownerId === p.userId || p.isAdmin;
  }

  async summon(hostId: string, roomId: string, userIds: string[]) {
    const host = this.mustBeOnline(hostId);
    const room = await this.rooms.get(roomId);
    if (!room) throw new PresenceError('That room no longer exists.', 'ROOM_NOT_FOUND', HttpStatus.NOT_FOUND);
    if (!this.canHost(host, room)) {
      throw new PresenceError(`Only the owner of ${room.name} can call people to it.`, 'NOT_HOST', HttpStatus.FORBIDDEN);
    }
    let meeting = this.meetings.get(roomId);
    if (!meeting) {
      meeting = { roomId, hostId, startedAt: new Date(), pending: new Set(), returnTo: new Map() };
      this.meetings.set(roomId, meeting);
    }
    if (host.roomId !== roomId) {
      meeting.returnTo.set(hostId, host.roomId);
      if (!this.hasSeat(room, hostId)) throw new PresenceError(`${room.name} is full right now.`, 'ROOM_FULL');
      await this.moveTo(host, room);
    }
    const sent: string[] = [];
    const offline: string[] = [];
    for (const id of new Set(userIds)) {
      if (id === hostId) continue;
      const p = this.people.get(id);
      if (!p || p.conns.size === 0) {
        if (p) offline.push(p.fullName);
        continue;
      }
      if (p.roomId === roomId) continue;
      for (const [sid, s] of this.summons) if (s.userId === id && s.roomId === roomId) this.summons.delete(sid);
      const s: Summon = {
        id: randomUUID(),
        roomId,
        roomName: room.name,
        hostId,
        hostName: host.fullName,
        userId: id,
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + SUMMON_TTL_MS,
      };
      this.summons.set(s.id, s);
      meeting.pending.add(id);
      sent.push(id);
      this.outbox?.toUser(id, 'summon:incoming', this.summonDto(s));
    }
    this.broadcastMeetings();
    return { sent: sent.length, offline };
  }

  async answerSummon(userId: string, summonId: string, accept: boolean) {
    const s = this.summons.get(summonId);
    if (!s || s.userId !== userId || s.expiresAt < Date.now()) {
      throw new PresenceError('That invitation is no longer open.', 'SUMMON_GONE', HttpStatus.GONE);
    }
    this.summons.delete(summonId);
    const meeting = this.meetings.get(s.roomId);
    meeting?.pending.delete(userId);
    if (accept && meeting) {
      const p = this.mustBeOnline(userId);
      const from = p.roomId;
      await this.enter(userId, s.roomId, true);
      meeting.returnTo.set(userId, from);
    }
    this.broadcastMeetings();
  }

  /** Ends a summoned meeting and sends everyone who was called back to where they were. */
  async endMeeting(userId: string, roomId: string) {
    const p = this.mustBeOnline(userId);
    const room = await this.rooms.get(roomId);
    const meeting = this.meetings.get(roomId);
    if (!room || !meeting) throw new PresenceError('There is no meeting to end here.', 'NO_MEETING', HttpStatus.NOT_FOUND);
    if (meeting.hostId !== userId && !this.canHost(p, room)) {
      throw new PresenceError('Only the host can end the meeting.', 'NOT_HOST', HttpStatus.FORBIDDEN);
    }
    this.meetings.delete(roomId);
    for (const [sid, s] of this.summons) {
      if (s.roomId === roomId) {
        this.summons.delete(sid);
        this.outbox?.toUser(s.userId, 'summon:closed', { id: sid });
      }
    }
    const all = await this.rooms.list();
    for (const [id, back] of meeting.returnTo) {
      const person = this.people.get(id);
      if (!person || person.conns.size === 0 || person.roomId !== roomId) continue;
      const target = back ? all.find((r) => r.id === back) : undefined;
      if (target && this.hasSeat(target, id)) {
        await this.moveTo(person, target);
      } else {
        const home = await this.homeRoom(person, all);
        await this.moveTo(person, all.find((r) => r.id === home) ?? null);
      }
    }
    this.broadcastMeetings();
  }

  private summonDto(s: Summon): SummonDto {
    return { id: s.id, roomId: s.roomId, roomName: s.roomName, hostId: s.hostId, hostName: s.hostName, createdAt: s.createdAt };
  }

  private meetingDtos(): MeetingDto[] {
    return [...this.meetings.values()].map((m) => ({
      roomId: m.roomId,
      hostId: m.hostId,
      pendingIds: [...m.pending],
      startedAt: m.startedAt.toISOString(),
    }));
  }

  private broadcastMeetings() {
    this.outbox?.toAll('meetings:update', this.meetingDtos());
  }

  /** Pending summons for someone who just (re)connected. */
  pendingSummonsFor(userId: string): SummonDto[] {
    return [...this.summons.values()].filter((s) => s.userId === userId && s.expiresAt > Date.now()).map((s) => this.summonDto(s));
  }

  /** Open knocks on the room someone is in. */
  pendingKnocksFor(userId: string): KnockDto[] {
    const p = this.people.get(userId);
    if (!p?.roomId) return [];
    return [...this.knocks.values()].filter((k) => k.roomId === p.roomId && k.expiresAt > Date.now()).map((k) => this.knockDto(k));
  }

  /* ---------------- sessions ---------------- */

  /** Disconnects sockets whose session ended (logout, force-logout, timeout) or whose account was deactivated. */
  private async checkSessions(userIds?: string[]) {
    const conns: { socketId: string; sessionId: string }[] = [];
    for (const p of this.people.values()) {
      if (userIds && !userIds.includes(p.userId)) continue;
      for (const [socketId, c] of p.conns) conns.push({ socketId, sessionId: c.sessionId });
    }
    if (!conns.length) return;
    const ids = [...new Set(conns.map((c) => c.sessionId))];
    const rows = await this.db
      .select({ id: sessions.id, revokedAt: sessions.revokedAt, revokedReason: sessions.revokedReason, expiresAt: sessions.expiresAt, lastActivityAt: sessions.lastActivityAt, userStatus: users.status })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(inArray(sessions.id, ids));
    const { sessionTimeoutMinutes } = await this.settings.get();
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ended = new Map<string, ServerEvents['session:ended']>();
    for (const c of conns) {
      const s = byId.get(c.sessionId);
      let reason: ServerEvents['session:ended'] | null = null;
      if (!s) reason = { code: 'SESSION_ENDED', message: 'Your session has ended. Please sign in again.' };
      else if (s.userStatus !== 'ACTIVE') reason = { code: 'ACCOUNT_DEACTIVATED', message: 'Your account is deactivated' };
      else {
        const st = sessionState(s, sessionTimeoutMinutes);
        if (st === 'idle_timeout') reason = { code: 'SESSION_TIMEOUT', message: 'You were signed out after a period of inactivity' };
        else if (st !== 'active') {
          const forced = s.revokedReason === 'forced' || s.revokedReason === 'deactivated';
          reason = forced
            ? { code: 'FORCED_LOGOUT', message: 'An administrator signed you out' }
            : { code: 'SESSION_ENDED', message: 'Your session has ended. Please sign in again.' };
        }
      }
      if (reason) ended.set(c.socketId, reason);
    }
    for (const [socketId, reason] of ended) this.outbox?.disconnect([socketId], reason);
  }

  private async sweep() {
    const now = Date.now();
    for (const [id, k] of this.knocks) if (k.expiresAt < now) this.closeKnock(id);
    for (const [id, s] of this.summons) {
      if (s.expiresAt < now) {
        this.summons.delete(id);
        this.meetings.get(s.roomId)?.pending.delete(s.userId);
        this.outbox?.toUser(s.userId, 'summon:closed', { id });
      }
    }
    // a summoned meeting with no one left in the room is over
    for (const [roomId, m] of this.meetings) {
      if (this.occupants(roomId).length === 0 && m.pending.size === 0) this.meetings.delete(roomId);
    }
    await this.checkSessions();
  }

  /* ---------------- views ---------------- */

  private mustBeOnline(userId: string): Person {
    const p = this.people.get(userId);
    if (!p || p.conns.size === 0) throw new PresenceError('You are not connected to the office.', 'NOT_CONNECTED');
    return p;
  }

  private bySocket(socketId: string): Person {
    const userId = this.socketOwner.get(socketId);
    const p = userId ? this.people.get(userId) : undefined;
    if (!p) throw new PresenceError('You are not connected to the office.', 'NOT_CONNECTED');
    return p;
  }

  userIdForSocket(socketId: string): string | undefined {
    return this.socketOwner.get(socketId);
  }

  private statusOf(p: Person) {
    const connected = p.conns.size > 0;
    return deriveStatus({
      connected,
      onClockBreak: p.onClockBreak,
      manual: p.manual,
      roomKind: p.roomId ? this.roomKindCache.get(p.roomId) ?? null : null,
      idle: connected && [...p.conns.values()].every((c) => c.idle),
    });
  }

  private dto(p: Person): PresencePersonDto {
    const online = p.conns.size > 0;
    return {
      userId: p.userId,
      fullName: p.fullName,
      title: p.title,
      departmentName: p.departmentName,
      timezone: p.timezone,
      avatarUrl: p.avatarUrl,
      status: this.statusOf(p),
      manualStatus: p.manual,
      message: p.message,
      roomId: online ? p.roomId : null,
      enteredAt: online && p.enteredAt ? p.enteredAt.toISOString() : null,
      lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
    };
  }

  private broadcast(p: Person) {
    this.outbox?.toAll('presence:update', this.dto(p));
  }

  async snapshot(me: string): Promise<FloorSnapshotDto> {
    await this.ensureLoaded();
    const all = await this.rooms.list();
    this.cacheKinds(all);
    return {
      rooms: all,
      people: [...this.people.values()].map((p) => this.dto(p)).sort((a, b) => a.fullName.localeCompare(b.fullName)),
      meetings: this.meetingDtos(),
      me,
    };
  }

  /** Seats per room, for tests and debugging. */
  async seats(roomId: string): Promise<Map<string, number>> {
    const room = await this.rooms.get(roomId);
    if (!room) return new Map();
    return assignSeats(
      this.occupants(roomId).map((p) => ({ userId: p.userId, enteredAt: p.enteredAt?.toISOString() ?? '' })),
      room.ownerId,
      room.capacity,
    );
  }

  private async save(p: Person) {
    const values = {
      userId: p.userId,
      roomId: p.roomId,
      enteredAt: p.enteredAt,
      manualStatus: p.manual,
      message: p.message,
      lastSeenAt: p.lastSeenAt,
    };
    await this.db.insert(presence).values(values).onConflictDoUpdate({ target: presence.userId, set: values });
  }
}
