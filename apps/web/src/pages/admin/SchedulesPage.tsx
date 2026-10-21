import type { DayOverrideDto, DayOverrideKind, PersonSetupDto, ScheduleDayInput, ScheduleDto, WorkSetup } from '@vo/shared';
import { addDays, WORK_SETUP_LABELS, WORK_SETUPS } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { dayName, todayIn } from '@/components/attendance/parts';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, PageHeader, Panel, Select, Spinner } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { allTimeZones, cityOf } from '@/lib/format';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function SchedulesPage() {
  const schedules = useQuery({ queryKey: ['schedules'], queryFn: () => api<ScheduleDto[]>('/schedules') });
  const [editing, setEditing] = useState<ScheduleDto | 'new' | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedules & setup"
        description="Work schedules, who follows which, on-site or remote, and days off. Changes apply from today; past days keep their schedule."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden /> Add a schedule
          </Button>
        }
      />
      <section aria-label="Schedules" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {schedules.isLoading && <Spinner />}
        {schedules.data?.map((s) => (
          <button key={s.id} type="button" onClick={() => setEditing(s)} className="rounded-card border border-line bg-surface p-4 text-left hover:border-brand/50">
            <p className="font-semibold">{s.name}</p>
            <p className="mt-1 text-sm text-muted">{s.label}</p>
            <p className="mt-3 text-xs text-muted">
              {s.memberCount} {s.memberCount === 1 ? 'person' : 'people'} · {cityOf(s.timezone)} time
            </p>
          </button>
        ))}
      </section>
      <PeopleSetup schedules={schedules.data ?? []} />
      <DaysOff />
      <ScheduleDialog open={!!editing} schedule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ScheduleDialog({ open, schedule, onClose }: { open: boolean; schedule: ScheduleDto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [tz, setTz] = useState('Asia/Manila');
  const [days, setDays] = useState<Record<number, ScheduleDayInput | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!open) return;
    setName(schedule?.name ?? '');
    setTz(schedule?.timezone ?? user!.timezone);
    const d: Record<number, ScheduleDayInput | null> = {};
    for (let w = 1; w <= 7; w++) d[w] = schedule ? (schedule.days.find((x) => x.weekday === w) ?? null) : w <= 5 ? { weekday: w, start: '08:00', end: '17:00', onsite: true } : null;
    setDays(d);
    setError(null);
    setErrors({});
  }, [open, schedule, user]);

  const save = useMutation({
    mutationFn: () =>
      api<ScheduleDto>(schedule ? `/schedules/${schedule.id}` : '/schedules', {
        method: schedule ? 'PUT' : 'POST',
        json: { name, timezone: tz, days: Object.values(days).filter(Boolean) },
      }),
    onSuccess: (s) => {
      toast(schedule ? `Saved ${s.name}` : `Added ${s.name}`);
      void qc.invalidateQueries({ queryKey: ['schedules'] });
      void qc.invalidateQueries({ queryKey: ['attendance-people'] });
      onClose();
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'That didn’t work');
      if (e instanceof ApiError) setErrors(e.fieldErrors);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/schedules/${schedule!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast(`Removed ${schedule!.name}`);
      void qc.invalidateQueries({ queryKey: ['schedules'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That didn’t work'),
  });
  const set = (w: number, patch: Partial<ScheduleDayInput> | null) =>
    setDays((d) => ({ ...d, [w]: patch === null ? null : { ...(d[w] ?? { weekday: w, start: '08:00', end: '17:00', onsite: true }), ...patch } }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={schedule ? `Edit ${schedule.name}` : 'Add a schedule'}
      description="An end time earlier than the start means the shift ends the next morning (night shifts)."
      footer={
        <>
          {schedule && (
            <Button variant="ghost" className="mr-auto text-danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button data-autofocus loading={save.isPending} onClick={() => save.mutate()}>
            {schedule ? 'Save changes' : 'Add schedule'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name?.[0]}>
            {({ id, invalid }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={invalid} maxLength={80} />}
          </Field>
          <Field label="Times are in" error={errors.timezone?.[0]}>
            {({ id }) => (
              <Select id={id} value={tz} onChange={(e) => setTz(e.target.value)}>
                {allTimeZones().map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Working days</legend>
          <div className="divide-y divide-line rounded-lg border border-line">
            {WEEKDAYS.map((label, i) => {
              const w = i + 1;
              const d = days[w];
              return (
                <div key={w} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <label className="flex w-32 items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={!!d} onChange={(e) => set(w, e.target.checked ? {} : null)} className="h-4 w-4" />
                    {label}
                  </label>
                  {d ? (
                    <>
                      <Input type="time" aria-label={`${label} start`} value={d.start} onChange={(e) => set(w, { start: e.target.value })} className="w-32" />
                      <span className="text-muted">to</span>
                      <Input type="time" aria-label={`${label} end`} value={d.end} onChange={(e) => set(w, { end: e.target.value })} className="w-32" />
                      <label className="ml-auto flex items-center gap-2 text-sm text-muted">
                        <input type="checkbox" checked={d.onsite} onChange={(e) => set(w, { onsite: e.target.checked })} className="h-4 w-4" />
                        On-site day (Hybrid)
                      </label>
                    </>
                  ) : (
                    <span className="text-sm text-muted">Off</span>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

function PeopleSetup({ schedules }: { schedules: ScheduleDto[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const people = useQuery({ queryKey: ['attendance-people'], queryFn: () => api<PersonSetupDto[]>('/attendance/people') });
  const update = useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: Record<string, unknown> }) =>
      api<PersonSetupDto>(`/attendance/people/${userId}`, { method: 'PATCH', json: body }),
    onSuccess: (p) => {
      toast(`Saved ${p.user.fullName}`);
      void qc.invalidateQueries({ queryKey: ['attendance-people'] });
      void qc.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'That didn’t work', 'danger'),
  });
  return (
    <Panel title="People" description="Turn tracking off for leaders. Hybrid people follow the on-site days in their schedule.">
      {people.isLoading ? (
        <Spinner />
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-5 pb-2 font-medium">Person</th>
                <th className="px-2 pb-2 font-medium">Tracked</th>
                <th className="px-2 pb-2 font-medium">Setup</th>
                <th className="px-5 pb-2 font-medium">Schedule</th>
              </tr>
            </thead>
            <tbody>
              {people.data?.map((p) => (
                <tr key={p.user.id} className="border-t border-line">
                  <td className="px-5 py-2">
                    <span className="flex items-center gap-3">
                      <Avatar name={p.user.fullName} size="sm" />
                      <span>
                        <span className="block font-semibold">{p.user.fullName}</span>
                        <span className="block text-xs text-muted">{p.user.title ?? p.user.departmentName}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-2">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={p.attendanceTracked}
                        onChange={(e) => update.mutate({ userId: p.user.id, body: { attendanceTracked: e.target.checked } })}
                        aria-label={`Track attendance for ${p.user.fullName}`}
                      />
                      {!p.attendanceTracked && <Badge>Not tracked</Badge>}
                    </label>
                  </td>
                  <td className="px-2">
                    <Select
                      aria-label={`Setup for ${p.user.fullName}`}
                      value={p.workSetup}
                      onChange={(e) => update.mutate({ userId: p.user.id, body: { workSetup: e.target.value as WorkSetup } })}
                      className="h-9 w-32"
                      disabled={!p.attendanceTracked}
                    >
                      {WORK_SETUPS.map((s) => (
                        <option key={s} value={s}>
                          {WORK_SETUP_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-5">
                    <Select
                      aria-label={`Schedule for ${p.user.fullName}`}
                      value={p.scheduleId ?? ''}
                      onChange={(e) => update.mutate({ userId: p.user.id, body: { scheduleId: e.target.value || null } })}
                      className="h-9 w-64"
                      disabled={!p.attendanceTracked}
                    >
                      <option value="">No schedule</option>
                      {schedules.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

const KIND_LABEL: Record<DayOverrideKind, string> = { LEAVE: 'On leave', DAY_OFF: 'Day off', SHIFT: 'Different shift' };

function DaysOff() {
  const { user } = useAuth();
  const today = todayIn(user!.timezone);
  const from = addDays(today, -7);
  const to = addDays(today, 90);
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ['overrides', from], queryFn: () => api<DayOverrideDto[]>(`/attendance/overrides${qs({ from, to })}`) });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/attendance/overrides/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Removed');
      void qc.invalidateQueries({ queryKey: ['overrides'] });
    },
  });
  return (
    <Panel
      title="Leave, days off and one-off shifts"
      description="Until the Leave module arrives, HR marks leave here so the person isn’t flagged as absent."
      action={
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <CalendarPlus className="h-4 w-4" aria-hidden /> Add
        </Button>
      }
    >
      {list.isLoading ? (
        <Spinner />
      ) : !list.data?.length ? (
        <EmptyState title="Nothing planned">Leave and days off from the last week and the next three months show here.</EmptyState>
      ) : (
        <ul className="-my-2 divide-y divide-line">
          {list.data.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <span className="w-28 font-medium">{dayName(o.date)}</span>
              <span className="w-44 font-semibold">{o.userName}</span>
              <Badge tone={o.kind === 'LEAVE' ? 'brand' : 'neutral'}>{KIND_LABEL[o.kind]}</Badge>
              <span className="flex-1 text-muted">
                {o.kind === 'SHIFT' ? `${o.start} – ${o.end}` : ''} {o.note}
              </span>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(o.id)} aria-label={`Remove ${KIND_LABEL[o.kind]} for ${o.userName} on ${o.date}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <OverrideDialog open={open} onClose={() => setOpen(false)} />
    </Panel>
  );
}

function OverrideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const people = useQuery({ queryKey: ['attendance-people'], queryFn: () => api<PersonSetupDto[]>('/attendance/people'), enabled: open });
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState(todayIn(user!.timezone));
  const [to, setTo] = useState(todayIn(user!.timezone));
  const [kind, setKind] = useState<DayOverrideKind>('LEAVE');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setError(null);
      setNote('');
    }
  }, [open]);
  const save = useMutation({
    mutationFn: async () => {
      if (!userId) throw new ApiError(400, 'Choose a person');
      if (to < from) throw new ApiError(400, 'The last day must be on or after the first');
      const days: string[] = [];
      for (let d = from; d <= to && days.length < 31; d = addDays(d, 1)) days.push(d);
      for (const date of days) {
        await api('/attendance/overrides', { method: 'PUT', json: { userId, date, kind, note: note || undefined, ...(kind === 'SHIFT' ? { start, end } : {}) } });
      }
      return days.length;
    },
    onSuccess: (n) => {
      toast(`Saved ${n} day${n === 1 ? '' : 's'}`);
      void qc.invalidateQueries({ queryKey: ['overrides'] });
      void qc.invalidateQueries({ queryKey: ['hr-board'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That didn’t work'),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add leave or a day off"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button data-autofocus loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Person">
          {({ id }) => (
            <Select id={id} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Choose…</option>
              {people.data
                ?.filter((p) => p.attendanceTracked)
                .map((p) => (
                  <option key={p.user.id} value={p.user.id}>
                    {p.user.fullName}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Type">
          {({ id }) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as DayOverrideKind)}>
              <option value="LEAVE">On leave</option>
              <option value="DAY_OFF">Day off</option>
              <option value="SHIFT">Different shift that day</option>
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First day">{({ id }) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Last day" hint="Up to 31 days at a time">
            {({ id, describedBy }) => <Input id={id} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-describedby={describedBy} />}
          </Field>
        </div>
        {kind === 'SHIFT' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">{({ id }) => <Input id={id} type="time" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
            <Field label="End">{({ id }) => <Input id={id} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
          </div>
        )}
        <Field label="Note (optional)">{({ id }) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Vacation leave, approved by Daniel Brooks" />}</Field>
      </div>
    </Dialog>
  );
}
