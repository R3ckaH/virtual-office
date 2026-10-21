/** Small building blocks shared by the attendance screens. */
import type { AttendanceDayDto, DayStatus, PunchSource, WorkSetup } from '@vo/shared';
import { DAY_STATUS_LABELS, localDate, WORK_SETUP_LABELS, zonedToUtc } from '@vo/shared';
import { clsx } from 'clsx';
import { Fingerprint, Laptop, ShieldCheck, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';

const STATUS_TONE: Record<DayStatus, string> = {
  ON_TIME: 'bg-ok/10 text-ok',
  WORKING: 'bg-ok/10 text-ok',
  LATE: 'bg-warn/10 text-warn',
  EXCUSED: 'bg-sunken text-muted',
  ON_BREAK: 'bg-warn/10 text-warn',
  NO_PUNCH: 'bg-danger/10 text-danger',
  MISSING_OUT: 'bg-danger/10 text-danger',
  ABSENT: 'bg-danger/10 text-danger',
  MISMATCH: 'bg-violet-100 text-violet-900 dark:bg-violet-400/15 dark:text-violet-300',
  DONE: 'bg-sunken text-muted',
  LEAVE: 'bg-brand/10 text-brand-fg',
  DAY_OFF: 'bg-sunken text-muted',
  OFF: 'bg-sunken text-muted',
  SCHEDULED: 'bg-sunken text-muted',
};

export function StatusChip({ day, status }: { day?: AttendanceDayDto | null; status?: DayStatus }) {
  const s = status ?? day?.status ?? 'OFF';
  const late = day && (s === 'LATE' || s === 'EXCUSED') && day.lateMinutes ? ` ${day.lateMinutes}m` : '';
  return (
    <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', STATUS_TONE[s])}>
      {DAY_STATUS_LABELS[s]}
      {late}
    </span>
  );
}

const SETUP_TONE: Record<WorkSetup, string> = {
  ONSITE: 'text-[#1F3A5F] ring-[#1F3A5F]/35 dark:text-sky-300 dark:ring-sky-300/40',
  REMOTE: 'text-teal-700 ring-teal-700/35 dark:text-teal-300 dark:ring-teal-300/40',
  HYBRID: 'text-violet-700 ring-violet-700/35 dark:text-violet-300 dark:ring-violet-300/40',
};

export function SetupTag({ setup }: { setup: WorkSetup }) {
  return (
    <span className={clsx('inline-flex h-[22px] items-center rounded-md px-2 text-xs font-semibold ring-1 ring-inset', SETUP_TONE[setup])}>
      {WORK_SETUP_LABELS[setup]}
    </span>
  );
}

const SOURCE: Record<PunchSource, { icon: typeof Fingerprint; label: string }> = {
  DEVICE: { icon: Fingerprint, label: 'Biometric punch' },
  WEB: { icon: Laptop, label: 'Virtual Office clock-in' },
  HR: { icon: ShieldCheck, label: 'Set by HR' },
  SYSTEM: { icon: Timer, label: 'Automatic clock-out' },
};

export function SourceIcon({ source, className }: { source: PunchSource; className?: string }) {
  const s = SOURCE[source];
  return <s.icon className={clsx('h-3.5 w-3.5 shrink-0 text-muted', className)} aria-label={s.label} role="img" />;
}

export const sourceLabel = (s: PunchSource) => SOURCE[s].label;

/** Re-renders every `ms` so live counters tick. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Minutes worked including the segment running right now. */
export function liveMinutes(day: AttendanceDayDto | null | undefined, now: Date): number {
  if (!day) return 0;
  const open = day.openSince ? Math.max(0, (now.getTime() - new Date(day.openSince).getTime()) / 60_000) : 0;
  return day.workedMinutes + open;
}

/** 127 → '2h 07m' */
export function hm(mins: number): string {
  const m = Math.floor(mins);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** 127.5 → '2:07:30' */
export function hms(mins: number): string {
  const s = Math.floor(mins * 60);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** '8:12 AM' in a time zone */
export function clock(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** 'Thu, Oct 1' from 'YYYY-MM-DD' */
export function dayName(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Today's date ('YYYY-MM-DD') in a time zone. */
export const todayIn = (tz: string, now = new Date()) => localDate(now, tz);

/** A 'YYYY-MM-DD' + 'HH:MM' wall time in a zone → ISO string (for HR edits). */
export const wallToIso = (date: string, time: string, tz: string) => zonedToUtc(date, time, tz).toISOString();

/** 'HH:MM' of an ISO time in a zone (for prefilling time inputs). */
export function wallTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** The local calendar date of an ISO instant in a zone. */
export function dateOf(iso: string, tz: string): string {
  return todayIn(tz, new Date(iso));
}

export function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-4 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <SourceIcon source="DEVICE" /> Biometric punch
      </span>
      <span className="inline-flex items-center gap-1.5">
        <SourceIcon source="WEB" /> Virtual Office clock-in
      </span>
      <span className="inline-flex items-center gap-1.5">
        <SourceIcon source="HR" /> Set by HR
      </span>
    </p>
  );
}
