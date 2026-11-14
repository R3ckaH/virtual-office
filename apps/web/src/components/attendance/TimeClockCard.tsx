import type { ClockStateDto, PunchKind } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Clock, Coffee, LogIn, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { DailyReportDialog } from '@/components/work/DailyReportForm';
import { useAuth } from '@/lib/auth';
import { clock, hms, liveMinutes, SourceIcon, StatusChip, useNow } from './parts';

const ACTION: Record<PunchKind, { label: string; done: string; icon: typeof LogIn; variant: 'primary' | 'secondary' }> = {
  IN: { label: 'Clock in', done: 'Clocked in', icon: LogIn, variant: 'primary' },
  BREAK_START: { label: 'Start break', done: 'Break started', icon: Coffee, variant: 'secondary' },
  BREAK_END: { label: 'End break', done: 'Back from break', icon: LogIn, variant: 'primary' },
  OUT: { label: 'Clock out', done: 'Clocked out', icon: LogOut, variant: 'secondary' },
};

export const clockKey = ['my-clock'];

/** Home screen card: clock in, take breaks, clock out; today's hours count up live. */
export function TimeClockCard({ showLink = true }: { showLink?: boolean }) {
  const { user } = useAuth();
  const tz = user!.timezone;
  const qc = useQueryClient();
  const toast = useToast();
  const now = useNow(1000);
  const state = useQuery({ queryKey: clockKey, queryFn: () => api<ClockStateDto>('/me/clock'), refetchInterval: 60_000 });
  const punch = useMutation({
    mutationFn: (action: PunchKind) => api<ClockStateDto>('/me/clock', { method: 'POST', json: { action } }),
    onSuccess: (data, action) => {
      qc.setQueryData(clockKey, data);
      void qc.invalidateQueries({ queryKey: ['my-attendance'] });
      toast(`${ACTION[action].done} at ${clock(new Date().toISOString(), tz)}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'DAILY_REPORT_REQUIRED') {
        setNeedReport(true);
        return;
      }
      toast(e instanceof ApiError ? e.message : 'That didn’t work. Try again.', 'danger');
      void qc.invalidateQueries({ queryKey: clockKey });
    },
  });
  const [needReport, setNeedReport] = useState(false);

  const s = state.data;
  const day = s?.day ?? null;
  const running = !!day?.openSince;
  const minutes = liveMinutes(day, now);
  const visible = (s?.punches ?? []).filter((p) => p.role !== 'REMOVED' && p.role !== 'MERGED');

  return (
    <section className="relative overflow-hidden rounded-card border border-line bg-surface p-6" aria-labelledby="clock-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="clock-title" className="text-lg font-semibold">
            Time clock
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {s?.tracked === false
              ? 'Attendance isn’t tracked for your role, so there’s nothing to clock.'
              : day?.scheduleStart
                ? `Your shift today: ${clock(day.scheduleStart, tz)} – ${clock(day.scheduleEnd, tz)}.`
                : 'No shift scheduled today. You can still clock in if you’re working.'}
          </p>
        </div>
        {day && s?.tracked && <StatusChip day={day} />}
      </div>

      {state.isLoading && (
        <div className="mt-8">
          <Spinner label="Checking your clock" />
        </div>
      )}
      {state.isError && (
        <div className="mt-6">
          <Alert>Couldn’t load your clock. Refresh the page to try again.</Alert>
        </div>
      )}

      {s?.tracked && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
            <p className={clsx('tabular text-4xl font-semibold', !running && 'text-muted')} aria-live="off">
              <span className="sr-only">Worked today: </span>
              {hms(minutes)}
            </p>
            <div className="flex flex-wrap gap-2">
              {s.allowed.map((a) => {
                const A = ACTION[a];
                return (
                  <Button
                    key={a}
                    size="lg"
                    variant={A.variant}
                    loading={punch.isPending && punch.variables === a}
                    disabled={punch.isPending}
                    onClick={() => punch.mutate(a)}
                    className={a === 'IN' ? 'px-7' : undefined}
                  >
                    <A.icon className="h-5 w-5" aria-hidden /> {A.label}
                  </Button>
                );
              })}
            </div>
          </div>
          {visible.length > 0 ? (
            <ol className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted" aria-label="Today's punches">
              {visible.map((p) => (
                <li key={p.id} className="inline-flex items-center gap-1.5">
                  <SourceIcon source={p.source} />
                  <span className="tabular font-medium text-ink">{clock(p.at, tz)}</span>
                  {roleLabel(p.role)}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted">
              <Clock className="h-4 w-4" aria-hidden /> Badging in at the office counts too; it shows up here.
            </p>
          )}
          {showLink && (
            <p className="mt-4 text-sm">
              <Link to="/attendance" className="text-brand-fg hover:underline">
                See your week and fix a missed punch
              </Link>
            </p>
          )}
        </>
      )}
      <DailyReportDialog
        open={needReport}
        onClose={() => setNeedReport(false)}
        onFiled={() => {
          setNeedReport(false);
          punch.mutate('OUT');
        }}
      />
    </section>
  );
}

function roleLabel(role: string): string {
  switch (role) {
    case 'IN':
      return 'in';
    case 'OUT':
      return 'out';
    case 'BREAK_START':
      return 'break';
    case 'BREAK_END':
      return 'back';
    default:
      return 'not counted';
  }
}
