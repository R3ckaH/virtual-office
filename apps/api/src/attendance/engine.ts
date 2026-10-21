/**
 * Attendance rules as pure functions: punches + the day's plan + rules → the day's record and its exceptions.
 * No database access here, so every rule is unit-tested directly (engine.spec.ts).
 */
import type { AttendanceRules, DayStatus, ExceptionType, PunchDto, PunchKind, PunchSource } from '@vo/shared';

const MIN = 60_000;

export interface Shift {
  start: Date;
  end: Date;
}

export type DayPlan =
  | { kind: 'WORK'; shift: Shift }
  | { kind: 'LEAVE' | 'DAY_OFF'; note?: string | null }
  | { kind: 'UNSCHEDULED' };

export interface EnginePunch {
  id: string;
  at: Date;
  source: PunchSource;
  kind: PunchKind | null;
  removed: boolean;
}

export interface EngineInput {
  now: Date;
  plan: DayPlan;
  /** on-site day (On-site people always, Hybrid on their on-site weekdays) */
  onsite: boolean;
  punches: EnginePunch[];
  rules: AttendanceRules;
  excused: boolean;
  preferSource: 'WEB' | 'DEVICE' | null;
}

export type PunchRole = PunchDto['role'];

export interface DesiredException {
  type: ExceptionType;
  data: Record<string, unknown>;
}

export interface EngineResult {
  status: DayStatus;
  firstIn: Date | null;
  lastOut: Date | null;
  /** start of the segment being worked right now */
  openSince: Date | null;
  /** completed segments only; screens add (now - openSince) while open */
  workedMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  mergedIds: string[];
  roles: Map<string, PunchRole>;
  /** when set, the caller should add a SYSTEM clock-out at this time and recompute */
  autoClockOutAt: Date | null;
  exceptions: DesiredException[];
  /** the first web and first device punch times, when both exist */
  firstWebAt: Date | null;
  firstDeviceAt: Date | null;
}

const CLOSING: readonly (PunchKind | null)[] = ['OUT', 'BREAK_START'];
const OPENING: readonly (PunchKind | null)[] = ['IN', 'BREAK_END'];
const minutes = (ms: number) => Math.max(0, Math.floor(ms / MIN));

/** Device punches within the duplicate window of the previous kept punch are merged into it. */
export function mergeDuplicates(sorted: EnginePunch[], windowMinutes: number): { kept: EnginePunch[]; merged: EnginePunch[] } {
  const kept: EnginePunch[] = [];
  const merged: EnginePunch[] = [];
  for (const p of sorted) {
    const prev = kept[kept.length - 1];
    if (p.source === 'DEVICE' && prev && p.at.getTime() - prev.at.getTime() <= windowMinutes * MIN) merged.push(p);
    else kept.push(p);
  }
  return { kept, merged };
}

export function computeDay(input: EngineInput): EngineResult {
  const { now, plan, rules } = input;
  const roles = new Map<string, PunchRole>();
  const active = input.punches
    .filter((p) => {
      if (p.removed) roles.set(p.id, 'REMOVED');
      return !p.removed;
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));

  const { kept, merged } = mergeDuplicates(active, rules.duplicateWindowMinutes);
  for (const p of merged) roles.set(p.id, 'MERGED');

  // ---- hybrid rule: which clock-in counts when there is both a web and a device clock-in
  const firstWeb = kept.find((p) => p.source === 'WEB' && (p.kind === 'IN' || p.kind === null)) ?? null;
  const firstDevice = kept.find((p) => p.source === 'DEVICE') ?? null;
  const both = !!firstWeb && !!firstDevice;
  const mismatch = both && input.onsite && Math.abs(firstWeb!.at.getTime() - firstDevice!.at.getTime()) > rules.mismatchMinutes * MIN;
  // On-site days the biometric clock-in counts; otherwise the web clock-in does. HR can pick either.
  const choose = input.preferSource ?? (both ? (input.onsite && rules.deviceWinsOnsite ? 'DEVICE' : 'WEB') : null);
  let used = kept;
  if (both && choose === 'DEVICE') used = kept.filter((p) => p !== firstWeb);
  if (both && choose === 'WEB') used = kept.filter((p) => p !== firstDevice);
  for (const p of kept) if (!used.includes(p)) roles.set(p.id, 'NOT_USED');

  // ---- build work segments: punches alternate in/out; explicit kinds from the web clock steer it
  const segments: { start: EnginePunch; end: EnginePunch | null }[] = [];
  /** a clock-out pressed while on a break: ends the day, the break isn't counted as work */
  let outWhileClosed: EnginePunch | null = null;
  for (const p of used) {
    const open = segments.length > 0 && segments[segments.length - 1].end === null;
    if (open) {
      if (OPENING.includes(p.kind) && p.kind !== null) {
        roles.set(p.id, 'NOT_USED'); // e.g. a second clock-in while already in
        continue;
      }
      segments[segments.length - 1].end = p;
    } else {
      if (CLOSING.includes(p.kind) && p.kind !== null) {
        if (p.kind === 'OUT' && segments.length > 0) outWhileClosed = p;
        else roles.set(p.id, 'NOT_USED'); // a clock-out while not clocked in
        continue;
      }
      outWhileClosed = null;
      segments.push({ start: p, end: null });
    }
  }
  segments.forEach((s, i) => {
    roles.set(s.start.id, i === 0 ? 'IN' : 'BREAK_END');
    if (s.end) roles.set(s.end.id, 'BREAK_START');
  });

  const last = segments[segments.length - 1];
  const isOpen = !!last && last.end === null;
  const shift = plan.kind === 'WORK' ? plan.shift : null;
  const lastClose = last?.end ?? null;

  // Is the last closing punch the end of the day, or a break?
  let finished = false;
  if (lastClose) {
    if (lastClose.kind === 'OUT' || lastClose.source === 'SYSTEM' || lastClose.source === 'HR') finished = lastClose.kind !== 'BREAK_START';
    else if (lastClose.kind === 'BREAK_START') finished = false;
    else finished = !shift || now.getTime() >= shift.end.getTime(); // device punch: a break until the shift ends
  }
  if (lastClose && outWhileClosed) {
    finished = true;
    roles.set(outWhileClosed.id, 'OUT');
  } else if (lastClose && finished) roles.set(lastClose.id, 'OUT');

  const firstIn = segments[0]?.start.at ?? null;
  const workedMinutes = segments.reduce((sum, s) => sum + (s.end ? minutes(s.end.at.getTime() - s.start.at.getTime()) : 0), 0);
  let breakMinutes = 0;
  for (let i = 1; i < segments.length; i++) breakMinutes += minutes(segments[i].start.at.getTime() - segments[i - 1].end!.at.getTime());

  const lateMinutes =
    shift && firstIn && firstIn.getTime() > shift.start.getTime() + rules.graceMinutes * MIN
      ? minutes(firstIn.getTime() - shift.start.getTime())
      : 0;

  // ---- status
  let status: DayStatus;
  let autoClockOutAt: Date | null = null;
  const pastMissingOut = !!shift && now.getTime() >= shift.end.getTime() + rules.missingOutAfterMinutes * MIN;
  const unresolvedMismatch = mismatch && !input.preferSource;
  const lateStatus = (): DayStatus => (lateMinutes > 0 ? (input.excused ? 'EXCUSED' : 'LATE') : shift ? 'ON_TIME' : 'WORKING');

  if (plan.kind === 'LEAVE') status = 'LEAVE';
  else if (plan.kind === 'DAY_OFF') status = 'DAY_OFF';
  else if (segments.length === 0) {
    if (!shift) status = 'OFF';
    else if (now < shift.start) status = 'SCHEDULED';
    else if (now < shift.end) status = 'NO_PUNCH';
    else status = 'ABSENT';
  } else if (isOpen) {
    if (firstIn && now.getTime() >= firstIn.getTime() + rules.autoClockOutHours * 60 * MIN) {
      const lastAt = last.start.at.getTime();
      autoClockOutAt =
        shift && shift.end.getTime() > lastAt ? shift.end : new Date(firstIn.getTime() + rules.autoClockOutHours * 60 * MIN);
    }
    if (pastMissingOut) status = 'MISSING_OUT';
    else if (unresolvedMismatch) status = 'MISMATCH';
    else status = lateStatus();
  } else if (!finished) {
    status = pastMissingOut ? 'MISSING_OUT' : unresolvedMismatch ? 'MISMATCH' : 'ON_BREAK';
  } else {
    status = unresolvedMismatch ? 'MISMATCH' : 'DONE';
  }

  // ---- exceptions this day should have (the service raises new ones and closes ones that stopped applying)
  const exceptions: DesiredException[] = [];
  const working = plan.kind !== 'LEAVE' && plan.kind !== 'DAY_OFF';
  if (working && lateMinutes > 0) exceptions.push({ type: 'LATE', data: { lateMinutes, firstIn: firstIn!.toISOString() } });
  if (working && shift && segments.length === 0 && now.getTime() >= shift.start.getTime() + rules.noPunchAfterMinutes * MIN) {
    exceptions.push({ type: 'NO_PUNCH', data: {} });
  }
  const autoOut = !!lastClose && lastClose.source === 'SYSTEM';
  if (working && (status === 'MISSING_OUT' || autoOut || autoClockOutAt)) {
    exceptions.push({
      type: 'MISSING_OUT',
      data: { auto: autoOut || !!autoClockOutAt, firstIn: firstIn?.toISOString() ?? null, suggestedOut: shift?.end.toISOString() ?? null },
    });
  }
  if (working && mismatch) {
    exceptions.push({ type: 'MISMATCH', data: { webAt: firstWeb!.at.toISOString(), deviceAt: firstDevice!.at.toISOString() } });
  }
  if (merged.length > 0) exceptions.push({ type: 'DUPLICATES', data: { mergedCount: merged.length } });

  return {
    status,
    firstIn,
    lastOut: finished && lastClose ? (outWhileClosed ?? lastClose).at : null,
    openSince: isOpen ? last.start.at : null,
    workedMinutes,
    breakMinutes,
    lateMinutes,
    mergedIds: merged.map((p) => p.id),
    roles,
    autoClockOutAt,
    exceptions,
    firstWebAt: firstWeb?.at ?? null,
    firstDeviceAt: firstDevice?.at ?? null,
  };
}

/** Which punch actions the web clock offers in each state. */
export function allowedActions(r: Pick<EngineResult, 'status' | 'openSince' | 'lastOut'> | null, hasPunches: boolean): PunchKind[] {
  if (!r || !hasPunches) return ['IN'];
  if (r.openSince) return ['BREAK_START', 'OUT'];
  if (r.lastOut) return ['IN']; // came back after clocking out: a new segment
  return ['BREAK_END', 'OUT']; // on a break
}

export interface WorkDateContext {
  at: Date;
  /** calendar date of `at` in the schedule's time zone */
  date: string;
  prevDate: string;
  /** previous work date's shift, if any */
  prevShift: Shift | null;
  /** the previous day is still clocked in, since this time */
  prevOpenFirstIn: Date | null;
  todayShift: Shift | null;
  rules: AttendanceRules;
}

/**
 * Which work date a punch belongs to. A punch after midnight belongs to yesterday's shift when the person is
 * still clocked in from yesterday, or when yesterday's shift runs overnight and today's hasn't started.
 */
export function assignWorkDate(c: WorkDateContext): string {
  const t = c.at.getTime();
  if (c.prevOpenFirstIn && t - c.prevOpenFirstIn.getTime() < c.rules.autoClockOutHours * 60 * MIN) return c.prevDate;
  if (c.prevShift) {
    const endsToday = t <= c.prevShift.end.getTime() + c.rules.missingOutAfterMinutes * MIN && t >= c.prevShift.start.getTime();
    const beforeToday = !c.todayShift || t < c.todayShift.start.getTime() - 3 * 60 * MIN;
    if (endsToday && beforeToday) return c.prevDate;
  }
  return c.date;
}
