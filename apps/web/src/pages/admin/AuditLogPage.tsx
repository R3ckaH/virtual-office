import type { AuditLogDto, Paged } from '@vo/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { EmptyState, PageHeader, Pagination, Select, Spinner } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';

const ACTION_LABELS: Record<string, string> = {
  'user.create': 'Added a person',
  'user.update': 'Edited a person',
  'user.deactivate': 'Deactivated a person',
  'user.activate': 'Reactivated a person',
  'user.unlock': 'Unlocked sign-in',
  'user.force_logout': 'Signed someone out',
  'user.reset_mfa': 'Reset two-step sign-in',
  'user.send_invite': 'Sent an invite',
  'user.send_password_reset': 'Sent a reset link',
  'department.create': 'Added a department',
  'department.update': 'Edited a department',
  'department.delete': 'Removed a department',
};

function Changes({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  if (!keys.length) return <span className="text-muted">—</span>;
  const show = (v: unknown) => (v === null || v === undefined ? 'empty' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <ul className="space-y-0.5">
      {keys.map((k) => (
        <li key={k}>
          <span className="text-muted">{k}:</span> {k in b && <s className="text-muted">{show(b[k])}</s>} {k in a && <span>{show(a[k])}</span>}
        </li>
      ))}
    </ul>
  );
}

export function AuditLogPage() {
  const { user } = useAuth();
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [entityType]);
  const q = useQuery({
    queryKey: ['audit-logs', { entityType, page }],
    queryFn: () => api<Paged<AuditLogDto>>(`/audit-logs${qs({ entityType, page, pageSize: 50 })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title="Audit log" description="A permanent record of changes made by administrators." />
      <div className="mb-4 max-w-xs">
        <Select value={entityType} onChange={(e) => setEntityType(e.target.value)} aria-label="Filter by area">
          <option value="">All areas</option>
          <option value="user">People</option>
          <option value="department">Departments</option>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        {q.isLoading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : !q.data?.items.length ? (
          <div className="p-6">
            <EmptyState title="No changes recorded yet" />
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Audit log</caption>
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">When</th>
                <th scope="col" className="px-4 py-3 font-medium">Who</th>
                <th scope="col" className="px-4 py-3 font-medium">What</th>
                <th scope="col" className="px-4 py-3 font-medium">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {q.data.items.map((l) => (
                <tr key={l.id}>
                  <td className="tabular whitespace-nowrap px-4 py-3">{formatDateTime(l.createdAt, user!.timezone)}</td>
                  <td className="px-4 py-3">{l.actorName ?? 'System'}</td>
                  <td className="px-4 py-3">
                    {ACTION_LABELS[l.action] ?? l.action}
                    {l.entityName && <span className="block font-medium">{l.entityName}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Changes before={l.before} after={l.after} />
                  </td>
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
