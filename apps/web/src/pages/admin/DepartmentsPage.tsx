import { zodResolver } from '@hookform/resolvers/zod';
import { departmentSchema, type DepartmentDto, type DepartmentInput, type Paged, type UserDto } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Button, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useDepartments } from './UsersPage';

function DepartmentDialog({ open, onClose, dept }: { open: boolean; onClose: () => void; dept?: DepartmentDto }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const people = useQuery({
    queryKey: ['users', 'all-active'],
    queryFn: () => api<Paged<UserDto>>('/users?status=ACTIVE&pageSize=100'),
    enabled: open,
  });
  const form = useForm<DepartmentInput>({ resolver: zodResolver(departmentSchema) });
  useEffect(() => {
    if (open) {
      setError(null);
      form.reset({ name: dept?.name ?? '', headUserId: dept?.headUserId ?? null, requireDailyReport: dept?.requireDailyReport ?? false });
    }
  }, [open, dept, form]);

  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api(dept ? `/departments/${dept.id}` : '/departments', { method: dept ? 'PATCH' : 'POST', json: { ...v, headUserId: v.headUserId || null } });
      toast(dept ? `Saved ${v.name}` : `Added ${v.name}`);
      await qc.invalidateQueries({ queryKey: ['departments'] });
      onClose();
    } catch (e) {
      setError(applyServerErrors(e, form.setError, ['name', 'headUserId']));
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={dept ? `Edit ${dept.name}` : 'Add a department'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={form.formState.isSubmitting}>
            {dept ? 'Save changes' : 'Add department'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Field label="Name" error={form.formState.errors.name?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} autoFocus aria-describedby={describedBy} aria-invalid={invalid} {...form.register('name')} />}
        </Field>
        <Field label="Department head" error={form.formState.errors.headUserId?.message}>
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register('headUserId', { setValueAs: (v) => v || null })}>
              <option value="">No head assigned</option>
              {(people.data?.items ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" {...form.register('requireDailyReport')} />
          <span>
            <span className="block font-medium">Require an end-of-day report</span>
            <span className="block text-muted">People in this department file a short report (what they did, blockers, plan for tomorrow) before clocking out on the web. Biometric punches are never blocked.</span>
          </span>
        </label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function DepartmentsPage() {
  const q = useDepartments();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentDto | undefined>();
  const [deleting, setDeleting] = useState<DepartmentDto | null>(null);
  const remove = useMutation({
    mutationFn: (d: DepartmentDto) => api(`/departments/${d.id}`, { method: 'DELETE' }),
    onSuccess: (_r, d) => {
      toast(`Removed ${d.name}`);
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['departments'] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not remove it', 'danger'),
  });

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Departments group people on the office floor, in chat channels and in reports."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add department
          </Button>
        }
      />
      {q.isLoading ? (
        <Spinner />
      ) : !q.data?.length ? (
        <EmptyState title="No departments yet">Add your first department to start organizing the office.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((d) => (
            <li key={d.id} className="flex flex-col rounded-card border border-line bg-surface p-5">
              <h2 className="text-lg font-semibold">{d.name}</h2>
              <p className="mt-1 text-sm text-muted">
                {d.memberCount} {d.memberCount === 1 ? 'person' : 'people'} · Head: {d.headUserName ?? 'not assigned'}
                {d.requireDailyReport ? ' · End-of-day report required' : ''}
              </p>
              <div className="mt-5 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(d);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(d)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <DepartmentDialog open={open} onClose={() => setOpen(false)} dept={editing} />
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Remove ${deleting?.name}?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              Remove department
            </Button>
          </>
        }
      >
        <p className="text-muted">
          {deleting?.memberCount
            ? `The ${deleting.memberCount} people in it will stay, without a department, until you move them.`
            : 'No one is in this department.'}
        </p>
      </Dialog>
    </div>
  );
}
