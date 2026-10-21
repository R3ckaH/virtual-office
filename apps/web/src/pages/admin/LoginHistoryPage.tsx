import { AUTH_EVENT_TYPES, type AuthEventDto, type AuthEventType, type Paged, type UserDto } from '@vo/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Badge, EmptyState, Input, PageHeader, Pagination, Select, Spinner } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, zonedDayStartIso } from '@/lib/format';

export const EVENT_LABELS: Record<AuthEventType, string> = {
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILED: 'Sign-in failed',
  LOGIN_LOCKED: 'Locked out',
  LOGOUT: 'Signed out',
  SESSION_TIMEOUT: 'Timed out (inactive)',
  FORCED_LOGOUT: 'Signed out by admin',
  PASSWORD_RESET_REQUESTED: 'Reset link requested',
  PASSWORD_RESET: 'Password reset',
  PASSWORD_CHANGED: 'Password changed',
  MFA_ENABLED: '2-step turned on',
  MFA_DISABLED: '2-step turned off',
  MFA_FAILED: 'Wrong 2-step code',
  REFRESH_TOKEN_REUSE: 'Suspicious session reuse',
};

const TONE: Partial<Record<AuthEventType, 'ok' | 'warn' | 'danger' | 'neutral'>> = {
  LOGIN_SUCCESS: 'ok',
  LOGIN_FAILED: 'warn',
  MFA_FAILED: 'warn',
  LOGIN_LOCKED: 'danger',
  FORCED_LOGOUT: 'danger',
  REFRESH_TOKEN_REUSE: 'danger',
};

export function LoginHistoryPage() {
  const { user } = useAuth();
  const tz = user!.timezone;
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [userId, type, from, to]);

  const people = useQuery({ queryKey: ['users', 'picker'], queryFn: () => api<Paged<UserDto>>('/users?pageSize=100') });
  const q = useQuery({
    queryKey: ['auth-events', { userId, type, from, to, page }],
    queryFn: () =>
      api<Paged<AuthEventDto>>(
        `/auth-events${qs({
          userId,
          type,
          from: from ? zonedDayStartIso(from, tz) : undefined,
          to: to ? zonedDayStartIso(to, tz, 1) : undefined,
          page,
          pageSize: 50,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title="Login history" description={`Every sign-in, sign-out, timeout and forced sign-out, with IP address and browser. Times are in ${tz.replace(/_/g, ' ')}.`} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Person">
          <option value="">Everyone</option>
          {(people.data?.items ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Event">
          <option value="">All events</option>
          {AUTH_EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_LABELS[t]}
            </option>
          ))}
        </Select>
        <label className="text-sm">
          <span className="sr-only">From date</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        </label>
        <label className="text-sm">
          <span className="sr-only">To date</span>
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </label>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        {q.isLoading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : !q.data?.items.length ? (
          <div className="p-6">
            <EmptyState title="No sign-in activity for these filters" />
          </div>
        ) : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Login history</caption>
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">When</th>
                <th scope="col" className="px-4 py-3 font-medium">Person</th>
                <th scope="col" className="px-4 py-3 font-medium">Event</th>
                <th scope="col" className="px-4 py-3 font-medium">IP address</th>
                <th scope="col" className="px-4 py-3 font-medium">Browser & device</th>
                <th scope="col" className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.items.map((e) => (
                <tr key={e.id}>
                  <td className="tabular whitespace-nowrap px-4 py-3">{formatDateTime(e.createdAt, tz)}</td>
                  <td className="px-4 py-3">
                    <span className="block">{e.userName ?? <span className="text-muted">Unknown account</span>}</span>
                    <span className="block text-xs text-muted">{e.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[e.type] ?? 'neutral'}>{EVENT_LABELS[e.type]}</Badge>
                  </td>
                  <td className="tabular px-4 py-3">{e.ip ?? '—'}</td>
                  <td className="px-4 py-3">{[e.browser, e.os].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-3 text-muted">{e.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {q.data && q.data.total > q.data.pageSize && <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
    </div>
  );
}
