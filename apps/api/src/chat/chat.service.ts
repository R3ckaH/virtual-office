import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  ALLOWED_FILE_TYPES,
  AnnouncementDto,
  ChannelDto,
  ChatMeDto,
  CreateChannelInput,
  EDIT_WINDOW_HOURS,
  EditMessageInput,
  fileExtension,
  FileDto,
  hasPermission,
  INLINE_IMAGE_TYPES,
  MAX_FILE_BYTES,
  MAX_GROUP_DM,
  MessageDto,
  MessagesPageDto,
  MessagesQuery,
  ReactionDto,
  SearchHitDto,
  SendMessageInput,
  ServerEvents,
  typingSchema,
  UpdateChannelInput,
} from '@vo/shared';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, sql } from 'drizzle-orm';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { DomainEvents } from '../common/domain-events';
import { env } from '../config/env';
import { DB, Db } from '../db/client';
import { Channel, channelMembers, channels, chatFiles, departments, Message, messageReactions, messages, User, users } from '../db/schema';
import { PresenceService } from '../presence/presence.service';
import { realtimeUrl } from '../settings/public.controller';

const HOUR = 3_600_000;
const LINK_HOURS = 12;

/** Who can post in the announcements channel and pin to everyone's home: Admins, HR and leaders (not attendance-tracked). */
export const canAnnounce = (u: Pick<User, 'role' | 'attendanceTracked'>) => u.role === 'ADMIN' || u.role === 'HR' || !u.attendanceTracked;
export const canCreateChannels = (u: Pick<User, 'role'>) => hasPermission(u.role, 'chat.channels');

/** Magic bytes for the image types shown inline, so a renamed file can't pose as an image. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
};

type Row = Channel & { lastReadSeq: number; isMember: boolean; memberCount: number; unread: number; mentions: number; deptName: string | null };

/**
 * Team chat: channels, direct messages, announcements, files, reactions, read state and search.
 * Messages go out live over the office connection (one event per member).
 */
@Injectable()
export class ChatService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Chat');
  private cleanup?: NodeJS.Timeout;
  private readonly typingAt = new Map<string, number>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly presence: PresenceService,
    private readonly domain: DomainEvents,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    this.domain.on('userChanged', ({ userId }) => this.syncUser(userId));
    this.presence.onClientEvent('chat:typing', typingSchema, (userId, i) => this.typing(userId, i.channelId));
    await this.syncAll().catch((e) => this.log.error(`Chat sync failed: ${e}`));
    if (env().NODE_ENV !== 'test') {
      this.cleanup = setInterval(() => void this.removeOrphanFiles().catch((e) => this.log.error(e)), HOUR);
      this.cleanup.unref();
    }
  }

  onApplicationShutdown() {
    if (this.cleanup) clearInterval(this.cleanup);
  }

  /* ================================================================ */
  /* System channels: announcements and one per department             */
  /* ================================================================ */

  private async announcementsId(): Promise<string> {
    const [c] = await this.db.select({ id: channels.id }).from(channels).where(eq(channels.kind, 'ANNOUNCEMENTS'));
    if (c) return c.id;
    await this.db.insert(channels).values({ kind: 'ANNOUNCEMENTS', name: 'Announcements', description: 'Company-wide news from leadership, HR and admins.' }).onConflictDoNothing();
    const [again] = await this.db.select({ id: channels.id }).from(channels).where(eq(channels.kind, 'ANNOUNCEMENTS'));
    return again.id;
  }

  private async departmentChannelId(departmentId: string): Promise<string> {
    const find = () => this.db.select({ id: channels.id }).from(channels).where(and(eq(channels.kind, 'DEPARTMENT'), eq(channels.departmentId, departmentId)));
    const [c] = await find();
    if (c) return c.id;
    await this.db.insert(channels).values({ kind: 'DEPARTMENT', departmentId }).onConflictDoNothing();
    return (await find())[0].id;
  }

  /** Everyone active is in announcements; people are in their department's channel and no other. */
  async syncAll() {
    const ann = await this.announcementsId();
    for (const d of await this.db.select({ id: departments.id }).from(departments)) await this.departmentChannelId(d.id);
    await this.db.execute(sql`
      INSERT INTO channel_members (channel_id, user_id, last_read_seq)
      SELECT ${ann}, u.id, 0 FROM users u WHERE u.status = 'ACTIVE'
      ON CONFLICT DO NOTHING`);
    await this.db.execute(sql`
      INSERT INTO channel_members (channel_id, user_id, last_read_seq)
      SELECT c.id, u.id, 0 FROM users u JOIN channels c ON c.kind = 'DEPARTMENT' AND c.department_id = u.department_id
      WHERE u.status = 'ACTIVE'
      ON CONFLICT DO NOTHING`);
    await this.db.execute(sql`
      DELETE FROM channel_members cm USING channels c, users u
      WHERE cm.channel_id = c.id AND cm.user_id = u.id
        AND ((c.kind = 'DEPARTMENT' AND (u.department_id IS DISTINCT FROM c.department_id OR u.status <> 'ACTIVE'))
          OR (c.kind = 'ANNOUNCEMENTS' AND u.status <> 'ACTIVE'))`);
  }

  async syncUser(userId: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u) return;
    const before = new Set((await this.db.select({ id: channelMembers.channelId }).from(channelMembers).where(eq(channelMembers.userId, userId))).map((r) => r.id));
    const ann = await this.announcementsId();
    const dept = u.departmentId ? await this.departmentChannelId(u.departmentId) : null;
    if (u.status === 'ACTIVE') {
      await this.db.insert(channelMembers).values({ channelId: ann, userId }).onConflictDoNothing();
      if (dept) await this.db.insert(channelMembers).values({ channelId: dept, userId }).onConflictDoNothing();
    }
    const wrongDept = this.db.select({ id: channels.id }).from(channels).where(and(eq(channels.kind, 'DEPARTMENT'), dept ? ne(channels.id, dept) : sql`true`));
    await this.db.delete(channelMembers).where(and(eq(channelMembers.userId, userId), inArray(channelMembers.channelId, wrongDept)));
    if (u.status !== 'ACTIVE') {
      await this.db.delete(channelMembers).where(and(eq(channelMembers.userId, userId), eq(channelMembers.channelId, ann)));
    }
    const after = new Set((await this.db.select({ id: channelMembers.channelId }).from(channelMembers).where(eq(channelMembers.userId, userId))).map((r) => r.id));
    for (const id of new Set([...before, ...after])) {
      if (before.has(id) !== after.has(id)) this.presence.notify(userId, 'chat:channel', { channelId: id, removed: !after.has(id) });
    }
  }

  /* ================================================================ */
  /* Channels                                                          */
  /* ================================================================ */

  me(user: User): ChatMeDto {
    return { canCreateChannels: canCreateChannels(user), canAnnounce: canAnnounce(user) };
  }

  private async rows(user: User, where: ReturnType<typeof sql>): Promise<Row[]> {
    const res = await this.db.execute(sql`
      SELECT c.*,
        cm.user_id IS NOT NULL AS is_member,
        COALESCE(cm.last_read_seq, 0) AS my_last_read,
        d.name AS dept_name,
        (SELECT count(*)::int FROM channel_members x WHERE x.channel_id = c.id) AS member_count,
        CASE WHEN cm.user_id IS NULL THEN 0 ELSE (
          SELECT count(*)::int FROM messages m
          WHERE m.channel_id = c.id AND m.seq > cm.last_read_seq AND m.deleted_at IS NULL AND m.author_id IS DISTINCT FROM ${user.id}) END AS unread,
        CASE WHEN cm.user_id IS NULL THEN 0 ELSE (
          SELECT count(*)::int FROM messages m
          WHERE m.channel_id = c.id AND m.seq > cm.last_read_seq AND m.deleted_at IS NULL AND ${user.id}::uuid = ANY(m.mention_ids)) END AS mentions
      FROM channels c
      LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ${user.id}
      LEFT JOIN departments d ON d.id = c.department_id
      WHERE ${where}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`);
    return (res.rows as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      kind: r.kind as Channel['kind'],
      name: r.name as string | null,
      description: r.description as string | null,
      isPrivate: r.is_private as boolean,
      departmentId: r.department_id as string | null,
      dmKey: r.dm_key as string | null,
      createdById: r.created_by_id as string | null,
      lastSeq: Number(r.last_seq),
      lastMessageAt: r.last_message_at ? new Date(r.last_message_at as string) : null,
      archivedAt: r.archived_at ? new Date(r.archived_at as string) : null,
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
      lastReadSeq: Number(r.my_last_read),
      isMember: r.is_member as boolean,
      memberCount: r.member_count as number,
      unread: r.unread as number,
      mentions: r.mentions as number,
      deptName: r.dept_name as string | null,
    }));
  }

  private canManage(c: Pick<Channel, 'kind' | 'createdById'>, user: User) {
    return c.kind === 'CUSTOM' && (c.createdById === user.id || user.role === 'ADMIN');
  }

  private canPost(c: Pick<Channel, 'kind' | 'archivedAt'>, user: User, isMember: boolean) {
    return isMember && !c.archivedAt && (c.kind !== 'ANNOUNCEMENTS' || canAnnounce(user));
  }

  private async dtos(user: User, rows: Row[]): Promise<ChannelDto[]> {
    const dmIds = rows.filter((r) => r.kind === 'DM' || r.kind === 'GROUP').map((r) => r.id);
    const people = new Map<string, { userId: string; fullName: string; avatarUrl: string | null }[]>();
    if (dmIds.length) {
      const ps = await this.db
        .select({ channelId: channelMembers.channelId, userId: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl })
        .from(channelMembers)
        .innerJoin(users, eq(users.id, channelMembers.userId))
        .where(and(inArray(channelMembers.channelId, dmIds), ne(channelMembers.userId, user.id)))
        .orderBy(users.fullName);
      for (const p of ps) people.set(p.channelId, [...(people.get(p.channelId) ?? []), { userId: p.userId, fullName: p.fullName, avatarUrl: p.avatarUrl }]);
    }
    return rows.map((r) => {
      const others = people.get(r.id) ?? [];
      const name =
        r.kind === 'DEPARTMENT'
          ? r.deptName ?? 'Department'
          : r.kind === 'DM' || r.kind === 'GROUP'
            ? others.map((p) => (r.kind === 'GROUP' ? p.fullName.split(' ')[0] : p.fullName)).join(', ') || 'Just you'
            : r.name ?? 'Channel';
      return {
        id: r.id,
        kind: r.kind,
        name,
        description: r.description,
        isPrivate: r.isPrivate || r.kind === 'DM' || r.kind === 'GROUP',
        departmentId: r.departmentId,
        people: others,
        memberCount: r.memberCount,
        isMember: r.isMember,
        canManage: this.canManage(r, user),
        canPost: this.canPost(r, user, r.isMember),
        lastSeq: r.lastSeq,
        lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
        lastReadSeq: r.lastReadSeq,
        unread: r.unread,
        mentions: r.mentions,
        archivedAt: r.archivedAt?.toISOString() ?? null,
      };
    });
  }

  /** Your channels and conversations, most recent first, with unread counts. */
  async list(user: User): Promise<ChannelDto[]> {
    await this.syncUser(user.id);
    return this.dtos(user, await this.rows(user, sql`cm.user_id IS NOT NULL AND c.archived_at IS NULL`));
  }

  /** Public channels you could join. */
  async browse(user: User): Promise<ChannelDto[]> {
    return this.dtos(user, await this.rows(user, sql`c.kind = 'CUSTOM' AND NOT c.is_private AND c.archived_at IS NULL`));
  }

  /** A channel you can see: a member, or a public custom channel. */
  async channel(user: User, id: string): Promise<ChannelDto> {
    const [r] = await this.rows(user, sql`c.id = ${id}`);
    if (!r || (!r.isMember && !(r.kind === 'CUSTOM' && !r.isPrivate))) throw new NotFoundException('Channel not found');
    return (await this.dtos(user, [r]))[0];
  }

  private async load(id: string): Promise<Channel> {
    const [c] = await this.db.select().from(channels).where(eq(channels.id, id));
    if (!c) throw new NotFoundException('Channel not found');
    return c;
  }

  private async isMember(channelId: string, userId: string) {
    const [m] = await this.db.select({ u: channelMembers.userId }).from(channelMembers).where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)));
    return !!m;
  }

  /** Read access: members, plus anyone for public custom channels. */
  private async readable(user: User, id: string): Promise<Channel> {
    const c = await this.load(id);
    if (await this.isMember(id, user.id)) return c;
    if (c.kind === 'CUSTOM' && !c.isPrivate) return c;
    throw new NotFoundException('Channel not found');
  }

  async memberIds(channelId: string): Promise<string[]> {
    return (await this.db.select({ id: channelMembers.userId }).from(channelMembers).where(eq(channelMembers.channelId, channelId))).map((r) => r.id);
  }

  async members(user: User, id: string) {
    await this.readable(user, id);
    return this.db
      .select({ userId: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl, title: users.title })
      .from(channelMembers)
      .innerJoin(users, eq(users.id, channelMembers.userId))
      .where(eq(channelMembers.channelId, id))
      .orderBy(users.fullName);
  }

  private async activeUsers(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const found = await this.db.select({ id: users.id }).from(users).where(and(inArray(users.id, unique), eq(users.status, 'ACTIVE')));
    if (found.length !== unique.length) throw new BadRequestException({ message: 'Add active people only', errors: { memberIds: ['Someone on the list is not an active user'] } });
    return unique;
  }

  private notifyChannel(channelId: string, ids: string[]) {
    for (const id of ids) this.presence.notify(id, 'chat:channel', { channelId });
  }

  /** Opens (or finds) the direct conversation with these people. */
  async openDm(user: User, userIds: string[]): Promise<ChannelDto> {
    const others = (await this.activeUsers(userIds.filter((u) => u !== user.id))).filter((u) => u !== user.id);
    if (!others.length) throw new BadRequestException('Pick someone to message.');
    if (others.length + 1 > MAX_GROUP_DM) throw new BadRequestException(`A group message can have up to ${MAX_GROUP_DM} people.`);
    const ids = [user.id, ...others].sort();
    const dmKey = ids.join(',');
    let [c] = await this.db.select().from(channels).where(eq(channels.dmKey, dmKey));
    if (!c) {
      [c] = await this.db
        .insert(channels)
        .values({ kind: ids.length === 2 ? 'DM' : 'GROUP', dmKey, createdById: user.id })
        .onConflictDoNothing()
        .returning();
      c ??= (await this.db.select().from(channels).where(eq(channels.dmKey, dmKey)))[0];
      await this.db.insert(channelMembers).values(ids.map((userId) => ({ channelId: c.id, userId }))).onConflictDoNothing();
    }
    return this.channel(user, c.id);
  }

  async create(user: User, input: CreateChannelInput): Promise<ChannelDto> {
    if (!canCreateChannels(user)) throw new ForbiddenException('Only Admins, HR and Managers can create channels.');
    const memberIds = await this.activeUsers([user.id, ...input.memberIds]);
    const clash = await this.db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.kind, 'CUSTOM'), isNull(channels.archivedAt), sql`lower(${channels.name}) = lower(${input.name})`));
    if (clash.length) throw new ConflictException({ message: 'A channel with that name already exists', errors: { name: ['Pick another name'] } });
    const [c] = await this.db
      .insert(channels)
      .values({ kind: 'CUSTOM', name: input.name, description: input.description, isPrivate: input.isPrivate, createdById: user.id })
      .returning();
    await this.db.insert(channelMembers).values(memberIds.map((userId) => ({ channelId: c.id, userId })));
    this.notifyChannel(c.id, memberIds);
    return this.channel(user, c.id);
  }

  private async manageable(user: User, id: string) {
    const c = await this.load(id);
    if (!this.canManage(c, user)) throw new ForbiddenException('Only the channel’s creator or an admin can change it.');
    if (c.archivedAt) throw new ConflictException('This channel is archived.');
    return c;
  }

  async update(user: User, id: string, input: UpdateChannelInput): Promise<ChannelDto> {
    await this.manageable(user, id);
    if (input.name) {
      const clash = await this.db
        .select({ id: channels.id })
        .from(channels)
        .where(and(eq(channels.kind, 'CUSTOM'), ne(channels.id, id), isNull(channels.archivedAt), sql`lower(${channels.name}) = lower(${input.name})`));
      if (clash.length) throw new ConflictException({ message: 'A channel with that name already exists', errors: { name: ['Pick another name'] } });
    }
    await this.db.update(channels).set(input).where(eq(channels.id, id));
    this.notifyChannel(id, await this.memberIds(id));
    return this.channel(user, id);
  }

  async archive(user: User, id: string) {
    await this.manageable(user, id);
    await this.db.update(channels).set({ archivedAt: new Date() }).where(eq(channels.id, id));
    for (const m of await this.memberIds(id)) this.presence.notify(m, 'chat:channel', { channelId: id, removed: true });
    await this.audit.record({ actorId: user.id, action: 'chat.channel_archived', entityType: 'channel', entityId: id, ip: null });
  }

  async addMembers(user: User, id: string, userIds: string[]) {
    await this.manageable(user, id);
    const ids = await this.activeUsers(userIds);
    await this.db.insert(channelMembers).values(ids.map((userId) => ({ channelId: id, userId }))).onConflictDoNothing();
    this.notifyChannel(id, await this.memberIds(id));
    return this.members(user, id);
  }

  async removeMember(user: User, id: string, userId: string) {
    const c = await this.load(id);
    const self = userId === user.id;
    if (self) {
      if (c.kind !== 'CUSTOM' && c.kind !== 'GROUP') throw new BadRequestException('You can’t leave this conversation.');
    } else await this.manageable(user, id);
    const remaining = (await this.memberIds(id)).filter((m) => m !== userId);
    await this.db.delete(channelMembers).where(and(eq(channelMembers.channelId, id), eq(channelMembers.userId, userId)));
    this.presence.notify(userId, 'chat:channel', { channelId: id, removed: true });
    this.notifyChannel(id, remaining);
  }

  async join(user: User, id: string): Promise<ChannelDto> {
    const c = await this.load(id);
    if (c.kind !== 'CUSTOM' || c.isPrivate || c.archivedAt) throw new ForbiddenException('You need an invite to join this channel.');
    await this.db.insert(channelMembers).values({ channelId: id, userId: user.id, lastReadSeq: c.lastSeq }).onConflictDoNothing();
    this.notifyChannel(id, await this.memberIds(id));
    return this.channel(user, id);
  }

  /* ================================================================ */
  /* Messages                                                          */
  /* ================================================================ */

  private sign(id: string, exp: number) {
    return createHmac('sha256', env().JWT_SECRET).update(`chat-file:${id}:${exp}`).digest('base64url');
  }

  private fileUrl(id: string) {
    // links last LINK_HOURS, rounded to the hour so the same file keeps the same URL (browser cache)
    const exp = Math.ceil((Date.now() + LINK_HOURS * HOUR) / HOUR) * (HOUR / 1000);
    return `${realtimeUrl() ?? ''}/api/chat/files/${id}?exp=${exp}&sig=${this.sign(id, exp)}`;
  }

  verifyFileLink(id: string, exp: number, sig: string) {
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
    const want = Buffer.from(this.sign(id, exp));
    const got = Buffer.from(sig ?? '');
    return want.length === got.length && timingSafeEqual(want, got);
  }

  private async hydrate(list: Message[]): Promise<MessageDto[]> {
    if (!list.length) return [];
    const ids = list.map((m) => m.id);
    const people = [...new Set(list.flatMap((m) => [m.authorId, m.pinnedById]).filter(Boolean) as string[])];
    const who = new Map(
      people.length ? (await this.db.select({ id: users.id, name: users.fullName, avatar: users.avatarUrl }).from(users).where(inArray(users.id, people))).map((u) => [u.id, u]) : [],
    );
    const files = await this.db
      .select({ id: chatFiles.id, messageId: chatFiles.messageId, name: chatFiles.name, contentType: chatFiles.contentType, size: chatFiles.size })
      .from(chatFiles)
      .where(inArray(chatFiles.messageId, ids))
      .orderBy(chatFiles.createdAt);
    const reacts = await this.db
      .select()
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, ids))
      .orderBy(messageReactions.createdAt);
    return list.map((m) => {
      const deleted = !!m.deletedAt;
      const rs = new Map<string, ReactionDto>();
      if (!deleted) {
        for (const r of reacts.filter((x) => x.messageId === m.id)) {
          const e = rs.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [] };
          e.count += 1;
          e.userIds.push(r.userId);
          rs.set(r.emoji, e);
        }
      }
      const author = m.authorId ? who.get(m.authorId) : undefined;
      return {
        id: m.id,
        seq: m.seq,
        channelId: m.channelId,
        authorId: m.authorId,
        authorName: author?.name ?? 'Former member',
        authorAvatarUrl: author?.avatar ?? null,
        body: deleted ? '' : m.body,
        mentionIds: deleted ? [] : m.mentionIds,
        files: deleted
          ? []
          : files
              .filter((f) => f.messageId === m.id)
              .map<FileDto>((f) => ({ id: f.id, name: f.name, contentType: f.contentType, size: f.size, url: this.fileUrl(f.id), isImage: INLINE_IMAGE_TYPES.includes(f.contentType) })),
        reactions: [...rs.values()],
        createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt?.toISOString() ?? null,
        deleted,
        pinnedAt: deleted ? null : m.pinnedAt?.toISOString() ?? null,
        pinnedByName: m.pinnedById ? who.get(m.pinnedById)?.name ?? null : null,
        clientId: m.clientId,
      };
    });
  }

  async messages(user: User, channelId: string, q: MessagesQuery): Promise<MessagesPageDto> {
    await this.readable(user, channelId);
    const base = eq(messages.channelId, channelId);
    const lim = q.limit;
    let rows: Message[];
    let hasBefore = false;
    let hasAfter = false;
    if (q.around) {
      const half = Math.floor(lim / 2);
      const older = await this.db.select().from(messages).where(and(base, lt(messages.seq, q.around))).orderBy(desc(messages.seq)).limit(half + 1);
      const newer = await this.db.select().from(messages).where(and(base, sql`${messages.seq} >= ${q.around}`)).orderBy(asc(messages.seq)).limit(lim - half + 1);
      hasBefore = older.length > half;
      hasAfter = newer.length > lim - half;
      rows = [...older.slice(0, half).reverse(), ...newer.slice(0, lim - half)];
    } else if (q.after !== undefined) {
      const newer = await this.db.select().from(messages).where(and(base, gt(messages.seq, q.after))).orderBy(asc(messages.seq)).limit(lim + 1);
      hasAfter = newer.length > lim;
      hasBefore = true;
      rows = newer.slice(0, lim);
    } else {
      const older = await this.db
        .select()
        .from(messages)
        .where(q.before ? and(base, lt(messages.seq, q.before)) : base)
        .orderBy(desc(messages.seq))
        .limit(lim + 1);
      hasBefore = older.length > lim;
      rows = older.slice(0, lim).reverse();
    }
    return { messages: await this.hydrate(rows), hasBefore, hasAfter };
  }

  private async validMentions(channelId: string, kind: Channel['kind'], ids: string[]) {
    if (!ids.length) return [];
    const unique = [...new Set(ids)];
    const ok = await this.db
      .select({ id: channelMembers.userId })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, channelId), inArray(channelMembers.userId, unique)));
    void kind;
    return ok.map((r) => r.id);
  }

  async send(user: User, channelId: string, input: SendMessageInput): Promise<MessageDto> {
    const c = await this.load(channelId);
    const member = await this.isMember(channelId, user.id);
    if (!member) throw new ForbiddenException('Join the channel to post.');
    if (!this.canPost(c, user, member)) {
      throw new ForbiddenException(c.archivedAt ? 'This channel is archived.' : 'Only leaders, HR and admins post announcements. You can react to them.');
    }
    if (input.clientId) {
      const [dup] = await this.db.select().from(messages).where(and(eq(messages.authorId, user.id), eq(messages.clientId, input.clientId)));
      if (dup) return (await this.hydrate([dup]))[0];
    }
    if (input.fileIds.length) {
      const fs = await this.db
        .select({ id: chatFiles.id })
        .from(chatFiles)
        .where(and(inArray(chatFiles.id, input.fileIds), eq(chatFiles.uploaderId, user.id), isNull(chatFiles.messageId)));
      if (fs.length !== new Set(input.fileIds).size) throw new BadRequestException('One of the files is missing. Attach it again.');
    }
    const mentionIds = await this.validMentions(channelId, c.kind, input.mentionIds);
    const m = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(messages)
        .values({ channelId, authorId: user.id, body: input.body.trim(), mentionIds, clientId: input.clientId ?? null })
        .returning();
      if (input.fileIds.length) await tx.update(chatFiles).set({ messageId: row.id }).where(inArray(chatFiles.id, input.fileIds));
      await tx.update(channels).set({ lastSeq: row.seq, lastMessageAt: row.createdAt }).where(and(eq(channels.id, channelId), lt(channels.lastSeq, row.seq)));
      // what you write, you've read
      await tx.update(channelMembers).set({ lastReadSeq: row.seq }).where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));
      return row;
    });
    const [dto] = await this.hydrate([m]);
    await this.broadcast(channelId, 'chat:message', dto);
    return dto;
  }

  private async broadcast<E extends keyof ServerEvents>(channelId: string, event: E, data: ServerEvents[E]) {
    for (const id of await this.memberIds(channelId)) this.presence.notify(id, event, data);
  }

  private async own(user: User, id: string) {
    const [m] = await this.db.select().from(messages).where(eq(messages.id, id));
    if (!m || !(await this.isMember(m.channelId, user.id))) throw new NotFoundException('Message not found');
    return m;
  }

  async edit(user: User, id: string, input: EditMessageInput): Promise<MessageDto> {
    const m = await this.own(user, id);
    if (m.authorId !== user.id) throw new ForbiddenException('You can only edit your own messages.');
    if (m.deletedAt) throw new ConflictException('This message was deleted.');
    if (Date.now() - m.createdAt.getTime() > EDIT_WINDOW_HOURS * HOUR) throw new ForbiddenException(`Messages can be edited for ${EDIT_WINDOW_HOURS} hours.`);
    const c = await this.load(m.channelId);
    const mentionIds = await this.validMentions(m.channelId, c.kind, input.mentionIds);
    const [row] = await this.db.update(messages).set({ body: input.body, mentionIds, editedAt: new Date() }).where(eq(messages.id, id)).returning();
    const [dto] = await this.hydrate([row]);
    await this.broadcast(m.channelId, 'chat:message-updated', dto);
    return dto;
  }

  async remove(user: User, id: string) {
    const [m] = await this.db.select().from(messages).where(eq(messages.id, id));
    if (!m) throw new NotFoundException('Message not found');
    const member = await this.isMember(m.channelId, user.id);
    const mine = m.authorId === user.id;
    // admins can remove anything in channels they belong to (moderation); never in others' private conversations
    if (!member || (!mine && user.role !== 'ADMIN')) throw new ForbiddenException('You can only delete your own messages.');
    if (m.deletedAt) return;
    await this.db.update(messages).set({ deletedAt: new Date(), body: '', mentionIds: [], pinnedAt: null, pinnedById: null }).where(eq(messages.id, id));
    await this.db.delete(chatFiles).where(eq(chatFiles.messageId, id));
    await this.db.delete(messageReactions).where(eq(messageReactions.messageId, id));
    if (!mine) await this.audit.record({ actorId: user.id, action: 'chat.message_removed', entityType: 'message', entityId: id, ip: null });
    await this.broadcast(m.channelId, 'chat:message-deleted', { channelId: m.channelId, id, seq: m.seq });
    if (m.pinnedAt) await this.broadcast(m.channelId, 'chat:pins', { channelId: m.channelId });
  }

  async react(user: User, id: string, emoji: string, on: boolean): Promise<MessageDto> {
    const m = await this.own(user, id);
    if (m.deletedAt) throw new ConflictException('This message was deleted.');
    if (on) await this.db.insert(messageReactions).values({ messageId: id, userId: user.id, emoji }).onConflictDoNothing();
    else await this.db.delete(messageReactions).where(and(eq(messageReactions.messageId, id), eq(messageReactions.userId, user.id), eq(messageReactions.emoji, emoji)));
    const [dto] = await this.hydrate([m]);
    await this.broadcast(m.channelId, 'chat:message-updated', dto);
    return dto;
  }

  async markRead(user: User, channelId: string, seq: number) {
    const c = await this.load(channelId);
    const upTo = Math.min(seq, c.lastSeq);
    await this.db
      .update(channelMembers)
      .set({ lastReadSeq: sql`GREATEST(${channelMembers.lastReadSeq}, ${upTo})` })
      .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, user.id)));
    this.presence.notify(user.id, 'chat:read', { channelId, seq: upTo });
  }

  /* ================================================================ */
  /* Pins and announcements                                            */
  /* ================================================================ */

  async pin(user: User, id: string, on: boolean): Promise<MessageDto> {
    const m = await this.own(user, id);
    const c = await this.load(m.channelId);
    if (c.kind !== 'ANNOUNCEMENTS' || !canAnnounce(user)) throw new ForbiddenException('Only leaders, HR and admins can pin announcements.');
    if (m.deletedAt) throw new ConflictException('This message was deleted.');
    const [row] = await this.db
      .update(messages)
      .set(on ? { pinnedAt: new Date(), pinnedById: user.id } : { pinnedAt: null, pinnedById: null })
      .where(eq(messages.id, id))
      .returning();
    const [dto] = await this.hydrate([row]);
    await this.broadcast(m.channelId, 'chat:message-updated', dto);
    await this.broadcast(m.channelId, 'chat:pins', { channelId: m.channelId });
    return dto;
  }

  /** Pinned announcements for the Home screen, newest first. */
  async announcements(user: User): Promise<AnnouncementDto[]> {
    const ann = await this.announcementsId();
    if (!(await this.isMember(ann, user.id))) await this.syncUser(user.id);
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.channelId, ann), isNotNull(messages.pinnedAt), isNull(messages.deletedAt)))
      .orderBy(desc(messages.pinnedAt))
      .limit(5);
    return (await this.hydrate(rows)).map((m) => ({ ...m, channelName: 'Announcements' }));
  }

  /* ================================================================ */
  /* Files                                                             */
  /* ================================================================ */

  async upload(user: User, name: string, body: Buffer) {
    const clean = (name || 'file').replace(/[\\/\r\n"<>]/g, '_').slice(-120).trim() || 'file';
    const contentType = ALLOWED_FILE_TYPES[fileExtension(clean)];
    if (!contentType) throw new BadRequestException({ message: 'That kind of file can’t be shared. Try PDF, Office documents, images, audio, video or zip.', code: 'FILE_TYPE' });
    if (!Buffer.isBuffer(body) || !body.length) throw new BadRequestException('The file is empty.');
    if (body.length > MAX_FILE_BYTES) throw new PayloadTooLargeException(`Files can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
    const check = SIGNATURES[contentType];
    if (check && !check(body)) throw new BadRequestException({ message: 'The file doesn’t match its type. Save it again and retry.', code: 'FILE_MISMATCH' });
    const [f] = await this.db
      .insert(chatFiles)
      .values({ uploaderId: user.id, name: clean, contentType, size: body.length, sha256: createHash('sha256').update(body).digest('hex'), data: body })
      .returning({ id: chatFiles.id, name: chatFiles.name, contentType: chatFiles.contentType, size: chatFiles.size });
    return { ...f, url: this.fileUrl(f.id), isImage: INLINE_IMAGE_TYPES.includes(f.contentType) } satisfies FileDto;
  }

  async file(id: string) {
    const [f] = await this.db.select().from(chatFiles).where(eq(chatFiles.id, id));
    if (!f) throw new NotFoundException('File not found');
    return f;
  }

  /** Uploads never attached to a message (closed tab, cancelled send) are removed after a day. */
  async removeOrphanFiles(now = new Date()) {
    const res = await this.db
      .delete(chatFiles)
      .where(and(isNull(chatFiles.messageId), lte(chatFiles.createdAt, new Date(now.getTime() - 24 * HOUR))))
      .returning({ id: chatFiles.id });
    return res.length;
  }

  /* ================================================================ */
  /* Search and typing                                                 */
  /* ================================================================ */

  async search(user: User, q: string, channelId?: string): Promise<SearchHitDto[]> {
    const words = q
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 0)
      .slice(0, 8);
    if (!words.length) return [];
    const tsq = words.map((w) => `${w}:*`).join(' & ');
    const mine = this.db.select({ id: channelMembers.channelId }).from(channelMembers).where(eq(channelMembers.userId, user.id));
    const rows = await this.db
      .select()
      .from(messages)
      .where(
        and(
          inArray(messages.channelId, mine),
          channelId ? eq(messages.channelId, channelId) : undefined,
          isNull(messages.deletedAt),
          sql`to_tsvector('simple', ${messages.body}) @@ to_tsquery('simple', ${tsq})`,
        ),
      )
      .orderBy(desc(messages.seq))
      .limit(30);
    const hydrated = await this.hydrate(rows);
    const chans = rows.length ? await this.dtos(user, await this.rows(user, sql`c.id = ANY(${`{${[...new Set(rows.map((r) => r.channelId))].join(',')}}`}::uuid[])`)) : [];
    const byId = new Map(chans.map((c) => [c.id, c]));
    return hydrated.map((m) => ({ message: m, channelName: byId.get(m.channelId)?.name ?? 'Channel', channelKind: byId.get(m.channelId)?.kind ?? 'CUSTOM' }));
  }

  async typing(userId: string, channelId: string) {
    const key = `${userId}:${channelId}`;
    const last = this.typingAt.get(key) ?? 0;
    if (Date.now() - last < 2500) return; // at most one relay every few seconds per person per channel
    this.typingAt.set(key, Date.now());
    if (this.typingAt.size > 5000) this.typingAt.clear();
    const ids = await this.memberIds(channelId);
    if (!ids.includes(userId)) return;
    const [u] = await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, userId));
    for (const id of ids) if (id !== userId) this.presence.notify(id, 'chat:typing', { channelId, userId, name: u?.name ?? 'Someone' });
  }
}
