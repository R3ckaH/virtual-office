import type { SessionDto } from '@vo/shared';
import { useQuery } from '@tanstack/react-query';
import { Laptop, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TimeClockCard } from '@/components/attendance/TimeClockCard';
import { AnnouncementsCard } from '@/components/chat/AnnouncementsCard';
import { OfficeNowCard } from '@/components/presence/OfficeNowCard';
import { Badge, Panel } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cityOf, formatDateTime, formatRelative, offsetLabel } from '@/lib/format';

function greeting(tz: string) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomePage() {
  const { user } = useAuth();
  const u = user!;
  const sessions = useQuery({ queryKey: ['my-sessions'], queryFn: () => api<SessionDto[]>('/auth/sessions') });
  const today = new Intl.DateTimeFormat(undefined, { timeZone: u.timezone, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted">{today}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {greeting(u.timezone)}, {u.fullName.split(' ')[0]}.
        </h1>
      </div>

      <AnnouncementsCard />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <TimeClockCard />

        <Panel title="Your details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted">Department</dt>
            <dd>{u.departmentName ?? 'Not assigned'}</dd>
            <dt className="text-muted">Reports to</dt>
            <dd>{u.managerName ?? '—'}</dd>
            <dt className="text-muted">Time zone</dt>
            <dd>
              {cityOf(u.timezone)} <span className="text-muted">({offsetLabel(u.timezone)})</span>
            </dd>
            <dt className="text-muted">Two-step sign-in</dt>
            <dd>
              {u.mfaEnabled ? (
                <Badge tone="ok">On</Badge>
              ) : (
                <Link to="/settings/profile#security" className="text-brand-fg hover:underline">
                  Turn on
                </Link>
              )}
            </dd>
          </dl>
        </Panel>
      </div>

      <OfficeNowCard />

      <Panel title="Where you're signed in" description="Sign out of any device you don't recognize from Profile & security.">
        {sessions.data ? (
          <ul className="divide-y divide-line">
            {sessions.data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                {s.device === 'mobile' ? <Smartphone className="h-5 w-5 text-muted" aria-hidden /> : <Laptop className="h-5 w-5 text-muted" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {s.browser ?? 'Unknown browser'} on {s.os ?? 'unknown system'} {s.current && <Badge tone="ok">This device</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    Signed in {formatDateTime(s.createdAt, u.timezone)} · active {formatRelative(s.lastActivityAt)} · {s.ip ?? 'IP unknown'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </Panel>
    </div>
  );
}
