import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DeviceDto, DeviceInput, DeviceTokenDto, DeviceUserDto, ImportResultDto, LinkDeviceUserInput, PunchDto } from '@vo/shared';
import { localDate, zonedToUtc } from '@vo/shared';
import { and, asc, count, desc, eq, gte, isNotNull, lt, max, ne, sql } from 'drizzle-orm';
import { DayService } from '../attendance/day.service';
import { toPunchDto } from '../attendance/dto';
import { ExceptionsService } from '../attendance/exceptions.service';
import { AuditService } from '../audit/audit.service';
import { randomToken, sha256 } from '../common/crypto';
import { DB, Db } from '../db/client';
import { Device, devices, deviceUserLinks, importBatches, punches, User, users } from '../db/schema';
import { IngestService, TOKEN_PREFIX } from './ingest.service';
import { parseAttendanceFile } from './parsers';

/** A pushing device or agent counts as online when it checked in within this window. */
const ONLINE_MS = 3 * 60_000;

@Injectable()
export class DevicesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly days: DayService,
    private readonly ingest: IngestService,
    private readonly exceptions: ExceptionsService,
    private readonly audit: AuditService,
  ) {}

  private async todayStart(now = new Date()) {
    const tz = await this.days.companyTz();
    return zonedToUtc(localDate(now, tz), '00:00', tz);
  }

  async list(now = new Date()): Promise<DeviceDto[]> {
    const rows = await this.db.select().from(devices).orderBy(asc(devices.name));
    const start = await this.todayStart(now);
    const today = await this.db
      .select({ deviceId: punches.deviceId, n: count() })
      .from(punches)
      .where(and(isNotNull(punches.deviceId), gte(punches.punchedAt, start)))
      .groupBy(punches.deviceId);
    const enrolled = await this.db
      .select({ deviceId: punches.deviceId, n: sql<number>`count(distinct ${punches.deviceUserId})::int` })
      .from(punches)
      .where(isNotNull(punches.deviceId))
      .groupBy(punches.deviceId);
    const out: DeviceDto[] = [];
    for (const d of rows) {
      let lastPunchName: string | null = null;
      if (d.lastPunchAt) {
        const [p] = await this.db
          .select({ name: users.fullName, badge: punches.deviceUserId })
          .from(punches)
          .leftJoin(users, eq(users.id, punches.userId))
          .where(and(eq(punches.deviceId, d.id), eq(punches.punchedAt, d.lastPunchAt)))
          .limit(1);
        lastPunchName = p ? (p.name ?? `Badge ${p.badge}`) : null;
      }
      const [lastImport] = await this.db
        .select()
        .from(importBatches)
        .where(eq(importBatches.deviceId, d.id))
        .orderBy(desc(importBatches.createdAt))
        .limit(1);
      out.push({
        id: d.id,
        name: d.name,
        model: d.model,
        serialNumber: d.serialNumber,
        location: d.location,
        connection: d.connection,
        timezone: d.timezone,
        allowedIps: d.allowedIps,
        active: d.active,
        online: d.connection !== 'FILE' && !!d.lastSeenAt && now.getTime() - d.lastSeenAt.getTime() < ONLINE_MS,
        hasToken: !!d.tokenHash,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        lastPunchAt: d.lastPunchAt?.toISOString() ?? null,
        lastPunchName,
        punchesToday: today.find((t) => t.deviceId === d.id)?.n ?? 0,
        enrolled: enrolled.find((t) => t.deviceId === d.id)?.n ?? 0,
        syncRequestedAt: d.syncRequestedAt?.toISOString() ?? null,
        lastImport: lastImport ? this.importDto(lastImport, d.name) : null,
      });
    }
    return out;
  }

  private importDto(b: typeof importBatches.$inferSelect, deviceName: string | null): ImportResultDto {
    return {
      id: b.id,
      deviceId: b.deviceId,
      deviceName,
      filename: b.filename,
      total: b.total,
      added: b.added,
      duplicates: b.duplicates,
      unknownUserIds: b.unknownUserIds,
      errors: b.errors,
      createdAt: b.createdAt.toISOString(),
    };
  }

  async get(id: string): Promise<DeviceDto> {
    const d = (await this.list()).find((x) => x.id === id);
    if (!d) throw new NotFoundException('Device not found');
    return d;
  }

  private async load(id: string): Promise<Device> {
    const [d] = await this.db.select().from(devices).where(eq(devices.id, id));
    if (!d) throw new NotFoundException('Device not found');
    return d;
  }

  private async checkSerial(input: DeviceInput, id?: string) {
    const sn = input.serialNumber || null;
    if (input.connection === 'PUSH' && !sn) {
      throw new BadRequestException({ message: 'Cloud push needs the device serial number', errors: { serialNumber: ['Required for cloud push'] } });
    }
    if (sn) {
      const [dup] = await this.db
        .select({ id: devices.id })
        .from(devices)
        .where(id ? and(eq(devices.serialNumber, sn), ne(devices.id, id)) : eq(devices.serialNumber, sn));
      if (dup) throw new ConflictException({ message: 'Another device has this serial number', errors: { serialNumber: ['Already in use'] } });
    }
  }

  async create(input: DeviceInput, actor: User, ip: string | null): Promise<DeviceDto & { token: string | null }> {
    await this.checkSerial(input);
    const [d] = await this.db
      .insert(devices)
      .values({
        name: input.name,
        model: input.model ?? null,
        serialNumber: input.serialNumber || null,
        location: input.location ?? null,
        connection: input.connection,
        timezone: input.timezone,
        allowedIps: input.allowedIps || null,
        active: input.active ?? true,
      })
      .returning();
    // agents always need a token; push devices get one too for the JSON push option
    const token = input.connection === 'FILE' ? null : await this.issueToken(d.id);
    await this.audit.record({ actorId: actor.id, action: 'device.create', entityType: 'device', entityId: d.id, after: { ...input }, ip });
    return { ...(await this.get(d.id)), token };
  }

  async update(id: string, input: DeviceInput, actor: User, ip: string | null): Promise<DeviceDto> {
    const before = await this.load(id);
    await this.checkSerial(input, id);
    await this.db
      .update(devices)
      .set({
        name: input.name,
        model: input.model ?? null,
        serialNumber: input.serialNumber || null,
        location: input.location ?? null,
        connection: input.connection,
        timezone: input.timezone,
        allowedIps: input.allowedIps || null,
        active: input.active ?? before.active,
      })
      .where(eq(devices.id, id));
    await this.audit.record({
      actorId: actor.id,
      action: 'device.update',
      entityType: 'device',
      entityId: id,
      before: { name: before.name, connection: before.connection, serialNumber: before.serialNumber, timezone: before.timezone, active: before.active },
      after: { ...input },
      ip,
    });
    return this.get(id);
  }

  async remove(id: string, actor: User, ip: string | null) {
    const d = await this.load(id);
    const [{ n }] = await this.db.select({ n: count() }).from(punches).where(eq(punches.deviceId, id));
    if (n > 0) throw new ConflictException('This device has punches on record. Turn it off instead of removing it.');
    await this.db.delete(devices).where(eq(devices.id, id));
    await this.audit.record({ actorId: actor.id, action: 'device.delete', entityType: 'device', entityId: id, before: { name: d.name }, ip });
  }

  private async issueToken(id: string): Promise<string> {
    const token = `${TOKEN_PREFIX}_${id}_${randomToken(32)}`;
    await this.db.update(devices).set({ tokenHash: sha256(token) }).where(eq(devices.id, id));
    return token;
  }

  /** A new token for the agent / JSON push; the old one stops working at once. Shown only this once. */
  async rotateToken(id: string, actor: User, ip: string | null): Promise<DeviceTokenDto> {
    await this.load(id);
    const token = await this.issueToken(id);
    await this.audit.record({ actorId: actor.id, action: 'device.token_rotate', entityType: 'device', entityId: id, ip });
    return { token };
  }

  /** "Sync now": the agent (or the device, via ADMS getrequest) picks this up on its next check-in. */
  async requestSync(id: string): Promise<DeviceDto> {
    await this.load(id);
    await this.db.update(devices).set({ syncRequestedAt: new Date() }).where(eq(devices.id, id));
    return this.get(id);
  }

  async devicePunches(id: string, date?: string): Promise<PunchDto[]> {
    await this.load(id);
    const tz = await this.days.companyTz();
    const d = date ?? localDate(new Date(), tz);
    const start = zonedToUtc(d, '00:00', tz);
    const end = new Date(start.getTime() + 24 * 3_600_000);
    const rows = await this.db
      .select({ punch: punches, deviceName: devices.name, userName: users.fullName })
      .from(punches)
      .leftJoin(devices, eq(devices.id, punches.deviceId))
      .leftJoin(users, eq(users.id, punches.userId))
      .where(and(eq(punches.deviceId, id), gte(punches.punchedAt, start), lt(punches.punchedAt, end)))
      .orderBy(desc(punches.punchedAt))
      .limit(500);
    return rows.map((r) => ({
      ...toPunchDto({ punch: r.punch, deviceName: r.deviceName ?? null, createdByName: null }, undefined),
      note: r.userName ?? `Badge ${r.punch.deviceUserId} (not linked)`,
    }));
  }

  /** File import: parse, ingest, and keep a record of what happened. */
  async importFile(id: string, file: { originalname: string; buffer: Buffer } | undefined, actor: User, ip: string | null): Promise<ImportResultDto> {
    const d = await this.load(id);
    if (!file) throw new BadRequestException({ message: 'Choose a file to upload', errors: { file: ['Required'] } });
    const filename = file.originalname.slice(0, 200);
    const parsed = await parseAttendanceFile(file.buffer, filename);
    const [batch] = await this.db.insert(importBatches).values({ deviceId: id, filename, uploadedById: actor.id }).returning();
    const res = parsed.rows.length
      ? await this.ingest.ingest(
          d,
          parsed.rows.map((r) => ({ deviceUserId: r.deviceUserId, at: r.local, verify: r.verify })),
          'file',
          { importBatchId: batch.id },
        )
      : { added: 0, duplicates: 0, unknownUserIds: [], errors: [] };
    const errors = [...parsed.errors, ...res.errors].slice(0, 30);
    const [saved] = await this.db
      .update(importBatches)
      .set({ total: parsed.rows.length, added: res.added, duplicates: res.duplicates, unknownUserIds: res.unknownUserIds, errors })
      .where(eq(importBatches.id, batch.id))
      .returning();
    await this.db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, id));
    await this.audit.record({
      actorId: actor.id,
      action: 'device.import',
      entityType: 'device',
      entityId: id,
      after: { filename, added: res.added, duplicates: res.duplicates, unknown: res.unknownUserIds.length },
      ip,
    });
    return this.importDto(saved, d.name);
  }

  /** Every device user ID known: linked ones, plus any badge that has punched. */
  async deviceUsers(now = new Date()): Promise<DeviceUserDto[]> {
    const start = await this.todayStart(now);
    const links = await this.db
      .select({ link: deviceUserLinks, userName: users.fullName, userStatus: users.status })
      .from(deviceUserLinks)
      .leftJoin(users, eq(users.id, deviceUserLinks.userId));
    const seen = await this.db
      .select({
        deviceUserId: punches.deviceUserId,
        lastPunchAt: max(punches.punchedAt),
        today: sql<number>`count(*) filter (where ${punches.punchedAt} >= ${start.toISOString()})::int`,
      })
      .from(punches)
      .where(isNotNull(punches.deviceUserId))
      .groupBy(punches.deviceUserId);
    const ids = new Set<string>([...links.map((l) => l.link.deviceUserId), ...seen.map((s) => s.deviceUserId!)]);
    return [...ids]
      .map((id) => {
        const l = links.find((x) => x.link.deviceUserId === id);
        const s = seen.find((x) => x.deviceUserId === id);
        return {
          deviceUserId: id,
          userId: l?.link.userId ?? null,
          userName: l?.userName ?? null,
          userActive: l?.userStatus === 'ACTIVE',
          enrolledWith: l?.link.enrolledWith ?? null,
          lastPunchAt: s?.lastPunchAt ? new Date(s.lastPunchAt).toISOString() : null,
          punchesToday: s?.today ?? 0,
        };
      })
      .sort((a, b) => a.deviceUserId.localeCompare(b.deviceUserId, undefined, { numeric: true }));
  }

  async linkDeviceUser(deviceUserId: string, input: LinkDeviceUserInput, actor: User, ip: string | null) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(deviceUserId)) throw new BadRequestException('Invalid device user ID');
    await this.exceptions.linkBadge(deviceUserId, input.userId, input.enrolledWith, actor, ip);
    return (await this.deviceUsers()).find((u) => u.deviceUserId === deviceUserId)!;
  }

  async removeDeviceUser(deviceUserId: string, actor: User, ip: string | null) {
    const [l] = await this.db.select().from(deviceUserLinks).where(eq(deviceUserLinks.deviceUserId, deviceUserId));
    if (!l) throw new NotFoundException('Not found');
    await this.db.delete(deviceUserLinks).where(eq(deviceUserLinks.deviceUserId, deviceUserId));
    await this.audit.record({ actorId: actor.id, action: 'device_user.remove', entityType: 'user', entityId: l.userId, before: { deviceUserId }, ip });
  }
}
