import type { ChannelDto } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ArrowLeft, Compass, Hash, Info, Lock, Megaphone, MessageSquarePlus, Plus, Search, Users } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BrowseChannelsDialog, ChannelInfoDialog, CreateChannelDialog, NewMessageDialog, SearchDialog } from '@/components/chat/ChatDialogs';
import { Composer } from '@/components/chat/Composer';
import { MessageList } from '@/components/chat/MessageList';
import { StatusDot } from '@/components/presence/StatusDot';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { chatKeys, setViewingChannel, useChannels, useChatMe } from '@/lib/chat';
import { usePresence } from '@/lib/presence';

function ChannelIcon({ c, className }: { c: ChannelDto; className?: string }) {
  const { people } = usePresence();
  if (c.kind === 'DM' && c.people[0]) {
    const p = people[c.people[0].userId];
    return (
      <span className={clsx('relative shrink-0', className)}>
        <Avatar name={c.people[0].fullName} src={c.people[0].avatarUrl} size="sm" />
        {p && <StatusDot status={p.status} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-surface" />}
      </span>
    );
  }
  const Icon = c.kind === 'ANNOUNCEMENTS' ? Megaphone : c.kind === 'GROUP' ? Users : c.isPrivate ? Lock : Hash;
  return (
    <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center text-muted', className)}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-1 flex items-center justify-between px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      <ul>{children}</ul>
    </section>
  );
}

function ChannelLink({ c, active }: { c: ChannelDto; active: boolean }) {
  const bold = c.unread > 0;
  return (
    <li>
      <Link
        to={`/chat/${c.id}`}
        aria-current={active ? 'page' : undefined}
        className={clsx('mx-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', active ? 'bg-brand/10 text-ink' : 'hover:bg-sunken', bold ? 'font-semibold text-ink' : 'text-ink/80')}
      >
        <ChannelIcon c={c} />
        <span className="min-w-0 flex-1 truncate">{c.name}</span>
        {c.mentions > 0 ? (
          <span className="rounded-full bg-danger px-1.5 text-2xs font-bold leading-4 text-white" aria-label={`${c.mentions} mentions`}>
            @{c.mentions}
          </span>
        ) : c.unread > 0 ? (
          <span className={clsx('rounded-full px-1.5 text-2xs font-bold leading-4', c.kind === 'DM' || c.kind === 'GROUP' ? 'bg-danger text-white' : 'bg-line text-ink')} aria-label={`${c.unread} unread`}>
            {c.unread > 99 ? '99+' : c.unread}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export function ChatPage() {
  const { channelId } = useParams();
  const [params] = useSearchParams();
  const focusSeq = params.get('m') ? Number(params.get('m')) : null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const chatMe = useChatMe();
  const list = useChannels();
  const [dialog, setDialog] = useState<'dm' | 'channel' | 'browse' | 'info' | 'search' | null>(null);

  const inList = list.data?.find((c) => c.id === channelId);
  // a channel you're not in (public custom channel opened from Browse or a link)
  const other = useQuery({ queryKey: chatKeys.channel(channelId ?? ''), queryFn: () => api<ChannelDto>(`/chat/channels/${channelId}`), enabled: !!channelId && !!list.data && !inList, retry: false });
  const channel = inList ?? other.data;

  useEffect(() => {
    setViewingChannel(channelId ?? null);
    return () => setViewingChannel(null);
  }, [channelId]);

  // on a wide screen, open the first conversation automatically
  useEffect(() => {
    if (!channelId && list.data?.length && window.matchMedia('(min-width: 768px)').matches) navigate(`/chat/${list.data[0].id}`, { replace: true });
  }, [channelId, list.data, navigate]);

  const join = useMutation({
    mutationFn: () => api<ChannelDto>(`/chat/channels/${channelId}/join`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['chat'] }),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Couldn’t join.', 'danger'),
  });

  const all = list.data ?? [];
  const announcements = all.filter((c) => c.kind === 'ANNOUNCEMENTS');
  const chans = all.filter((c) => c.kind === 'DEPARTMENT' || c.kind === 'CUSTOM').sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'DEPARTMENT' ? -1 : 1));
  const dms = all.filter((c) => c.kind === 'DM' || c.kind === 'GROUP');
  const canCreate = chatMe.data?.canCreateChannels;
  const canAnnounce = chatMe.data?.canAnnounce ?? false;

  return (
    <div className="flex h-[calc(100dvh-4rem)] overflow-hidden bg-surface">
      {/* conversation list */}
      <nav aria-label="Conversations" className={clsx('flex w-full shrink-0 flex-col border-r border-line md:w-72', channelId && 'max-md:hidden')}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-3">
          <h1 className="flex-1 text-lg font-semibold">Chat</h1>
          <button type="button" onClick={() => setDialog('search')} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink" aria-label="Search messages">
            <Search className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setDialog('dm')} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink" aria-label="New message">
            <MessageSquarePlus className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {list.isLoading ? (
            <Spinner />
          ) : (
            <>
              {announcements.map((c) => (
                <ul key={c.id} className="mb-3">
                  <ChannelLink c={c} active={c.id === channelId} />
                </ul>
              ))}
              <Section
                title="Channels"
                action={
                  <span className="flex">
                    <button type="button" onClick={() => setDialog('browse')} className="rounded p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="Browse channels" title="Browse channels">
                      <Compass className="h-4 w-4" />
                    </button>
                    {canCreate && (
                      <button type="button" onClick={() => setDialog('channel')} className="rounded p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="Create a channel" title="Create a channel">
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                }
              >
                {chans.map((c) => (
                  <ChannelLink key={c.id} c={c} active={c.id === channelId} />
                ))}
              </Section>
              <Section
                title="Direct messages"
                action={
                  <button type="button" onClick={() => setDialog('dm')} className="rounded p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="New direct message">
                    <Plus className="h-4 w-4" />
                  </button>
                }
              >
                {dms.length === 0 && <li className="px-3 py-1 text-sm text-muted">Start one with New message, or Message on someone’s card on the office floor.</li>}
                {dms.map((c) => (
                  <ChannelLink key={c.id} c={c} active={c.id === channelId} />
                ))}
              </Section>
            </>
          )}
        </div>
      </nav>

      {/* conversation */}
      <section className={clsx('flex min-w-0 flex-1 flex-col', !channelId && 'max-md:hidden')} aria-label={channel ? `Conversation: ${channel.name}` : 'Conversation'}>
        {!channelId ? (
          <div className="m-auto max-w-sm p-6">
            <EmptyState title="Pick a conversation">Choose a channel or person on the left, or start a new message.</EmptyState>
          </div>
        ) : !channel ? (
          other.isError ? (
            <div className="m-auto max-w-sm p-6">
              <EmptyState title="Conversation not found">It may be private, archived, or you were removed from it.</EmptyState>
            </div>
          ) : (
            <Spinner />
          )
        ) : (
          <>
            <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
              <Link to="/chat" className="rounded-lg p-1.5 text-muted hover:bg-sunken md:hidden" aria-label="Back to conversations">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <ChannelIcon c={channel} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold">{channel.kind === 'DM' || channel.kind === 'GROUP' || channel.kind === 'ANNOUNCEMENTS' ? channel.name : `#${channel.name}`}</h2>
                <p className="truncate text-xs text-muted">
                  {channel.kind === 'DM' ? (channel.people[0] ? 'Direct message' : '') : `${channel.memberCount} members`}
                  {channel.description && channel.kind !== 'DM' ? ` · ${channel.description}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setDialog('search')} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink" aria-label="Search this conversation">
                <Search className="h-5 w-5" />
              </button>
              {channel.kind !== 'DM' && (
                <button type="button" onClick={() => setDialog('info')} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink" aria-label="Members and settings">
                  <Info className="h-5 w-5" />
                </button>
              )}
            </header>
            <MessageList key={channel.id} channel={channel} focusSeq={focusSeq} canPin={channel.kind === 'ANNOUNCEMENTS' && canAnnounce} />
            {channel.isMember ? (
              <Composer
                key={`composer-${channel.id}`}
                channel={channel}
                disabledReason={
                  channel.canPost ? undefined : channel.archivedAt ? 'This channel is archived.' : channel.kind === 'ANNOUNCEMENTS' ? 'Leaders, HR and admins post announcements. You can react to them.' : 'You can’t post here.'
                }
              />
            ) : (
              <div className="flex items-center justify-center gap-3 border-t border-line px-4 py-4 text-sm">
                <span className="text-muted">You’re viewing #{channel.name}.</span>
                <Button size="sm" onClick={() => join.mutate()} loading={join.isPending}>
                  Join channel
                </Button>
              </div>
            )}
            {dialog === 'info' && <ChannelInfoDialog channel={channel} open onClose={() => setDialog(null)} />}
          </>
        )}
      </section>

      <NewMessageDialog open={dialog === 'dm'} onClose={() => setDialog(null)} />
      {canCreate && <CreateChannelDialog open={dialog === 'channel'} onClose={() => setDialog(null)} />}
      <BrowseChannelsDialog open={dialog === 'browse'} onClose={() => setDialog(null)} />
      <SearchDialog open={dialog === 'search'} onClose={() => setDialog(null)} channelId={channelId} />
    </div>
  );
}
