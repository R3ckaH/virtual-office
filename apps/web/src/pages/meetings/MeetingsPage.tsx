import type { CalendarFeedDto, OccurrenceDto } from '@vo/shared';
import { addDays, isoWeekday, localDate, zonedToUtc } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, Link2, Plus, Repeat } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MeetingDetails } from '@/components/meetings/MeetingDetails';
import { ScheduleDialog } from '@/components/meetings/ScheduleDialog';
import { Alert, Button, Dialog, EmptyState, Input, PageHeader, Panel, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type View = 'week' | 'month' | 'list';
const VIEWS: { id: View; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'list', label: 'List' },
];

const VIEW_KEY = 'vo.meetings.view';
function savedView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'month' || v === 'list' ? v : 'week';
  } catch {
    return 'week';
  }
}

/** First and last calendar day shown for a view, plus the day used to step forward/back. */
function rangeOf(view: View, anchor: string): { first: string; last: string } {
  if (view === 'week') {
    const first = addDays(anchor, 1 - isoWeekday(anchor));
    return { first, last: addDays(first, 6) };
  }
  if (view === 'month') {
    const monthStart = `${anchor.slice(0, 8)}01`;
    const first = addDays(monthStart, 1 - isoWeekday(monthStart));
    return { first, last: addDays(first, 41) };
  }
  return { first: anchor, last: addDays(anchor, 29) };
}

function step(view: View, anchor: string, dir: 1 | -1): string {
  if (view === 'week') return addDays(anchor, 7 * dir);
  if (view === 'list') return addDays(anchor, 30 * dir);
  const [y, m] = anchor.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  return d.toISOString().slice(0, 10);
}

const dayName = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

export function MeetingsPage() {
  const { user, can } = useAuth();
  const tz = user!.timezone;
  const today = localDate(new Date(), tz);
  const [view, setViewState] = useState<View>(savedView);
  const [anchor, setAnchor] = useState(today);
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<{ id: string; start?: string } | null>(() => (params.get('open') ? { id: params.get('open')! } : null));
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const canSchedule = can('meetings.schedule');

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
  };

  useEffect(() => {
    if (params.get('open')) {
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const { first, last } = rangeOf(view, anchor);
  const from = zonedToUtc(first, '00:00', tz).toISOString();
  const to = zonedToUtc(addDays(last, 1), '00:00', tz).toISOString();
  const q = useQuery({
    queryKey: ['meetings', 'range', from, to],
    queryFn: () => api<OccurrenceDto[]>(`/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    refetchInterval: 60_000,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, OccurrenceDto[]>();
    for (const o of q.data ?? []) {
      const d = localDate(new Date(o.start), tz);
      map.set(d, [...(map.get(d) ?? []), o]);
    }
    return map;
  }, [q.data, tz]);

  const title =
    view === 'month'
      ? dayName(`${anchor.slice(0, 8)}15`, { month: 'long', year: 'numeric' })
      : `${dayName(first, { month: 'short', day: 'numeric' })} – ${dayName(last, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const openOcc = (o: OccurrenceDto) => setOpen({ id: o.meetingId, start: o.start });

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Your calendar. Join from here or from the reminder that pops up 10 minutes before. For a quick call, click someone on the office floor."
        actions={
          <>
            <Button variant="secondary" onClick={() => setFeedOpen(true)}>
              <Link2 className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Sync to my calendar</span>
            </Button>
            {canSchedule && (
              <Button onClick={() => setScheduling(today)}>
                <Plus className="h-4 w-4" aria-hidden /> Schedule
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => setAnchor(step(view, anchor, -1))} aria-label={`Previous ${view === 'list' ? '30 days' : view}`}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchor(today)}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchor(step(view, anchor, 1))} aria-label={`Next ${view === 'list' ? '30 days' : view}`}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="mr-auto text-base font-semibold" aria-live="polite">
          {title}
        </h2>
        <div role="radiogroup" aria-label="Calendar view" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={view === v.id}
              onClick={() => setView(v.id)}
              className={clsx('rounded-md px-3 py-1 text-sm font-medium', view === v.id ? 'bg-brand text-white' : 'text-muted hover:text-ink')}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {q.isError ? (
        <Alert>{q.error instanceof ApiError ? q.error.message : 'Couldn’t load your meetings.'}</Alert>
      ) : q.isLoading ? (
        <Spinner />
      ) : view === 'week' ? (
        <WeekView first={first} today={today} byDay={byDay} tz={tz} onOpen={openOcc} onAdd={canSchedule ? setScheduling : undefined} />
      ) : view === 'month' ? (
        <MonthView first={first} month={anchor.slice(0, 7)} today={today} byDay={byDay} tz={tz} onOpen={openOcc} onAdd={canSchedule ? setScheduling : undefined} />
      ) : (
        <ListView first={first} last={last} today={today} byDay={byDay} tz={tz} onOpen={openOcc} canSchedule={canSchedule} onSchedule={() => setScheduling(today)} />
      )}

      <MeetingDetails meetingId={open?.id ?? null} occurrence={open?.start} onClose={() => setOpen(null)} />
      <ScheduleDialog open={scheduling !== null} defaultDate={scheduling ?? undefined} onClose={() => setScheduling(null)} onSaved={(m) => setOpen({ id: m.id })} />
      <FeedDialog open={feedOpen} onClose={() => setFeedOpen(false)} />
    </>
  );
}

interface ViewProps {
  today: string;
  byDay: Map<string, OccurrenceDto[]>;
  tz: string;
  onOpen: (o: OccurrenceDto) => void;
}

const time = (iso: string, tz: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

function Chip({ o, tz, onOpen, compact }: { o: OccurrenceDto; tz: string; onOpen: (o: OccurrenceDto) => void; compact?: boolean }) {
  const now = Date.now();
  const past = Date.parse(o.end) < now;
  const declined = o.myResponse === 'DECLINED';
  const reply = o.myResponse === 'PENDING' ? 'needs your reply' : o.myResponse === 'TENTATIVE' ? 'maybe' : declined ? 'not going' : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(o)}
      className={clsx(
        'group block w-full rounded-md border-l-[3px] px-2 text-left text-xs transition-colors',
        compact ? 'py-0.5' : 'py-1.5',
        o.myResponse === 'PENDING' ? 'border-dashed border-brand bg-surface ring-1 ring-inset ring-brand/30' : 'border-brand bg-brand/10 hover:bg-brand/15',
        (past || declined) && 'opacity-60',
        declined && 'line-through',
      )}
      aria-label={`${o.title}, ${time(o.start, tz)} to ${time(o.end, tz)}${reply ? `, ${reply}` : ''}${o.liveCount ? `, ${o.liveCount} in the call now` : ''}`}
    >
      <span className="flex items-center gap-1">
        {o.liveCount > 0 && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-ok" aria-hidden />}
        <span className="tabular text-muted">{time(o.start, tz)}</span>
        {o.recurrence !== 'NONE' && <Repeat className="h-3 w-3 shrink-0 text-muted" aria-hidden />}
      </span>
      <span className={clsx('block truncate font-medium text-ink', compact && 'hidden sm:block')}>{o.title}</span>
    </button>
  );
}

function WeekView({ first, onAdd, ...p }: ViewProps & { first: string; onAdd?: (d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {days.map((d) => {
        const list = p.byDay.get(d) ?? [];
        const isToday = d === p.today;
        return (
          <section key={d} aria-label={dayName(d, { weekday: 'long', month: 'long', day: 'numeric' })} className={clsx('flex min-h-[9rem] flex-col rounded-card border bg-surface p-2', isToday ? 'border-brand' : 'border-line')}>
            <header className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium uppercase text-muted">{dayName(d, { weekday: 'short' })}</span>
              <span className={clsx('flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular', isToday && 'bg-brand text-white')}>{Number(d.slice(8))}</span>
            </header>
            <div className="flex-1 space-y-1.5">
              {list.map((o) => (
                <Chip key={`${o.meetingId}${o.start}`} o={o} tz={p.tz} onOpen={p.onOpen} />
              ))}
            </div>
            {onAdd && d >= p.today && (
              <button type="button" onClick={() => onAdd(d)} className="mt-1 rounded-md py-1 text-xs text-muted hover:bg-sunken hover:text-ink" aria-label={`Schedule on ${dayName(d, { weekday: 'long', month: 'long', day: 'numeric' })}`}>
                + Add
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function MonthView({ first, month, onAdd, ...p }: ViewProps & { first: string; month: string; onAdd?: (d: string) => void }) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line bg-sunken/60 text-center text-xs font-medium text-muted" aria-hidden>
        {days.slice(0, 7).map((d) => (
          <div key={d} className="py-2">
            {dayName(d, { weekday: 'short' })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = p.byDay.get(d) ?? [];
          const inMonth = d.startsWith(month);
          return (
            <div
              key={d}
              className={clsx('min-h-[5.5rem] border-b border-r border-line p-1 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-sunken/40')}
              onDoubleClick={() => onAdd && d >= p.today && onAdd(d)}
            >
              <span className={clsx('mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs tabular', d === p.today ? 'bg-brand font-semibold text-white' : inMonth ? 'text-ink' : 'text-muted')}>
                {Number(d.slice(8))}
              </span>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((o) => (
                  <Chip key={`${o.meetingId}${o.start}`} o={o} tz={p.tz} onOpen={p.onOpen} compact />
                ))}
                {list.length > 3 && <p className="px-1 text-2xs text-muted">+{list.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ first, last, canSchedule, onSchedule, ...p }: ViewProps & { first: string; last: string; canSchedule: boolean; onSchedule: () => void }) {
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) if (p.byDay.has(d)) days.push(d);
  if (!days.length) {
    return (
      <EmptyState title="Nothing on your calendar for the next 30 days">
        {canSchedule ? (
          <Button className="mt-3" onClick={onSchedule}>
            <CalendarPlus className="h-4 w-4" aria-hidden /> Schedule a meeting
          </Button>
        ) : (
          'Meetings you’re invited to show up here.'
        )}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      {days.map((d) => (
        <Panel key={d} title={d === p.today ? `Today · ${dayName(d, { weekday: 'long', month: 'long', day: 'numeric' })}` : dayName(d, { weekday: 'long', month: 'long', day: 'numeric' })}>
          <ul className="divide-y divide-line">
            {p.byDay.get(d)!.map((o) => (
              <li key={`${o.meetingId}${o.start}`}>
                <button type="button" onClick={() => p.onOpen(o)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-left hover:bg-sunken/50">
                  <span className="w-32 shrink-0 text-sm tabular text-muted">
                    {time(o.start, p.tz)} – {time(o.end, p.tz)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.title}</span>
                    <span className="text-xs text-muted">
                      {o.isHost ? 'You’re hosting' : `Host: ${o.hostName}`} · {o.inviteeCount} invited
                      {o.recurrence !== 'NONE' && ' · repeats'}
                    </span>
                  </span>
                  {o.liveCount > 0 && <span className="text-xs font-medium text-ok">{o.liveCount} in the call</span>}
                  {o.myResponse === 'PENDING' && <span className="text-xs font-medium text-brand-fg">Reply needed</span>}
                  {o.myResponse === 'DECLINED' && <span className="text-xs text-muted">Not going</span>}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

/** Your private calendar link: add it once in Google Calendar or Outlook and meetings appear there on their own. */
function FeedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const feed = useQuery({ queryKey: ['calendar-feed'], queryFn: () => api<CalendarFeedDto | undefined>('/me/calendar-feed'), enabled: open });
  const reset = useMutation({
    mutationFn: () => api<CalendarFeedDto>('/me/calendar-feed', { method: 'POST' }),
    onSuccess: (d) => qc.setQueryData(['calendar-feed'], d),
    onError: () => toast('Couldn’t make the link. Try again.', 'danger'),
  });
  const url = feed.data && 'url' in feed.data ? feed.data.url : null;
  const copy = () => url && void navigator.clipboard?.writeText(url).then(() => toast('Link copied. Paste it into your calendar app.'));
  return (
    <Dialog open={open} onClose={onClose} title="Sync meetings to your calendar" description="Add this private link once, and meetings you’re invited to show up in Google Calendar or Outlook. Those apps check for changes every few hours; invite emails arrive right away." size="md">
      {feed.isLoading ? (
        <Spinner />
      ) : url ? (
        <div className="space-y-4 text-sm">
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label="Your calendar link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button variant="secondary" onClick={copy} aria-label="Copy link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-muted">
            <li>
              <strong className="text-ink">Google Calendar:</strong> Other calendars → + → From URL → paste the link.
            </li>
            <li>
              <strong className="text-ink">Outlook:</strong> Add calendar → Subscribe from web → paste the link.
            </li>
          </ol>
          <Alert tone="warn">Treat this link like a password: anyone with it can see your meeting titles and times.</Alert>
          <Button variant="ghost" size="sm" loading={reset.isPending} onClick={() => reset.mutate()}>
            Make a new link (the old one stops working)
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p>You don’t have a calendar link yet.</p>
          <Button loading={reset.isPending} onClick={() => reset.mutate()} data-autofocus>
            Create my link
          </Button>
        </div>
      )}
    </Dialog>
  );
}
