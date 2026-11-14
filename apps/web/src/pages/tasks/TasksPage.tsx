import type { DepartmentDto, TaskDto, TaskStatus, TeamReportsDto } from '@vo/shared';
import { TASK_STATUS_LABELS, TASK_STATUSES } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ArrowLeft, ArrowRight, CalendarDays, Plus } from 'lucide-react';
import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, PageHeader, Panel, Select, Spinner } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { DailyReportForm } from '@/components/work/DailyReportForm';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePresence } from '@/lib/presence';

type Tab = 'mine' | 'team' | 'report' | 'reports';
export const tasksKey = ['tasks'] as const;

const dueLabel = (d: string) => new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${d}T12:00:00Z`));

export function TasksPage() {
  const { user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  const lead = can('team.read') || can('attendance.manage');
  const [tab, setTab] = useState<Tab>(params.get('report') ? 'report' : 'mine');
  const [editing, setEditing] = useState<TaskDto | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  useEffect(() => {
    if (params.get('open') || params.get('report')) {
      params.delete('open');
      params.delete('report');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'mine', label: 'My tasks' },
    ...(user!.departmentId || lead ? [{ id: 'team' as const, label: 'Team board' }] : []),
    { id: 'report', label: 'End-of-day report' },
    ...(lead ? [{ id: 'reports' as const, label: 'Team reports' }] : []),
  ];
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Your to-do list and your team’s board. Drag a card to another column, or open it to change it."
        actions={
          tab === 'mine' || tab === 'team' ? (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden /> New task
            </Button>
          ) : undefined
        }
      />
      <div role="tablist" aria-label="Tasks" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx('-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium', tab === t.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'mine' && <MyBoard onOpen={setEditing} openId={openId} clearOpen={() => setOpenId(null)} />}
      {tab === 'team' && <TeamBoard onOpen={setEditing} />}
      {tab === 'report' && (
        <Panel title="End-of-day report" className="max-w-2xl">
          <DailyReportForm />
        </Panel>
      )}
      {tab === 'reports' && <TeamReports />}
      {editing && <TaskDialog task={editing === 'new' ? null : editing} defaultTeam={tab === 'team'} onClose={() => setEditing(null)} />}
    </>
  );
}

/* ---------------- boards ---------------- */

function MyBoard({ onOpen, openId, clearOpen }: { onOpen: (t: TaskDto) => void; openId: string | null; clearOpen: () => void }) {
  const { can } = useAuth();
  const { people, me } = usePresence();
  const lead = can('team.read') || can('attendance.manage');
  const [who, setWho] = useState('');
  const reports = useMemo(() => Object.values(people).filter((p) => p.userId !== me).sort((a, b) => a.fullName.localeCompare(b.fullName)), [people, me]);
  const q = useQuery({
    queryKey: [...tasksKey, who ? 'person' : 'mine', who],
    queryFn: () => api<TaskDto[]>(who ? `/tasks?scope=person&userId=${who}` : '/tasks?scope=mine'),
  });
  useEffect(() => {
    if (!openId || !q.data) return;
    const t = q.data.find((x) => x.id === openId);
    if (t) onOpen(t);
    clearOpen();
  }, [openId, q.data, onOpen, clearOpen]);
  return (
    <div className="space-y-4">
      {lead && (
        <Select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose tasks" className="w-64">
          <option value="">My tasks</option>
          {reports.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.fullName}
            </option>
          ))}
        </Select>
      )}
      <Board tasks={q.data} loading={q.isLoading} onOpen={onOpen} empty="Nothing here yet. Add a task with New task." />
    </div>
  );
}

function TeamBoard({ onOpen }: { onOpen: (t: TaskDto) => void }) {
  const { user, can } = useAuth();
  const lead = can('team.read') || can('attendance.manage');
  const [dept, setDept] = useState(user!.departmentId ?? '');
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api<DepartmentDto[]>('/departments'), enabled: lead });
  const q = useQuery({ queryKey: [...tasksKey, 'team', dept], queryFn: () => api<TaskDto[]>(`/tasks?scope=team${dept ? `&departmentId=${dept}` : ''}`), enabled: !!dept });
  return (
    <div className="space-y-4">
      {lead && (
        <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Team" className="w-64">
          <option value="">Choose a team</option>
          {departments.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      )}
      {dept ? <Board tasks={q.data} loading={q.isLoading} onOpen={onOpen} empty="No team tasks yet. Anyone on the team can add one and anyone can pick it up." /> : <p className="text-sm text-muted">Pick a team.</p>}
    </div>
  );
}

function useUpdateTask() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { id: string; status: TaskStatus }) => api<TaskDto>(`/tasks/${v.id}`, { method: 'PATCH', json: { status: v.status } }),
    onMutate: async (v) => {
      // move the card right away
      const snapshots = qc.getQueriesData<TaskDto[]>({ queryKey: tasksKey });
      for (const [key, list] of snapshots) if (list) qc.setQueryData(key, list.map((t) => (t.id === v.id ? { ...t, status: v.status } : t)));
      return { snapshots };
    },
    onError: (e, _v, ctx) => {
      for (const [key, list] of ctx?.snapshots ?? []) qc.setQueryData(key, list);
      toast(e instanceof ApiError ? e.message : 'Couldn’t move the task.', 'danger');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: tasksKey });
      void qc.invalidateQueries({ queryKey: ['daily-report'] });
    },
  });
}

function Board({ tasks, loading, onOpen, empty }: { tasks: TaskDto[] | undefined; loading: boolean; onOpen: (t: TaskDto) => void; empty: string }) {
  const move = useUpdateTask();
  const [over, setOver] = useState<TaskStatus | null>(null);
  if (loading) return <Spinner />;
  if (!tasks?.length) return <EmptyState title="No tasks">{empty}</EmptyState>;
  const drop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/task');
    const t = tasks.find((x) => x.id === id);
    if (t && t.status !== status) move.mutate({ id, status });
  };
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {TASK_STATUSES.map((status, col) => {
        const list = tasks.filter((t) => t.status === status);
        return (
          <section
            key={status}
            aria-label={`${TASK_STATUS_LABELS[status]}, ${list.length}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('text/task')) {
                e.preventDefault();
                setOver(status);
              }
            }}
            onDragLeave={() => setOver(null)}
            onDrop={drop(status)}
            className={clsx('flex min-h-[12rem] flex-col rounded-card border bg-sunken/50 p-2', over === status ? 'border-brand ring-2 ring-brand/30' : 'border-line')}
          >
            <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold">
              {TASK_STATUS_LABELS[status]}
              <span className="rounded-full bg-surface px-2 text-xs text-muted tabular">{list.length}</span>
            </h2>
            <ul className="flex-1 space-y-2">
              {list.map((t) => (
                <TaskCard key={t.id} t={t} onOpen={onOpen} prev={TASK_STATUSES[col - 1]} next={TASK_STATUSES[col + 1]} onMove={(s) => move.mutate({ id: t.id, status: s })} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TaskCard({ t, onOpen, prev, next, onMove }: { t: TaskDto; onOpen: (t: TaskDto) => void; prev?: TaskStatus; next?: TaskStatus; onMove: (s: TaskStatus) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!t.dueDate && t.dueDate < today && t.status !== 'DONE';
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task', t.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="group cursor-grab rounded-lg border border-line bg-surface p-3 shadow-sm active:cursor-grabbing"
    >
      <button type="button" onClick={() => onOpen(t)} className={clsx('block w-full text-left text-sm font-medium', t.status === 'DONE' && 'text-muted line-through')}>
        {t.title}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {t.assigneeName ? (
          <span className="inline-flex items-center gap-1">
            <Avatar name={t.assigneeName} size="xs" />
            {t.assigneeName.split(' ')[0]}
          </span>
        ) : (
          <span className="italic">Unassigned</span>
        )}
        {t.dueDate && (
          <span className={clsx('inline-flex items-center gap-1', overdue && 'font-medium text-danger')}>
            <CalendarDays className="h-3 w-3" aria-hidden /> {overdue ? 'Overdue · ' : ''}
            {dueLabel(t.dueDate)}
          </span>
        )}
        {t.departmentName && <Badge>{t.departmentName}</Badge>}
        <span className="ml-auto flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {prev && (
            <button type="button" onClick={() => onMove(prev)} className="rounded p-1 hover:bg-sunken" aria-label={`Move “${t.title}” to ${TASK_STATUS_LABELS[prev]}`}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          {next && (
            <button type="button" onClick={() => onMove(next)} className="rounded p-1 hover:bg-sunken" aria-label={`Move “${t.title}” to ${TASK_STATUS_LABELS[next]}`}>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

/* ---------------- add / edit ---------------- */

function TaskDialog({ task, defaultTeam, onClose }: { task: TaskDto | null; defaultTeam: boolean; onClose: () => void }) {
  const { user, can } = useAuth();
  const { people } = usePresence();
  const qc = useQueryClient();
  const toast = useToast();
  const lead = can('team.read') || can('attendance.manage');
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api<DepartmentDto[]>('/departments'), enabled: lead });
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'TODO');
  const [departmentId, setDepartmentId] = useState(task ? (task.departmentId ?? '') : defaultTeam ? (user!.departmentId ?? '') : '');
  const [assigneeId, setAssigneeId] = useState(task ? (task.assigneeId ?? '') : defaultTeam ? '' : user!.id);
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const all = Object.values(people).sort((a, b) => a.fullName.localeCompare(b.fullName));
    if (lead || can('users.manage')) return all;
    return all.filter((p) => p.userId === user!.id || (user!.departmentName && p.departmentName === user!.departmentName));
  }, [people, lead, can, user]);

  const body = () => ({ title, description: description || null, status, assigneeId: assigneeId || null, departmentId: departmentId || null, dueDate: dueDate || null });
  const save = useMutation({
    mutationFn: () => (task ? api<TaskDto>(`/tasks/${task.id}`, { method: 'PATCH', json: body() }) : api<TaskDto>('/tasks', { method: 'POST', json: body() })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: tasksKey });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast(task ? 'Task saved.' : 'Task added.');
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t save the task.'),
  });
  const del = useMutation({
    mutationFn: () => api(`/tasks/${task!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: tasksKey });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t delete the task.'),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Give the task a title.');
    save.mutate();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={task ? 'Task' : 'New task'}
      description={task?.createdByName ? `Added by ${task.createdByName}` : undefined}
      size="md"
      footer={
        <>
          {task?.canDelete && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => del.mutate()} loading={del.isPending}>
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" loading={save.isPending}>
            {task ? 'Save' : 'Add task'}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Title">{(f) => <Input id={f.id} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus={!task} />}</Field>
        <Field label="Details (optional)">
          {(f) => (
            <textarea
              id={f.id}
              rows={3}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            {(f) => (
              <Select id={f.id} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due (optional)">{(f) => <Input id={f.id} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}</Field>
          <Field label="Assigned to">
            {(f) => (
              <Select id={f.id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Nobody yet</option>
                {candidates.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.userId === user!.id ? `Me (${p.fullName})` : p.fullName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Team board" hint={departmentId ? 'Everyone on the team sees it.' : 'Personal: only you, the assignee and their manager see it.'}>
            {(f) => (
              <Select id={f.id} aria-describedby={f.describedBy} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">None (personal)</option>
                {lead
                  ? departments.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))
                  : user!.departmentId && <option value={user!.departmentId}>{user!.departmentName}</option>}
              </Select>
            )}
          </Field>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------------- team reports ---------------- */

function TeamReports() {
  const { can } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dept, setDept] = useState('');
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api<DepartmentDto[]>('/departments'), enabled: can('attendance.manage') });
  const q = useQuery({ queryKey: ['daily-report', 'team', date, dept], queryFn: () => api<TeamReportsDto>(`/daily-reports/team?date=${date}${dept ? `&departmentId=${dept}` : ''}`) });
  const [open, setOpen] = useState<string | null>(null);
  const rows = q.data?.rows ?? [];
  const filed = rows.filter((r) => r.report).length;
  const missing = rows.filter((r) => !r.report && r.worked && r.required).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Day" className="w-44">
          {(f) => <Input id={f.id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        {can('attendance.manage') && (
          <Field label="Department" className="w-56">
            {(f) => (
              <Select id={f.id} value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">Everyone</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {rows.length > 0 && (
          <p className="pb-2 text-sm text-muted">
            {filed} filed{missing ? ` · ${missing} required but missing` : ''}
          </p>
        )}
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : !rows.length ? (
        <EmptyState title="Nobody to show">Reports from the people you manage appear here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {rows.map((r) => (
            <li key={r.userId} className="px-4 py-3">
              <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === r.userId ? null : r.userId)} aria-expanded={open === r.userId} disabled={!r.report}>
                <Avatar name={r.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{r.fullName}</span>
                  <span className="block text-xs text-muted">{r.departmentName}</span>
                </span>
                {r.report ? (
                  <Badge tone="ok">Filed {new Date(r.report.submittedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Badge>
                ) : !r.worked ? (
                  <Badge>Didn’t work</Badge>
                ) : r.required ? (
                  <Badge tone="danger">Missing</Badge>
                ) : (
                  <Badge tone="neutral">Not filed</Badge>
                )}
              </button>
              {open === r.userId && r.report && (
                <dl className="mt-3 grid gap-3 pl-11 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="font-medium">Did</dt>
                    <dd className="whitespace-pre-wrap text-muted">{r.report.accomplished}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Blockers</dt>
                    <dd className="whitespace-pre-wrap text-muted">{r.report.blockers || 'None'}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Tomorrow</dt>
                    <dd className="whitespace-pre-wrap text-muted">{r.report.plan || '—'}</dd>
                  </div>
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
