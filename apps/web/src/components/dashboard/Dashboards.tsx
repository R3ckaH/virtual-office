import type { DepartmentDto, MyDashboardDto, TeamDashboardDto } from '@vo/shared';
import { formatMinutes } from '@vo/shared';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CalendarDays, CheckSquare, ClipboardList, Video } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Panel, Select } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCalls } from '@/lib/calls';

const hours = (m: number) => (m / 60).toFixed(m % 60 === 0 ? 0 : 1);

/** This week's hours, your tasks, meetings coming up and leave left. */
export function MyDashboard() {
  const { user } = useAuth();
  const { joinMeeting } = useCalls();
  const q = useQuery({ queryKey: ['dashboard', 'me'], queryFn: () => api<MyDashboardDto>('/dashboard/me'), refetchInterval: 60_000 });
  const d = q.data;
  if (!d) return null;
  const tz = user!.timezone;
  const pct = d.week.scheduledMinutes ? Math.min(100, Math.round((d.week.workedMinutes / d.week.scheduledMinutes) * 100)) : 0;
  const time = (iso: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const soon = (iso: string) => Date.parse(iso) - Date.now() < 15 * 60_000;
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      <Panel title="This week">
        <p className="text-3xl font-semibold tabular">
          {hours(d.week.workedMinutes)}
          <span className="ml-1 text-base font-normal text-muted">h{d.week.scheduledMinutes ? ` of ${hours(d.week.scheduledMinutes)} h` : ''}</span>
        </p>
        {d.week.scheduledMinutes > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${pct}% of scheduled hours`}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="mt-2 text-sm text-muted">
          Today {formatMinutes(d.today.workedMinutes) || '0 min'} · {d.week.daysWorked} {d.week.daysWorked === 1 ? 'day' : 'days'} worked
        </p>
        {d.dailyReport.required && (
          <p className="mt-3 text-sm">
            {d.dailyReport.submitted ? (
              <Badge tone="ok">Today’s report filed</Badge>
            ) : (
              <Link to="/tasks?report=1" className="font-medium text-brand-fg hover:underline">
                Write today’s end-of-day report
              </Link>
            )}
          </p>
        )}
      </Panel>

      <Panel title="Coming up" action={<Link to="/meetings" className="text-sm font-medium text-brand-fg hover:underline">Calendar</Link>}>
        {d.upcomingMeetings.length === 0 ? (
          <p className="text-sm text-muted">No meetings in the next 7 days.</p>
        ) : (
          <ul className="space-y-2.5">
            {d.upcomingMeetings.map((m) => (
              <li key={`${m.meetingId}${m.start}`} className="flex items-center gap-2 text-sm">
                <Video className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.title}</span>
                  <span className="text-xs text-muted">{time(m.start)}</span>
                </span>
                {soon(m.start) && (
                  <button type="button" onClick={() => void joinMeeting(m.meetingId)} className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-brand-ink">
                    Join
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="My tasks" action={<Link to="/tasks" className="text-sm font-medium text-brand-fg hover:underline">{d.tasks.open} open</Link>}>
        {d.tasks.dueSoon.length === 0 ? (
          <p className="text-sm text-muted">Nothing on your list.</p>
        ) : (
          <ul className="space-y-2">
            {d.tasks.dueSoon.map((t) => {
              const overdue = !!t.dueDate && t.dueDate < d.today.workDate;
              return (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <Link to={`/tasks?open=${t.id}`} className="min-w-0 flex-1 truncate hover:underline">
                    {t.title}
                  </Link>
                  {t.dueDate && <span className={clsx('shrink-0 text-xs', overdue ? 'font-medium text-danger' : 'text-muted')}>{overdue ? 'Overdue' : new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${t.dueDate}T12:00:00Z`))}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Leave left" action={<Link to="/leave" className="text-sm font-medium text-brand-fg hover:underline">File leave</Link>}>
        {d.leave.length === 0 ? (
          <p className="text-sm text-muted">No leave balances set up yet.</p>
        ) : (
          <ul className="space-y-2">
            {d.leave.map((b) => (
              <li key={b.typeId} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
                <span className="flex-1">{b.typeName}</span>
                <span className="font-semibold tabular">{b.remaining}</span>
                <span className="text-xs text-muted">days</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Tile({ label, value, tone, children }: { label: string; value: number; tone?: 'danger' | 'warn' | 'ok'; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={clsx('mt-1 text-3xl font-semibold tabular', value > 0 && tone === 'danger' && 'text-danger', value > 0 && tone === 'warn' && 'text-warn', tone === 'ok' && 'text-ok')}>{value}</p>
      {children && <div className="mt-2 text-xs text-muted">{children}</div>}
    </div>
  );
}

const names = (list: { fullName: string }[], max = 3) => (list.length ? `${list.slice(0, max).map((p) => p.fullName.split(' ')[0]).join(', ')}${list.length > max ? ` +${list.length - max}` : ''}` : '');

/** Managers: their team. HR and admins: everyone, or a department. */
export function TeamDashboard() {
  const { user, can } = useAuth();
  const all = can('attendance.manage') || user!.role === 'ADMIN';
  const [dept, setDept] = useState('');
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api<DepartmentDto[]>('/departments'), enabled: all });
  const q = useQuery({ queryKey: ['dashboard', 'team', dept], queryFn: () => api<TeamDashboardDto>(`/dashboard/team${dept ? `?departmentId=${dept}` : ''}`), refetchInterval: 60_000 });
  const d = q.data;
  if (!d) return null;
  const max = Math.max(1, ...d.week.people.map((p) => Math.max(p.workedMinutes, p.scheduledMinutes)));
  const anyPending = d.pending.leave + d.pending.corrections + d.pending.reportsMissingYesterday > 0;
  return (
    <section aria-labelledby="team-today" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="team-today" className="text-lg font-semibold">
          {d.scopeLabel} today <span className="text-sm font-normal text-muted">· {d.headcount} people</span>
        </h2>
        {all && (
          <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department" className="w-52">
            <option value="">Everyone</option>
            {departments.data?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Online now" value={d.online.length} tone="ok">
          {names(d.online)}
        </Tile>
        <Tile label="Late today" value={d.late.length} tone="warn">
          {d.late.slice(0, 3).map((p) => `${p.fullName.split(' ')[0]} (${formatMinutes(p.lateMinutes)})`).join(', ')}
        </Tile>
        <Tile label="Not in yet" value={d.notIn.length} tone="warn">
          {names(d.notIn)}
        </Tile>
        <Tile label="Absent" value={d.absent.length} tone="danger">
          {names(d.absent)}
        </Tile>
        <Tile label="On leave" value={d.onLeave.length}>
          {names(d.onLeave)}
        </Tile>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Hours this week" description="Worked so far against scheduled hours.">
          {d.week.people.length === 0 ? (
            <p className="text-sm text-muted">Nobody yet.</p>
          ) : (
            <ul className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
              {d.week.people.map((p) => (
                <li key={p.userId} className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={p.fullName} size="xs" />
                    <span className="truncate">{p.fullName}</span>
                  </span>
                  <span className="relative h-2.5 rounded-full bg-sunken" role="img" aria-label={`${formatMinutes(p.workedMinutes)} of ${formatMinutes(p.scheduledMinutes)}`}>
                    <span className="absolute inset-y-0 left-0 rounded-full bg-line" style={{ width: `${(p.scheduledMinutes / max) * 100}%` }} />
                    <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${(p.workedMinutes / max) * 100}%` }} />
                  </span>
                  <span className="text-right tabular text-muted">
                    {hours(p.workedMinutes)} h{p.lateDays ? <span className="ml-1 text-warn">· {p.lateDays}L</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Waiting for you">
          {!anyPending ? (
            <p className="text-sm text-muted">All caught up.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {d.pending.leave > 0 && (
                <li className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted" aria-hidden />
                  <Link to="/leave?tab=approvals" className="font-medium text-brand-fg hover:underline">
                    {d.pending.leave} leave {d.pending.leave === 1 ? 'request' : 'requests'} to approve
                  </Link>
                </li>
              )}
              {d.pending.corrections > 0 && (
                <li className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted" aria-hidden />
                  <Link to={all ? '/admin/attendance' : '/attendance'} className="font-medium text-brand-fg hover:underline">
                    {d.pending.corrections} time {d.pending.corrections === 1 ? 'correction' : 'corrections'} to review
                  </Link>
                </li>
              )}
              {d.pending.reportsMissingYesterday > 0 && (
                <li className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted" aria-hidden />
                  <Link to="/tasks" className="hover:underline">
                    {d.pending.reportsMissingYesterday} end-of-day {d.pending.reportsMissingYesterday === 1 ? 'report' : 'reports'} missing from yesterday
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}
