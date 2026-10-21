import type { BoardDto, BoardRowDto, DayDetailDto, LivePunchDto } from '@vo/shared';
import { FLAGGED_STATUSES, WORK_SETUP_LABELS, WORKING_STATUSES } from '@vo/shared';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef } from 'react';
import { EmptyState, Spinner } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { api, qs } from '@/lib/api';
import { clock, dayName, hm, liveMinutes, SetupTag, SourceIcon, StatusChip, todayIn, useNow } from './parts';

export type BoardFilter = 'all' | 'onsite' | 'remote' | 'flagged';

export function filterRows(rows: BoardRowDto[], f: BoardFilter) {
  if (f === 'onsite') return rows.filter((r) => r.workSetup !== 'REMOTE');
  if (f === 'remote') return rows.filter((r) => r.workSetup !== 'ONSITE');
  if (f === 'flagged') return rows.filter((r) => r.day && FLAGGED_STATUSES.includes(r.day.status));
  return rows;
}

export function Kpis({ board, onReview, today = true }: { board: BoardDto; onReview?: () => void; today?: boolean }) {
  const k = board.kpis;
  const tiles: { label: string; value: number; sub: ReactNode; tone?: string }[] = [
    { label: today ? 'Working now' : 'Still clocked in', value: k.working, sub: `${k.onsite} on-site, ${k.remote} remote` },
    { label: today ? 'Late today' : 'Late', value: k.late, sub: 'After the grace period', tone: k.late ? 'text-warn' : undefined },
    { label: today ? 'No punch yet' : 'No punch', value: k.noPunch, sub: 'Scheduled, not clocked in', tone: k.noPunch ? 'text-danger' : undefined },
    { label: 'On leave', value: k.onLeave, sub: 'Not counted as absent' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-card border border-line bg-surface px-4 py-3.5">
          <p className="text-sm text-muted">{t.label}</p>
          <p className={clsx('tabular mt-1 text-3xl font-semibold', t.tone)}>{t.value}</p>
          <p className="mt-0.5 text-xs text-muted">{t.sub}</p>
        </div>
      ))}
      {onReview && (
        <div className={clsx('col-span-2 rounded-card border px-4 py-3.5 lg:col-span-1', k.openExceptions ? 'border-danger/30 bg-danger/5' : 'border-line bg-surface')}>
          <p className="text-sm text-muted">Needs attention</p>
          <p className={clsx('tabular mt-1 text-3xl font-semibold', k.openExceptions && 'text-danger')}>{k.openExceptions}</p>
          <button type="button" onClick={onReview} className="mt-0.5 text-xs font-semibold text-brand-fg hover:underline">
            Review exceptions
          </button>
        </div>
      )}
    </div>
  );
}

export function LiveStrip({ punches, tz }: { punches: LivePunchDto[]; tz: string }) {
  if (!punches.length) return null;
  return (
    <section aria-label="Live punches" className="rounded-card border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-2 pb-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
        </span>
        <h2 className="text-sm font-semibold">Live punches</h2>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {punches.slice(0, 4).map((p) => (
          <li key={p.id} className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-sunken/70 px-3 py-2">
            <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
              <SourceIcon source={p.source} /> {p.name}
            </span>
            <span className="truncate text-xs text-muted">
              {p.what}, {clock(p.at, tz)}
              {p.where ? `, ${p.where}` : ''}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function BoardTable({ rows, tz, selected, onPick }: { rows: BoardRowDto[]; tz: string; selected?: string | null; onPick: (r: BoardRowDto) => void }) {
  const now = useNow(30_000);
  if (!rows.length) return <EmptyState title="Nobody here">Try another filter.</EmptyState>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-muted">
            <th className="px-5 pb-2 font-medium">Person</th>
            <th className="px-2 pb-2 font-medium">Setup</th>
            <th className="px-2 pb-2 font-medium">Schedule</th>
            <th className="px-2 pb-2 font-medium">In</th>
            <th className="px-2 pb-2 font-medium">Out</th>
            <th className="px-2 pb-2 text-right font-medium">Hours</th>
            <th className="px-2 pb-2 font-medium">Status</th>
            <th className="px-5 pb-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.day;
            const working = d && WORKING_STATUSES.includes(d.status);
            return (
              <tr key={r.user.id} className={clsx('border-t border-line', selected === r.user.id && 'bg-brand/5')}>
                <td className="px-5 py-2.5">
                  <button type="button" onClick={() => onPick(r)} className="flex items-center gap-3 text-left" aria-label={`Open ${r.user.fullName}'s day`}>
                    <Avatar name={r.user.fullName} src={r.user.avatarUrl} size="sm" />
                    <span className="min-w-0">
                      <span className="block font-semibold hover:underline">{r.user.fullName}</span>
                      <span className="block truncate text-xs text-muted">{r.user.title ?? r.user.departmentName}</span>
                    </span>
                  </button>
                </td>
                <td className="px-2">
                  <SetupTag setup={r.workSetup} />
                </td>
                <td className="tabular whitespace-nowrap px-2 text-muted">{d?.scheduleStart ? `${clock(d.scheduleStart, tz)} – ${clock(d.scheduleEnd, tz)}` : (r.scheduleLabel ?? '—')}</td>
                <td className="tabular whitespace-nowrap px-2">
                  <span className="inline-flex items-center gap-1.5">
                    {r.inSource && <SourceIcon source={r.inSource} />}
                    {clock(d?.firstIn, tz)}
                    {r.bothSources && <span className="sr-only">(web and biometric)</span>}
                  </span>
                </td>
                <td className="tabular whitespace-nowrap px-2">{clock(d?.lastOut, tz)}</td>
                <td className="tabular whitespace-nowrap px-2 text-right">{d && (d.firstIn || d.workedMinutes) ? hm(working ? liveMinutes(d, now) : d.workedMinutes) : '—'}</td>
                <td className="px-2">{d ? <StatusChip day={d} /> : '—'}</td>
                <td className="px-5 text-xs text-muted">{r.note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Slide-over panel on the right (a native <dialog>, so focus and Esc work). */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-y-0 left-auto right-0 m-0 h-full max-h-full w-full max-w-md border-l border-line bg-surface p-0 text-ink shadow-2xl"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 id={titleId} className="text-sm font-semibold text-muted">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** One person's day: punches with where they came from, and the last five days' hours. */
export function PersonDay({ detailPath, tz }: { detailPath: string; tz: string }) {
  const now = useNow(30_000);
  const q = useQuery({ queryKey: ['person-day', detailPath], queryFn: () => api<DayDetailDto>(detailPath), refetchInterval: 30_000 });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <p className="text-sm text-danger">Couldn’t load this day.</p>;
  const d = q.data;
  const shown = d.punches;
  const max = Math.max(600, ...d.week.map((w) => w.workedMinutes));
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={d.user.fullName} src={d.user.avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="text-lg font-semibold">{d.user.fullName}</p>
          <p className="text-sm text-muted">{d.user.title ?? d.user.departmentName}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {d.day && <StatusChip day={d.day} />}
            <span className="text-xs text-muted">
              {WORK_SETUP_LABELS[d.workSetup]}, {d.day?.scheduleStart ? `${clock(d.day.scheduleStart, tz)} – ${clock(d.day.scheduleEnd, tz)}` : (d.scheduleLabel ?? 'no shift')}
            </span>
          </div>
        </div>
      </div>

      <section aria-labelledby="punches-h">
        <h3 id="punches-h" className="mb-2 text-sm font-semibold">
          Punches, {dayName(d.day?.workDate ?? d.week[d.week.length - 1].date)}
        </h3>
        {shown.length ? (
          <ol className="space-y-2">
            {shown.map((p) => (
              <li key={p.id} className={clsx('flex gap-3 rounded-lg border border-line px-3 py-2', (p.role === 'REMOVED' || p.role === 'MERGED' || p.role === 'NOT_USED') && 'opacity-60')}>
                <SourceIcon source={p.source} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className={clsx('tabular font-semibold', p.role === 'REMOVED' && 'line-through')}>{clock(p.at, tz)}</span> {ROLE[p.role]}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {[p.location, p.verify, p.note].filter(Boolean).join(' · ') || (p.source === 'WEB' ? 'Virtual Office' : '')}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">{d.leaveNote ?? 'No punches yet.'}</p>
        )}
      </section>

      <section aria-labelledby="week-h">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 id="week-h" className="text-sm font-semibold">
            Hours, last 5 days
          </h3>
          {d.day && (
            <span className="tabular text-sm text-muted">
              {hm(liveMinutes(d.day, now))} {d.day.workDate === todayIn(tz) ? 'today' : `on ${dayName(d.day.workDate, { weekday: 'long' })}`}
            </span>
          )}
        </div>
        <ol className="flex h-28 items-end gap-3" aria-label="Hours per day">
          {d.week.map((w, i) => {
            const mins = i === d.week.length - 1 && d.day ? liveMinutes(d.day, now) : w.workedMinutes;
            return (
              <li key={w.date} className="flex flex-1 flex-col items-center gap-1">
                <span className="tabular text-2xs text-muted">{mins ? `${(mins / 60).toFixed(1)}h` : 'Off'}</span>
                <span
                  className={clsx('w-full rounded-t', i === d.week.length - 1 ? 'bg-brand' : mins ? 'bg-brand/35' : 'bg-line')}
                  style={{ height: `${Math.max(3, Math.round((mins / max) * 72))}px` }}
                  aria-hidden
                />
                <span className="text-2xs text-muted">{dayName(w.date, { weekday: 'short' })}</span>
              </li>
            );
          })}
        </ol>
      </section>
      {d.day?.note && (
        <p className="rounded-lg bg-sunken px-3 py-2 text-sm">
          <span className="font-semibold">Note:</span> {d.day.note}
        </p>
      )}
    </div>
  );
}

const ROLE: Record<string, string> = {
  IN: 'Clock in',
  OUT: 'Clock out',
  BREAK_START: 'Break out',
  BREAK_END: 'Back from break',
  MERGED: 'Duplicate (merged)',
  NOT_USED: 'Not counted',
  REMOVED: 'Removed',
};

export const boardPath = (base: string, date?: string) => `${base}${qs({ date })}`;
