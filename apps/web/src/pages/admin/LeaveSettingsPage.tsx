import type { HolidayDto, HolidayKind, LeaveAdjustmentDto, LeaveBalanceDto, LeaveTypeDto } from '@vo/shared';
import { HOLIDAY_KIND_LABELS, HOLIDAY_KINDS } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, PageHeader, Panel, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePresence } from '@/lib/presence';
import { BalanceCards } from '@/pages/leave/LeavePage';

const COLORS = ['#16a34a', '#2563eb', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#64748b'];
const fail = (toast: ReturnType<typeof useToast>) => (e: unknown) => toast(e instanceof ApiError ? e.message : 'That didn’t work. Try again.', 'danger');

/** HR: leave types, holidays and balance adjustments. */
export function LeaveSettingsPage() {
  const { can } = useAuth();
  return (
    <>
      <PageHeader title="Leave & holidays" description="The kinds of leave people can file and how many days they get each year, company holidays, and balance adjustments." />
      <div className="space-y-6">
        {can('leave.manage') && <LeaveTypes />}
        {can('attendance.manage') && <Holidays />}
        {can('leave.manage') && <Adjustments />}
      </div>
    </>
  );
}

/* ---------------- leave types ---------------- */

function LeaveTypes() {
  const q = useQuery({ queryKey: ['leave', 'types'], queryFn: () => api<LeaveTypeDto[]>('/leave/types') });
  const [editing, setEditing] = useState<LeaveTypeDto | 'new' | null>(null);
  return (
    <Panel
      title="Leave types"
      description="Days per year applies to everyone from January 1. Leave without a yearly allowance (e.g. unpaid or maternity leave) keeps no balance."
      action={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden /> Add type
        </Button>
      }
    >
      {q.isLoading ? (
        <Spinner />
      ) : !q.data?.length ? (
        <EmptyState title="No leave types yet">Add the kinds of leave your company offers, like Vacation, Sick and Emergency leave.</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium">Days per year</th>
              <th className="py-2 font-medium">Paid</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {q.data.map((t) => (
              <tr key={t.id}>
                <td className="py-2.5">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} aria-hidden />
                    {t.name}
                  </span>
                </td>
                <td className="py-2.5 tabular">{t.yearlyDays === null ? <span className="text-muted">No balance</span> : t.yearlyDays}</td>
                <td className="py-2.5">{t.paid ? 'Paid' : 'Unpaid'}</td>
                <td className="py-2.5">{t.active ? <Badge tone="ok">In use</Badge> : <Badge>Turned off</Badge>}</td>
                <td className="py-2.5 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <TypeDialog type={editing === 'new' ? null : editing} used={q.data?.map((t) => t.color) ?? []} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function TypeDialog({ type, used, onClose }: { type: LeaveTypeDto | null; used: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(type?.name ?? '');
  const [color, setColor] = useState(type?.color ?? COLORS.find((c) => !used.includes(c)) ?? COLORS[0]);
  const [paid, setPaid] = useState(type?.paid ?? true);
  const [hasBalance, setHasBalance] = useState(type ? type.yearlyDays !== null : true);
  const [days, setDays] = useState(String(type?.yearlyDays ?? 15));
  const [active, setActive] = useState(type?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const body = () => ({ name, color, paid, yearlyDays: hasBalance ? Number(days) : null, active });
  const save = useMutation({
    mutationFn: () => (type ? api(`/leave/types/${type.id}`, { method: 'PUT', json: body() }) : api('/leave/types', { method: 'POST', json: body() })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leave'] });
      toast(type ? 'Leave type saved.' : 'Leave type added.');
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0]])));
      else fail(toast)(e);
    },
  });
  const del = useMutation({
    mutationFn: () => api(`/leave/types/${type!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leave'] });
      onClose();
    },
    onError: fail(toast),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setErrors({ name: 'At least 2 characters' });
    if (hasBalance && (!(Number(days) >= 0) || !Number.isInteger(Number(days) * 2))) return setErrors({ yearlyDays: 'Use whole or half days' });
    save.mutate();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={type ? `Edit ${type.name}` : 'Add a leave type'}
      size="md"
      footer={
        <>
          {type && !type.inUse && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => del.mutate()} loading={del.isPending}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="type-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="type-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Name" error={errors.name}>
          {(f) => <Input id={f.id} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Vacation leave" autoFocus aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Color on the calendar</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c} className="h-7 w-7 rounded-full ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-ink" style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hasBalance} onChange={(e) => setHasBalance(e.target.checked)} /> Keep a yearly balance
        </label>
        {hasBalance && (
          <Field label="Days per year" error={errors.yearlyDays} className="sm:w-1/2">
            {(f) => <Input id={f.id} type="number" min={0} max={365} step={0.5} value={days} onChange={(e) => setDays(e.target.value)} aria-invalid={f.invalid} aria-describedby={f.describedBy} />}
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid leave
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> People can file this type
        </label>
        {type?.inUse && <p className="text-xs text-muted">People have filed this type, so it can be turned off but not deleted.</p>}
      </form>
    </Dialog>
  );
}

/* ---------------- holidays ---------------- */

function Holidays() {
  const [year, setYear] = useState(new Date().getFullYear());
  const q = useQuery({ queryKey: ['holidays', year], queryFn: () => api<HolidayDto[]>(`/holidays?year=${year}`) });
  const [editing, setEditing] = useState<HolidayDto | 'new' | null>(null);
  return (
    <Panel
      title="Company holidays"
      description="Nobody is expected to work on these days: they don’t count as leave, and nobody is marked absent."
      action={
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => setYear(year - 1)} aria-label="Previous year">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-sm font-semibold tabular">{year}</span>
          <Button size="sm" variant="secondary" onClick={() => setYear(year + 1)} aria-label="Next year">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setEditing('new')} className="ml-2">
            <Plus className="h-4 w-4" aria-hidden /> Add holiday
          </Button>
        </div>
      }
    >
      {q.isLoading ? (
        <Spinner />
      ) : !q.data?.length ? (
        <p className="text-sm text-muted">No holidays for {year} yet. Add the regular holidays and special non-working days your company observes.</p>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-36 tabular text-muted">{new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${h.date}T12:00:00Z`))}</span>
              <span className="flex-1 font-medium">{h.name}</span>
              <Badge tone={h.kind === 'REGULAR' ? 'brand' : 'neutral'}>{HOLIDAY_KIND_LABELS[h.kind]}</Badge>
              <Button size="sm" variant="ghost" onClick={() => setEditing(h)} aria-label={`Edit ${h.name}`}>
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && <HolidayDialog holiday={editing === 'new' ? null : editing} year={year} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function HolidayDialog({ holiday, year, onClose }: { holiday: HolidayDto | null; year: number; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(holiday?.date ?? `${year}-01-01`);
  const [name, setName] = useState(holiday?.name ?? '');
  const [kind, setKind] = useState<HolidayKind>(holiday?.kind ?? 'REGULAR');
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['holidays'] });
    void qc.invalidateQueries({ queryKey: ['leave'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => api(holiday ? `/holidays/${holiday.id}` : '/holidays', { method: holiday ? 'PUT' : 'POST', json: { date, name, kind } }),
    onSuccess: () => (toast('Holiday saved. Timesheets for that day were updated.'), done()),
    onError: fail(toast),
  });
  const del = useMutation({ mutationFn: () => api(`/holidays/${holiday!.id}`, { method: 'DELETE' }), onSuccess: done, onError: fail(toast) });
  return (
    <Dialog
      open
      onClose={onClose}
      title={holiday ? 'Edit holiday' : 'Add a holiday'}
      size="sm"
      footer={
        <>
          {holiday && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => del.mutate()} loading={del.isPending} aria-label="Delete holiday">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={name.trim().length < 2 || !date}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Date">{(f) => <Input id={f.id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Name">{(f) => <Input id={f.id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Independence Day" />}</Field>
        <Field label="Kind">
          {(f) => (
            <Select id={f.id} value={kind} onChange={(e) => setKind(e.target.value as HolidayKind)}>
              {HOLIDAY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {HOLIDAY_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/* ---------------- adjustments ---------------- */

function Adjustments() {
  const { people } = usePresence();
  const qc = useQueryClient();
  const toast = useToast();
  const year = new Date().getFullYear();
  const directory = useMemo(() => Object.values(people).sort((a, b) => a.fullName.localeCompare(b.fullName)), [people]);
  const [userId, setUserId] = useState('');
  const types = useQuery({ queryKey: ['leave', 'types'], queryFn: () => api<LeaveTypeDto[]>('/leave/types') });
  const balances = useQuery({ queryKey: ['leave', 'balances', year, userId], queryFn: () => api<LeaveBalanceDto[]>(`/leave/balances?userId=${userId}&year=${year}`), enabled: !!userId });
  const history = useQuery({ queryKey: ['leave', 'adjustments', year, userId], queryFn: () => api<LeaveAdjustmentDto[]>(`/leave/adjustments?userId=${userId}&year=${year}`), enabled: !!userId });
  const withBalance = types.data?.filter((t) => t.yearlyDays !== null) ?? [];
  const [typeId, setTypeId] = useState('');
  const [days, setDays] = useState('1');
  const [note, setNote] = useState('');
  const add = useMutation({
    mutationFn: () => api('/leave/adjustments', { method: 'POST', json: { userId, typeId: typeId || withBalance[0]?.id, year, days: Number(days), note } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leave'] });
      setNote('');
      toast('Balance adjusted.');
    },
    onError: fail(toast),
  });
  return (
    <Panel title={`Adjust a balance (${year})`} description="Add days (carry-over, special grants) or take some away. Every change is kept with its reason.">
      <div className="space-y-4">
        <Field label="Person" className="sm:w-1/2">
          {(f) => (
            <Select id={f.id} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Choose someone</option>
              {directory.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.fullName}
                  {p.departmentName ? ` · ${p.departmentName}` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {userId && (balances.isLoading ? <Spinner /> : <BalanceCards balances={balances.data ?? []} />)}
        {userId && withBalance.length > 0 && (
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_2fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <Field label="Type">
              {(f) => (
                <Select id={f.id} value={typeId || withBalance[0]?.id} onChange={(e) => setTypeId(e.target.value)}>
                  {withBalance.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Days (+/−)">{(f) => <Input id={f.id} type="number" step={0.5} value={days} onChange={(e) => setDays(e.target.value)} />}</Field>
            <Field label="Reason">{(f) => <Input id={f.id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Carried over from last year" />}</Field>
            <Button type="submit" loading={add.isPending} disabled={!note.trim() || !Number(days)}>
              Save
            </Button>
          </form>
        )}
        {userId && withBalance.length === 0 && <Alert tone="info">Add a leave type with a yearly balance first.</Alert>}
        {history.data && history.data.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {history.data.map((a) => (
              <li key={a.id} className="flex gap-3 px-3 py-2">
                <span className={a.days > 0 ? 'w-16 font-medium text-ok tabular' : 'w-16 font-medium text-danger tabular'}>
                  {a.days > 0 ? '+' : ''}
                  {a.days}
                </span>
                <span className="flex-1">
                  {a.typeName}: {a.note}
                </span>
                <span className="text-xs text-muted">
                  {a.byName ?? ''} · {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
