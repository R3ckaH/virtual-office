import type { BoardDto, BoardRowDto, CorrectionDto, MyDayDto } from '@vo/shared';
import { addDays, isoWeekday } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { BoardTable, boardPath, Drawer, Kpis, PersonDay } from '@/components/attendance/board';
import { CorrectionCard, RequestCorrectionDialog } from '@/components/attendance/corrections';
import { clock, dayName, hm, Legend, liveMinutes, SourceIcon, StatusChip, todayIn, useNow } from '@/components/attendance/parts';
import { TimeClockCard } from '@/components/attendance/TimeClockCard';
import { Alert, Button, EmptyState, PageHeader, Panel, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Tab = 'mine' | 'team' | 'approvals';

export function AttendancePage() {
  const { can } = useAuth();
  const manager = can('team.read');
  const [tab, setTab] = useState<Tab>('mine');
  const approvals = useQuery({
    queryKey: ['team-corrections'],
    queryFn: () => api<CorrectionDto[]>('/team/corrections?status=PENDING_MANAGER'),
    enabled: manager,
  });
  return (
    <div className="space-y-5">
      <PageHeader title="Attendance" description="Your hours, punches and time corrections." />
      {manager && (
        <div role="tablist" aria-label="Attendance views" className="flex gap-6 border-b border-line">
          {(
            [
              ['mine', 'My time'],
              ['team', 'My team'],
              ['approvals', `Approvals${approvals.data?.length ? ` (${approvals.data.length})` : ''}`],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={clsx('-mb-px h-11 border-b-[3px] text-[15px] font-semibold', tab === id ? 'border-brand' : 'border-transparent text-muted hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'mine' && <MyTime />}
      {tab === 'team' && manager && <TeamView />}
      {tab === 'approvals' && manager && <Approvals list={approvals.data} loading={approvals.isLoading} />}
    </div>
  );
}

/** Monday of the week containing `date`. */
const weekStart = (date: string) => addDays(date, 1 - isoWeekday(date));

function MyTime() {
  const { user } = useAuth();
  const tz = user!.timezone;
  const today = todayIn(tz);
  const [from, setFrom] = useState(() => weekStart(today));
  const to = addDays(from, 6);
  const now = useNow(30_000);
  const [fixing, setFixing] = useState<MyDayDto | null>(null);
  const days = useQuery({
    queryKey: ['my-attendance', from],
    queryFn: () => api<MyDayDto[]>(`/me/attendance${qs({ from, to: to > today ? today : to })}`),
    enabled: from <= today,
  });
  const requests = useQuery({ queryKey: ['my-corrections'], queryFn: () => api<CorrectionDto[]>('/me/corrections') });
  const qc = useQueryClient();
  const toast = useToast();
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/me/corrections/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast('Request cancelled');
      void qc.invalidateQueries({ queryKey: ['my-corrections'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'That didn’t work', 'danger'),
  });
  const total = (days.data ?? []).reduce((s, d) => s + (d.day ? (d.date === today ? liveMinutes(d.day, now) : d.day.workedMinutes) : 0), 0);
  const pending = (requests.data ?? []).filter((r) => r.status === 'PENDING_MANAGER' || r.status === 'PENDING_HR');
  const past = (requests.data ?? []).filter((r) => !pending.includes(r)).slice(0, 6);

  return (
    <div className="space-y-6">
      <TimeClockCard showLink={false} />
      <Panel
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>
              Week of {dayName(from, { month: 'long', day: 'numeric' })}
            </span>
            <span className="tabular text-sm font-normal text-muted">{hm(total)} worked</span>
          </span>
        }
        action={
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => setFrom(addDays(from, -7))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setFrom(addDays(from, 7))} disabled={addDays(from, 7) > today} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      >
        {days.isLoading && <Spinner />}
        {days.isError && <Alert>Couldn’t load your week.</Alert>}
        {days.data && (
          <ul className="-my-2 divide-y divide-line">
            {days.data.map((d) => {
              const shown = d.punches.filter((p) => p.role !== 'REMOVED' && p.role !== 'MERGED');
              const mins = d.day ? (d.date === today ? liveMinutes(d.day, now) : d.day.workedMinutes) : 0;
              const offDay = !d.day || d.day.status === 'OFF';
              return (
                <li key={d.date} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <div className="w-28">
                    <p className="font-semibold">{d.date === today ? 'Today' : dayName(d.date, { weekday: 'long' })}</p>
                    <p className="text-xs text-muted">{dayName(d.date, { month: 'short', day: 'numeric' })}</p>
                  </div>
                  <div className="w-36">{d.day && <StatusChip day={d.day} />}</div>
                  <ol className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Punches">
                    {shown.length ? (
                      shown.map((p) => (
                        <li key={p.id} className="inline-flex items-center gap-1.5">
                          <SourceIcon source={p.source} />
                          <span className="tabular">{clock(p.at, tz)}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-muted">{offDay ? 'No shift' : d.day?.scheduleStart ? `Shift ${clock(d.day.scheduleStart, tz)} – ${clock(d.day.scheduleEnd, tz)}` : '—'}</li>
                    )}
                  </ol>
                  <p className="tabular w-16 text-right text-sm font-medium">{mins ? hm(mins) : '—'}</p>
                  <Button size="sm" variant="ghost" onClick={() => setFixing(d)} disabled={offDay && !shown.length && d.date !== today}>
                    Fix a punch
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4">
          <Legend />
        </div>
      </Panel>

      <Panel title="My correction requests" description="Your manager approves first, then HR. You get an email when it’s decided.">
        {requests.isLoading ? (
          <Spinner />
        ) : pending.length + past.length === 0 ? (
          <EmptyState title="No requests yet">If a punch is missing or wrong, use “Fix a punch” on that day.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {[...pending, ...past].map((c) => (
              <div key={c.id} className="relative">
                <CorrectionCard c={c} showName={false} />
                {pending.includes(c) && (
                  <Button size="sm" variant="ghost" className="absolute right-2 top-2" loading={cancel.isPending && cancel.variables === c.id} onClick={() => cancel.mutate(c.id)}>
                    Cancel
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
      <RequestCorrectionDialog open={!!fixing} onClose={() => setFixing(null)} day={fixing} />
    </div>
  );
}

function TeamView() {
  const { user } = useAuth();
  const tz = user!.timezone;
  const [selected, setSelected] = useState<BoardRowDto | null>(null);
  const today = todayIn(tz);
  const board = useQuery({ queryKey: ['team-board'], queryFn: () => api<BoardDto>(boardPath('/team/board', today)), refetchInterval: 30_000 });
  if (board.isLoading) return <Spinner />;
  if (!board.data) return <Alert>Couldn’t load your team.</Alert>;
  return (
    <div className="space-y-5">
      <Kpis board={board.data} />
      <Panel title="Your team today" description="People who report to you. HR handles exceptions; you approve their time corrections.">
        <BoardTable rows={board.data.rows} tz={tz} selected={selected?.user.id} onPick={setSelected} />
        <div className="mt-4">
          <Legend />
        </div>
      </Panel>
      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Person">
        {selected && <PersonDay detailPath={`/team/people/${selected.user.id}/day${qs({ date: selected.day?.workDate ?? today })}`} tz={tz} />}
      </Drawer>
    </div>
  );
}

function Approvals({ list, loading }: { list?: CorrectionDto[]; loading: boolean }) {
  if (loading) return <Spinner />;
  if (!list?.length) return <EmptyState title="Nothing to approve">Time corrections from your team show up here.</EmptyState>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {list.map((c) => (
        <CorrectionCard key={c.id} c={c} decidePath={`/team/corrections/${c.id}/decision`} invalidate={['team-corrections']} />
      ))}
    </div>
  );
}
