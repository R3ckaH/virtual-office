import type { MessageDto } from '@vo/shared';
import { EDIT_WINDOW_HOURS, REACTIONS, segmentMessage } from '@vo/shared';
import { clsx } from 'clsx';
import { Download, FileText, Pencil, Pin, PinOff, SmilePlus, Trash2 } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { usePresence } from '@/lib/presence';

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function MessageBody({ body, mentionIds, me }: { body: string; mentionIds: string[]; me?: string }) {
  const { people } = usePresence();
  const names = useMemo(() => mentionIds.map((id) => ({ userId: id, fullName: people[id]?.fullName ?? '' })).filter((p) => p.fullName), [mentionIds, people]);
  const segs = useMemo(() => segmentMessage(body, names), [body, names]);
  return (
    <p className="whitespace-pre-wrap break-words">
      {segs.map((s, i) => {
        switch (s.type) {
          case 'link':
            return (
              <a key={i} href={s.href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-fg underline underline-offset-2 hover:no-underline">
                {s.text}
              </a>
            );
          case 'mention':
            return (
              <span key={i} className={clsx('rounded px-0.5 font-medium', s.userId === me ? 'bg-amber-200/70 text-amber-950 dark:bg-amber-400/30 dark:text-amber-100' : 'bg-brand/10 text-brand-fg')}>
                {s.text}
              </span>
            );
          case 'code':
            return (
              <code key={i} className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.85em]">
                {s.text}
              </code>
            );
          case 'bold':
            return <strong key={i}>{s.text}</strong>;
          case 'italic':
            return <em key={i}>{s.text}</em>;
          default:
            return <span key={i}>{s.text}</span>;
        }
      })}
    </p>
  );
}

interface Props {
  m: MessageDto;
  me: string;
  /** same author within a few minutes: hide the avatar and name */
  compact: boolean;
  tz: string;
  canPin: boolean;
  isAdmin: boolean;
  highlighted?: boolean;
  onReact: (m: MessageDto, emoji: string, on: boolean) => void;
  onEdit: (m: MessageDto) => void;
  onDelete: (m: MessageDto) => void;
  onPin: (m: MessageDto, on: boolean) => void;
  editing?: React.ReactNode;
}

export const MessageItem = memo(function MessageItem({ m, me, compact, tz, canPin, isAdmin, highlighted, onReact, onEdit, onDelete, onPin, editing }: Props) {
  const [picker, setPicker] = useState(false);
  const mine = m.authorId === me;
  const time = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(m.createdAt));
  const full = new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(new Date(m.createdAt));
  const canEdit = mine && !m.deleted && Date.now() - Date.parse(m.createdAt) < EDIT_WINDOW_HOURS * 3_600_000;
  const canDelete = !m.deleted && (mine || isAdmin);
  const pending = m.seq === 0;

  return (
    <li
      id={`msg-${m.seq}`}
      className={clsx(
        'group relative flex gap-3 px-4 transition-colors hover:bg-sunken/60 focus-within:bg-sunken/60',
        compact ? 'py-0.5' : 'pt-3 pb-0.5',
        highlighted && 'bg-amber-100/70 dark:bg-amber-400/10',
        pending && 'opacity-60',
      )}
    >
      <div className="w-9 shrink-0">
        {compact ? (
          <time dateTime={m.createdAt} title={full} className="invisible block pt-0.5 text-right text-2xs tabular text-muted group-hover:visible">
            {time.replace(/\s?[AP]M$/i, '')}
          </time>
        ) : (
          <Avatar name={m.authorName} src={m.authorAvatarUrl} size="md" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-[15px] leading-relaxed">
        {!compact && (
          <p className="flex items-baseline gap-2">
            <span className="font-semibold">{m.authorName}</span>
            <time dateTime={m.createdAt} title={full} className="text-xs text-muted">
              {time}
            </time>
            {m.pinnedAt && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <Pin className="h-3 w-3" aria-hidden /> Pinned{m.pinnedByName ? ` by ${m.pinnedByName}` : ''}
              </span>
            )}
          </p>
        )}
        {m.deleted ? (
          <p className="italic text-muted">This message was deleted.</p>
        ) : editing ? (
          editing
        ) : (
          <>
            {m.body && <MessageBody body={m.body} mentionIds={m.mentionIds} me={me} />}
            {m.editedAt && <span className="text-xs text-muted"> (edited)</span>}
            {compact && m.pinnedAt && (
              <span className="ml-1 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <Pin className="h-3 w-3" aria-hidden /> Pinned
              </span>
            )}
          </>
        )}

        {m.files.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {m.files.map((f) =>
              f.isImage ? (
                <li key={f.id}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-line">
                    <img src={f.url} alt={f.name} loading="lazy" className="max-h-72 max-w-[min(24rem,100%)] object-contain" />
                  </a>
                </li>
              ) : (
                <li key={f.id}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.name} className="flex max-w-xs items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-sunken">
                    <FileText className="h-8 w-8 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{f.name}</span>
                      <span className="text-xs text-muted">{fmtSize(f.size)}</span>
                    </span>
                    <Download className="h-4 w-4 text-muted" aria-hidden />
                  </a>
                </li>
              ),
            )}
          </ul>
        )}

        {m.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.reactions.map((r) => {
              const mineR = r.userIds.includes(me);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => onReact(m, r.emoji, !mineR)}
                  aria-pressed={mineR}
                  aria-label={`${r.emoji} ${r.count}${mineR ? ', including you' : ''}`}
                  className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm', mineR ? 'border-brand/50 bg-brand/10' : 'border-line bg-surface hover:bg-sunken')}
                >
                  <span aria-hidden>{r.emoji}</span>
                  <span className="text-xs tabular text-muted">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!m.deleted && !pending && !editing && (
        <div className={clsx('absolute -top-3 right-4 z-10 flex items-center rounded-lg border border-line bg-surface shadow-sm', picker ? 'flex' : 'hidden group-hover:flex group-focus-within:flex')}>
          <div className="relative">
            <button type="button" className="rounded-l-lg p-1.5 text-muted hover:bg-sunken hover:text-ink" aria-label="Add a reaction" aria-expanded={picker} onClick={() => setPicker((v) => !v)}>
              <SmilePlus className="h-4 w-4" />
            </button>
            {picker && (
              <div role="menu" aria-label="Reactions" className="absolute right-0 top-8 z-20 grid w-max grid-cols-5 gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-lg" onKeyDown={(e) => e.key === 'Escape' && setPicker(false)}>
                {REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="menuitem"
                    className="rounded p-1.5 text-lg leading-none hover:bg-sunken"
                    onClick={() => {
                      onReact(m, e, !m.reactions.find((r) => r.emoji === e)?.userIds.includes(me));
                      setPicker(false);
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          {canEdit && (
            <button type="button" className="p-1.5 text-muted hover:bg-sunken hover:text-ink" aria-label="Edit message" onClick={() => onEdit(m)}>
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {canPin && (
            <button type="button" className="p-1.5 text-muted hover:bg-sunken hover:text-ink" aria-label={m.pinnedAt ? 'Unpin from Home' : 'Pin to everyone’s Home'} onClick={() => onPin(m, !m.pinnedAt)}>
              {m.pinnedAt ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
          )}
          {canDelete && (
            <button type="button" className="rounded-r-lg p-1.5 text-muted hover:bg-sunken hover:text-danger" aria-label="Delete message" onClick={() => onDelete(m)}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </li>
  );
});
