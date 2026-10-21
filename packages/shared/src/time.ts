/**
 * Time zone helpers built on Intl (no extra libraries).
 * Dates are 'YYYY-MM-DD' strings, times are 'HH:MM' (or 'HH:MM:SS') wall-clock strings in a named zone.
 */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday: 1 = Monday ... 7 = Sunday */
  weekday: number;
}

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(at: Date, tz: string): ZonedParts {
  const p: Record<string, string> = {};
  for (const part of formatter(tz).formatToParts(at)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS[p.weekday] ?? 1,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar date ('YYYY-MM-DD') of an instant in a time zone. */
export function localDate(at: Date, tz: string): string {
  const p = zonedParts(at, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Wall-clock time 'HH:MM' of an instant in a time zone. */
export function localTime(at: Date, tz: string): string {
  const p = zonedParts(at, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

function offsetMs(at: Date, tz: string): number {
  const p = zonedParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `tz` shows `date` `time`.
 * For times skipped by a daylight-saving jump, returns the instant just after the jump.
 */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi, s = 0] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const off1 = offsetMs(new Date(guess), tz);
  let utc = guess - off1;
  const off2 = offsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

/** 'YYYY-MM-DD' plus n days. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** ISO weekday of a 'YYYY-MM-DD' date: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
