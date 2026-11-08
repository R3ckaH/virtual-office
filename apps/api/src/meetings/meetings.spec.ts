import { buildIcs, currentOccurrence, deriveStatus, expandOccurrences } from '@vo/shared';

const base = { durationMinutes: 30, recurrenceUntil: null as string | null };

describe('expandOccurrences', () => {
  it('lists a one-off meeting only when it overlaps the range', () => {
    const m = { ...base, startsAt: '2027-01-04T01:00:00.000Z', timezone: 'Asia/Manila', recurrence: 'NONE' as const };
    expect(expandOccurrences(m, new Date('2027-01-01'), new Date('2027-01-05'))).toHaveLength(1);
    expect(expandOccurrences(m, new Date('2027-01-05'), new Date('2027-01-06'))).toHaveLength(0);
  });

  it('weekdays skip the weekend and stop at the last date', () => {
    // Fri 2027-01-08 09:00 Manila
    const m = { ...base, startsAt: '2027-01-08T01:00:00.000Z', timezone: 'Asia/Manila', recurrence: 'WEEKDAYS' as const, recurrenceUntil: '2027-01-12' };
    expect(expandOccurrences(m, new Date('2027-01-01'), new Date('2027-02-01')).map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2027-01-08',
      '2027-01-11',
      '2027-01-12',
    ]);
  });

  it('keeps the local time across a daylight-saving change', () => {
    // 9:00 New York, daily, across the March 2027 change (Mar 14)
    const m = { ...base, startsAt: '2027-03-12T14:00:00.000Z', timezone: 'America/New_York', recurrence: 'DAILY' as const };
    const list = expandOccurrences(m, new Date('2027-03-12'), new Date('2027-03-16'));
    expect(list.map((d) => d.toISOString())).toEqual([
      '2027-03-12T14:00:00.000Z',
      '2027-03-13T14:00:00.000Z',
      '2027-03-14T13:00:00.000Z',
      '2027-03-15T13:00:00.000Z',
    ]);
  });

  it('finds the occurrence you can join right now', () => {
    const m = { ...base, startsAt: '2027-01-04T01:00:00.000Z', timezone: 'Asia/Manila', recurrence: 'WEEKLY' as const };
    const early = 15 * 60_000;
    const late = 60 * 60_000;
    expect(currentOccurrence(m, new Date('2027-01-11T00:50:00Z'), early, late)?.toISOString()).toBe('2027-01-11T01:00:00.000Z');
    expect(currentOccurrence(m, new Date('2027-01-11T00:40:00Z'), early, late)).toBeNull();
    expect(currentOccurrence(m, new Date('2027-01-11T02:20:00Z'), early, late)?.toISOString()).toBe('2027-01-11T01:00:00.000Z');
    expect(currentOccurrence(m, new Date('2027-01-11T02:40:00Z'), early, late)).toBeNull();
  });
});

describe('buildIcs', () => {
  const event = {
    uid: 'abc@virtual-office',
    sequence: 2,
    title: 'Team weekly; planning, notes',
    description: 'Line one\nLine two',
    url: 'https://example.test/meetings?open=abc',
    startsAt: new Date('2027-01-04T01:00:00Z'),
    durationMinutes: 30,
    timezone: 'Asia/Manila',
    recurrence: 'WEEKLY' as const,
    recurrenceUntil: '2027-01-18',
    organizer: { name: 'Jose Reyes', email: 'manager@acme.test' },
    attendees: [{ name: 'Ana Cruz', email: 'employee@acme.test', response: 'ACCEPTED' as const }],
    cancelled: false,
    location: 'Huddle room',
    updatedAt: new Date('2026-12-01T00:00:00Z'),
  };

  it('writes a valid calendar invite with local time, repeat and reminder', () => {
    const ics = buildIcs([event], 'REQUEST');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('DTSTART;TZID=Asia/Manila:20270104T090000');
    expect(ics).toMatch(/RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20270118T\d{6}Z/);
    expect(ics).toContain('SEQUENCE:2');
    expect(ics).toContain('SUMMARY:Team weekly\\; planning\\, notes');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('PARTSTAT=ACCEPTED');
    // lines are folded at 75 octets
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it('marks cancellations', () => {
    const ics = buildIcs([{ ...event, cancelled: true }], 'CANCEL');
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
  });
});

describe('status in a call', () => {
  it('a call shows as In a meeting, but a manual Busy or a break wins', () => {
    const i = { connected: true, onClockBreak: false, manual: null, roomKind: 'DEPARTMENT' as const, idle: false, inCall: true };
    expect(deriveStatus(i)).toBe('IN_MEETING');
    expect(deriveStatus({ ...i, manual: 'BUSY' })).toBe('BUSY');
    expect(deriveStatus({ ...i, onClockBreak: true })).toBe('ON_BREAK');
    expect(deriveStatus({ ...i, connected: false })).toBe('OFFLINE');
  });
});
