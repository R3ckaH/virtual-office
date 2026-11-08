import { assignSeats, deriveStatus, FLOOR, FLOOR_SPOTS, knockSpot, roomAccess, walkRoute } from '@vo/shared';

describe('presence rules', () => {
  const base = { connected: true, onClockBreak: false, manual: null, roomKind: 'DEPARTMENT' as const, idle: false };

  it('derives the status in priority order', () => {
    expect(deriveStatus({ ...base, connected: false, manual: 'BUSY', onClockBreak: true })).toBe('OFFLINE');
    expect(deriveStatus({ ...base, onClockBreak: true, manual: 'BUSY' })).toBe('ON_BREAK');
    expect(deriveStatus({ ...base, manual: 'BUSY', roomKind: 'MEETING', idle: true })).toBe('BUSY');
    expect(deriveStatus({ ...base, roomKind: 'MEETING', idle: true })).toBe('IN_MEETING');
    expect(deriveStatus({ ...base, roomKind: 'LEADERS' })).toBe('IN_MEETING');
    expect(deriveStatus({ ...base, roomKind: 'BREAK' })).toBe('ON_BREAK');
    expect(deriveStatus({ ...base, idle: true })).toBe('AWAY');
    expect(deriveStatus(base)).toBe('AVAILABLE');
  });

  it('decides who walks in and who knocks', () => {
    const office = { kind: 'PRIVATE' as const, ownerId: 'owner', memberIds: ['m'], occupantCount: 0 };
    expect(roomAccess(office, 'owner')).toBe('enter');
    expect(roomAccess(office, 'm')).toBe('enter');
    expect(roomAccess(office, 'x')).toBe('knock');
    const booth = { kind: 'PRIVATE' as const, ownerId: null, memberIds: [], occupantCount: 0 };
    expect(roomAccess(booth, 'x')).toBe('enter');
    expect(roomAccess({ ...booth, occupantCount: 1 }, 'x')).toBe('knock');
    const leaders = { kind: 'LEADERS' as const, ownerId: 'p', memberIds: ['ceo'], occupantCount: 3 };
    expect(roomAccess(leaders, 'ceo')).toBe('enter');
    expect(roomAccess({ ...leaders, occupantCount: 0 }, 'x')).toBe('knock');
    for (const kind of ['OPEN', 'DEPARTMENT', 'MEETING', 'BREAK'] as const) {
      expect(roomAccess({ kind, ownerId: 'p', memberIds: [], occupantCount: 9 }, 'x')).toBe('enter');
    }
  });

  it('keeps seat 0 for the owner and seats everyone else by arrival', () => {
    const seats = assignSeats(
      [
        { userId: 'b', enteredAt: '2026-11-08T01:00:02Z' },
        { userId: 'owner', enteredAt: '2026-11-08T01:00:05Z' },
        { userId: 'a', enteredAt: '2026-11-08T01:00:01Z' },
      ],
      'owner',
      9,
    );
    expect(Object.fromEntries(seats)).toEqual({ owner: 0, a: 1, b: 2 });
    // without the owner present, seat 0 stays free
    expect(Object.fromEntries(assignSeats([{ userId: 'a', enteredAt: 'x' }], 'owner', 3))).toEqual({ a: 1 });
    expect(Object.fromEntries(assignSeats([{ userId: 'a', enteredAt: 'x' }], null, 3))).toEqual({ a: 0 });
  });

  it('routes along the hallways and through the connector between floors halves', () => {
    const r = walkRoute('eng', 'break', 0);
    expect(r[0]).toEqual([695, 200]); // out of Engineering's door
    expect(r).toContainEqual([FLOOR.connectorX, FLOOR.halls[1]]);
    expect(r).toContainEqual([FLOOR.connectorX, FLOOR.halls[2]]);
    expect(r[r.length - 1]).toEqual(FLOOR.spots.break.slots[0]);
    // same hallway: no detour
    expect(walkRoute('eng', 'ceo', 1)).not.toContainEqual([FLOOR.connectorX, FLOOR.halls[1]]);
    // arriving from outside comes in through the front door
    expect(walkRoute(null, 'lobby', 0)[0][0]).toBeGreaterThan(FLOOR.width);
    // every seat is inside its room, and every knock spot is in the hallway outside
    for (const s of FLOOR_SPOTS) {
      const { rect, slots } = FLOOR.spots[s];
      for (const [x, y] of slots) {
        expect(x).toBeGreaterThan(rect.x);
        expect(x).toBeLessThan(rect.x + rect.w);
        expect(y).toBeGreaterThan(rect.y);
        expect(y).toBeLessThan(rect.y + rect.h);
      }
      const [, ky] = knockSpot(s);
      expect(ky < rect.y || ky > rect.y + rect.h).toBe(true);
    }
  });
});
