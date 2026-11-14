import type { DepartmentDto, HolidayDto, LeaveBalanceDto, LeaveCalendarEntryDto, LeavePreviewDto, LeaveRequestDto, LeaveTypeDto } from '@vo/shared';
import { addDays, formatDays, isoWeekday, LEAVE_STATUS_LABELS, localDate } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, PageHeader, Panel, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const TONE: Record<LeaveRequestDto['status'], 'neutral' | 'ok' | 'warn' | 'danger'> = { PENDING: 'warn', APPROVED: 'ok', REJECTED: 'danger', CANCELLED: 'neutral' };
const short = (d: string) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${d}T12:00:00Z`));
const long = (d: string) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${d}T12:00:00Z`));
export const dateRange = (a: string, b: string) => (a === b ? long(a) : `${short(a)} – ${long(b)}`);

export const leaveKeys = { all: ['leave'] as const };

type Tab = 'mine' | 'approvals' | 'calendar';

export function LeavePage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const approver = can('team.read') || can('leave.manage');
  const [tab, setTab] = useState<Tab>(() => (params.get('tab') as Tab) || 'mine');
  const [filing, setFiling] = useState(false);
  const [open, setOpen] = useState<string | null>(params.get('open'));
  useEffect(() => {
    if (params.get('open') || params.get('tab')) {
      params.delete('open');
      params.delete('tab');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const pending = useQuery({
    queryKey: [...leaveKeys.all, 'requests', 'approvals', 'PENDING'],
    queryFn: () => api<LeaveRequestDto[]>('/leave/requests?scope=approvals&status=PENDING'),
    enabled: approver,
  });
  const tabs: { id: Tab; label: string }[] = [
    { id: 'mine', label: 'My leave' },
    ...(approver ? [{ id: 'approvals' as const, label: `To approve${pending.data?.length ? ` (${pending.data.length})` : ''}` }] : []),
    { id: 'calendar', label: 'Team calendar' },
  ];

  return (
    <>
      <PageHeader
        title="Leave"
        description="File leave and see your balance. Approved leave is marked on your timesheet, so you’re never flagged absent."
        actions={
          <Button onClick={() => setFiling(true)}>
            <CalendarPlus className="h-4 w-4" aria-hidden /> File leave
          </Button>
        }
      />
      <div role="tablist" aria-label="Leave" className="mb-5 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'mine' && <MyLeave onOpen={setOpen} onFile={() => setFiling(true)} />}
      {tab === 'approvals' && <Approvals onOpen={setOpen} />}
      {tab === 'calendar' && <TeamCalendar />}
      <FileLeaveDialog open={filing} onClose={() => setFiling(false)} onFiled={(r) => setOpen(r.id)} />
      <RequestDialog id={open} onClose={() => setOpen(null)} />
    </>
  );
}

/* ---------------- my leave ---------------- */

export function BalanceCards({ balances }: { balances: LeaveBalanceDto[] }) {
  if (!balances.length) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {balances.map((b) => (
        <li key={b.typeId} className="rounded-card border border-line bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
            {b.typeName}
            {!b.paid && <span className="text-xs font-normal text-muted">unpaid</span>}
          </p>
          {b.remaining === null ? (
            <p className="mt-2 text-sm text-muted">{b.used ? `${formatDays(b.used)} taken this year` : 'No limit'}</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-semibold tabular">
                {b.remaining % 1 ? b.remaining.toFixed(1) : b.remaining}
                <span className="ml-1 text-sm font-normal text-muted">of {(b.allowance ?? 0) + b.adjustments} days left</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (b.used / Math.max(1, (b.allowance ?? 0) + b.adjustments)) * 100)}%`, background: b.color }} />
              </div>
              {b.pending > 0 && <p className="mt-1.5 text-xs text-muted">{formatDays(b.pending)} waiting for approval</p>}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function RequestRow({ r, onOpen, showName }: { r: LeaveRequestDto; onOpen: (id: string) => void; showName?: boolean }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(r.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-1 py-3 text-left hover:bg-sunken/50">
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            {showName ? `${r.userName} · ` : ''}
            {r.typeName}
          </span>
          <span className="block text-sm text-muted">
            {dateRange(r.startDate, r.endDate)} · {formatDays(r.days)}
          </span>
        </span>
        <Badge tone={TONE[r.status]}>{r.status === 'PENDING' ? `Waiting for ${r.approverName}` : LEAVE_STATUS_LABELS[r.status]}</Badge>
      </button>
    </li>
  );
}

function MyLeave({ onOpen, onFile }: { onOpen: (id: string) => void; onFile: () => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const balances = useQuery({ queryKey: [...leaveKeys.all, 'balances', year], queryFn: () => api<LeaveBalanceDto[]>(`/leave/balances?year=${year}`) });
  const mine = useQuery({ queryKey: [...leaveKeys.all, 'requests', 'mine', year], queryFn: () => api<LeaveRequestDto[]>(`/leave/requests?scope=mine&year=${year}`) });
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setYear(year - 1)} aria-label="Previous year">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold tabular">{year}</h2>
        <Button variant="secondary" size="sm" onClick={() => setYear(year + 1)} aria-label="Next year">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {balances.isLoading ? (
        <Spinner />
      ) : balances.data?.length ? (
        <BalanceCards balances={balances.data} />
      ) : (
        <Alert tone="info">No leave types are set up yet. HR adds them in Leave &amp; holidays.</Alert>
      )}
      <Panel title="Your requests">
        {mine.isLoading ? (
          <Spinner />
        ) : !mine.data?.length ? (
          <EmptyState title={`No leave filed for ${year}`}>
            <Button className="mt-3" onClick={onFile}>
              File leave
            </Button>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {mine.data.map((r) => (
              <RequestRow key={r.id} r={r} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- approvals ---------------- */

function Approvals({ onOpen }: { onOpen: (id: string) => void }) {
  const pending = useQuery({ queryKey: [...leaveKeys.all, 'requests', 'approvals', 'PENDING'], queryFn: () => api<LeaveRequestDto[]>('/leave/requests?scope=approvals&status=PENDING') });
  const recent = useQuery({ queryKey: [...leaveKeys.all, 'requests', 'approvals', 'all'], queryFn: () => api<LeaveRequestDto[]>('/leave/requests?scope=approvals') });
  const decided = (recent.data ?? []).filter((r) => r.status !== 'PENDING').slice(0, 30);
  return (
    <div className="space-y-6">
      <Panel title="Waiting for you">
        {pending.isLoading ? (
          <Spinner />
        ) : !pending.data?.length ? (
          <p className="text-sm text-muted">Nothing to approve right now.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pending.data.map((r) => (
              <PendingRow key={r.id} r={r} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Recently decided">
        {decided.length ? (
          <ul className="divide-y divide-line">
            {decided.map((r) => (
              <RequestRow key={r.id} r={r} onOpen={onOpen} showName />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing yet.</p>
        )}
      </Panel>
    </div>
  );
}

function useDecide(id: string, after?: () => void) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { approve: boolean; note?: string }) => api<LeaveRequestDto>(`/leave/requests/${id}/decision`, { method: 'POST', json: v }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: leaveKeys.all });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast(r.status === 'APPROVED' ? `Approved. ${r.userName} has been told.` : `Marked not approved. ${r.userName} has been told.`);
      after?.();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Couldn’t save the decision.', 'danger'),
  });
}

function PendingRow({ r, onOpen }: { r: LeaveRequestDto; onOpen: (id: string) => void }) {
  const decide = useDecide(r.id);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(r.id)}>
        <span className="block font-medium">
          {r.userName} · {r.typeName}
        </span>
        <span className="block text-sm text-muted">
          {dateRange(r.startDate, r.endDate)} · {formatDays(r.days)} · “{r.reason}”
        </span>
      </button>
      <Button size="sm" variant="secondary" onClick={() => onOpen(r.id)}>
        Not approve…
      </Button>
      <Button size="sm" loading={decide.isPending} onClick={() => decide.mutate({ approve: true })} aria-label={`Approve ${r.userName}’s leave`}>
        Approve
      </Button>
    </li>
  );
}

/* ---------------- one request ---------------- */

function RequestDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const q = useQuery({ queryKey: [...leaveKeys.all, 'one', id], queryFn: () => api<LeaveRequestDto>(`/leave/requests/${id}`), enabled: !!id });
  const decide = useDecide(id ?? '', onClose);
  const cancel = useMutation({
    mutationFn: () => api(`/leave/requests/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leaveKeys.all });
      toast('Leave cancelled.');
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Couldn’t cancel.', 'danger'),
  });
  useEffect(() => setNote(''), [id]);
  const r = q.data;
  return (
    <Dialog
      open={!!id}
      onClose={onClose}
      title={r ? `${r.typeName}: ${r.userName}` : 'Leave request'}
      description={r ? `${dateRange(r.startDate, r.endDate)} · ${formatDays(r.days)}` : undefined}
      size="md"
      footer={
        r && (r.canDecide || r.canCancel) ? (
          <>
            {r.canCancel && (
              <Button variant="ghost" className="mr-auto text-danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel leave
              </Button>
            )}
            {r.canDecide && (
              <>
                <Button variant="secondary" loading={decide.isPending && decide.variables?.approve === false} onClick={() => decide.mutate({ approve: false, note: note || undefined })}>
                  Not approve
                </Button>
                <Button loading={decide.isPending && decide.variables?.approve === true} onClick={() => decide.mutate({ approve: true, note: note || undefined })} data-autofocus>
                  Approve
                </Button>
              </>
            )}
          </>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <Spinner />
      ) : !r ? (
        <Alert>{q.error instanceof ApiError ? q.error.message : 'Couldn’t load this request.'}</Alert>
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
            <dt className="text-muted">Status</dt>
            <dd>
              <Badge tone={TONE[r.status]}>{r.status === 'PENDING' ? `Waiting for ${r.approverName}` : LEAVE_STATUS_LABELS[r.status]}</Badge>
            </dd>
            {r.departmentName && (
              <>
                <dt className="text-muted">Department</dt>
                <dd>{r.departmentName}</dd>
              </>
            )}
            <dt className="text-muted">Reason</dt>
            <dd className="whitespace-pre-wrap">{r.reason}</dd>
            {r.decidedByName && r.status !== 'PENDING' && (
              <>
                <dt className="text-muted">{r.status === 'CANCELLED' ? 'Cancelled by' : 'Decided by'}</dt>
                <dd>
                  {r.decidedByName}
                  {r.decidedAt ? `, ${new Date(r.decidedAt).toLocaleDateString()}` : ''}
                </dd>
              </>
            )}
            {r.decisionNote && (
              <>
                <dt className="text-muted">Note</dt>
                <dd className="whitespace-pre-wrap">{r.decisionNote}</dd>
              </>
            )}
          </dl>
          {r.canDecide && (
            <Field label="Note to the employee (optional)">
              {(f) => <Input id={f.id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Please hand over the release to Nico" />}
            </Field>
          )}
        </div>
      )}
    </Dialog>
  );
}

/* ---------------- filing ---------------- */

function FileLeaveDialog({ open, onClose, onFiled }: { open: boolean; onClose: () => void; onFiled: (r: LeaveRequestDto) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const types = useQuery({ queryKey: [...leaveKeys.all, 'types'], queryFn: () => api<LeaveTypeDto[]>('/leave/types'), enabled: open });
  const today = new Date().toISOString().slice(0, 10);
  const [typeId, setTypeId] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const active = types.data?.filter((t) => t.active) ?? [];
  useEffect(() => {
    if (open && !typeId && active[0]) setTypeId(active[0].id);
  }, [open, typeId, active]);

  const preview = useQuery({
    queryKey: [...leaveKeys.all, 'preview', typeId, start, end],
    queryFn: () => api<LeavePreviewDto>(`/leave/preview?typeId=${typeId}&startDate=${start}&endDate=${end}`),
    enabled: open && !!typeId && !!start && !!end && end >= start,
  });
  const file = useMutation({
    mutationFn: () => api<LeaveRequestDto>('/leave/requests', { method: 'POST', json: { typeId, startDate: start, endDate: end, reason } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: leaveKeys.all });
      toast(`Filed. ${r.approverName} has been asked to approve it.`);
      setReason('');
      onClose();
      onFiled(r);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setFieldErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0]])));
        setError(Object.keys(e.fieldErrors).length ? null : e.message);
      } else setError('Couldn’t file the leave. Try again.');
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) return setFieldErrors({ reason: 'Add a short reason' });
    setFieldErrors({});
    file.mutate();
  }
  const p = preview.data;
  const skipped = p?.dates.filter((d) => !d.counted) ?? [];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="File leave"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="leave-form" loading={file.isPending} disabled={!active.length || p?.days === 0}>
            File {p ? formatDays(p.days) : 'leave'}
          </Button>
        </>
      }
    >
      {types.isLoading ? (
        <Spinner />
      ) : !active.length ? (
        <Alert tone="info">No leave types are set up yet. Ask HR to add them.</Alert>
      ) : (
        <form id="leave-form" onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Type" error={fieldErrors.typeId}>
            {(f) => (
              <Select id={f.id} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {active.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.paid ? '' : ' (unpaid)'}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First day" error={fieldErrors.startDate}>
              {(f) => <Input id={f.id} type="date" value={start} onChange={(e) => {
                    const v = e.target.value;
                    setStart(v);
                    if (v && end < v) setEnd(v);
                  }} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
            </Field>
            <Field label="Last day" error={fieldErrors.endDate}>
              {(f) => <Input id={f.id} type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
            </Field>
          </div>
          {p && (
            <div className="rounded-lg bg-sunken px-3 py-2 text-sm" aria-live="polite">
              <p>
                <strong>{formatDays(p.days)}</strong> of leave
                {skipped.length > 0 && <span className="text-muted"> ({skipped.map((d) => `${short(d.date)}: ${d.note}`).join(', ')} not counted)</span>}
              </p>
              {p.remainingAfter !== null && (
                <p className={clsx(p.remainingAfter < 0 ? 'text-danger' : 'text-muted')}>
                  {p.remainingAfter < 0 ? `That’s ${formatDays(-p.remainingAfter)} more than you have left.` : `${formatDays(p.remainingAfter)} left after this.`}
                </p>
              )}
              {p.overlaps.map((o) => (
                <p key={o.id} className="text-danger">
                  You already have {o.typeName.toLowerCase()} on {dateRange(o.startDate, o.endDate)} ({LEAVE_STATUS_LABELS[o.status].toLowerCase()}).
                </p>
              ))}
            </div>
          )}
          <Field label="Reason" error={fieldErrors.reason}>
            {(f) => (
              <textarea
                id={f.id}
                aria-describedby={f.describedBy}
                aria-invalid={f.invalid}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            )}
          </Field>
        </form>
      )}
    </Dialog>
  );
}

/* ---------------- team calendar ---------------- */

function TeamCalendar() {
  const { user, can } = useAuth();
  const tz = user!.timezone;
  const today = localDate(new Date(), tz);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dept, setDept] = useState('');
  const first = `${month}-01`;
  const gridStart = addDays(first, 1 - isoWeekday(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const last = days[41];
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api<DepartmentDto[]>('/departments'), enabled: can('leave.manage') });
  const entries = useQuery({
    queryKey: [...leaveKeys.all, 'calendar', gridStart, last, dept],
    queryFn: () => api<LeaveCalendarEntryDto[]>(`/leave/calendar?from=${gridStart}&to=${last}${dept ? `&departmentId=${dept}` : ''}`),
  });
  const holidays = useQuery({ queryKey: ['holidays', gridStart, last], queryFn: () => api<HolidayDto[]>(`/holidays?from=${gridStart}&to=${last}`) });
  const step = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  };
  const byDay = useMemo(() => {
    const m = new Map<string, LeaveCalendarEntryDto[]>();
    for (const e of entries.data ?? []) for (let d = e.startDate; d <= e.endDate; d = addDays(d, 1)) m.set(d, [...(m.get(d) ?? []), e]);
    return m;
  }, [entries.data]);
  const label = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${first}T12:00:00Z`));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => step(-1)} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
          This month
        </Button>
        <Button variant="secondary" size="sm" onClick={() => step(1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <h2 className="mr-auto text-base font-semibold" aria-live="polite">
          {label}
        </h2>
        {can('leave.manage') && (
          <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department" className="w-48">
            <option value="">Everyone</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line bg-sunken/60 text-center text-xs font-medium text-muted" aria-hidden>
          {days.slice(0, 7).map((d) => (
            <div key={d} className="py-2">
              {new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${d}T12:00:00Z`))}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const hol = holidays.data?.find((h) => h.date === d);
            const inMonth = d.startsWith(month);
            const weekend = isoWeekday(d) > 5;
            return (
              <div key={d} className={clsx('min-h-[6rem] border-b border-r border-line p-1 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-sunken/40', weekend && inMonth && 'bg-sunken/20')}>
                <span className={clsx('mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs tabular', d === today ? 'bg-brand font-semibold text-white' : inMonth ? 'text-ink' : 'text-muted')}>
                  {Number(d.slice(8))}
                </span>
                {hol && <p className="mb-0.5 truncate rounded bg-amber-100 px-1 text-2xs font-medium text-amber-900 dark:bg-amber-400/20 dark:text-amber-100" title={hol.name}>{hol.name}</p>}
                <ul className="space-y-0.5">
                  {list.slice(0, 3).map((e) => (
                    <li
                      key={e.id}
                      className={clsx('truncate rounded px-1 text-2xs', e.status === 'PENDING' && 'border border-dashed')}
                      style={{ background: `${e.color}22`, borderColor: e.color }}
                      title={`${e.userName}${e.typeName ? `: ${e.typeName}` : ''}${e.status === 'PENDING' ? ' (waiting for approval)' : ''}`}
                    >
                      {e.userName.split(' ')[0]}
                      {e.typeName ? <span className="text-muted"> · {e.typeName}</span> : null}
                    </li>
                  ))}
                  {list.length > 3 && <li className="px-1 text-2xs text-muted">+{list.length - 3} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted">Dashed: waiting for approval (you see these for yourself and the people you approve). Colleagues see approved leave without the type.</p>
    </div>
  );
}
