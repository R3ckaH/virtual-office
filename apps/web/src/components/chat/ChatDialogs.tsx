import type { ChannelDto, SearchHitDto } from '@vo/shared';
import { MAX_GROUP_DM, previewOf } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Lock, Search, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Dialog, Field, Input, Spinner } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { chatKeys } from '@/lib/chat';
import { usePresence } from '@/lib/presence';
import { useMembers } from './Composer';

/** Search the company directory (everyone on the office floor list) and pick people. */
export function PeoplePicker({ selected, onChange, exclude = [], max, label = 'People' }: { selected: string[]; onChange: (ids: string[]) => void; exclude?: string[]; max?: number; label?: string }) {
  const { people } = usePresence();
  const [q, setQ] = useState('');
  const all = useMemo(() => Object.values(people).sort((a, b) => a.fullName.localeCompare(b.fullName)), [people]);
  const matches = all.filter((p) => !exclude.includes(p.userId) && !selected.includes(p.userId) && (!q.trim() || `${p.fullName} ${p.departmentName ?? ''} ${p.title ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 8);
  const full = max !== undefined && selected.length >= max;
  return (
    <div className="space-y-2">
      <label htmlFor="people-search" className="block text-sm font-medium">
        {label}
      </label>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected">
          {selected.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full bg-sunken py-0.5 pl-2.5 pr-1 text-sm">
              {people[id]?.fullName ?? 'Someone'}
              <button type="button" onClick={() => onChange(selected.filter((x) => x !== id))} className="rounded-full p-0.5 text-muted hover:bg-line hover:text-ink" aria-label={`Remove ${people[id]?.fullName ?? 'person'}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input id="people-search" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={full ? `Up to ${max} people` : 'Search by name or department'} disabled={full} autoComplete="off" />
      </div>
      {!full && (
        <ul role="listbox" aria-label="Matching people" className="max-h-60 overflow-y-auto rounded-lg border border-line">
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-muted">No one matches.</li>}
          {matches.map((p) => (
            <li key={p.userId} role="option" aria-selected={false}>
              <button type="button" onClick={() => (onChange([...selected, p.userId]), setQ(''))} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-sunken">
                <Avatar name={p.fullName} src={p.avatarUrl} size="sm" />
                <span className="flex-1">{p.fullName}</span>
                <span className="text-xs text-muted">{p.departmentName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NewMessageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [ids, setIds] = useState<string[]>([]);
  const go = useMutation({
    mutationFn: () => api<ChannelDto>('/chat/dms', { method: 'POST', json: { userIds: ids } }),
    onSuccess: (c) => {
      setIds([]);
      onClose();
      navigate(`/chat/${c.id}`);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Couldn’t start the conversation.', 'danger'),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New message"
      description={`Message one person, or up to ${MAX_GROUP_DM - 1} for a group conversation.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ids.length} loading={go.isPending} onClick={() => go.mutate()}>
            {ids.length > 1 ? 'Start group conversation' : 'Open conversation'}
          </Button>
        </>
      }
    >
      <PeoplePicker selected={ids} onChange={setIds} exclude={[user!.id]} max={MAX_GROUP_DM - 1} label="To" />
    </Dialog>
  );
}

export function CreateChannelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api<ChannelDto>('/chat/channels', { method: 'POST', json: { name, description: description || null, isPrivate, memberIds: ids } }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: chatKeys.channels });
      setName('');
      setDescription('');
      setIds([]);
      setPrivate(false);
      onClose();
      navigate(`/chat/${c.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0]])));
        setFormError(Object.keys(e.fieldErrors).length ? null : e.message);
      } else setFormError('Couldn’t create the channel.');
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setErrors({ name: 'At least 2 characters' });
    setErrors({});
    create.mutate();
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create a channel"
      description="For a team, project or ministry. Department channels and Announcements are made for you."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="channel-form" loading={create.isPending}>
            Create channel
          </Button>
        </>
      }
    >
      <form id="channel-form" onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <Field label="Name" error={errors.name}>
          {(f) => <Input id={f.id} aria-describedby={f.describedBy} aria-invalid={f.invalid} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Prayer requests" autoFocus />}
        </Field>
        <Field label="What it’s for (optional)" error={errors.description}>
          {(f) => <Input id={f.id} aria-describedby={f.describedBy} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />}
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Who can find it</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="vis" className="mt-1" checked={!isPrivate} onChange={() => setPrivate(false)} />
            <span>
              <span className="font-medium">Public</span> <span className="text-muted">· anyone can find and join it</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="vis" className="mt-1" checked={isPrivate} onChange={() => setPrivate(true)} />
            <span>
              <span className="font-medium">Private</span> <span className="text-muted">· only people you add</span>
            </span>
          </label>
        </fieldset>
        <PeoplePicker selected={ids} onChange={setIds} exclude={[user!.id]} label="Add people (optional)" />
      </form>
    </Dialog>
  );
}

export function BrowseChannelsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['chat', 'browse'], queryFn: () => api<ChannelDto[]>('/chat/channels/browse'), enabled: open });
  return (
    <Dialog open={open} onClose={onClose} title="Browse channels" description="Public channels you can read and join." size="md">
      {q.isLoading ? (
        <Spinner />
      ) : !q.data?.length ? (
        <p className="text-sm text-muted">No public channels yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(`/chat/${c.id}`);
                }}
                className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-sunken/50"
              >
                <Hash className="h-4 w-4 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.name}</span>
                  {c.description && <span className="block truncate text-sm text-muted">{c.description}</span>}
                </span>
                <span className="text-xs text-muted">{c.memberCount} members</span>
                {c.isMember && <Badge tone="ok">Joined</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** Members, and for the channel's creator or an admin: rename, add/remove people, archive. */
export function ChannelInfoDialog({ channel, open, onClose }: { channel: ChannelDto; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const members = useMembers(channel.id);
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? '');
  const [adding, setAdding] = useState<string[]>([]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['chat'] });
  };
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : 'That didn’t work. Try again.', 'danger');
  const save = useMutation({
    mutationFn: () => api(`/chat/channels/${channel.id}`, { method: 'PATCH', json: { name, description: description || null } }),
    onSuccess: () => (refresh(), toast('Channel updated.')),
    onError: fail,
  });
  const add = useMutation({
    mutationFn: () => api(`/chat/channels/${channel.id}/members`, { method: 'POST', json: { userIds: adding } }),
    onSuccess: () => (setAdding([]), refresh()),
    onError: fail,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/chat/channels/${channel.id}/members/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError: fail });
  const leave = useMutation({
    mutationFn: () => api(`/chat/channels/${channel.id}/leave`, { method: 'POST' }),
    onSuccess: () => (refresh(), onClose(), navigate('/chat')),
    onError: fail,
  });
  const archive = useMutation({
    mutationFn: () => api(`/chat/channels/${channel.id}/archive`, { method: 'POST' }),
    onSuccess: () => (refresh(), onClose(), navigate('/chat'), toast('Channel archived.')),
    onError: fail,
  });
  const direct = channel.kind === 'DM' || channel.kind === 'GROUP';
  return (
    <Dialog open={open} onClose={onClose} title={direct ? channel.name : `#${channel.name}`} description={channel.kind === 'DEPARTMENT' ? 'Department channel: members follow the department.' : channel.kind === 'ANNOUNCEMENTS' ? 'Everyone in the company.' : channel.description ?? undefined} size="md">
      <div className="space-y-5">
        {channel.canManage && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Name">{(f) => <Input id={f.id} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
            <Field label="What it’s for">{(f) => <Input id={f.id} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />}</Field>
            <Button type="submit" size="sm" variant="secondary" loading={save.isPending}>
              Save
            </Button>
          </form>
        )}
        <div>
          <h3 className="mb-2 text-sm font-semibold">{members.data?.length ?? channel.memberCount} members</h3>
          {members.isLoading ? (
            <Spinner />
          ) : (
            <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {members.data?.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Avatar name={m.fullName} src={m.avatarUrl} size="sm" />
                  <span className="flex-1">
                    {m.fullName}
                    {m.userId === user!.id && <span className="text-muted"> (you)</span>}
                    {m.title && <span className="block text-xs text-muted">{m.title}</span>}
                  </span>
                  {channel.canManage && m.userId !== user!.id && (
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(m.userId)} aria-label={`Remove ${m.fullName}`}>
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {channel.canManage && (
          <div className="space-y-2">
            <PeoplePicker selected={adding} onChange={setAdding} exclude={members.data?.map((m) => m.userId) ?? []} label="Add people" />
            <Button size="sm" disabled={!adding.length} loading={add.isPending} onClick={() => add.mutate()}>
              Add {adding.length || ''}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {(channel.kind === 'CUSTOM' || channel.kind === 'GROUP') && channel.isMember && (
            <Button variant="secondary" onClick={() => leave.mutate()} loading={leave.isPending}>
              Leave {channel.kind === 'GROUP' ? 'conversation' : 'channel'}
            </Button>
          )}
          {channel.canManage && (
            <Button variant="danger" onClick={() => archive.mutate()} loading={archive.isPending}>
              Archive channel
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Message search across your conversations. */
export function SearchDialog({ open, onClose, channelId }: { open: boolean; onClose: () => void; channelId?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [scoped, setScoped] = useState(!!channelId);
  const res = useQuery({
    queryKey: ['chat', 'search', submitted, scoped ? channelId : null],
    queryFn: () => api<SearchHitDto[]>(`/chat/search?q=${encodeURIComponent(submitted)}${scoped && channelId ? `&channelId=${channelId}` : ''}`),
    enabled: open && submitted.length >= 2,
  });
  return (
    <Dialog open={open} onClose={onClose} title="Search messages" size="lg">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Words to find" aria-label="Search messages" autoFocus />
        <Button type="submit" disabled={q.trim().length < 2}>
          Search
        </Button>
      </form>
      {channelId && (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={scoped} onChange={(e) => setScoped(e.target.checked)} /> Only this conversation
        </label>
      )}
      <div className="mt-4">
        {res.isFetching ? (
          <Spinner />
        ) : submitted && res.data?.length === 0 ? (
          <p className="text-sm text-muted">No messages match “{submitted}”.</p>
        ) : (
          <ul className="divide-y divide-line">
            {res.data?.map((h) => (
              <li key={h.message.id}>
                <button
                  type="button"
                  className="w-full py-2.5 text-left hover:bg-sunken/50"
                  onClick={() => {
                    onClose();
                    navigate(`/chat/${h.message.channelId}?m=${h.message.seq}`);
                  }}
                >
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {h.channelKind === 'DM' || h.channelKind === 'GROUP' ? <Lock className="h-3 w-3" aria-hidden /> : <Hash className="h-3 w-3" aria-hidden />}
                    {h.channelName} · {h.message.authorName} ·{' '}
                    {new Intl.DateTimeFormat(undefined, { timeZone: user!.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(h.message.createdAt))}
                  </span>
                  <span className="mt-0.5 block text-sm">{previewOf(h.message.body, h.message.files.length, 200)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
