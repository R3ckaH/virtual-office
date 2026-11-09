/**
 * Phase 5: team chat and announcements.
 * Channels: direct messages (2 people), group messages (3–9), one per department (members follow the
 * department), one company-wide announcements channel (everyone; leaders post), and custom channels
 * that Admins, HR and Managers create (public: anyone can join; private: invite only).
 */
import { z } from 'zod';

export const CHANNEL_KINDS = ['DM', 'GROUP', 'DEPARTMENT', 'ANNOUNCEMENTS', 'CUSTOM'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_GROUP_DM = 9; // including you
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 5;
export const EDIT_WINDOW_HOURS = 24;
export const PAGE_SIZE = 50;
/** emoji anyone can react with (keeps reactions readable and the picker small) */
export const REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '👀', '✅', '🔥', '😮', '😢'] as const;

/** File types people can share, by extension → content type. No SVG/HTML (they can run scripts). */
export const ALLOWED_FILE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};
export const INLINE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export const fileExtension = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

const uuid = z.string().uuid();
const channelName = z
  .string()
  .trim()
  .min(2, 'At least 2 characters')
  .max(60, 'At most 60 characters')
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} &'’._-]*$/u, 'Letters, numbers, spaces and - _ . & only');

export const createChannelSchema = z.object({
  name: channelName,
  description: z.string().trim().max(300).nullable().default(null),
  isPrivate: z.boolean().default(false),
  memberIds: z.array(uuid).max(500).default([]),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  name: channelName.optional(),
  description: z.string().trim().max(300).nullable().optional(),
  isPrivate: z.boolean().optional(),
});
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export const membersSchema = z.object({ userIds: z.array(uuid).min(1).max(500) });
export type MembersInput = z.infer<typeof membersSchema>;

export const openDmSchema = z.object({ userIds: z.array(uuid).min(1).max(MAX_GROUP_DM - 1) });
export type OpenDmInput = z.infer<typeof openDmSchema>;

export const sendMessageSchema = z
  .object({
    body: z.string().max(MAX_MESSAGE_LENGTH, `Keep it under ${MAX_MESSAGE_LENGTH} characters`).default(''),
    fileIds: z.array(uuid).max(MAX_FILES_PER_MESSAGE).default([]),
    mentionIds: z.array(uuid).max(50).default([]),
    /** client-made id so a retried send isn't posted twice */
    clientId: z.string().max(64).optional(),
  })
  .refine((m) => m.body.trim().length > 0 || m.fileIds.length > 0, { message: 'Write a message or attach a file', path: ['body'] });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  body: z.string().trim().min(1, 'Write something').max(MAX_MESSAGE_LENGTH),
  mentionIds: z.array(uuid).max(50).default([]),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

export const reactSchema = z.object({ emoji: z.enum(REACTIONS) });
export type ReactInput = z.infer<typeof reactSchema>;

export const messagesQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  after: z.coerce.number().int().nonnegative().optional(),
  around: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
});
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

export const readSchema = z.object({ seq: z.number().int().nonnegative() });
export type ReadInput = z.infer<typeof readSchema>;

export const searchSchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(120),
  channelId: uuid.optional(),
});
export type SearchInput = z.infer<typeof searchSchema>;

export const typingSchema = z.object({ channelId: uuid });

/* ---------------- DTOs ---------------- */

export interface ChatPersonDto {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface ChannelDto {
  id: string;
  kind: ChannelKind;
  /** for DMs/groups: the other people's names */
  name: string;
  description: string | null;
  isPrivate: boolean;
  departmentId: string | null;
  /** for DMs/groups: the other people */
  people: ChatPersonDto[];
  memberCount: number;
  isMember: boolean;
  /** you can rename, archive and manage members */
  canManage: boolean;
  /** you can post (announcements: leaders, Admins and HR only) */
  canPost: boolean;
  lastSeq: number;
  lastMessageAt: string | null;
  lastReadSeq: number;
  unread: number;
  mentions: number;
  archivedAt: string | null;
}

export interface FileDto {
  id: string;
  name: string;
  contentType: string;
  size: number;
  /** signed link, valid for a few hours */
  url: string;
  isImage: boolean;
}

export interface ReactionDto {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface MessageDto {
  id: string;
  seq: number;
  channelId: string;
  authorId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  mentionIds: string[];
  files: FileDto[];
  reactions: ReactionDto[];
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  pinnedAt: string | null;
  pinnedByName: string | null;
  clientId: string | null;
}

export interface MessagesPageDto {
  messages: MessageDto[];
  /** more older / newer messages exist */
  hasBefore: boolean;
  hasAfter: boolean;
}

export interface SearchHitDto {
  message: MessageDto;
  channelName: string;
  channelKind: ChannelKind;
}

export interface ChatMeDto {
  canCreateChannels: boolean;
  canAnnounce: boolean;
}

/** Pinned announcements for the Home screen. */
export interface AnnouncementDto extends MessageDto {
  channelName: string;
}

/* ---------------- real-time ---------------- */

export interface ChatServerEvents {
  'chat:message': MessageDto;
  'chat:message-updated': MessageDto;
  'chat:message-deleted': { channelId: string; id: string; seq: number };
  'chat:channel': { channelId: string; removed?: boolean };
  'chat:read': { channelId: string; seq: number };
  'chat:typing': { channelId: string; userId: string; name: string };
  'chat:pins': { channelId: string };
}

/* ---------------- text helpers ---------------- */

export type Segment =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'mention'; text: string; userId: string }
  | { type: 'code'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string };

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/**
 * Splits a message into safe pieces for display: links, @mentions (by the names of the people
 * mentioned), `code`, **bold** and _italic_. Never produces HTML.
 */
export function segmentMessage(body: string, mentions: { userId: string; fullName: string }[] = []): Segment[] {
  const out: Segment[] = [];
  const names = [...mentions].sort((a, b) => b.fullName.length - a.fullName.length);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = [
    '`[^`\\n]+`',
    URL_RE.source,
    '\\*\\*[^*\\n]+\\*\\*',
    '(?<![\\w])_[^_\\n]+_(?![\\w])',
    ...(names.length ? [`@(?:${names.map((n) => escape(n.fullName)).join('|')})`] : []),
  ];
  const re = new RegExp(parts.join('|'), 'gu');
  let last = 0;
  for (const m of body.matchAll(re)) {
    const t = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push({ type: 'text', text: body.slice(last, at) });
    if (t.startsWith('`')) out.push({ type: 'code', text: t.slice(1, -1) });
    else if (t.startsWith('**')) out.push({ type: 'bold', text: t.slice(2, -2) });
    else if (t.startsWith('_')) out.push({ type: 'italic', text: t.slice(1, -1) });
    else if (t.startsWith('@')) {
      const who = names.find((n) => n.fullName === t.slice(1));
      out.push(who ? { type: 'mention', text: t, userId: who.userId } : { type: 'text', text: t });
    } else out.push({ type: 'link', text: t, href: t });
    last = at + t.length;
  }
  if (last < body.length) out.push({ type: 'text', text: body.slice(last) });
  return out;
}

/** A short single-line preview for notifications and the channel list. */
export function previewOf(body: string, files = 0, max = 80): string {
  const text = body.replace(/\s+/g, ' ').replace(/\*\*|`/g, '').trim();
  if (!text) return files ? `Shared ${files === 1 ? 'a file' : `${files} files`}` : '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
