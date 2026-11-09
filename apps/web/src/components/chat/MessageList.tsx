import type { ChannelDto, MessageDto, MessagesPageDto } from '@vo/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, Hash } from 'lucide-react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { chatKeys, markReadLocally, putMessage, useTyping } from '@/lib/chat';
import { EditBox } from './Composer';
import { MessageItem } from './MessageItem';

const GROUP_MS = 5 * 60_000;

function dayLabel(iso: string, tz: string) {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(x);
  const today = day(new Date());
  const yesterday = day(new Date(Date.now() - 86_400_000));
  if (day(d) === today) return 'Today';
  if (day(d) === yesterday) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(d);
}

/** The conversation: history (loads older as you scroll up), live messages, read markers and typing. */
export function MessageList({ channel, focusSeq, canPin }: { channel: ChannelDto; focusSeq?: number | null; canPin: boolean }) {
  const { user } = useAuth();
  const me = user!.id;
  const tz = user!.timezone;
  const qc = useQueryClient();
  const toast = useToast();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MessageDto | null>(null);
  // where "New" goes: what you'd read when you opened the channel
  const [readAtOpen] = useState(channel.lastReadSeq);
  const typing = useTyping(channel.id);

  const key = chatKeys.messages(channel.id);
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<MessagesPageDto>(`/chat/channels/${channel.id}/messages${focusSeq ? `?around=${focusSeq}` : ''}`),
    staleTime: Infinity,
  });
  const list = q.data?.messages ?? [];

  // jump to a search result
  useEffect(() => {
    if (!focusSeq) return;
    void qc.fetchQuery({ queryKey: key, queryFn: () => api<MessagesPageDto>(`/chat/channels/${channel.id}/messages?around=${focusSeq}`) }).then(() => {
      requestAnimationFrame(() => document.getElementById(`msg-${focusSeq}`)?.scrollIntoView({ block: 'center' }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq, channel.id]);

  // stay pinned to the bottom as messages arrive (unless you've scrolled up to read)
  const lastId = list[list.length - 1]?.id;
  const firstLoad = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !list.length) return;
    if (firstLoad.current && !focusSeq) {
      firstLoad.current = false;
      const marker = document.getElementById('new-marker');
      if (marker && channel.unread > 8) marker.scrollIntoView({ block: 'start' });
      else el.scrollTop = el.scrollHeight;
      return;
    }
    if (atBottom.current) el.scrollTop = el.scrollHeight;
    else if (list[list.length - 1]?.authorId !== me) setShowJump(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  // mark read while you're looking at the bottom of the conversation
  const latest = list.length ? list[list.length - 1].seq : 0;
  const markRead = useCallback(() => {
    if (!latest || q.data?.hasAfter || document.visibilityState !== 'visible' || !atBottom.current) return;
    if (latest <= channel.lastReadSeq && channel.unread === 0) return;
    markReadLocally(qc, channel.id, latest);
    void api(`/chat/channels/${channel.id}/read`, { method: 'POST', json: { seq: latest } }).catch(() => undefined);
  }, [latest, q.data?.hasAfter, channel.id, channel.lastReadSeq, channel.unread, qc]);
  useEffect(() => {
    const t = window.setTimeout(markRead, 600);
    const vis = () => markRead();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [markRead]);

  async function loadOlder() {
    if (!q.data?.hasBefore || loadingOlder || !list.length) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const page = await api<MessagesPageDto>(`/chat/channels/${channel.id}/messages?before=${list[0].seq}`);
      qc.setQueryData<MessagesPageDto>(key, (p) => (p ? { ...p, hasBefore: page.hasBefore, messages: [...page.messages, ...p.messages] } : p));
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function loadNewer() {
    if (!q.data?.hasAfter || !list.length) return;
    const page = await api<MessagesPageDto>(`/chat/channels/${channel.id}/messages?after=${list[list.length - 1].seq}&limit=100`);
    qc.setQueryData<MessagesPageDto>(key, (p) => (p ? { ...p, hasAfter: page.hasAfter, messages: [...p.messages, ...page.messages] } : p));
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) {
      setShowJump(false);
      if (q.data?.hasAfter) void loadNewer();
      else markRead();
    }
    if (el.scrollTop < 200) void loadOlder();
  }

  async function jumpToLatest() {
    if (q.data?.hasAfter) await qc.fetchQuery({ queryKey: key, queryFn: () => api<MessagesPageDto>(`/chat/channels/${channel.id}/messages`) });
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setShowJump(false);
  }

  const onReact = useCallback(
    (m: MessageDto, emoji: string, on: boolean) => {
      const req = on
        ? api<MessageDto>(`/chat/messages/${m.id}/reactions`, { method: 'POST', json: { emoji } })
        : api<MessageDto>(`/chat/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' });
      req.then((x) => putMessage(qc, x)).catch((e) => toast(e instanceof ApiError ? e.message : 'Couldn’t react.', 'danger'));
    },
    [qc, toast],
  );
  const onPin = useCallback(
    (m: MessageDto, on: boolean) => {
      api<MessageDto>(`/chat/messages/${m.id}/pin`, { method: on ? 'POST' : 'DELETE' })
        .then((x) => {
          putMessage(qc, x);
          toast(on ? 'Pinned. It now shows on everyone’s Home.' : 'Unpinned from Home.');
        })
        .catch((e) => toast(e instanceof ApiError ? e.message : 'Couldn’t pin.', 'danger'));
    },
    [qc, toast],
  );
  const onEdit = useCallback((m: MessageDto) => setEditing(m.id), []);
  const onDelete = useCallback((m: MessageDto) => setConfirmDelete(m), []);

  async function doDelete() {
    const m = confirmDelete!;
    setConfirmDelete(null);
    try {
      await api(`/chat/messages/${m.id}`, { method: 'DELETE' });
      qc.setQueryData<MessagesPageDto>(key, (p) => (p ? { ...p, messages: p.messages.map((x) => (x.id === m.id ? { ...x, deleted: true, body: '', files: [], reactions: [] } : x)) } : p));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Couldn’t delete the message.', 'danger');
    }
  }

  const rows = useMemo(() => {
    let lastDay = '';
    let newShown = false;
    return list.map((m, i) => {
      const prev = list[i - 1];
      const day = dayLabel(m.createdAt, tz);
      const showDay = day !== lastDay;
      lastDay = day;
      const showNew = !newShown && readAtOpen > 0 && m.seq > readAtOpen && m.authorId !== me && m.seq !== 0;
      if (showNew) newShown = true;
      const compact = !showDay && !showNew && !!prev && prev.authorId === m.authorId && !prev.deleted && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_MS;
      return { m, showDay, day, showNew, compact };
    });
  }, [list, tz, readAtOpen, me]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto" aria-busy={q.isLoading}>
        {q.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            {!q.data?.hasBefore && <ChannelIntro channel={channel} />}
            {q.data?.hasBefore && (
              <div className="py-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => void loadOlder()} loading={loadingOlder}>
                  Load earlier messages
                </Button>
              </div>
            )}
            <ol aria-label={`Messages in ${channel.name}`} className="pb-3">
              {rows.map(({ m, showDay, day, showNew, compact }) => (
                <Fragment key={m.clientId ?? m.id}>
                  {showDay && (
                    <li role="separator" className="relative my-3 flex items-center px-4" aria-label={day}>
                      <span className="h-px flex-1 bg-line" />
                      <span className="mx-3 rounded-full border border-line bg-surface px-3 py-0.5 text-xs font-medium text-muted">{day}</span>
                      <span className="h-px flex-1 bg-line" />
                    </li>
                  )}
                  {showNew && (
                    <li id="new-marker" role="separator" aria-label="New messages" className="my-2 flex items-center gap-2 px-4">
                      <span className="h-px flex-1 bg-danger/60" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-danger">New</span>
                    </li>
                  )}
                  <MessageItem
                    m={m}
                    me={me}
                    compact={compact}
                    tz={tz}
                    canPin={canPin}
                    isAdmin={user!.role === 'ADMIN'}
                    highlighted={!!focusSeq && m.seq === focusSeq}
                    onReact={onReact}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onPin={onPin}
                    editing={editing === m.id ? <EditBox m={m} onDone={() => setEditing(null)} /> : undefined}
                  />
                </Fragment>
              ))}
            </ol>
          </>
        )}
      </div>

      <p className="h-5 px-4 text-xs text-muted" aria-live="polite">
        {typing.length === 1 ? `${typing[0]} is typing…` : typing.length === 2 ? `${typing[0]} and ${typing[1]} are typing…` : typing.length > 2 ? 'Several people are typing…' : ''}
      </p>

      {(showJump || q.data?.hasAfter) && (
        <button type="button" onClick={() => void jumpToLatest()} className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-brand-ink shadow-lg">
          <ArrowDown className="h-4 w-4" aria-hidden /> {q.data?.hasAfter ? 'Jump to latest' : 'New messages'}
        </button>
      )}

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this message?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => void doDelete()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm">
          {confirmDelete?.authorId === me ? 'It will show as “This message was deleted” for everyone, and any files in it are removed.' : `You’re removing ${confirmDelete?.authorName}’s message as an admin. This is recorded in the audit log.`}
        </p>
      </Dialog>
    </div>
  );
}

function ChannelIntro({ channel }: { channel: ChannelDto }) {
  const direct = channel.kind === 'DM' || channel.kind === 'GROUP';
  return (
    <div className="px-4 pb-2 pt-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand-fg">
        <Hash className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="mt-3 text-xl font-semibold">{direct ? channel.name : channel.kind === 'ANNOUNCEMENTS' ? 'Announcements' : `#${channel.name}`}</h2>
      <p className="mt-1 text-sm text-muted">
        {direct
          ? `This is the start of your conversation${channel.kind === 'GROUP' ? ' with this group' : ` with ${channel.name}`}. Only the people in it can see it.`
          : channel.kind === 'ANNOUNCEMENTS'
            ? 'Company-wide news. Leaders, HR and admins post here; everyone can react. Pinned posts show on everyone’s Home.'
            : channel.kind === 'DEPARTMENT'
              ? `Everyone in ${channel.name} is here automatically.`
              : channel.description || 'The start of the channel.'}
      </p>
    </div>
  );
}
