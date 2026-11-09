import { Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MessageBody } from '@/components/chat/MessageItem';
import { Panel } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth';
import { useAnnouncements, useChannels } from '@/lib/chat';
import { formatRelative } from '@/lib/format';

/** Pinned announcements on the Home screen. Hidden when nothing is pinned. */
export function AnnouncementsCard() {
  const { user } = useAuth();
  const q = useAnnouncements();
  const channels = useChannels();
  const ann = channels.data?.find((c) => c.kind === 'ANNOUNCEMENTS');
  if (!q.data?.length) return null;
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-brand-fg" aria-hidden /> Announcements
        </span>
      }
      action={
        ann ? (
          <Link to={`/chat/${ann.id}`} className="text-sm font-medium text-brand-fg hover:underline">
            See all{ann.unread ? ` (${ann.unread} new)` : ''}
          </Link>
        ) : undefined
      }
    >
      <ul className="divide-y divide-line">
        {q.data.map((m) => (
          <li key={m.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <Avatar name={m.authorName} src={m.authorAvatarUrl} size="md" />
            <div className="min-w-0 flex-1 text-[15px]">
              <p className="text-sm">
                <span className="font-semibold">{m.authorName}</span> <span className="text-muted">· {formatRelative(m.createdAt)}</span>
              </p>
              <MessageBody body={m.body} mentionIds={m.mentionIds} me={user!.id} />
              {m.files.length > 0 && (
                <p className="mt-1 text-sm">
                  {m.files.map((f) => (
                    <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="mr-3 text-brand-fg underline">
                      {f.name}
                    </a>
                  ))}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
