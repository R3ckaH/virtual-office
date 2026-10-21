import { zodResolver } from '@hookform/resolvers/zod';
import {
  createUserSchema,
  ROLE_LABELS,
  ROLES,
  type CreateUserInput,
  type DepartmentDto,
  type Paged,
  type Role,
  type SessionDto,
  type UserDto,
} from '@vo/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, PageHeader, Pagination, Select, Spinner } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { allTimeZones, cityOf, formatDateTime, formatRelative } from '@/lib/format';

type ManagerOption = { id: string; fullName: string; role: Role };

export const useDepartments = () => useQuery({ queryKey: ['departments'], queryFn: () => api<DepartmentDto[]>('/departments') });
const useManagerOptions = () => useQuery({ queryKey: ['manager-options'], queryFn: () => api<ManagerOption[]>('/users/manager-options') });

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/* ----------------------------- create / edit ----------------------------- */

function UserFormDialog({ open, onClose, user }: { open: boolean; onClose: () => void; user?: UserDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const depts = useDepartments();
  const managers = useManagerOptions();
  const [error, setError] = useState<string | null>(null);
  const editing = !!user;
  const form = useForm<CreateUserInput>({ resolver: zodResolver(createUserSchema) });

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.reset({
      email: user?.email ?? '',
      fullName: user?.fullName ?? '',
      title: user?.title ?? '',
      role: user?.role ?? 'EMPLOYEE',
      departmentId: user?.departmentId ?? null,
      managerId: user?.managerId ?? null,
      timezone: user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Manila',
      sendInvite: true,
    });
  }, [open, user, form]);

  const submit = form.handleSubmit(async (v) => {
    setError(null);
    const body = { ...v, title: v.title || null, departmentId: v.departmentId || null, managerId: v.managerId || null };
    try {
      if (editing) {
        const { sendInvite: _s, ...patch } = body;
        await api(`/users/${user!.id}`, { method: 'PATCH', json: patch });
        toast(`Saved changes to ${v.fullName}`);
      } else {
        await api('/users', { method: 'POST', json: body });
        toast(v.sendInvite ? `Added ${v.fullName} and emailed an invite` : `Added ${v.fullName}`);
      }
      await qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['departments'] });
      void qc.invalidateQueries({ queryKey: ['manager-options'] });
      onClose();
    } catch (e) {
      setError(applyServerErrors(e, form.setError, ['email', 'fullName', 'title', 'role', 'departmentId', 'managerId', 'timezone']));
    }
  });

  const err = form.formState.errors;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${user!.fullName}` : 'Add a person'}
      description={editing ? undefined : "They'll get an email to set their password."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={form.formState.isSubmitting}>
            {editing ? 'Save changes' : 'Add person'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        )}
        <Field label="Full name" error={err.fullName?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register('fullName')} />}
        </Field>
        <Field label="Work email" error={err.email?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="email" aria-describedby={describedBy} aria-invalid={invalid} {...form.register('email')} />}
        </Field>
        <Field label="Job title" error={err.title?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register('title')} />}
        </Field>
        <Field label="Role" error={err.role?.message} hint="Controls what they can see and manage.">
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register('role')}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Department" error={err.departmentId?.message}>
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register('departmentId', { setValueAs: (v) => v || null })}>
              <option value="">No department</option>
              {(depts.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reports to" error={err.managerId?.message}>
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register('managerId', { setValueAs: (v) => v || null })}>
              <option value="">No manager</option>
              {(managers.data ?? [])
                .filter((m) => m.id !== user?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({ROLE_LABELS[m.role]})
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Time zone" error={err.timezone?.message} className="sm:col-span-2">
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register('timezone')}>
              {allTimeZones().map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {!editing && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 rounded border-line accent-[rgb(var(--brand))]" {...form.register('sendInvite')} />
            Email an invite now
          </label>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/* ------------------------------ person detail ------------------------------ */

function PersonDialog({ user, onClose, onEdit }: { user: UserDto | null; onClose: () => void; onEdit: (u: UserDto) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user: me } = useAuth();
  const [confirm, setConfirm] = useState<null | 'deactivate' | 'force' | 'mfa'>(null);
  const sessions = useQuery({
    queryKey: ['user-sessions', user?.id],
    queryFn: () => api<SessionDto[]>(`/users/${user!.id}/sessions`),
    enabled: !!user,
  });

  const action = useMutation({
    mutationFn: async (kind: 'deactivate' | 'activate' | 'force' | 'mfa' | 'link') => {
      const path = { deactivate: 'deactivate', activate: 'activate', force: 'force-logout', mfa: 'reset-mfa', link: 'send-password-link' }[kind];
      return { kind, result: await api<Record<string, unknown>>(`/users/${user!.id}/${path}`, { method: 'POST' }) };
    },
    onSuccess: ({ kind, result }) => {
      const name = user!.fullName;
      const msg = {
        deactivate: `${name} is deactivated and signed out`,
        activate: `${name} can sign in again`,
        force: `Signed ${name} out of ${result.sessionsEnded} session(s)`,
        mfa: `Two-step sign-in reset for ${name}`,
        link: result.sent === 'INVITE' ? `Invite sent to ${user!.email}` : `Password reset link sent to ${user!.email}`,
      }[kind];
      toast(msg);
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['user-sessions', user!.id] });
      if (kind === 'deactivate' || kind === 'activate' || kind === 'mfa') onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'danger'),
  });

  if (!user) return null;
  const self = me!.id === user.id;
  const confirmCopy = {
    deactivate: { title: `Deactivate ${user.fullName}?`, body: "They'll be signed out everywhere and can't sign in until reactivated. Their history is kept.", cta: 'Deactivate' },
    force: { title: `Sign ${user.fullName} out everywhere?`, body: 'Every browser they are signed in on will be signed out immediately.', cta: 'Sign out everywhere' },
    mfa: { title: `Reset two-step sign-in for ${user.fullName}?`, body: 'Use this if they lost their phone. They can set it up again after signing in.', cta: 'Reset' },
  };

  return (
    <>
      <Dialog open={!!user && !confirm} onClose={onClose} title={user.fullName} size="lg">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar name={user.fullName} src={user.avatarUrl} size="lg" />
            <div>
              <p className="font-medium">{user.title ?? ROLE_LABELS[user.role]}</p>
              <p className="text-sm text-muted">{user.email}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone="brand">{ROLE_LABELS[user.role]}</Badge>
                {user.status === 'ACTIVE' ? <Badge tone="ok">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}
                {user.mfaEnabled && <Badge>2-step on</Badge>}
                {user.locked && <Badge tone="warn">Locked out</Badge>}
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">Department</dt>
              <dd>{user.departmentName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Reports to</dt>
              <dd>{user.managerName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">Time zone</dt>
              <dd>{cityOf(user.timezone)}</dd>
            </div>
            <div>
              <dt className="text-muted">Last sign-in</dt>
              <dd>{formatRelative(user.lastLoginAt)}</dd>
            </div>
          </dl>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Active sessions</h3>
            {sessions.isLoading ? (
              <Spinner />
            ) : sessions.data?.length ? (
              <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                {sessions.data.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3 px-3 py-2">
                    <span>
                      {s.browser ?? 'Unknown'} on {s.os ?? 'unknown'} <span className="text-muted">· {s.ip}</span>
                    </span>
                    <span className="text-muted">active {formatRelative(s.lastActivityAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Not signed in anywhere.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => onEdit(user)}>
              Edit details
            </Button>
            {user.status === 'ACTIVE' && (
              <Button variant="secondary" onClick={() => action.mutate('link')} loading={action.isPending && action.variables === 'link'}>
                Email a sign-in link
              </Button>
            )}
            {!self && user.status === 'ACTIVE' && !!sessions.data?.length && (
              <Button variant="secondary" onClick={() => setConfirm('force')}>
                Sign out everywhere
              </Button>
            )}
            {user.mfaEnabled && (
              <Button variant="secondary" onClick={() => setConfirm('mfa')}>
                Reset two-step sign-in
              </Button>
            )}
            {user.status === 'ACTIVE' && user.locked && (
              <Button variant="secondary" onClick={() => action.mutate('activate')}>
                Unlock sign-in
              </Button>
            )}
            <span className="flex-1" />
            {!self &&
              (user.status === 'ACTIVE' ? (
                <Button variant="danger" onClick={() => setConfirm('deactivate')}>
                  Deactivate
                </Button>
              ) : (
                <Button onClick={() => action.mutate('activate')} loading={action.isPending}>
                  Reactivate
                </Button>
              ))}
          </div>
        </div>
      </Dialog>
      {confirm && (
        <Dialog
          open
          onClose={() => setConfirm(null)}
          title={confirmCopy[confirm].title}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button variant="danger" loading={action.isPending} onClick={() => action.mutate(confirm)}>
                {confirmCopy[confirm].cta}
              </Button>
            </>
          }
        >
          <p className="text-muted">{confirmCopy[confirm].body}</p>
        </Dialog>
      )}
    </>
  );
}

/* --------------------------------- page --------------------------------- */

export function UsersPage() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserDto | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<UserDto | null>(null);
  const depts = useDepartments();
  const debounced = useDebounced(search);

  useEffect(() => setPage(1), [debounced, role, departmentId, status]);

  const q = useQuery({
    queryKey: ['users', { debounced, role, departmentId, status, page }],
    queryFn: () => api<Paged<UserDto>>(`/users${qs({ search: debounced, role, departmentId, status, page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });

  // Keep the open detail dialog in sync after actions.
  useEffect(() => {
    if (viewing && q.data) {
      const fresh = q.data.items.find((u) => u.id === viewing.id);
      if (fresh && fresh !== viewing) setViewing(fresh);
    }
  }, [q.data, viewing]);

  return (
    <div>
      <PageHeader
        title="People"
        description="Add teammates, set their role and manager, and control their access."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add person
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="relative">
          <span className="sr-only">Search by name or email</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className="pl-9" />
        </label>
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="Filter by department">
          <option value="">All departments</option>
          {(depts.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="ACTIVE">Active</option>
          <option value="DEACTIVATED">Deactivated</option>
          <option value="">Everyone</option>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        {q.isLoading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : q.data && q.data.items.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No one matches these filters">Try a different search, or add someone new.</EmptyState>
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">People</caption>
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Department</th>
                <th scope="col" className="px-4 py-3 font-medium">Reports to</th>
                <th scope="col" className="px-4 py-3 font-medium">Local time zone</th>
                <th scope="col" className="px-4 py-3 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data?.items.map((u) => (
                <tr key={u.id} className="hover:bg-sunken/60">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setViewing(u)} className="flex items-center gap-3 rounded text-left">
                      <Avatar name={u.fullName} src={u.avatarUrl} size="sm" />
                      <span>
                        <span className="block font-medium hover:underline">
                          {u.fullName} {u.id === me!.id && <span className="text-muted">(you)</span>}
                        </span>
                        <span className="block text-xs text-muted">{u.email}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {ROLE_LABELS[u.role].split(' /')[0]}
                    {u.status !== 'ACTIVE' && (
                      <span className="ml-2">
                        <Badge tone="danger">Deactivated</Badge>
                      </span>
                    )}
                    {u.locked && (
                      <span className="ml-2">
                        <Badge tone="warn">Locked out</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{u.departmentName ?? <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3">{u.managerName ?? <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3">{cityOf(u.timezone)}</td>
                  <td className="px-4 py-3" title={formatDateTime(u.lastLoginAt, me!.timezone)}>
                    {u.lastLoginAt ? formatRelative(u.lastLoginAt) : <Badge tone="warn">Never signed in</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {q.data && q.data.total > q.data.pageSize && <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}

      <UserFormDialog open={formOpen} onClose={() => setFormOpen(false)} user={editing} />
      <PersonDialog
        user={formOpen ? null : viewing}
        onClose={() => setViewing(null)}
        onEdit={(u) => {
          setEditing(u);
          setFormOpen(true);
        }}
      />
    </div>
  );
}
