/** Human-readable times for exception texts, emails and CSV export (always in the company's time zone). */
import { zonedParts } from '@vo/shared';

/** '8:12 AM' */
export function clockTime(at: Date, tz: string): string {
  const p = zonedParts(at, tz);
  const h = p.hour % 12 || 12;
  return `${h}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/** '08:00' → '8:00 AM' */
export function wallTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** '8:00 AM – 5:00 PM' */
export function shiftLabel(start: string, end: string): string {
  return `${wallTime(start)} – ${wallTime(end)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** '2026-09-29' → 'Tue, Sep 29' */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[(wd + 6) % 7]}, ${MONTHS[m - 1]} ${d}`;
}

/** 127 → '2h 07m' */
export function duration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Weekday ranges for a schedule: 'Mon–Fri 8:00 AM – 5:00 PM' */
export function scheduleLabel(days: { weekday: number; startTime: string; endTime: string }[]): string {
  if (days.length === 0) return 'No working days';
  const sorted = [...days].sort((a, b) => a.weekday - b.weekday);
  const groups: { from: number; to: number; label: string }[] = [];
  for (const d of sorted) {
    const label = shiftLabel(d.startTime, d.endTime);
    const g = groups[groups.length - 1];
    if (g && g.label === label && g.to === d.weekday - 1) g.to = d.weekday;
    else groups.push({ from: d.weekday, to: d.weekday, label });
  }
  return groups
    .map((g) => `${DAYS[g.from - 1]}${g.to !== g.from ? `–${DAYS[g.to - 1]}` : ''} ${g.label}`)
    .join(', ');
}
