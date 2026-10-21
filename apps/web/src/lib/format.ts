/** All times arrive from the API in UTC (ISO strings) and are shown in the viewer's chosen time zone. */

export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatTime(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(diff, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/** "Manila", "New York" from an IANA zone. */
export function cityOf(timeZone: string): string {
  return timeZone.split('/').pop()!.replace(/_/g, ' ');
}

/** "GMT+8" style offset for a zone right now. */
export function offsetLabel(timeZone: string, date = new Date()): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? '';
}

let zones: string[] | null = null;
export function allTimeZones(): string[] {
  zones ??= typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC', 'Asia/Manila', 'America/New_York'];
  return zones;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Milliseconds a zone is ahead of UTC at a given instant. */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Start of a calendar day ("2026-09-29") in a time zone, as a UTC ISO string for the API. */
export function zonedDayStartIso(day: string, timeZone: string, addDays = 0): string {
  const [y, m, d] = day.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d + addDays));
  const first = guess.getTime() - zoneOffsetMs(timeZone, guess);
  // Re-check in case the offset changes across the day boundary (DST).
  const second = guess.getTime() - zoneOffsetMs(timeZone, new Date(first));
  return new Date(second).toISOString();
}
