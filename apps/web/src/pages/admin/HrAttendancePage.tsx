import type {
  AttendanceRules,
  BoardDto,
  BoardRowDto,
  CorrectionDto,
  ExceptionDto,
  LivePunchDto,
  PersonSetupDto,
  ResolveExceptionInput,
} from '@vo/shared';
import { addDays, EXCEPTION_TYPE_LABELS } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CheckCircle2, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BoardFilter, BoardTable, boardPath, Drawer, filterRows, Kpis, LiveStrip, PersonDay } from '@/components/attendance/board';
import { CorrectionCard } from '@/components/attendance/corrections';
import { AdjustTimesDialog, NoteDialog } from '@/components/attendance/dialogs';
import { clock, dayName, Legend, todayIn, wallToIso } from '@/components/attendance/parts';
import { Alert, Button, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, qs, tokenStore } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Tab = 'board' | 'exceptions' | 'corrections';

export function HrAttendancePage() {
  const { user } = useAuth();
  const tz = user!.timezone;
  const [date, setDate] = useState(() => todayIn(tz));
  const [tab, setTab] = useState<Tab>('board');
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [selected, setSelected] = useState<BoardRowDto | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const isToday = date === todayIn(tz);

  const board = useQuery({
    queryKey: ['hr-board', date],
    queryFn: () => api<BoardDto>(boardPath('/attendance/board', date)),
    refetchInterval: isToday ? 15_000 : false,
  });
  const live = useQuery({ queryKey: ['hr-live'], queryFn: () => api<LivePunchDto[]>('/attendance/live'), refetchInterval: 15_000, enabled: isToday });
  const exceptions = useQuery({
    queryKey: ['hr-exceptions'],
    queryFn: () => api<ExceptionDto[]>('/attendance/exceptions'),
    refetchInterval: 30_000,
  });
  const corrections = useQuery({ queryKey: ['hr-corrections'], queryFn: () => api<CorrectionDto[]>('/attendance/corrections') });

  const open = (exceptions.data ?? []).filter((e) => e.status === 'OPEN');
  const pendingHr = (corrections.data ?? []).filter((c) => c.status === 'PENDING_HR');
  const rows = board.data ? filterRows(board.data.rows, filter) : [];
  const counts = useMemo(() => {
    const all = board.data?.rows ?? [];
    return { all: all.length, onsite: filterRows(all, 'onsite').length, remote: filterRows(all, 'remote').length, flagged: filterRows(all, 'flagged').length };
  }, [board.data]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance"
        description="Biometric punches and Virtual Office clock-ins, combined into one record per person."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Date</span>
              <Input type="date" value={date} max={todayIn(tz)} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
            </label>
            {!isToday && (
              <Button variant="ghost" onClick={() => setDate(todayIn(tz))}>
                Today
              </Button>
            )}
            <Button variant="secondary" onClick={() => setExportOpen(true)}>
              <Download className="h-4 w-4" aria-hidden /> Export
            </Button>
          </>
        }
      />

      {board.isLoading && <Spinner label="Loading the board" />}
      {board.isError && <Alert>Couldn’t load the attendance board.</Alert>}
      {board.data && <Kpis board={board.data} today={isToday} onReview={() => setTab('exceptions')} />}
      {isToday && live.data && <LiveStrip punches={live.data} tz={tz} />}

      <div className="rounded-card border border-line bg-surface">
        <div role="tablist" aria-label="Attendance views" className="flex gap-6 overflow-x-auto border-b border-line px-5">
          <TabButton id="board" tab={tab} setTab={setTab} label={isToday ? 'Today’s board' : `Board, ${dayName(date)}`} />
          <TabButton id="exceptions" tab={tab} setTab={setTab} label="Exceptions" count={open.length} tone="bg-danger" />
          <TabButton id="corrections" tab={tab} setTab={setTab} label="Correction requests" count={pendingHr.length} tone="bg-brand" />
        </div>
        <div className="p-5" role="tabpanel">
          {tab === 'board' && board.data && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-lg bg-sunken p-1" role="group" aria-label="Filter people">
                  {(
                    [
                      ['all', 'Everyone'],
                      ['onsite', 'On-site'],
                      ['remote', 'Remote'],
                      ['flagged', 'Needs attention'],
                    ] as [BoardFilter, string][]
                  ).map(([f, label]) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                      className={clsx('h-8 rounded-md px-3 text-sm font-medium', filter === f ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink')}
                    >
                      {label} ({counts[f]})
                    </button>
                  ))}
                </div>
                <Legend />
              </div>
              <BoardTable rows={rows} tz={tz} selected={selected?.user.id} onPick={setSelected} />
              {board.data.untracked.count > 0 && (
                <p className="text-xs text-muted">
                  Not tracked: {board.data.untracked.names.join(', ')} (attendance is turned off for leaders in Schedules &amp; setup).
                </p>
              )}
            </div>
          )}
          {tab === 'exceptions' && <ExceptionsTab list={exceptions.data} loading={exceptions.isLoading} tz={tz} />}
          {tab === 'corrections' && <CorrectionsTab list={corrections.data} loading={corrections.isLoading} />}
        </div>
      </div>

      <PersonDrawer row={selected} date={selected?.day?.workDate ?? date} tz={tz} onClose={() => setSelected(null)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} date={date} />
    </div>
  );
}

function TabButton({ id, tab, setTab, label, count, tone }: { id: Tab; tab: Tab; setTab: (t: Tab) => void; label: string; count?: number; tone?: string }) {
  const on = tab === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => setTab(id)}
      className={clsx('-mb-px inline-flex h-12 items-center gap-2 whitespace-nowrap border-b-[3px] text-[15px] font-semibold', on ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}
    >
      {label}
      {count !== undefined && (
        <span className={clsx('tabular inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-xs font-bold', count ? `${tone} text-white` : 'bg-sunken text-muted')}>
          {count}
        </span>
      )}
    </button>
  );
}

function PersonDrawer({ row, date, tz, onClose }: { row: BoardRowDto | null; date: string; tz: string; onClose: () => void }) {
  const [adjust, setAdjust] = useState(false);
  const [note, setNote] = useState(false);
  const path = row ? `/attendance/people/${row.user.id}/day${qs({ date })}` : '';
  return (
    <>
      <Drawer
        open={!!row}
        onClose={onClose}
        title="Person"
        footer={
          row && (
            <>
              <Button variant="secondary" onClick={() => setNote(true)}>
                Add a note
              </Button>
              <Button onClick={() => setAdjust(true)}>Adjust times</Button>
            </>
          )
        }
      >
        {row && <PersonDay detailPath={path} tz={tz} />}
      </Drawer>
      {row && (
        <>
          <AdjustTimesDialog open={adjust} onClose={() => setAdjust(false)} userId={row.user.id} name={row.user.fullName} date={date} day={row.day} tz={tz} />
          <NoteDialog open={note} onClose={() => setNote(false)} userId={row.user.id} name={row.user.fullName} date={date} current={row.day?.note ?? null} />
        </>
      )}
    </>
  );
}

const KIND_TONE: Record<string, string> = {
  UNLINKED_BADGE: 'bg-danger/10 text-danger',
  MISSING_OUT: 'bg-danger/10 text-danger',
  NO_PUNCH: 'bg-danger/10 text-danger',
  MISMATCH: 'bg-violet-100 text-violet-900 dark:bg-violet-400/15 dark:text-violet-300',
  LATE: 'bg-warn/10 text-warn',
  DUPLICATES: 'bg-sunken text-muted',
};

function ExceptionsTab({ list, loading, tz }: { list?: ExceptionDto[]; loading: boolean; tz: string }) {
  const rules = useQuery({ queryKey: ['attendance-rules'], queryFn: () => api<AttendanceRules>('/attendance/settings') });
  const today = todayIn(tz);
  if (loading || !list) return <Spinner />;
  const open = list.filter((e) => e.status === 'OPEN');
  const resolvedToday = list.filter((e) => e.status === 'RESOLVED' && e.resolvedAt && todayIn(tz, new Date(e.resolvedAt)) === today);
  const r = rules.data;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-3">
        {open.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line px-6 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-ok" aria-hidden />
            <p className="font-medium">All clear</p>
            <p className="text-sm text-muted">New exceptions appear here as punches come in.</p>
          </div>
        ) : (
          open.map((e) => <ExceptionCard key={e.id} e={e} tz={tz} />)
        )}
        {resolvedToday.length > 0 && (
          <section className="pt-4">
            <h3 className="mb-2 text-sm font-semibold">Resolved today</h3>
            <ul className="divide-y divide-line rounded-card border border-line">
              {resolvedToday.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-sm">
                  <p className="font-medium">{e.title}</p>
                  <p className="text-xs text-muted">
                    {e.resolution} {e.resolvedByName && `(${e.resolvedByName})`}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <aside className="h-fit rounded-card bg-sunken/70 px-4 py-4 text-sm">
        <h3 className="mb-2 font-semibold">How exceptions are raised</h3>
        {r ? (
          <ul className="space-y-2 text-muted">
            <li>
              <b className="text-ink">Late:</b> first punch after start time plus {r.graceMinutes} minutes
            </li>
            <li>
              <b className="text-ink">No punch:</b> {r.noPunchAfterMinutes / 60} hours after start with no punch and no leave
            </li>
            <li>
              <b className="text-ink">Missing clock-out:</b> still clocked in {r.missingOutAfterMinutes} minutes after shift end; auto clock-out at {r.autoClockOutHours} hours
            </li>
            <li>
              <b className="text-ink">Mismatch:</b> web and biometric clock-ins more than {r.mismatchMinutes} minutes apart on an on-site day
            </li>
            <li>
              <b className="text-ink">Unlinked badge:</b> a device user ID with no employee attached
            </li>
          </ul>
        ) : (
          <Spinner />
        )}
      </aside>
    </div>
  );
}

function ExceptionCard({ e, tz }: { e: ExceptionDto; tz: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [linkTo, setLinkTo] = useState('');
  const [pickOut, setPickOut] = useState(false);
  const people = useQuery({
    queryKey: ['attendance-people'],
    queryFn: () => api<PersonSetupDto[]>('/attendance/people'),
    enabled: e.type === 'UNLINKED_BADGE',
  });
  const resolve = useMutation({
    mutationFn: (body: ResolveExceptionInput) => api<ExceptionDto>(`/attendance/exceptions/${e.id}/resolve`, { method: 'POST', json: body }),
    onSuccess: (r) => {
      toast(r.resolution ?? 'Done');
      void qc.invalidateQueries({ queryKey: ['hr-exceptions'] });
      void qc.invalidateQueries({ queryKey: ['hr-board'] });
      void qc.invalidateQueries({ queryKey: ['person-day'] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'That didn’t work', 'danger'),
  });
  const busy = resolve.isPending;
  const act = (body: ResolveExceptionInput) => resolve.mutate(body);

  return (
    <article className="rounded-card border border-line px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx('inline-flex h-[22px] items-center rounded-md px-2 text-xs font-bold', KIND_TONE[e.type])}>{EXCEPTION_TYPE_LABELS[e.type]}</span>
        <span className="text-xs text-muted">{dayName(e.workDate)}</span>
      </div>
      <h3 className="mt-2 font-semibold">{e.title}</h3>
      <p className="mt-0.5 text-sm text-muted">{e.detail}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        {e.type === 'UNLINKED_BADGE' && (
          <>
            <Field label="Link to" className="min-w-[220px]">
              {({ id }) => (
                <Select id={id} value={linkTo} onChange={(x) => setLinkTo(x.target.value)}>
                  <option value="">Choose a person…</option>
                  {(people.data ?? [])
                    .filter((p) => p.attendanceTracked)
                    .map((p) => (
                      <option key={p.user.id} value={p.user.id}>
                        {p.user.fullName}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <Button disabled={!linkTo} loading={busy} onClick={() => act({ action: 'LINK_BADGE', userId: linkTo })}>
              Link badge
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => act({ action: 'ACK' })}>
              Ignore
            </Button>
          </>
        )}
        {e.type === 'MISSING_OUT' && (
          <>
            {e.suggestedOut && (
              <Button loading={busy} onClick={() => act({ action: 'SET_CLOCK_OUT', at: e.suggestedOut! })}>
                Set clock-out to {clock(e.suggestedOut, tz)}
              </Button>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => setPickOut(true)}>
              Pick another time
            </Button>
          </>
        )}
        {e.type === 'MISMATCH' && (
          <>
            <Button loading={busy} onClick={() => act({ action: 'USE_DEVICE' })}>
              Use biometric time
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => act({ action: 'USE_WEB' })}>
              Keep web time
            </Button>
          </>
        )}
        {e.type === 'LATE' && (
          <>
            <Button loading={busy} onClick={() => act({ action: 'EXCUSE' })}>
              Excuse
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => act({ action: 'KEEP' })}>
              Keep as late
            </Button>
          </>
        )}
        {(e.type === 'NO_PUNCH' || e.type === 'DUPLICATES') && (
          <Button variant="secondary" loading={busy} onClick={() => act({ action: 'ACK' })}>
            OK
          </Button>
        )}
      </div>
      {e.type === 'MISSING_OUT' && (
        <PickTimeDialog
          open={pickOut}
          onClose={() => setPickOut(false)}
          tz={tz}
          baseDate={e.workDate}
          onPick={(iso) => {
            setPickOut(false);
            act({ action: 'SET_CLOCK_OUT', at: iso });
          }}
        />
      )}
    </article>
  );
}

function PickTimeDialog({ open, onClose, tz, baseDate, onPick }: { open: boolean; onClose: () => void; tz: string; baseDate: string; onPick: (iso: string) => void }) {
  const [date, setDate] = useState(baseDate);
  const [time, setTime] = useState('17:00');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Set the clock-out time"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button data-autofocus onClick={() => onPick(wallToIso(date, time, tz))}>
            Set clock-out
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">{({ id }) => <Input id={id} type="date" value={date} min={baseDate} max={addDays(baseDate, 1)} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Time">{({ id }) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

function CorrectionsTab({ list, loading }: { list?: CorrectionDto[]; loading: boolean }) {
  if (loading || !list) return <Spinner />;
  const pending = list.filter((c) => c.status === 'PENDING_HR');
  const waiting = list.filter((c) => c.status === 'PENDING_MANAGER');
  const decided = list.filter((c) => c.status === 'APPROVED' || c.status === 'REJECTED').slice(0, 10);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Employees request corrections from their Attendance page. Their manager approves first; HR gives the final approval and the timesheet updates.
      </p>
      {pending.length === 0 ? (
        <EmptyState title="Nothing waiting for HR" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pending.map((c) => (
            <CorrectionCard key={c.id} c={c} decidePath={`/attendance/corrections/${c.id}/decision`} invalidate={['hr-corrections', 'hr-board', 'person-day', 'hr-exceptions']} />
          ))}
        </div>
      )}
      {waiting.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Waiting for a manager</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {waiting.map((c) => (
              <CorrectionCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}
      {decided.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Recently decided</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {decided.map((c) => (
              <CorrectionCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** CSV timesheet for a date range. Uses fetch directly so the browser can save the file. */
function ExportDialog({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/attendance/export${qs({ from, to })}`, { headers: { authorization: `Bearer ${tokenStore.get()}` }, credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Export failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Export timesheets"
      description="A CSV file with one row per person per day, for payroll or a spreadsheet."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button data-autofocus loading={busy} onClick={() => void download()} disabled={from > to}>
            Download CSV
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">{({ id }) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="To" error={from > to ? 'Must be on or after From' : undefined}>
          {({ id }) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
