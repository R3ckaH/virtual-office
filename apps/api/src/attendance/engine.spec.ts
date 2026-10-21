import { addDays, DEFAULT_RULES, zonedToUtc } from '@vo/shared';
import { allowedActions, assignWorkDate, computeDay, DayPlan, EngineInput, EnginePunch } from './engine';

const TZ = 'Asia/Manila';
const D = '2026-10-01';
const at = (time: string, date = D) => zonedToUtc(date, time, TZ);
const shift = (start: string, end: string, date = D): DayPlan => {
  const s = at(start, date);
  let e = at(end, date);
  if (e <= s) e = at(end, addDays(date, 1));
  return { kind: 'WORK', shift: { start: s, end: e } };
};
let n = 0;
const p = (time: string, source: EnginePunch['source'] = 'DEVICE', kind: EnginePunch['kind'] = null, date = D): EnginePunch => ({
  id: `p${String(++n).padStart(3, '0')}`,
  at: at(time, date),
  source,
  kind,
  removed: false,
});
const run = (o: Partial<EngineInput> & { now: Date }) =>
  computeDay({
    plan: shift('08:00', '17:00'),
    onsite: true,
    punches: [],
    rules: DEFAULT_RULES,
    excused: false,
    preferSource: null,
    ...o,
  });
const types = (r: ReturnType<typeof computeDay>) => r.exceptions.map((e) => e.type).sort();

describe('attendance engine', () => {
  describe('before and without punches', () => {
    it('is "not started" before the shift', () => {
      expect(run({ now: at('07:30') }).status).toBe('SCHEDULED');
    });
    it('is "no punch yet" once the shift starts, and raises No punch only after 2 hours', () => {
      const early = run({ now: at('09:30') });
      expect(early.status).toBe('NO_PUNCH');
      expect(types(early)).toEqual([]);
      const later = run({ now: at('10:00') });
      expect(types(later)).toEqual(['NO_PUNCH']);
    });
    it('is absent after the shift ends', () => {
      expect(run({ now: at('18:00') }).status).toBe('ABSENT');
    });
    it('is off on an unscheduled day', () => {
      expect(run({ now: at('10:00'), plan: { kind: 'UNSCHEDULED' } }).status).toBe('OFF');
    });
    it('leave and day off are not flagged as no punch', () => {
      const r = run({ now: at('12:00'), plan: { kind: 'LEAVE' } });
      expect(r.status).toBe('LEAVE');
      expect(r.exceptions).toEqual([]);
      expect(run({ now: at('12:00'), plan: { kind: 'DAY_OFF' } }).status).toBe('DAY_OFF');
    });
  });

  describe('grace period and lateness', () => {
    it('8:03 is within the 5-minute grace (Ryan)', () => {
      const r = run({ now: at('10:24'), punches: [p('08:03')] });
      expect(r.status).toBe('ON_TIME');
      expect(r.lateMinutes).toBe(0);
    });
    it('8:05 exactly is still on time', () => {
      expect(run({ now: at('10:24'), punches: [p('08:05')] }).lateMinutes).toBe(0);
    });
    it('8:14 is 14 minutes late, counted from the start time (Liza)', () => {
      const r = run({ now: at('10:24'), punches: [p('08:14')] });
      expect(r.status).toBe('LATE');
      expect(r.lateMinutes).toBe(14);
      expect(types(r)).toEqual(['LATE']);
    });
    it('excused lateness keeps the minutes but shows Late, excused', () => {
      const r = run({ now: at('10:24'), punches: [p('08:14')], excused: true });
      expect(r.status).toBe('EXCUSED');
      expect(r.lateMinutes).toBe(14);
    });
    it('mid shift start: 10:21 for a 10:00 shift is 21 minutes late (Joy)', () => {
      const r = run({ now: at('10:24'), plan: shift('10:00', '19:00'), punches: [p('10:21')] });
      expect(r.lateMinutes).toBe(21);
    });
  });

  describe('duplicates, breaks and clock-out', () => {
    it('merges device punches within 2 minutes and keeps the first (Carlo)', () => {
      const a = p('07:49'),
        b = { ...p('07:49'), at: new Date(at('07:49').getTime() + 29_000) },
        c = { ...p('07:50'), at: new Date(at('07:50').getTime() + 5_000) };
      const r = run({ now: at('10:24'), punches: [a, b, c] });
      expect(r.status).toBe('ON_TIME');
      expect(r.firstIn).toEqual(a.at);
      expect(r.mergedIds.sort()).toEqual([b.id, c.id].sort());
      expect(r.roles.get(b.id)).toBe('MERGED');
      expect(types(r)).toEqual(['DUPLICATES']);
    });
    it('does not merge web punches (a quick break is intentional)', () => {
      const r = run({ now: at('10:24'), onsite: false, punches: [p('08:00', 'WEB', 'IN'), p('08:01', 'WEB', 'BREAK_START')] });
      expect(r.mergedIds).toEqual([]);
      expect(r.status).toBe('ON_BREAK');
    });
    it('a second device punch during the shift is a break (Grace)', () => {
      const r = run({ now: at('10:24'), punches: [p('07:58'), p('10:05')] });
      expect(r.status).toBe('ON_BREAK');
      expect(r.workedMinutes).toBe(127);
      expect(r.lastOut).toBeNull();
    });
    it('first punch in, last punch out, punches between are breaks', () => {
      const ps = [p('08:00'), p('12:00'), p('13:00'), p('17:02')];
      const r = run({ now: at('18:00'), punches: ps });
      expect(r.status).toBe('DONE');
      expect(r.workedMinutes).toBe(240 + 242);
      expect(r.breakMinutes).toBe(60);
      expect(r.lastOut).toEqual(ps[3].at);
      expect(ps.map((x) => r.roles.get(x.id))).toEqual(['IN', 'BREAK_START', 'BREAK_END', 'OUT']);
    });
    it('a web clock-out ends the day straight away', () => {
      const r = run({ now: at('16:00'), onsite: false, punches: [p('08:00', 'WEB', 'IN'), p('15:30', 'WEB', 'OUT')] });
      expect(r.status).toBe('DONE');
      expect(r.workedMinutes).toBe(450);
    });
    it('clocking out during a break ends the day without counting the break', () => {
      const out = p('13:00', 'WEB', 'OUT');
      const r = run({ now: at('13:01'), onsite: false, punches: [p('08:00', 'WEB', 'IN'), p('12:00', 'WEB', 'BREAK_START'), out] });
      expect(r.status).toBe('DONE');
      expect(r.workedMinutes).toBe(240);
      expect(r.lastOut).toEqual(out.at);
      expect(r.roles.get(out.id)).toBe('OUT');
    });
    it('ignores a second clock-in while already clocked in', () => {
      const second = p('09:00', 'WEB', 'IN');
      const r = run({ now: at('10:00'), onsite: false, punches: [p('08:00', 'WEB', 'IN'), second] });
      expect(r.roles.get(second.id)).toBe('NOT_USED');
      expect(r.openSince).toEqual(at('08:00'));
    });
    it('removed punches are ignored', () => {
      const x = { ...p('08:30'), removed: true };
      const r = run({ now: at('10:00'), punches: [x, p('07:59')] });
      expect(r.roles.get(x.id)).toBe('REMOVED');
      expect(r.lateMinutes).toBe(0);
    });
  });

  describe('missing clock-out and auto clock-out', () => {
    it('flags a missing clock-out 1 hour after shift end', () => {
      expect(run({ now: at('17:59'), punches: [p('08:00')] }).status).toBe('ON_TIME');
      const r = run({ now: at('18:00'), punches: [p('08:00')] });
      expect(r.status).toBe('MISSING_OUT');
      expect(types(r)).toEqual(['MISSING_OUT']);
      expect(r.autoClockOutAt).toBeNull();
    });
    it('asks for an auto clock-out at 14 hours, at the end of the shift', () => {
      const r = run({ now: at('22:00'), punches: [p('08:00')] });
      expect(r.autoClockOutAt).toEqual(at('17:00'));
    });
    it('after the auto clock-out the day is done but still flagged for HR', () => {
      const r = run({ now: at('22:30'), punches: [p('08:00'), p('17:00', 'SYSTEM', 'OUT')] });
      expect(r.status).toBe('DONE');
      expect(types(r)).toEqual(['MISSING_OUT']);
      expect(r.exceptions[0].data.auto).toBe(true);
    });
    it('overnight shift: Emily 9 PM to 6 AM is still fine at 6:30 AM, flagged at 7 AM', () => {
      const plan = shift('21:00', '06:00', '2026-09-30');
      const punches = [p('20:57', 'WEB', 'IN', '2026-09-30')];
      expect(run({ now: at('06:30'), plan, onsite: false, punches }).status).toBe('ON_TIME');
      const r = run({ now: at('10:24'), plan, onsite: false, punches });
      expect(r.status).toBe('MISSING_OUT');
      expect(r.autoClockOutAt).toBeNull(); // 13h27m in
      expect(run({ now: at('10:58'), plan, onsite: false, punches }).autoClockOutAt).toEqual(at('06:00'));
    });
  });

  describe('hybrid rule: web vs biometric', () => {
    const jose = () => [p('07:55', 'WEB', 'IN'), p('08:31')];
    it('flags a mismatch over 15 minutes on an on-site day and uses the biometric time meanwhile', () => {
      const r = run({ now: at('10:24'), punches: jose() });
      expect(r.status).toBe('MISMATCH');
      expect(r.firstIn).toEqual(at('08:31'));
      expect(types(r)).toEqual(['LATE', 'MISMATCH']);
    });
    it('HR picks the biometric time: 31 minutes late', () => {
      const r = run({ now: at('10:24'), punches: jose(), preferSource: 'DEVICE' });
      expect(r.status).toBe('LATE');
      expect(r.lateMinutes).toBe(31);
    });
    it('HR keeps the web time: on time', () => {
      const r = run({ now: at('10:24'), punches: jose(), preferSource: 'WEB' });
      expect(r.status).toBe('ON_TIME');
      expect(r.firstIn).toEqual(at('07:55'));
    });
    it('within 15 minutes is not a mismatch, and the biometric time still counts', () => {
      const r = run({ now: at('10:24'), punches: [p('07:50', 'WEB', 'IN'), p('08:02')] });
      expect(r.status).toBe('ON_TIME');
      expect(r.firstIn).toEqual(at('08:02'));
      expect(types(r)).toEqual([]);
    });
    it('remote days never flag a mismatch', () => {
      const r = run({ now: at('10:24'), onsite: false, punches: jose() });
      expect(r.status).toBe('ON_TIME');
      expect(r.firstIn).toEqual(at('07:55'));
    });
  });

  describe('web clock actions', () => {
    it('offers clock in, then break/out, then back/out', () => {
      expect(allowedActions(null, false)).toEqual(['IN']);
      const working = run({ now: at('09:00'), onsite: false, punches: [p('08:00', 'WEB', 'IN')] });
      expect(allowedActions(working, true)).toEqual(['BREAK_START', 'OUT']);
      const onBreak = run({ now: at('12:10'), onsite: false, punches: [p('08:00', 'WEB', 'IN'), p('12:00', 'WEB', 'BREAK_START')] });
      expect(allowedActions(onBreak, true)).toEqual(['BREAK_END', 'OUT']);
    });
  });

  describe('work date of a punch', () => {
    const rules = DEFAULT_RULES;
    const emilyShift = (date: string) => (shift('21:00', '06:00', date) as { shift: { start: Date; end: Date } }).shift;
    it('a 6:05 AM clock-out belongs to last night’s overnight shift', () => {
      expect(
        assignWorkDate({ at: at('06:05'), date: D, prevDate: '2026-09-30', prevShift: emilyShift('2026-09-30'), prevOpenFirstIn: null, todayShift: emilyShift(D), rules }),
      ).toBe('2026-09-30');
    });
    it('a 9 PM clock-in belongs to today', () => {
      expect(
        assignWorkDate({ at: at('20:58'), date: D, prevDate: '2026-09-30', prevShift: emilyShift('2026-09-30'), prevOpenFirstIn: null, todayShift: emilyShift(D), rules }),
      ).toBe(D);
    });
    it('still clocked in from yesterday evening → yesterday', () => {
      expect(
        assignWorkDate({ at: at('00:30'), date: D, prevDate: '2026-09-30', prevShift: null, prevOpenFirstIn: at('17:00', '2026-09-30'), todayShift: null, rules }),
      ).toBe('2026-09-30');
    });
    it('a normal morning punch is today', () => {
      const day = (shift('08:00', '17:00', '2026-09-30') as { shift: { start: Date; end: Date } }).shift;
      expect(assignWorkDate({ at: at('07:52'), date: D, prevDate: '2026-09-30', prevShift: day, prevOpenFirstIn: null, todayShift: day, rules })).toBe(D);
    });
  });
});
