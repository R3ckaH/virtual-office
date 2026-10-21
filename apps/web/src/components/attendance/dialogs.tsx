import type { AttendanceDayDto } from '@vo/shared';
import { addDays } from '@vo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, Field, Input } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { dayName, wallTime, wallToIso } from './parts';

const refresh = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of ['hr-board', 'person-day', 'hr-exceptions']) void qc.invalidateQueries({ queryKey: [k] });
};

/** HR: replace a day's punches with a clock-in (and clock-out). The old punches stay on record as removed. */
export function AdjustTimesDialog({
  open,
  onClose,
  userId,
  name,
  date,
  day,
  tz,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  name: string;
  date: string;
  day: AttendanceDayDto | null;
  tz: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [inTime, setIn] = useState('08:00');
  const [outTime, setOut] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIn(wallTime(day?.firstIn ?? day?.scheduleStart, tz) || '08:00');
    setOut(wallTime(day?.lastOut, tz));
    setReason('');
    setErrors({});
    setError(null);
  }, [open, day, tz]);

  const save = useMutation({
    mutationFn: () => {
      const inIso = wallToIso(date, inTime, tz);
      // a clock-out earlier than the clock-in means it's after midnight
      const outIso = outTime ? wallToIso(outTime <= inTime ? addDays(date, 1) : date, outTime, tz) : null;
      return api(`/attendance/days/${userId}/${date}/times`, { method: 'PUT', json: { in: inIso, out: outIso, reason } });
    },
    onSuccess: () => {
      toast(`Saved ${name.split(' ')[0]}’s times for ${dayName(date)}`);
      refresh(qc);
      onClose();
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'That didn’t work');
      if (e instanceof ApiError) setErrors(e.fieldErrors);
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Adjust times for ${name}`}
      description={`${dayName(date, { weekday: 'long', month: 'long', day: 'numeric' })}. The current punches are kept on record, marked as replaced.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button data-autofocus loading={save.isPending} onClick={() => save.mutate()}>
            Save times
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Clock in" error={errors.in?.[0]}>
            {({ id }) => <Input id={id} type="time" value={inTime} onChange={(e) => setIn(e.target.value)} />}
          </Field>
          <Field label="Clock out" hint="Leave empty if still working" error={errors.out?.[0]}>
            {({ id, describedBy }) => <Input id={id} type="time" value={outTime} onChange={(e) => setOut(e.target.value)} aria-describedby={describedBy} />}
          </Field>
        </div>
        <Field label="Reason" error={errors.reason?.[0]} hint="Shown in the audit log and on the punches.">
          {({ id, describedBy, invalid }) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} maxLength={500} />}
        </Field>
      </div>
    </Dialog>
  );
}

export function NoteDialog({ open, onClose, userId, name, date, current }: { open: boolean; onClose: () => void; userId: string; name: string; date: string; current: string | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState(current ?? '');
  useEffect(() => {
    if (open) setNote(current ?? '');
  }, [open, current]);
  const save = useMutation({
    mutationFn: () => api(`/attendance/days/${userId}/${date}/note`, { method: 'PATCH', json: { note: note.trim() || null } }),
    onSuccess: () => {
      toast('Note saved');
      refresh(qc);
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'That didn’t work', 'danger'),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={`Note for ${name}`}
      description={dayName(date)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button data-autofocus loading={save.isPending} onClick={() => save.mutate()}>
            Save note
          </Button>
        </>
      }
    >
      <label className="sr-only" htmlFor="day-note">
        Note
      </label>
      <textarea
        id="day-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        maxLength={500}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
    </Dialog>
  );
}
