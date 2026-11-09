import type { AnnouncementDto, ChannelDto, ChatMeDto, FileDto, MessageDto, MessagesPageDto } from '@vo/shared';
import { previewOf } from '@vo/shared';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/toast';
import { api } from './api';
import { useAuth } from './auth';
import { usePublicConfig } from './config';
import { usePresence } from './presence';

export const chatKeys = {
  me: ['chat', 'me'] as const,
  channels: ['chat', 'channels'] as const,
  channel: (id: string) => ['chat', 'channel', id] as const,
  messages: (id: string) => ['chat', 'messages', id] as const,
  announcements: ['chat', 'announcements'] as const,
};

export const useChatMe = () => useQuery({ queryKey: chatKeys.me, queryFn: () => api<ChatMeDto>('/chat/me'), staleTime: 5 * 60_000 });
export const useChannels = (enabled = true) => useQuery({ queryKey: chatKeys.channels, queryFn: () => api<ChannelDto[]>('/chat/channels'), enabled });
export const useAnnouncements = () => useQuery({ queryKey: chatKeys.announcements, queryFn: () => api<AnnouncementDto[]>('/chat/announcements') });

/** What the nav badge counts: unread direct messages and announcements, plus @mentions anywhere. */
export function attentionCount(list: ChannelDto[] | undefined) {
  return (list ?? []).reduce((n, c) => n + (c.kind === 'DM' || c.kind === 'GROUP' || c.kind === 'ANNOUNCEMENTS' ? c.unread : c.mentions), 0);
}

/* ---------------- the channel being looked at (for unread counting and notifications) ---------------- */

let viewing: string | null = null;
export const setViewingChannel = (id: string | null) => {
  viewing = id;
};

/* ---------------- typing indicators ---------------- */

type Typing = Record<string, { userId: string; name: string; at: number }[]>;
let typing: Typing = {};
const typingSubs = new Set<() => void>();
const emitTyping = () => typingSubs.forEach((f) => f());
function addTyping(channelId: string, userId: string, name: string) {
  const now = Date.now();
  typing = { ...typing, [channelId]: [...(typing[channelId] ?? []).filter((t) => t.userId !== userId && now - t.at < 6000), { userId, name, at: now }] };
  emitTyping();
  window.setTimeout(() => {
    typing = { ...typing, [channelId]: (typing[channelId] ?? []).filter((t) => Date.now() - t.at < 6000) };
    emitTyping();
  }, 6100);
}
function clearTyping(channelId: string, userId: string | null) {
  if (!userId || !typing[channelId]?.some((t) => t.userId === userId)) return;
  typing = { ...typing, [channelId]: typing[channelId].filter((t) => t.userId !== userId) };
  emitTyping();
}
/** Names of people typing in a channel right now. */
export function useTyping(channelId: string | null): string[] {
  const snap = useSyncExternalStore(
    (f) => (typingSubs.add(f), () => typingSubs.delete(f)),
    () => typing,
  );
  return useMemo(() => (channelId ? (snap[channelId] ?? []).map((t) => t.name) : []), [snap, channelId]);
}

/* ---------------- cache updates ---------------- */

function upsert(list: MessageDto[], m: MessageDto): MessageDto[] {
  const i = list.findIndex((x) => x.id === m.id || (m.clientId && x.clientId === m.clientId));
  if (i >= 0) {
    const copy = [...list];
    copy[i] = m;
    return copy;
  }
  if (list.length && m.seq < list[list.length - 1].seq) return [...list, m].sort((a, b) => a.seq - b.seq);
  return [...list, m];
}

export function putMessage(qc: QueryClient, m: MessageDto) {
  qc.setQueryData<MessagesPageDto>(chatKeys.messages(m.channelId), (page) => {
    if (!page || page.hasAfter) return page; // not showing the latest messages: they'll load when you scroll down
    return { ...page, messages: upsert(page.messages, m) };
  });
}

function patchChannel(qc: QueryClient, id: string, fn: (c: ChannelDto) => ChannelDto) {
  qc.setQueryData<ChannelDto[]>(chatKeys.channels, (list) => {
    if (!list) return list;
    const next = list.map((c) => (c.id === id ? fn(c) : c));
    return next.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
  });
  qc.setQueryData<ChannelDto>(chatKeys.channel(id), (c) => (c ? fn(c) : c));
}

export function markReadLocally(qc: QueryClient, channelId: string, seq: number) {
  patchChannel(qc, channelId, (c) => (seq >= c.lastSeq ? { ...c, lastReadSeq: Math.max(c.lastReadSeq, seq), unread: 0, mentions: 0 } : { ...c, lastReadSeq: Math.max(c.lastReadSeq, seq) }));
}

/** Upload a file straight to the API's own domain (Vercel's proxy caps request bodies at 4.5 MB). */
export async function uploadFile(file: File, base: string | null): Promise<FileDto> {
  return api<FileDto>(`/chat/files?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    body: file,
    headers: { 'content-type': 'application/octet-stream' },
    base: base ?? undefined,
  });
}

export function useUploadBase() {
  return usePublicConfig().data?.realtimeUrl ?? null;
}

/**
 * Keeps chat live: new messages, edits, reactions, read markers and typing arrive over the office
 * connection and update the cached lists. Mounted once in the app shell.
 */
export function ChatLive() {
  const { on, connection } = usePresence();
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const me = user?.id;

  useEffect(() => {
    const offs = [
      on('chat:message', (m) => {
        putMessage(qc, m);
        clearTyping(m.channelId, m.authorId);
        const list = qc.getQueryData<ChannelDto[]>(chatKeys.channels);
        const known = list?.find((c) => c.id === m.channelId);
        if (!known) {
          void qc.invalidateQueries({ queryKey: chatKeys.channels });
        } else {
          const mine = m.authorId === me;
          const looking = viewing === m.channelId && document.visibilityState === 'visible';
          const mentioned = !!me && m.mentionIds.includes(me);
          patchChannel(qc, m.channelId, (c) => ({
            ...c,
            lastSeq: Math.max(c.lastSeq, m.seq),
            lastMessageAt: m.createdAt,
            unread: mine || looking ? c.unread : c.unread + 1,
            mentions: mentioned && !looking ? c.mentions + 1 : c.mentions,
            lastReadSeq: mine ? m.seq : c.lastReadSeq,
          }));
          const direct = known.kind === 'DM' || known.kind === 'GROUP';
          if (!mine && viewing !== m.channelId && (direct || mentioned || known.kind === 'ANNOUNCEMENTS')) {
            const where = direct ? '' : ` in ${known.kind === 'ANNOUNCEMENTS' ? 'Announcements' : `#${known.name}`}`;
            toast(`${m.authorName}${where}: ${previewOf(m.body, m.files.length, 70)}`, 'info', { label: 'Open', onClick: () => navigate(`/chat/${m.channelId}`) });
          }
        }
        if (known?.kind === 'ANNOUNCEMENTS') void qc.invalidateQueries({ queryKey: chatKeys.announcements });
      }),
      on('chat:message-updated', (m) => {
        qc.setQueryData<MessagesPageDto>(chatKeys.messages(m.channelId), (p) => (p ? { ...p, messages: p.messages.map((x) => (x.id === m.id ? m : x)) } : p));
      }),
      on('chat:message-deleted', (d) => {
        qc.setQueryData<MessagesPageDto>(chatKeys.messages(d.channelId), (p) =>
          p ? { ...p, messages: p.messages.map((x) => (x.id === d.id ? { ...x, deleted: true, body: '', files: [], reactions: [], pinnedAt: null } : x)) } : p,
        );
        void qc.invalidateQueries({ queryKey: chatKeys.channels });
      }),
      on('chat:channel', (e) => {
        void qc.invalidateQueries({ queryKey: chatKeys.channels });
        void qc.invalidateQueries({ queryKey: chatKeys.channel(e.channelId) });
        void qc.invalidateQueries({ queryKey: ['chat', 'members', e.channelId] });
      }),
      on('chat:read', (e) => markReadLocally(qc, e.channelId, e.seq)),
      on('chat:typing', (t) => addTyping(t.channelId, t.userId, t.name)),
      on('chat:pins', () => void qc.invalidateQueries({ queryKey: chatKeys.announcements })),
    ];
    return () => offs.forEach((off) => off());
  }, [on, qc, me, toast, navigate]);

  // after a reconnect, catch up on anything missed
  useEffect(() => {
    if (connection === 'online') void qc.invalidateQueries({ queryKey: ['chat'] });
  }, [connection, qc]);

  return null;
}
