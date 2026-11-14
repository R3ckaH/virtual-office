import type { ChannelDto, FileDto, MessageDto } from '@vo/shared';
import { ALLOWED_FILE_TYPES, fileExtension, MAX_FILE_BYTES, MAX_FILES_PER_MESSAGE, MAX_MESSAGE_LENGTH } from '@vo/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { FileText, Loader2, Paperclip, SendHorizontal, X } from 'lucide-react';
import { ClipboardEvent, DragEvent, KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { putMessage, uploadFile, useUploadBase } from '@/lib/chat';
import { usePresence } from '@/lib/presence';

export interface Member {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  title: string | null;
}

export const useMembers = (channelId: string) =>
  useQuery({ queryKey: ['chat', 'members', channelId], queryFn: () => api<Member[]>(`/chat/channels/${channelId}/members`), staleTime: 60_000 });

interface Upload {
  key: string;
  name: string;
  size: number;
  file?: FileDto;
  error?: string;
}

const draftKey = (id: string) => `vo.chat.draft.${id}`;
const readDraft = (id: string) => {
  try {
    return sessionStorage.getItem(draftKey(id)) ?? '';
  } catch {
    return '';
  }
};

/** The @-word being typed at the caret, if any. */
function mentionQuery(text: string, caret: number): { start: number; q: string } | null {
  const before = text.slice(0, caret);
  const m = /(?:^|\s)@([\p{L}\p{N}.'-]*(?: [\p{L}\p{N}.'-]*)?)$/u.exec(before);
  if (!m) return null;
  return { start: caret - m[1].length - 1, q: m[1].toLowerCase() };
}

/** Which of the picked mentions are still in the text. */
export function keptMentions(text: string, picked: Map<string, string>) {
  return [...picked].filter(([, name]) => text.includes(`@${name}`)).map(([id]) => id);
}

/** Mention autocomplete + textarea, shared by the composer and the edit box. */
function useMentionBox(channelId: string, text: string, setText: (s: string) => void, picked: Map<string, string>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const members = useMembers(channelId);
  const { user } = useAuth();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const mq = mentionQuery(text, caret);
  const options = mq
    ? (members.data ?? []).filter((p) => p.userId !== user!.id && p.fullName.toLowerCase().split(/\s+/).some((w) => w.startsWith(mq.q.split(' ')[0])) && p.fullName.toLowerCase().includes(mq.q)).slice(0, 6)
    : [];
  useEffect(() => setActive(0), [mq?.q]);

  function choose(p: Member) {
    if (!mq) return;
    const insert = `@${p.fullName} `;
    const next = text.slice(0, mq.start) + insert + text.slice(caret);
    picked.set(p.userId, p.fullName);
    setText(next);
    pendingCaret.current = mq.start + insert.length;
  }

  // put the caret after the inserted name once the new text is on screen
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const pos = pendingCaret.current;
    if (pos === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(pos, pos);
    setCaret(pos);
  }, [text]);

  /** returns true when the key was used by the mention menu */
  function onMentionKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!options.length) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      choose(options[active]);
      return true;
    }
    if (e.key === 'Escape') {
      setCaret(-1);
      return true;
    }
    return false;
  }

  const menu =
    options.length > 0 ? (
      <ul role="listbox" aria-label="People to mention" className="absolute bottom-full left-2 z-20 mb-1 w-72 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
        {options.map((p, i) => (
          <li key={p.userId} role="option" aria-selected={i === active}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
              className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', i === active ? 'bg-brand/10' : 'hover:bg-sunken')}
            >
              <Avatar name={p.fullName} src={p.avatarUrl} size="sm" />
              <span className="flex-1 truncate">{p.fullName}</span>
              {p.title && <span className="truncate text-xs text-muted">{p.title}</span>}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  const track = (el: HTMLTextAreaElement) => setCaret(el.selectionStart ?? el.value.length);
  return { ref, menu, onMentionKey, track, mentionOpen: options.length > 0 };
}

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
}

export function Composer({ channel, disabledReason }: { channel: ChannelDto; disabledReason?: string }) {
  const { user } = useAuth();
  const { send: emit } = usePresence();
  const qc = useQueryClient();
  const toast = useToast();
  const base = useUploadBase();
  const [text, setTextState] = useState(() => readDraft(channel.id));
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const picked = useRef(new Map<string, string>()).current;
  const lastTyping = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const setText = (s: string) => {
    setTextState(s);
    try {
      if (s) sessionStorage.setItem(draftKey(channel.id), s);
      else sessionStorage.removeItem(draftKey(channel.id));
    } catch {
      /* storage unavailable */
    }
  };
  const box = useMentionBox(channel.id, text, setText, picked);
  useEffect(() => autosize(box.ref.current), [text, box.ref]);
  useEffect(() => {
    box.ref.current?.focus();
  }, [channel.id, box.ref]);

  function addFiles(list: FileList | File[]) {
    const files = [...list];
    if (uploads.length + files.length > MAX_FILES_PER_MESSAGE) {
      toast(`Up to ${MAX_FILES_PER_MESSAGE} files per message.`, 'danger');
      return;
    }
    for (const f of files) {
      const key = `${Date.now()}-${Math.random()}`;
      const bad = !ALLOWED_FILE_TYPES[fileExtension(f.name)]
        ? 'This kind of file can’t be shared.'
        : f.size > MAX_FILE_BYTES
          ? `Too big (over ${MAX_FILE_BYTES / 1024 / 1024} MB).`
          : undefined;
      setUploads((u) => [...u, { key, name: f.name, size: f.size, error: bad }]);
      if (bad) continue;
      uploadFile(f, base)
        .then((file) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, file } : x))))
        .catch((e) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: e instanceof ApiError ? e.message : 'Upload failed.' } : x))));
    }
  }

  const uploading = uploads.some((u) => !u.file && !u.error);
  const ready = uploads.filter((u) => u.file).map((u) => u.file!);
  const canSend = !disabledReason && !uploading && (text.trim().length > 0 || ready.length > 0) && text.length <= MAX_MESSAGE_LENGTH && !uploads.some((u) => u.error);

  async function send() {
    if (!canSend) return;
    const body = text.trim();
    const mentionIds = keptMentions(body, picked);
    const clientId = crypto.randomUUID();
    const temp: MessageDto = {
      id: clientId,
      seq: 0,
      channelId: channel.id,
      authorId: user!.id,
      authorName: user!.fullName,
      authorAvatarUrl: user!.avatarUrl ?? null,
      body,
      mentionIds,
      files: ready,
      reactions: [],
      createdAt: new Date().toISOString(),
      editedAt: null,
      deleted: false,
      pinnedAt: null,
      pinnedByName: null,
      clientId,
    };
    putMessage(qc, temp);
    setText('');
    setUploads([]);
    picked.clear();
    try {
      const m = await api<MessageDto>(`/chat/channels/${channel.id}/messages`, { method: 'POST', json: { body, fileIds: ready.map((f) => f.id), mentionIds, clientId } });
      putMessage(qc, m);
      void qc.invalidateQueries({ queryKey: ['chat', 'channels'] });
    } catch (e) {
      qc.setQueryData<{ messages: MessageDto[] }>(['chat', 'messages', channel.id], (p) => (p ? { ...p, messages: p.messages.filter((x) => x.clientId !== clientId) } : p));
      setText(body);
      toast(e instanceof ApiError ? e.message : 'Your message didn’t send. Check your connection and try again.', 'danger');
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (box.onMentionKey(e)) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  function onChange(v: string, el: HTMLTextAreaElement) {
    setText(v);
    box.track(el);
    if (v && Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      void emit('chat:typing', { channelId: channel.id });
    }
  }

  if (disabledReason) {
    return <p className="border-t border-line px-4 py-4 text-center text-sm text-muted">{disabledReason}</p>;
  }

  return (
    <div
      className={clsx('relative border-t border-line bg-surface px-3 pb-3 pt-2', dragging && 'ring-2 ring-inset ring-brand')}
      onDragOver={(e: DragEvent) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {box.menu}
      {uploads.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
          {uploads.map((u) => (
            <li key={u.key} className={clsx('flex max-w-[16rem] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm', u.error ? 'border-danger/50 text-danger' : 'border-line')}>
              {!u.file && !u.error ? <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Uploading" /> : <FileText className="h-4 w-4 text-muted" aria-hidden />}
              <span className="min-w-0 flex-1 truncate" title={u.error ?? u.name}>
                {u.error ? `${u.name}: ${u.error}` : u.name}
              </span>
              <button type="button" className="rounded p-0.5 text-muted hover:text-ink" aria-label={`Remove ${u.name}`} onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-line bg-surface px-2 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
        <button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink" aria-label="Attach files">
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept={Object.keys(ALLOWED_FILE_TYPES).map((x) => `.${x}`).join(',')}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <textarea
          ref={box.ref}
          rows={1}
          value={text}
          onChange={(e) => onChange(e.target.value, e.target)}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => box.track(e.currentTarget)}
          onClick={(e) => box.track(e.currentTarget)}
          onPaste={(e: ClipboardEvent<HTMLTextAreaElement>) => {
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              addFiles(files.map((f, i) => (f.name === 'image.png' ? new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type }) : f)));
            }
          }}
          aria-label={`Message ${channel.kind === 'DM' || channel.kind === 'GROUP' ? channel.name : `#${channel.name}`}`}
          aria-autocomplete="list"
          aria-expanded={box.mentionOpen}
          placeholder={`Message ${channel.kind === 'DM' || channel.kind === 'GROUP' ? channel.name : channel.kind === 'ANNOUNCEMENTS' ? 'everyone' : `#${channel.name}`}`}
          className="max-h-[220px] min-h-[2.25rem] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed placeholder:text-muted focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className="rounded-lg bg-brand p-2 text-brand-ink transition-opacity disabled:opacity-40"
          aria-label="Send"
          title="Send (Enter). New line: Shift+Enter"
        >
          <SendHorizontal className="h-5 w-5" />
        </button>
      </div>
      {text.length > MAX_MESSAGE_LENGTH - 200 && (
        <p className={clsx('mt-1 text-right text-xs', text.length > MAX_MESSAGE_LENGTH ? 'text-danger' : 'text-muted')}>
          {text.length} / {MAX_MESSAGE_LENGTH}
        </p>
      )}
    </div>
  );
}

/** Inline editor for your own message. */
export function EditBox({ m, onDone }: { m: MessageDto; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { people } = usePresence();
  const [text, setText] = useState(m.body);
  const picked = useRef(new Map(m.mentionIds.map((id) => [id, people[id]?.fullName ?? '']))).current;
  const box = useMentionBox(m.channelId, text, setText, picked);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const el = box.ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    autosize(el);
  }, [box.ref]);
  useEffect(() => autosize(box.ref.current), [text, box.ref]);

  async function save() {
    const body = text.trim();
    if (!body || body === m.body) return onDone();
    setSaving(true);
    try {
      const next = await api<MessageDto>(`/chat/messages/${m.id}`, { method: 'PUT', json: { body, mentionIds: keptMentions(body, picked) } });
      putMessage(qc, next);
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Couldn’t save the edit.', 'danger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative mt-1">
      {box.menu}
      <textarea
        ref={box.ref}
        value={text}
        aria-label="Edit message"
        onChange={(e) => {
          setText(e.target.value);
          box.track(e.target);
        }}
        onKeyDown={(e) => {
          if (box.onMentionKey(e)) return;
          if (e.key === 'Escape') onDone();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
        className="w-full resize-none rounded-lg border border-brand bg-surface px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <p className="mt-1 flex items-center gap-2 text-xs text-muted">
        Esc to cancel · Enter to save
        <button type="button" className="ml-auto rounded px-2 py-1 hover:bg-sunken" onClick={onDone}>
          Cancel
        </button>
        <button type="button" disabled={saving} className="rounded bg-brand px-2 py-1 font-medium text-brand-ink" onClick={() => void save()}>
          Save
        </button>
      </p>
    </div>
  );
}
