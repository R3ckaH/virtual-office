import type { FloorSpot, MeetingDto, Point, PresencePersonDto, RoomDto, RoomKind } from '@vo/shared';
import { assignSeats, FLOOR, FLOOR_SPOTS, knockSpot, walkRoute } from '@vo/shared';
import { Crown, DoorClosed, Coffee, Lock, Star, Users, Video, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Character, CharacterRole } from './Character';
import { FURNITURE } from './furniture';
import './floor.css';

/* ---------------------------------------------------------------- */
/* Static pieces                                                     */
/* ---------------------------------------------------------------- */

const FINISH: Record<string, CSSProperties> = {
  carpet: { backgroundColor: '#EFF3F8', backgroundImage: 'linear-gradient(90deg, rgba(31,58,95,0.06) 1px, transparent 1px)', backgroundSize: '24px 100%' },
  dots: { backgroundColor: '#F6F0E1', backgroundImage: 'radial-gradient(rgba(146,108,20,0.10) 1px, transparent 1px)', backgroundSize: '12px 12px' },
  wood: { backgroundColor: '#F7F3EC', backgroundImage: 'linear-gradient(90deg, rgba(120,95,60,0.07) 1px, transparent 1px)', backgroundSize: '28px 100%' },
  plain: { backgroundColor: '#ECE8F6' },
  stone: { backgroundColor: '#EDF2F0' },
  tile: {
    backgroundColor: '#F6F6F2',
    backgroundImage:
      'linear-gradient(45deg, #E8E9E3 25%, transparent 25%, transparent 75%, #E8E9E3 75%), linear-gradient(45deg, #E8E9E3 25%, transparent 25%, transparent 75%, #E8E9E3 75%)',
    backgroundSize: '20px 20px',
    backgroundPosition: '0 0, 10px 10px',
  },
  stripes: { backgroundColor: '#F4F1EA', backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.03) 0 6px, transparent 6px 12px)' },
};

const KIND_ICON: Record<RoomKind, LucideIcon> = {
  OPEN: DoorClosed,
  DEPARTMENT: Users,
  MEETING: Video,
  BREAK: Coffee,
  PRIVATE: Lock,
  LEADERS: Crown,
};

function cssToStyle(css: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[prop] = decl.slice(i + 1).trim();
  }
  return out as CSSProperties;
}
const FURNITURE_STYLES = FURNITURE.map((f) => ({ desk: f.includes('vo-desk'), style: cssToStyle(f) }));

/** Wall segments for one room: four sides, with a gap for the door (and the front door in the lobby). */
function wallsFor(spot: FloorSpot) {
  const { rect: r, door } = FLOOR.spots[spot];
  const h: { x: number; y: number; w: number }[] = [];
  const v: { x: number; y: number; h: number }[] = [];
  for (const y of [r.y, r.y + r.h]) {
    if (door.y === y) {
      h.push({ x: r.x, y, w: door.x - 19 - r.x }, { x: door.x + 19, y, w: r.x + r.w - door.x - 19 });
    } else h.push({ x: r.x, y, w: r.w });
  }
  for (const x of [r.x, r.x + r.w]) {
    const e = FLOOR.entrance;
    if (spot === 'lobby' && x === r.x + r.w) {
      v.push({ x, y: r.y, h: e.y - 20 - r.y }, { x, y: e.y + 20, h: r.y + r.h - e.y - 20 });
    } else v.push({ x, y: r.y, h: r.h });
  }
  return { h, v };
}

/* ---------------------------------------------------------------- */
/* Walking                                                           */
/* ---------------------------------------------------------------- */

interface Pos {
  x: number;
  y: number;
  dur: number;
  walking: boolean;
  facing: 'left' | 'right';
}

interface Target {
  roomId: string;
  seat: number;
  /** standing outside this room's door, knocking */
  knock: string | null;
}

const SPEED = 0.13; // floor units per ms, as in the mockup

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** From a hallway point to a seat in a room (used when coming back from a knock). */
function routeFromHall(hall: 1 | 2, x: number, to: FloorSpot, seat: number): Point[] {
  const pts: Point[] = [[x, FLOOR.halls[hall]]];
  const t = FLOOR.spots[to].door;
  if (hall !== t.hall) pts.push([FLOOR.connectorX, FLOOR.halls[hall]], [FLOOR.connectorX, FLOOR.halls[t.hall]]);
  pts.push([t.x, FLOOR.halls[t.hall]], [t.x, t.y], FLOOR.spots[to].slots[seat] ?? FLOOR.spots[to].slots[0]);
  return pts;
}

/* ---------------------------------------------------------------- */
/* Component                                                         */
/* ---------------------------------------------------------------- */

export interface FloorPlanProps {
  rooms: RoomDto[];
  /** connected people (status not OFFLINE, with a room) */
  people: PresencePersonDto[];
  me: string | null;
  meetings: MeetingDto[];
  selectedId: string | null;
  knockRoomId: string | null;
  /** the room someone just let me into (between the answer and the move arriving) */
  admittedRoomId: string | null;
  accent: string;
  onSelect: (userId: string) => void;
  onRoomClick: (room: RoomDto) => void;
}

export function FloorPlan({ rooms, people, me, meetings, selectedId, knockRoomId, admittedRoomId, accent, onSelect, onRoomClick }: FloorPlanProps) {
  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const roomBySpot = useMemo(() => new Map(rooms.map((r) => [r.spot, r])), [rooms]);

  /* ----- view & camera ----- */
  const [view, setView] = useState<'2d' | '3d'>(() => (localGet('vo-floor-view') === '3d' ? '3d' : '2d'));
  const [depth, setDepth] = useState(view === '3d');
  const [follow, setFollow] = useState(() => localGet('vo-floor-follow') !== 'off');
  const [angle, setAngle] = useState(0);
  const [heading, setHeading] = useState(-16);
  const flatTimer = useRef<number>();
  useEffect(() => localSet('vo-floor-view', view), [view]);
  useEffect(() => localSet('vo-floor-follow', follow ? 'on' : 'off'), [follow]);

  /* ----- walkers ----- */
  const [pos, setPos] = useState<Record<string, Pos>>({});
  const posRef = useRef(pos);
  posRef.current = pos;
  const [doors, setDoors] = useState<Record<string, boolean>>({});
  const doorUntil = useRef<Record<string, number>>({});
  const targets = useRef(new Map<string, Target>());
  const tokens = useRef(new Map<string, number>());
  const timers = useRef(new Set<number>());
  const firstSync = useRef(true);
  const [walkLabel, setWalkLabel] = useState('');
  const angleRef = useRef(angle);
  angleRef.current = angle;

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const openDoor = useCallback(
    (key: string, ms: number) => {
      const until = Date.now() + ms;
      if ((doorUntil.current[key] ?? 0) < until) doorUntil.current[key] = until;
      setDoors((d) => (d[key] ? d : { ...d, [key]: true }));
      later(() => {
        if (Date.now() >= (doorUntil.current[key] ?? 0) - 30) setDoors((d) => ({ ...d, [key]: false }));
      }, ms);
    },
    [later],
  );

  const doorAt = useCallback((p: Point): string | null => {
    for (const s of FLOOR_SPOTS) {
      const d = FLOOR.spots[s].door;
      if (d.x === p[0] && d.y === p[1]) return s;
    }
    return p[0] >= FLOOR.width - 40 && Math.abs(p[1] - FLOOR.entrance.y) < 25 ? 'entrance' : null;
  }, []);

  const place = useCallback((id: string, p: Point) => {
    setPos((all) => ({ ...all, [id]: { x: p[0], y: p[1], dur: 0, walking: false, facing: all[id]?.facing ?? 'right' } }));
  }, []);

  /** Walks someone through waypoints; doors slide open as they pass. */
  const stepAlong = useCallback(
    (id: string, pts: Point[]) => {
      if (!pts.length) return;
      if (reducedMotion()) return place(id, pts[pts.length - 1]);
      const token = (tokens.current.get(id) ?? 0) + 1;
      tokens.current.set(id, token);
      const go = (i: number) => {
        if (tokens.current.get(id) !== token) return;
        const cur = posRef.current[id];
        if (i >= pts.length || !cur) {
          setPos((all) => (all[id] ? { ...all, [id]: { ...all[id], walking: false } } : all));
          if (id === me) setWalkLabel('');
          return;
        }
        const [nx, ny] = pts[i];
        if (id === me) {
          const dx = nx - cur.x;
          const dy = ny - cur.y;
          if (Math.hypot(dx, dy) > 1) {
            // turn the camera so the walking direction points away from the viewer
            const target = -90 - (Math.atan2(dy, dx) * 180) / Math.PI;
            setHeading((prev) => {
              const from = i === 0 && !cur.walking ? angleRef.current : prev;
              const delta = ((((target - from) % 360) + 540) % 360) - 180;
              return from + delta;
            });
          }
        }
        const ms = Math.max(80, Math.round(Math.hypot(nx - cur.x, ny - cur.y) / SPEED));
        const facing: Pos['facing'] = nx < cur.x - 1 ? 'left' : nx > cur.x + 1 ? 'right' : cur.facing;
        const door = doorAt(pts[i]);
        if (door) later(() => openDoor(door, 1500), Math.max(0, ms - 650));
        const prevDoor = i > 0 ? doorAt(pts[i - 1]) : null;
        if (prevDoor) openDoor(prevDoor, Math.min(ms, 700) + 500);
        setPos((all) => ({ ...all, [id]: { x: nx, y: ny, dur: ms, walking: true, facing } }));
        later(() => go(i + 1), ms);
      };
      // start from wherever they are right now
      const start = posRef.current[id];
      if (!start) place(id, pts[0]);
      later(() => go(start ? 0 : 1), 20);
    },
    [doorAt, later, me, openDoor, place],
  );
  /* ----- seats ----- */
  const seats = useMemo(() => {
    const out = new Map<string, number>();
    const byRoom = new Map<string, PresencePersonDto[]>();
    for (const p of people) {
      if (!p.roomId) continue;
      byRoom.set(p.roomId, [...(byRoom.get(p.roomId) ?? []), p]);
    }
    for (const [roomId, list] of byRoom) {
      const room = roomsById.get(roomId);
      if (!room) continue;
      const s = assignSeats(
        list.map((p) => ({ userId: p.userId, enteredAt: p.enteredAt ?? '' })),
        room.ownerId,
        room.capacity,
      );
      for (const [k, v] of s) out.set(k, v);
    }
    return out;
  }, [people, roomsById]);

  /* ----- keep animations in step with presence ----- */
  useLayoutEffect(() => {
    if (!rooms.length) return;
    const online = new Set<string>();
    for (const p of people) {
      const room = p.roomId ? roomsById.get(p.roomId) : undefined;
      if (!room) continue;
      online.add(p.userId);
      const spot = room.spot;
      const seat = seats.get(p.userId) ?? 0;
      const seatPt = FLOOR.spots[spot].slots[seat] ?? FLOOR.spots[spot].slots[0];
      const t = targets.current.get(p.userId);
      const isMe = p.userId === me;

      // walking up to a door to knock
      if (isMe && knockRoomId && knockRoomId !== p.roomId && t && t.knock !== knockRoomId) {
        const kr = roomsById.get(knockRoomId);
        if (kr) {
          const from = roomsById.get(t.roomId)?.spot ?? null;
          stepAlong(p.userId, [...walkRoute(from, kr.spot, null), knockSpot(kr.spot)]);
          targets.current.set(p.userId, { ...t, knock: knockRoomId });
          setWalkLabel(`Walking to the door of ${kr.name}`);
          continue;
        }
      }

      if (!t) {
        if (firstSync.current || reducedMotion()) place(p.userId, seatPt);
        else stepAlong(p.userId, walkRoute(null, spot, seat));
      } else if (t.knock && p.roomId === t.knock) {
        // let in after knocking: through the door to a seat
        const d = FLOOR.spots[spot].door;
        stepAlong(p.userId, [[d.x, d.y], seatPt]);
        if (isMe) setWalkLabel(`Walking into ${room.name}`);
      } else if (t.knock && knockRoomId === t.knock) {
        continue; // still waiting at the door
      } else if (t.knock && admittedRoomId === t.knock && p.roomId === t.roomId) {
        continue; // let in: the move is on its way
      } else if (t.knock && !knockRoomId && p.roomId === t.roomId) {
        // knock declined or timed out: walk back
        const kr = roomsById.get(t.knock);
        if (kr) {
          const kd = FLOOR.spots[kr.spot].door;
          stepAlong(p.userId, routeFromHall(kd.hall, kd.x + 26, spot, seat));
        } else place(p.userId, seatPt);
      } else if (t.roomId !== p.roomId) {
        const from = roomsById.get(t.roomId)?.spot ?? null;
        stepAlong(p.userId, walkRoute(from, spot, seat));
        if (isMe) setWalkLabel(`Walking to ${room.name}`);
      } else if (t.seat !== seat) {
        stepAlong(p.userId, [seatPt]);
      }
      targets.current.set(p.userId, { roomId: p.roomId!, seat, knock: isMe && knockRoomId && knockRoomId !== p.roomId ? knockRoomId : null });
    }
    // people who left the office
    for (const id of [...targets.current.keys()]) {
      if (online.has(id)) continue;
      targets.current.delete(id);
      tokens.current.set(id, (tokens.current.get(id) ?? 0) + 1);
      setPos((all) => {
        const next = { ...all };
        delete next[id];
        return next;
      });
    }
    firstSync.current = false;
  }, [people, rooms, roomsById, seats, me, knockRoomId, admittedRoomId, place, stepAlong]);

  /* ----- camera ----- */
  const mp = me ? pos[me] : undefined;
  const following = follow && !!mp?.walking;
  const is3d = view === '3d' || following;
  useEffect(() => {
    window.clearTimeout(flatTimer.current);
    if (view === '3d' || following) setDepth(true);
    else flatTimer.current = window.setTimeout(() => setDepth(false), 950);
    return () => window.clearTimeout(flatTimer.current);
  }, [view, following]);

  const tilt = following ? 64 : 54;
  const camAngle = following ? heading : angle;
  // corners: turn slowly with a soft ease-in-out so the view never whips around
  const camEase = following ? '1800ms cubic-bezier(.45,0,.25,1)' : '850ms cubic-bezier(.25,.7,.25,1)';
  const billboard = is3d ? `rotateZ(${-camAngle}deg) rotateX(${-tilt}deg)` : 'rotateZ(0deg) rotateX(0deg)';
  const camTransform = following
    ? `translateY(170px) rotateX(${tilt}deg) rotateZ(${camAngle}deg) scale3d(1.8, 1.8, 1.8)`
    : is3d
      ? `translateY(26px) rotateX(${tilt}deg) rotateZ(${camAngle}deg) scale3d(0.8, 0.8, 0.8)`
      : 'translateY(0px) rotateX(0deg) rotateZ(0deg) scale3d(1, 1, 1)';
  const planTransform = following && mp ? `translate(${400 - mp.x}px, ${310 - mp.y}px)` : 'translate(0px, 0px)';
  const planTransition = following && mp ? `transform ${mp.dur}ms linear, box-shadow 900ms` : 'transform 850ms cubic-bezier(.25,.7,.25,1), box-shadow 900ms';
  const wallH = is3d ? 'rotateX(-90deg) scaleY(1)' : 'rotateX(-90deg) scaleY(0.01)';
  const wallV = is3d ? 'rotateY(90deg) scaleX(1)' : 'rotateY(90deg) scaleX(0.01)';

  /* ----- fit to the available width ----- */
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / 820)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ----- who's who ----- */
  const roleOf = useCallback(
    (userId: string): CharacterRole => {
      for (const r of rooms) if (r.kind === 'LEADERS' && r.ownerId === userId) return 'host';
      for (const r of rooms) if (r.kind === 'LEADERS' && r.memberIds.includes(userId)) return 'leader';
      return 'staff';
    },
    [rooms],
  );
  const pending = useMemo(() => new Set(meetings.flatMap((m) => m.pendingIds)), [meetings]);
  const meetingRooms = useMemo(() => new Set(meetings.map((m) => m.roomId)), [meetings]);

  const talkIdx: Record<string, number> = {};
  const myRoomId = me ? people.find((p) => p.userId === me)?.roomId ?? null : null;
  const knockRoom = knockRoomId ? roomsById.get(knockRoomId) : undefined;

  return (
    <div ref={outer} className="w-full">
      <div role="group" aria-label="Floor view" className="mb-2 flex flex-wrap items-center justify-end gap-1.5" style={{ maxWidth: 820 * scale }}>
        {is3d && (
          <>
            <ViewButton label="Rotate view left" onClick={() => setAngle((a) => Math.max(-60, a - 15))}>
              <path d="M4 12a8 8 0 1 0 2.3-5.7" />
              <path d="M4 4v4h4" />
            </ViewButton>
            <ViewButton label="Rotate view right" onClick={() => setAngle((a) => Math.min(60, a + 15))}>
              <path d="M20 12a8 8 0 1 1-2.3-5.7" />
              <path d="M20 4v4h-4" />
            </ViewButton>
          </>
        )}
        <button
          type="button"
          onClick={() => setFollow((f) => !f)}
          aria-pressed={follow}
          title="Follow camera: zooms in behind you while you walk"
          className={clsx('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold', follow ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-ink hover:bg-sunken')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="6" width="13" height="12" rx="2" />
            <path d="M16 10l5-3v10l-5-3" />
          </svg>
          Follow
        </button>
        <div className="flex gap-0.5 rounded-lg border border-line bg-surface p-0.5">
          {(['2d', '3d'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={(v === '3d') === is3d}
              className={clsx('h-7 min-w-[40px] rounded-md px-2 text-sm font-semibold', (v === '3d') === is3d ? 'bg-ink text-canvas' : 'text-muted hover:text-ink')}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 640 * scale, width: 820 * scale }} className="relative">
        <div
          style={{
            '--vo-accent': accent,
            width: 820,
            height: 640,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            perspective: following ? '1100px' : '1700px',
            perspectiveOrigin: '50% 30%',
            background: is3d ? '#E3E7DF' : '#C4CABF',
            transition: 'background 600ms, perspective 800ms',
          } as CSSProperties}
          className="relative overflow-hidden rounded-2xl p-[10px]"
        >
          {following && walkLabel && (
            <div role="status" className="vo-hud absolute bottom-[22px] left-[22px] z-[3000] flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-semibold text-white shadow-lg" style={{ background: 'rgba(27,34,48,0.88)' }}>
              <span className="vo-live h-2 w-2 rounded-full" style={{ background: '#4ADE80' }} />
              {walkLabel}
            </div>
          )}

          <div className="vo-cam" style={{ width: 800, height: 620, transform: camTransform, transition: `transform ${camEase}` }}>
            <div
              aria-label="Office floor plan"
              className={depth || following ? 'vo-plan vo-3d' : 'vo-plan'}
              style={{
                position: 'relative',
                width: 800,
                height: 620,
                overflow: depth || following ? 'visible' : 'hidden',
                borderRadius: 8,
                backgroundColor: '#DADFD5',
                backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)',
                backgroundSize: '16px 16px',
                transform: planTransform,
                transition: planTransition,
                boxShadow: is3d ? '0 0 0 8px #AEB6A8, 0 40px 60px rgba(27,34,48,0.25)' : '0 0 0 0 rgba(0,0,0,0)',
              }}
            >
              {FLOOR_SPOTS.map((spot) => {
                const room = roomBySpot.get(spot);
                if (!room) return null;
                const g = FLOOR.spots[spot];
                const count = people.filter((p) => p.roomId === room.id).length;
                const mine = myRoomId === room.id;
                const wall = mine ? accent : room.kind === 'LEADERS' ? '#A07A1E' : room.kind === 'PRIVATE' && room.ownerId ? '#1F3A5F' : '#7E8A7C';
                return (
                  <button
                    key={spot}
                    type="button"
                    className="vo-room"
                    onClick={() => onRoomClick(room)}
                    aria-label={`${room.name}, ${count ? `${count} ${count === 1 ? 'person' : 'people'}` : 'empty'}${mine ? '. You’re here' : ''}`}
                    title={room.name}
                    style={{
                      position: 'absolute',
                      left: g.rect.x,
                      top: g.rect.y,
                      width: g.rect.w,
                      height: g.rect.h,
                      boxSizing: 'border-box',
                      margin: 0,
                      padding: 0,
                      border: `3px solid ${wall}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                      zIndex: 1,
                      ...FINISH[g.finish],
                    }}
                  />
                );
              })}

              {/* 3D walls */}
              {FLOOR_SPOTS.map((spot) => {
                const room = roomBySpot.get(spot);
                const rgb = room?.kind === 'LEADERS' ? '160,122,30' : room?.kind === 'PRIVATE' && room.ownerId ? '31,58,95' : '110,124,108';
                const { h, v } = wallsFor(spot);
                return [
                  ...h.map((w, i) => (
                    <span
                      key={`${spot}h${i}`}
                      className="vo-wall"
                      style={{ position: 'absolute', left: w.x, top: w.y - 34, width: w.w, height: 34, boxSizing: 'border-box', background: `rgba(${rgb},0.16)`, borderTop: `3px solid rgb(${rgb})`, transformOrigin: '50% 100%', pointerEvents: 'none', transform: wallH, opacity: is3d ? 1 : 0 }}
                    />
                  )),
                  ...v.map((w, i) => (
                    <span
                      key={`${spot}v${i}`}
                      className="vo-wall"
                      style={{ position: 'absolute', left: w.x - 34, top: w.y, width: 34, height: w.h, boxSizing: 'border-box', background: `rgba(${rgb},0.16)`, borderLeft: `3px solid rgb(${rgb})`, transformOrigin: '100% 50%', pointerEvents: 'none', transform: wallV, opacity: is3d ? 1 : 0 }}
                    />
                  )),
                ];
              })}

              {/* sliding doors */}
              {FLOOR_SPOTS.map((spot) => {
                const d = FLOOR.spots[spot].door;
                const open = !!doors[spot];
                const stand = is3d ? ' rotateX(-90deg) scaleY(6)' : ' rotateX(0deg) scaleY(1)';
                const panel: CSSProperties = { transformOrigin: '50% 100%', position: 'absolute', top: d.y - 3, width: 19, height: 5, boxSizing: 'border-box', borderRadius: 1, background: '#B7CAD8', border: '1px solid #6F8797', zIndex: 4, pointerEvents: 'none' };
                return (
                  <span key={`door-${spot}`}>
                    <span style={{ position: 'absolute', left: d.x - 19, top: d.y - 4, width: 38, height: 7, background: '#DADFD5', zIndex: 2, pointerEvents: 'none' }} />
                    <span className="vo-door" style={{ ...panel, left: d.x - 19, transform: `translateX(${open ? -18 : 0}px)${stand}` }} />
                    <span className="vo-door" style={{ ...panel, left: d.x, transform: `translateX(${open ? 18 : 0}px)${stand}` }} />
                  </span>
                );
              })}
              {(() => {
                const e = FLOOR.entrance;
                const open = !!doors.entrance;
                const stand = is3d ? ' rotateY(90deg) scaleX(6)' : ' rotateY(0deg) scaleX(1)';
                const panel: CSSProperties = { transformOrigin: '100% 50%', position: 'absolute', left: e.x - 2, width: 5, height: 20, boxSizing: 'border-box', borderRadius: 1, background: '#B7CAD8', border: '1px solid #6F8797', zIndex: 4, pointerEvents: 'none' };
                return (
                  <>
                    <span style={{ position: 'absolute', left: e.x - 3, top: e.y - 20, width: 7, height: 40, background: '#DADFD5', zIndex: 2, pointerEvents: 'none' }} />
                    <span className="vo-door" style={{ ...panel, top: e.y - 20, transform: `translateY(${open ? -18 : 0}px)${stand}` }} />
                    <span className="vo-door" style={{ ...panel, top: e.y, transform: `translateY(${open ? 18 : 0}px)${stand}` }} />
                  </>
                );
              })()}

              {FURNITURE_STYLES.map((f, i) => (
                <span key={`f${i}`} className={f.desk ? 'vo-desk' : 'vo-furn'} style={{ ...f.style, pointerEvents: 'none' }} />
              ))}

              {/* people */}
              {people.map((p) => {
                const s = pos[p.userId];
                if (!s || !p.roomId) return null;
                const room = roomsById.get(p.roomId);
                const isMe = p.userId === me;
                const inMeeting = p.status === 'IN_MEETING' && (room?.kind === 'MEETING' || room?.kind === 'LEADERS');
                let talkDelay = '0s';
                if (inMeeting) {
                  const k = talkIdx[p.roomId] ?? 0;
                  talkIdx[p.roomId] = k + 1;
                  talkDelay = `${(k * 1.2).toFixed(1)}s`;
                }
                const first = p.fullName.replace(/^Ptr\.\s+/, 'Ptr. ').split(' ');
                const label = isMe ? 'You' : first[0] === 'Ptr.' ? `${first[0]} ${first[1] ?? ''}` : first[0];
                return (
                  <Character
                    key={p.userId}
                    name={p.fullName}
                    label={label}
                    role={roleOf(p.userId)}
                    status={p.status}
                    isMe={isMe}
                    selected={selectedId === p.userId}
                    walking={s.walking}
                    facing={s.facing}
                    inMeeting={inMeeting}
                    talkDelay={talkDelay}
                    summoned={pending.has(p.userId)}
                    accent={accent}
                    ariaLabel={`${isMe ? 'You' : p.fullName}, ${statusText(p)}${room ? `, in ${room.name}` : ''}`}
                    onClick={() => onSelect(p.userId)}
                    style={{
                      left: s.x - 20,
                      top: s.y - 54,
                      zIndex: Math.round(s.y) + 10,
                      transformOrigin: '20px 52px',
                      transform: billboard,
                      transition: `left ${s.dur}ms linear, top ${s.dur}ms linear, opacity 300ms, transform ${camEase}`,
                    }}
                  />
                );
              })}


              {/* room labels sit above everyone so names stay readable */}
              {FLOOR_SPOTS.map((spot) => {
                const room = roomBySpot.get(spot);
                if (!room) return null;
                const g = FLOOR.spots[spot];
                const count = people.filter((p) => p.roomId === room.id).length;
                const mine = myRoomId === room.id;
                const Icon = room.kind === 'PRIVATE' && room.ownerId ? Star : KIND_ICON[room.kind];
                return (
                  <span
                    key={`label-${spot}`}
                    aria-hidden
                    className="vo-label"
                    style={{ position: 'absolute', left: g.rect.x + 9, top: g.rect.y + 9, zIndex: 1000, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px 3px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.92)', color: '#1B2230', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', maxWidth: g.rect.w - 18, overflow: 'hidden', boxShadow: '0 1px 2px rgba(27,34,48,0.12)' }}
                  >
                    <Icon width={13} height={13} aria-hidden />
                    <span className="truncate">{room.name}</span>
                    {count > 0 && <span style={{ color: '#586171', fontWeight: 500 }}>{count}</span>}
                    {meetingRooms.has(room.id) && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#92400E', fontWeight: 700 }}>
                        <span className="vo-live" style={{ width: 7, height: 7, borderRadius: 999, background: '#B45309' }} />
                        In session
                      </span>
                    )}
                    {mine && <span style={{ color: accent, fontWeight: 700 }}>You’re here</span>}
                  </span>
                );
              })}

              {knockRoom && (
                <span aria-hidden>
                  {[0, 0.4, 0.8].map((delay) => {
                    const d = FLOOR.spots[knockRoom.spot].door;
                    return (
                      <span
                        key={delay}
                        className="vo-ripple"
                        style={{ position: 'absolute', left: d.x, top: d.y, width: 34, height: 34, boxSizing: 'border-box', border: `3px solid ${accent}`, borderRadius: '50%', zIndex: 900, pointerEvents: 'none', animationDelay: `${delay}s` }}
                      />
                    );
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function statusText(p: PresencePersonDto) {
  const labels: Record<string, string> = { AVAILABLE: 'Available', IN_MEETING: 'In a meeting', BUSY: 'Busy', ON_BREAK: 'On break', AWAY: 'Away', OFFLINE: 'Offline' };
  return labels[p.status];
}

function ViewButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="inline-flex h-8 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:bg-sunken">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

function localGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function localSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: preference lasts for this visit only */
  }
}
