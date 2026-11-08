import type { RoomDto, RoomKind, UpdateRoomInput } from '@vo/shared';
import { ROOM_KIND_HELP, ROOM_KIND_LABELS, ROOM_KINDS } from '@vo/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Dialog, EmptyState, Field, Input, PageHeader, Panel, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { usePresence } from '@/lib/presence';
import { useDepartments } from './UsersPage';

/** Admin: what each room on the floor is called, how it behaves, and who it belongs to. */
export function RoomsPage() {
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => api<RoomDto[]>('/rooms') });
  const { people, rooms: liveRooms } = usePresence();
  const departments = useDepartments();
  const [editing, setEditing] = useState<RoomDto | null>(null);
  const qc = useQueryClient();

  // rooms changed by someone else arrive over the live connection
  useEffect(() => {
    if (liveRooms.length) qc.setQueryData(['rooms'], liveRooms);
  }, [liveRooms, qc]);

  const nameOf = (id: string | null) => (id ? people[id]?.fullName ?? 'Someone no longer active' : null);
  const deptName = (id: string | null) => (id ? departments.data?.find((d) => d.id === id)?.name ?? '—' : null);

  return (
    <>
      <PageHeader
        title="Office rooms"
        description="Name the rooms on the office floor and choose how each one behaves. The layout itself stays fixed for now."
      />
      {rooms.isLoading ? (
        <Spinner />
      ) : rooms.isError ? (
        <Alert>Couldn’t load the rooms. Refresh to try again.</Alert>
      ) : !rooms.data?.length ? (
        <EmptyState title="No rooms yet">Rooms are created with the database. Run the latest migration.</EmptyState>
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {rooms.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
                <div className="min-w-[12rem] flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-sm text-muted">
                    {ROOM_KIND_LABELS[r.kind]} · {r.capacity} seats
                  </p>
                </div>
                <div className="min-w-[14rem] flex-[2] text-sm">
                  {r.kind === 'DEPARTMENT' && <p>Department: {deptName(r.departmentId) ?? <span className="text-muted">none</span>}</p>}
                  {(r.kind === 'PRIVATE' || r.kind === 'LEADERS' || r.ownerId) && <p>Owner: {nameOf(r.ownerId) ?? <span className="text-muted">none</span>}</p>}
                  {(r.kind === 'PRIVATE' || r.kind === 'LEADERS') && (
                    <p className="text-muted">
                      {r.memberIds.length ? `Members: ${r.memberIds.map(nameOf).filter(Boolean).join(', ')}` : 'No members'}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Edit
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <RoomDialog room={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function RoomDialog({ room, onClose }: { room: RoomDto | null; onClose: () => void }) {
  const { people } = usePresence();
  const departments = useDepartments();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<UpdateRoomInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!room) return;
    setForm({ name: room.name, kind: room.kind, departmentId: room.departmentId, ownerId: room.ownerId, memberIds: room.memberIds });
    setError(null);
    setFieldErrors({});
    setFilter('');
  }, [room]);

  const everyone = useMemo(() => Object.values(people).sort((a, b) => a.fullName.localeCompare(b.fullName)), [people]);
  if (!room || !form) return <Dialog open={false} onClose={onClose} title="" children={null} />;

  const set = (patch: Partial<UpdateRoomInput>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const restricted = form.kind === 'PRIVATE' || form.kind === 'LEADERS';
  const visible = everyone.filter((p) => p.userId !== form.ownerId && p.fullName.toLowerCase().includes(filter.trim().toLowerCase()));

  async function save() {
    if (!form || !room) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const body: UpdateRoomInput = {
        ...form,
        name: form.name.trim(),
        departmentId: form.kind === 'DEPARTMENT' ? form.departmentId : null,
        memberIds: restricted ? form.memberIds : [],
      };
      await api(`/rooms/${room.id}`, { method: 'PATCH', json: body });
      await qc.invalidateQueries({ queryKey: ['rooms'] });
      toast(`Saved ${body.name}`);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(e.fieldErrors);
        setError(e.message);
      } else setError('Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit ${room.name}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Save room
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {error && <Alert>{error}</Alert>}
        <Field label="Name" error={fieldErrors.name?.[0]}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
          )}
        </Field>
        <Field label="Type" hint={ROOM_KIND_HELP[form.kind]} error={fieldErrors.kind?.[0]}>
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={form.kind} onChange={(e) => set({ kind: e.target.value as RoomKind })}>
              {ROOM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ROOM_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {form.kind === 'DEPARTMENT' && (
          <Field label="Department" hint="People in this department start here when they open the office." error={fieldErrors.departmentId?.[0]}>
            {({ id, describedBy, invalid }) => (
              <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={form.departmentId ?? ''} onChange={(e) => set({ departmentId: e.target.value || null })}>
                <option value="">No department</option>
                {(departments.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field
          label="Owner"
          hint={restricted ? 'Walks in freely, starts here when they open the office, and can call people to this room.' : 'Optional. The owner can call people to this room.'}
          error={fieldErrors.ownerId?.[0]}
        >
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={form.ownerId ?? ''} onChange={(e) => set({ ownerId: e.target.value || null, memberIds: form.memberIds.filter((m) => m !== e.target.value) })}>
              <option value="">No owner</option>
              {everyone.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {restricted && (
          <fieldset>
            <legend className="text-sm font-medium">Members</legend>
            <p className="mt-0.5 text-sm text-muted">
              {form.kind === 'LEADERS' ? 'Walk in without knocking and can be called here together.' : 'Walk in without knocking.'} {form.memberIds.length} selected.
            </p>
            {fieldErrors.memberIds?.[0] && <p className="mt-1 text-sm text-danger">{fieldErrors.memberIds[0]}</p>}
            <Input className="mt-2 h-9" placeholder="Filter people" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter people" />
            <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-line p-1">
              {visible.map((p) => (
                <li key={p.userId}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sunken">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[rgb(var(--brand))]"
                      checked={form.memberIds.includes(p.userId)}
                      onChange={(e) => set({ memberIds: e.target.checked ? [...form.memberIds, p.userId] : form.memberIds.filter((m) => m !== p.userId) })}
                    />
                    <span className="flex-1">{p.fullName}</span>
                    <span className="text-xs text-muted">{[p.title, p.departmentName].filter(Boolean).join(' · ')}</span>
                  </label>
                </li>
              ))}
              {!visible.length && <li className="px-2 py-1.5 text-sm text-muted">No one matches.</li>}
            </ul>
          </fieldset>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
