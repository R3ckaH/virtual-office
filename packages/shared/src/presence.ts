import { z } from 'zod';
import type { ChatServerEvents } from './chat';
import type { typingSchema } from './chat';

/* ------------------------------------------------------------------ */
/* Presence statuses                                                   */
/* ------------------------------------------------------------------ */

export const PRESENCE_STATUSES = ['AVAILABLE', 'IN_MEETING', 'BUSY', 'ON_BREAK', 'AWAY', 'OFFLINE'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  AVAILABLE: 'Available',
  IN_MEETING: 'In a meeting',
  BUSY: 'Busy',
  ON_BREAK: 'On break',
  AWAY: 'Away',
  OFFLINE: 'Offline',
};

export const PRESENCE_COLORS: Record<PresenceStatus, string> = {
  AVAILABLE: '#16A34A',
  IN_MEETING: '#7C3AED',
  BUSY: '#DC2626',
  ON_BREAK: '#B45309',
  AWAY: '#6B7280',
  OFFLINE: '#9CA3AF',
};

/** Statuses a person can pick themselves. `null` means "automatic". */
export const MANUAL_STATUSES = ['BUSY', 'IN_MEETING', 'AWAY'] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

/** Minutes without keyboard or mouse activity before someone shows as Away. */
export const IDLE_AWAY_MINUTES = 15;

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

export const ROOM_KINDS = ['OPEN', 'DEPARTMENT', 'MEETING', 'BREAK', 'PRIVATE', 'LEADERS'] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

export const ROOM_KIND_LABELS: Record<RoomKind, string> = {
  OPEN: 'Open area',
  DEPARTMENT: 'Department room',
  MEETING: 'Meeting room',
  BREAK: 'Break room',
  PRIVATE: 'Private office',
  LEADERS: 'Leaders’ room',
};

export const ROOM_KIND_HELP: Record<RoomKind, string> = {
  OPEN: 'Anyone can walk in. New arrivals start here.',
  DEPARTMENT: 'Anyone can walk in. Shown as the home room for its department.',
  MEETING: 'Anyone can walk in. People inside show as In a meeting.',
  BREAK: 'Anyone can walk in. People inside show as On break.',
  PRIVATE: 'The owner and members walk in; everyone else knocks. With no owner, anyone can use it while it’s empty.',
  LEADERS: 'Only the owner and members walk in; others knock. People inside show as In a meeting. The owner can summon people.',
};

/** Fixed positions on the floor plan. Admins choose what each one is called and how it behaves. */
export const FLOOR_SPOTS = ['pastor', 'ceo', 'eng', 'huddle', 'sales', 'lobby', 'ops', 'break', 'focus'] as const;
export type FloorSpot = (typeof FLOOR_SPOTS)[number];

export type Point = readonly [number, number];
export interface SpotGeometry {
  rect: { x: number; y: number; w: number; h: number };
  /** door centre, and which hallway (1 = upper, 2 = lower) it opens onto */
  door: { x: number; y: number; hall: 1 | 2 };
  /** seats; the first is the owner's when the room has one */
  slots: readonly Point[];
  /** floor finish used by the UI */
  finish: 'carpet' | 'wood' | 'tile' | 'stone' | 'dots' | 'stripes' | 'plain';
}

/** The floor plan from the approved mockup (800 × 620 units). */
export const FLOOR = {
  width: 800,
  height: 620,
  /** y of the two hallways */
  halls: { 1: 222, 2: 442 } as const,
  /** x of the corridor connecting the two hallways */
  connectorX: 245,
  /** the front door, on the right wall of the lobby */
  entrance: { x: 798, y: 365 },
  spots: {
    pastor: {
      rect: { x: 0, y: 0, w: 230, h: 200 },
      door: { x: 115, y: 200, hall: 1 },
      slots: [[115, 92], [62, 172], [168, 172]],
      finish: 'carpet',
    },
    ceo: {
      rect: { x: 260, y: 0, w: 300, h: 200 },
      door: { x: 410, y: 200, hall: 1 },
      slots: [[292, 128], [332, 90], [392, 90], [452, 90], [512, 90], [332, 172], [392, 172], [452, 172], [512, 172]],
      finish: 'dots',
    },
    eng: {
      rect: { x: 590, y: 0, w: 210, h: 200 },
      door: { x: 695, y: 200, hall: 1 },
      slots: [[640, 88], [750, 88], [640, 165], [750, 165], [695, 125]],
      finish: 'wood',
    },
    huddle: {
      rect: { x: 0, y: 245, w: 230, h: 175 },
      door: { x: 115, y: 245, hall: 1 },
      slots: [[60, 318], [115, 314], [170, 318], [60, 398], [170, 398], [115, 400]],
      finish: 'plain',
    },
    sales: {
      rect: { x: 260, y: 245, w: 260, h: 175 },
      door: { x: 390, y: 245, hall: 1 },
      slots: [[315, 322], [465, 322], [315, 400], [465, 400], [390, 360]],
      finish: 'wood',
    },
    lobby: {
      rect: { x: 550, y: 245, w: 250, h: 175 },
      door: { x: 675, y: 245, hall: 1 },
      slots: [[608, 352], [658, 352], [708, 352], [760, 400], [600, 400]],
      finish: 'stone',
    },
    ops: {
      rect: { x: 0, y: 465, w: 230, h: 155 },
      door: { x: 115, y: 465, hall: 2 },
      slots: [[55, 562], [175, 562], [115, 598]],
      finish: 'wood',
    },
    break: {
      rect: { x: 260, y: 465, w: 300, h: 155 },
      door: { x: 410, y: 465, hall: 2 },
      slots: [[300, 590], [350, 590], [428, 528], [478, 528], [512, 592], [455, 600]],
      finish: 'tile',
    },
    focus: {
      rect: { x: 590, y: 465, w: 210, h: 155 },
      door: { x: 695, y: 465, hall: 2 },
      slots: [[645, 565], [750, 565]],
      finish: 'stripes',
    },
  } satisfies Record<FloorSpot, SpotGeometry>,
};

export function spotCapacity(spot: FloorSpot): number {
  return FLOOR.spots[spot].slots.length;
}

/** Waypoints from one room (or the front door, when `from` is null) to a seat in another. */
export function walkRoute(from: FloorSpot | null, to: FloorSpot, seat: number | null): Point[] {
  const pts: Point[] = [];
  let hall: 1 | 2;
  if (from) {
    const d = FLOOR.spots[from].door;
    pts.push([d.x, d.y], [d.x, FLOOR.halls[d.hall]]);
    hall = d.hall;
  } else {
    // in through the front door into the lobby, then out to the upper hallway
    const e = FLOOR.entrance;
    const lobby = FLOOR.spots.lobby.door;
    if (to === 'lobby') {
      pts.push([e.x + 30, e.y], [e.x - 30, e.y]);
      if (seat !== null) pts.push(FLOOR.spots.lobby.slots[seat] ?? FLOOR.spots.lobby.slots[0]);
      return pts;
    }
    pts.push([e.x + 30, e.y], [e.x - 30, e.y], [lobby.x, lobby.y + 40], [lobby.x, lobby.y], [lobby.x, FLOOR.halls[1]]);
    hall = 1;
  }
  const t = FLOOR.spots[to].door;
  if (hall !== t.hall) pts.push([FLOOR.connectorX, FLOOR.halls[hall]], [FLOOR.connectorX, FLOOR.halls[t.hall]]);
  pts.push([t.x, FLOOR.halls[t.hall]]);
  if (seat !== null) pts.push([t.x, t.y], FLOOR.spots[to].slots[seat] ?? FLOOR.spots[to].slots[0]);
  return pts;
}

/** Where to stand while knocking: just outside the door. */
export function knockSpot(spot: FloorSpot): Point {
  const d = FLOOR.spots[spot].door;
  const hallY = FLOOR.halls[d.hall];
  return [d.x + 26, d.y < hallY ? d.y + 15 : d.y - 15];
}

/* ------------------------------------------------------------------ */
/* Rules (shared by server and client)                                  */
/* ------------------------------------------------------------------ */

export interface StatusInputs {
  connected: boolean;
  /** an open break on today's timesheet */
  onClockBreak: boolean;
  manual: ManualStatus | null;
  /** in a video call right now (any meeting) */
  inCall?: boolean;
  roomKind: RoomKind | null;
  idle: boolean;
}

/**
 * The status everyone else sees. Order matters:
 * offline → break on the timesheet → what the person picked → in a video call → the room they're in → idle → available.
 */
export function deriveStatus(i: StatusInputs): PresenceStatus {
  if (!i.connected) return 'OFFLINE';
  if (i.onClockBreak) return 'ON_BREAK';
  if (i.manual) return i.manual;
  if (i.inCall) return 'IN_MEETING';
  if (i.roomKind === 'MEETING' || i.roomKind === 'LEADERS') return 'IN_MEETING';
  if (i.roomKind === 'BREAK') return 'ON_BREAK';
  if (i.idle) return 'AWAY';
  return 'AVAILABLE';
}

export interface RoomAccessInput {
  kind: RoomKind;
  ownerId: string | null;
  memberIds: readonly string[];
  /** people currently inside, not counting the one asking */
  occupantCount: number;
}

/** 'enter': walk straight in. 'knock': someone inside has to let you in. */
export function roomAccess(room: RoomAccessInput, userId: string): 'enter' | 'knock' {
  const insider = room.ownerId === userId || room.memberIds.includes(userId);
  if (room.kind === 'PRIVATE') {
    if (insider) return 'enter';
    if (!room.ownerId && room.memberIds.length === 0 && room.occupantCount === 0) return 'enter';
    return 'knock';
  }
  if (room.kind === 'LEADERS') return insider ? 'enter' : 'knock';
  return 'enter';
}

/** Seat index for each person in a room: the owner keeps seat 0, everyone else in order of arrival. */
export function assignSeats(
  occupants: readonly { userId: string; enteredAt: string }[],
  ownerId: string | null,
  capacity: number,
): Map<string, number> {
  const seats = new Map<string, number>();
  const ordered = [...occupants].sort((a, b) => a.enteredAt.localeCompare(b.enteredAt) || a.userId.localeCompare(b.userId));
  const ownerHere = !!ownerId && ordered.some((o) => o.userId === ownerId);
  if (ownerHere) seats.set(ownerId!, 0);
  let next = ownerId ? 1 : 0;
  for (const o of ordered) {
    if (o.userId === ownerId && ownerHere) continue;
    seats.set(o.userId, Math.min(next, capacity - 1));
    next += 1;
  }
  return seats;
}

/* ------------------------------------------------------------------ */
/* DTOs                                                                 */
/* ------------------------------------------------------------------ */

export interface RoomDto {
  id: string;
  spot: FloorSpot;
  name: string;
  kind: RoomKind;
  departmentId: string | null;
  ownerId: string | null;
  memberIds: string[];
  capacity: number;
}

export interface PresencePersonDto {
  userId: string;
  fullName: string;
  title: string | null;
  departmentName: string | null;
  timezone: string;
  avatarUrl: string | null;
  status: PresenceStatus;
  manualStatus: ManualStatus | null;
  message: string | null;
  roomId: string | null;
  enteredAt: string | null;
  lastSeenAt: string | null;
}

/** A gathering someone called with Summon. */
export interface GatheringDto {
  roomId: string;
  hostId: string;
  /** invited and not yet answered */
  pendingIds: string[];
  startedAt: string;
}

export interface FloorSnapshotDto {
  rooms: RoomDto[];
  people: PresencePersonDto[];
  meetings: GatheringDto[];
  /** your own id, so the client knows which avatar is you */
  me: string;
}

export interface KnockDto {
  id: string;
  roomId: string;
  fromId: string;
  fromName: string;
  createdAt: string;
}

export interface SummonDto {
  id: string;
  roomId: string;
  roomName: string;
  hostId: string;
  hostName: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Realtime events                                                      */
/* ------------------------------------------------------------------ */

const id = z.string().uuid();

export const enterRoomSchema = z.object({ roomId: id });
export const setStatusSchema = z.object({
  status: z.enum(MANUAL_STATUSES).nullable(),
  message: z
    .string()
    .trim()
    .max(80, 'Keep the message under 80 characters')
    .nullable()
    .transform((v) => (v ? v : null)),
});
export type SetStatusInput = z.infer<typeof setStatusSchema>;
export const idleSchema = z.object({ idle: z.boolean() });
export const knockSchema = z.object({ roomId: id });
export const answerSchema = z.object({ id, accept: z.boolean() });
export const summonSchema = z.object({ roomId: id, userIds: z.array(id).min(1).max(50) });
export const endMeetingSchema = z.object({ roomId: id });

/** Client → server event names and payloads. */
export interface ClientEvents {
  'chat:typing': z.input<typeof typingSchema>;
  'room:enter': z.input<typeof enterRoomSchema>;
  'status:set': z.input<typeof setStatusSchema>;
  'activity:idle': z.input<typeof idleSchema>;
  'knock:send': z.input<typeof knockSchema>;
  'knock:answer': z.input<typeof answerSchema>;
  'summon:send': z.input<typeof summonSchema>;
  'summon:answer': z.input<typeof answerSchema>;
  'meeting:end': z.input<typeof endMeetingSchema>;
}

/** Every client → server event is acknowledged with this. */
export type Ack<T = undefined> = { ok: true; data?: T } | { ok: false; message: string; code?: string };

/** Server → client events. */
export interface ServerEvents {
  'floor:snapshot': FloorSnapshotDto;
  'presence:update': PresencePersonDto;
  'rooms:update': RoomDto[];
  'meetings:update': GatheringDto[];
  'knock:incoming': KnockDto;
  'knock:closed': { id: string };
  'knock:answered': { id: string; roomId: string; accepted: boolean; byName: string };
  'summon:incoming': SummonDto;
  'summon:closed': { id: string };
  'session:ended': { code: string; message: string };
  /** someone is calling you (Phase 4) */
  'call:incoming': import('./meetings').CallDto;
  /** a call stopped ringing: answered elsewhere, cancelled by the caller, declined or timed out */
  'call:ended': { meetingId: string; reason: 'answered' | 'cancelled' | 'declined' | 'timeout'; byName?: string };
  /** a meeting starts soon */
  'meeting:reminder': { meetingId: string; title: string; start: string };
  /** a meeting you're in was created, changed or cancelled (refresh the calendar) */
  'meetings:changed': { meetingId: string };
}

export interface ServerEvents extends ChatServerEvents {}

/** Socket.IO-style listener maps (for typing `io()` / `Server`). */
export type ServerEventListeners = { [K in keyof ServerEvents]: (data: ServerEvents[K]) => void };
export type ClientEventListeners = { [K in keyof ClientEvents]: (data: ClientEvents[K], ack?: (a: Ack<unknown>) => void) => void };

/* ------------------------------------------------------------------ */
/* Admin: rooms                                                         */
/* ------------------------------------------------------------------ */

export const updateRoomSchema = z.object({
  name: z.string().trim().min(1, 'Give the room a name').max(60),
  kind: z.enum(ROOM_KINDS),
  departmentId: id.nullable(),
  ownerId: id.nullable(),
  memberIds: z.array(id).max(200),
});
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
