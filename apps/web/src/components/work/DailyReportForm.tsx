import type { MyDailyReportDto } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Dialog, Field, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';

export const reportKey = ['daily-report', 'me'] as const;

const area = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';

/** What I did, blockers, plan for tomorrow. Starts from the tasks you finished today. */
export function DailyReportForm({ onSaved, formId = 'daily-report', hideSubmit }: { onSaved?: () => void; formId?: string; hideSubmit?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: reportKey, queryFn: () => api<MyDailyReportDto>('/daily-reports/me') });
  const [accomplished, setAccomplished] = useState('');
  const [blockers, setBlockers] = useState('');
  const [plan, setPlan] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!q.data || loaded) return;
    const r = q.data.report;
    setAccomplished(r?.accomplished ?? q.data.tasksDone.map((t) => `- ${t.title}`).join('\n'));
    setBlockers(r?.blockers ?? '');
    setPlan(r?.plan ?? '');
    setLoaded(true);
  }, [q.data, loaded]);

  const save = useMutation({
    mutationFn: () => api<MyDailyReportDto>('/daily-reports/me', { method: 'PUT', json: { accomplished, blockers, plan, workDate: q.data?.workDate } }),
    onSuccess: (d) => {
      qc.setQueryData(reportKey, d);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast('Report saved. Your manager can see it.');
      onSaved?.();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t save the report.'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!accomplished.trim()) return setError('Write what you got done today.');
    save.mutate();
  }

  if (q.isLoading) return <Spinner />;
  const d = q.data;
  const day = d ? new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${d.workDate}T12:00:00Z`)) : '';
  return (
    <form id={formId} onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted">
        For {day}.{d?.required ? ' Your team asks for this before you clock out.' : ''}
      </p>
      {d?.report && (
        <p className="flex items-center gap-1.5 text-sm text-ok">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Filed {new Date(d.report.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. You can still update it.
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      <Field label="What I did today" hint={d?.tasksDone.length ? 'Started from the tasks you marked done today.' : undefined}>
        {(f) => <textarea id={f.id} aria-describedby={f.describedBy} rows={5} maxLength={4000} value={accomplished} onChange={(e) => setAccomplished(e.target.value)} className={area} />}
      </Field>
      <Field label="Blockers (optional)">
        {(f) => <textarea id={f.id} rows={2} maxLength={2000} value={blockers} onChange={(e) => setBlockers(e.target.value)} className={area} placeholder="Anything stopping you, or help you need" />}
      </Field>
      <Field label="Plan for tomorrow (optional)">
        {(f) => <textarea id={f.id} rows={3} maxLength={2000} value={plan} onChange={(e) => setPlan(e.target.value)} className={area} />}
      </Field>
      {!hideSubmit && (
        <Button type="submit" loading={save.isPending}>
          {d?.report ? 'Update report' : 'Submit report'}
        </Button>
      )}
      {hideSubmit && <span hidden data-saving={save.isPending} />}
    </form>
  );
}

/** Shown when a clock-out needs the report first; clocks out once it's filed. */
export function DailyReportDialog({ open, onClose, onFiled }: { open: boolean; onClose: () => void; onFiled: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="End-of-day report"
      description="File your report to clock out."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button type="submit" form="clockout-report">
            Submit and clock out
          </Button>
        </>
      }
    >
      {open && <DailyReportForm formId="clockout-report" hideSubmit onSaved={onFiled} />}
    </Dialog>
  );
}
