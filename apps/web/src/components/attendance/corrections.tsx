import type { CorrectionAction, CorrectionDto, CorrectionStatus, MyDayDto, PunchKind } from '@vo/shared';
import { addDays } from '@vo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, Field, Input, Select } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { clock, dayName, wallTime, wallToIso } from './parts';

const STATUS_TEXT: Record<CorrectionStatus, { text: (c: CorrectionDto) => string; tone: string }> = {
  PENDING_MANAGER: { text: (c) => `Waiting for ${c.managerName ?? 'the manager'}`, tone: 'text-warn' },
  PENDING_HR: { text: (c) => (c.managerName ? `Approved by ${c.managerName}, waiting for HR` : 'Waiting for HR'), tone: 'text-warn' },
  APPROVED: { text: (c) => `Approved${c.hrName ? ` by ${c.hrName}` : ''}. The timesheet was updated.`, tone: 'text-ok' },
  REJECTED: { text: (c) => `Not approved${c.hrNote || c.managerNote ? `: “${c.hrNote ?? c.managerNote}”` : ''}`, tone: 'text-danger' },
  CANCELLED: { text: () => 'Cancelled', tone: 'text-muted' },
};

/** A correction request; with `decidePath` it shows Approve / Reject. */
export function CorrectionCard({ c, decidePath, invalidate = [], showName = true }: { c: CorrectionDto; decidePath?: string; invalidate?: string[]; showName?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<CorrectionDto>(decidePath!, { method: 'POST', json: { approve, note: note || undefined } }),
    onSuccess: (r) => {
      const first = c.userName.split(' ')[0];
      toast(
        r.status === 'APPROVED'
          ? `Approved. ${first}’s timesheet was updated.`
          : r.status === 'PENDING_HR'
            ? 'Approved. Sent to HR for the final approval.'
            : `Rejected. ${first} was notified.`,
      );
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'That didn’t work', 'danger'),
  });
  const s = STATUS_TEXT[c.status];
  return (
    <article className="rounded-card border border-line px-4 py-3.5">
      <div className="flex items-start gap-3">
        {showName && <Avatar name={c.userName} />}
        <div className="min-w-0 flex-1">
          {showName && <p className="font-semibold">{c.userName}</p>}
          <p className="text-xs text-muted">{dayName(c.workDate)}</p>
        </div>
      </div>
      <p className="mt-2 font-medium">{c.summary}</p>
      <p className="mt-1 text-sm text-muted">“{c.reason}”</p>
      <p className={clsx('mt-2 text-xs font-semibold', s.tone)}>{s.text(c)}</p>
      {decidePath && (
        <div className="mt-3 space-y-2">
          <Input placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <div className="flex gap-2">
            <Button size="sm" loading={decide.isPending && decide.variables === true} disabled={decide.isPending} onClick={() => decide.mutate(true)}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" loading={decide.isPending && decide.variables === false} disabled={decide.isPending} onClick={() => decide.mutate(false)}>
              Reject
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

/** Employee: ask to add, change or remove a punch on one day. */
export function RequestCorrectionDialog({ open, onClose, day }: { open: boolean; onClose: () => void; day: MyDayDto | null }) {
  const { user } = useAuth();
  const tz = user!.timezone;
  const qc = useQueryClient();
  const toast = useToast();
  const punches = (day?.punches ?? []).filter((p) => p.role !== 'REMOVED');
  const [action, setAction] = useState<CorrectionAction>('ADD');
  const [punchId, setPunchId] = useState('');
  const [kind, setKind] = useState<PunchKind>('OUT');
  const [time, setTime] = useState('17:00');
  const [nextDay, setNextDay] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    setReason('');
    setNextDay(false);
    const hasOut = punches.some((p) => p.role === 'OUT');
    setAction(punches.length && hasOut ? 'CHANGE' : 'ADD');
    setKind(punches.length ? 'OUT' : 'IN');
    setPunchId(punches[0]?.id ?? '');
    setTime(punches.length ? '17:00' : '08:00');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, day?.date]);

  useEffect(() => {
    const p = punches.find((x) => x.id === punchId);
    if (action === 'CHANGE' && p) setTime(wallTime(p.at, tz));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punchId, action]);

  const send = useMutation({
    mutationFn: () =>
      api<CorrectionDto>('/me/corrections', {
        method: 'POST',
        json: {
          date: day!.date,
          action,
          punchId: action === 'ADD' ? undefined : punchId || undefined,
          kind: action === 'ADD' ? kind : undefined,
          at: action === 'REMOVE' ? undefined : wallToIso(nextDay ? addDays(day!.date, 1) : day!.date, time, tz),
          reason,
        },
      }),
    onSuccess: (c) => {
      toast(c.status === 'PENDING_MANAGER' ? `Sent to ${c.managerName ?? 'your manager'} for approval` : 'Sent to HR for approval');
      void qc.invalidateQueries({ queryKey: ['my-corrections'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setError(e.message);
        setFieldErrors(e.fieldErrors);
      } else setError('That didn’t work. Try again.');
    },
  });

  if (!day) return null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Fix a punch, ${dayName(day.date)}`}
      description="Your manager approves first, then HR. Your timesheet changes once HR approves."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button data-autofocus loading={send.isPending} onClick={() => send.mutate()}>
            Send request
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        {error && <Alert>{error}</Alert>}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">What needs fixing?</legend>
          <div className="inline-flex rounded-lg bg-sunken p-1">
            {(
              [
                ['ADD', 'A punch is missing'],
                ['CHANGE', 'A time is wrong'],
                ['REMOVE', 'Remove a punch'],
              ] as [CorrectionAction, string][]
            ).map(([a, label]) => (
              <label key={a} className={clsx('cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand', action === a ? 'bg-surface shadow-sm' : 'text-muted', a !== 'ADD' && !punches.length && 'pointer-events-none opacity-40')}>
                <input type="radio" name="action" className="sr-only" checked={action === a} disabled={a !== 'ADD' && !punches.length} onChange={() => setAction(a)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {action === 'ADD' ? (
          <Field label="Missing punch" error={fieldErrors.kind?.[0]}>
            {({ id }) => (
              <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as PunchKind)}>
                <option value="IN">Clock in</option>
                <option value="OUT">Clock out</option>
                <option value="BREAK_START">Break start</option>
                <option value="BREAK_END">Back from break</option>
              </Select>
            )}
          </Field>
        ) : (
          <Field label="Which punch" error={fieldErrors.punchId?.[0]}>
            {({ id }) => (
              <Select id={id} value={punchId} onChange={(e) => setPunchId(e.target.value)}>
                {punches.map((p) => (
                  <option key={p.id} value={p.id}>
                    {clock(p.at, tz)} ({p.source === 'DEVICE' ? 'biometric' : p.source === 'WEB' ? 'web' : 'HR'})
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        {action !== 'REMOVE' && (
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Correct time" error={fieldErrors.at?.[0]}>
              {({ id, describedBy, invalid }) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} className="w-36" />}
            </Field>
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={nextDay} onChange={(e) => setNextDay(e.target.checked)} className="h-4 w-4 rounded border-line" />
              Next day (after midnight)
            </label>
          </div>
        )}

        <Field label="What happened?" error={fieldErrors.reason?.[0]} hint="For example: the scanner didn’t read my finger, or I forgot to clock out.">
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              rows={3}
              maxLength={1000}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 aria-[invalid=true]:border-danger"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
