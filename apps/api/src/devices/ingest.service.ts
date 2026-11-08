import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { IngestResultDto } from '@vo/shared';
import { localDate, zonedToUtc } from '@vo/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { DayService } from '../attendance/day.service';
import { safeEqual, sha256 } from '../common/crypto';
import { DomainEvents } from '../common/domain-events';
import { DB, Db } from '../db/client';
import { attendanceExceptions, Device, devices, deviceUserLinks, punches, users } from '../db/schema';

export interface IncomingPunch {
  deviceUserId: string;
  /** device wall-clock 'YYYY-MM-DD HH:MM[:SS]' or an ISO time with offset */
  at: string;
  verify?: string | null;
}

const LOCAL = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/;

/** Device times usually come without an offset; read them in the device's own time zone. */
export function deviceTime(at: string, tz: string): Date | null {
  const m = at.trim().match(LOCAL);
  if (m) return zonedToUtc(m[1], m[2], tz);
  const t = Date.parse(at);
  return Number.isNaN(t) ? null : new Date(t);
}

export const TOKEN_PREFIX = 'vod';

/** Device/agent tokens look like vod_<deviceId>_<secret>; only the sha256 is stored. */
export function parseDeviceToken(token: string): { deviceId: string } | null {
  const m = token.match(/^vod_([0-9a-f-]{36})_[A-Za-z0-9_-]{20,}$/);
  return m ? { deviceId: m[1] } : null;
}

/** Turns raw device punches into attendance: links badges to people, skips duplicates, flags unknown badges. */
@Injectable()
export class IngestService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly days: DayService,
    private readonly domain: DomainEvents,
  ) {}

  /** Looks up the device for a Bearer token (sync agent / JSON push). */
  async deviceForToken(header: string | undefined): Promise<Device> {
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const parsed = parseDeviceToken(token);
    if (!parsed) throw new UnauthorizedException('Missing or invalid device token');
    const [d] = await this.db.select().from(devices).where(eq(devices.id, parsed.deviceId));
    if (!d || !d.active || !d.tokenHash || !safeEqual(sha256(token), d.tokenHash)) {
      throw new UnauthorizedException('Missing or invalid device token');
    }
    return d;
  }

  async ingest(
    device: Device,
    items: IncomingPunch[],
    via: 'push' | 'agent' | 'file',
    opts: { importBatchId?: string; now?: Date } = {},
  ): Promise<IngestResultDto & { errors: string[] }> {
    const now = opts.now ?? new Date();
    const errors: string[] = [];
    const parsed: { deviceUserId: string; at: Date; verify: string | null }[] = [];
    for (const it of items) {
      const at = deviceTime(it.at, device.timezone);
      const id = it.deviceUserId.trim();
      if (!at || !id) {
        if (errors.length < 20) errors.push(`Skipped an unreadable punch (${id || 'no ID'}, ${it.at})`);
        continue;
      }
      // a device clock that's far off would create punches in the future
      if (at.getTime() > now.getTime() + 10 * 60_000) {
        if (errors.length < 20) errors.push(`Skipped a punch in the future for ${id} (${it.at}); check the device clock`);
        continue;
      }
      parsed.push({ deviceUserId: id, at, verify: it.verify ?? null });
    }
    parsed.sort((a, b) => a.at.getTime() - b.at.getTime());
    if (!parsed.length) return { added: 0, duplicates: 0, unknownUserIds: [], errors };

    const badges = [...new Set(parsed.map((p) => p.deviceUserId))];
    const links = await this.db
      .select({ deviceUserId: deviceUserLinks.deviceUserId, userId: deviceUserLinks.userId })
      .from(deviceUserLinks)
      .innerJoin(users, eq(users.id, deviceUserLinks.userId))
      .where(inArray(deviceUserLinks.deviceUserId, badges));
    const owner = new Map(links.map((l) => [l.deviceUserId, l.userId!]));
    const owners = [...new Set(owner.values())];
    const workDate = await this.days.workDateResolver(owners, parsed[0].at, parsed[parsed.length - 1].at);
    const tz = await this.days.companyTz();

    let added = 0;
    let duplicates = 0;
    const touched = new Set<string>();
    const unknown = new Map<string, { firstAt: Date; count: number; verify: string | null }>();
    // insert in chunks; the unique (device, badge, time) index skips anything already received
    for (let i = 0; i < parsed.length; i += 500) {
      const chunk = parsed.slice(i, i + 500).map((p) => {
        const userId = owner.get(p.deviceUserId) ?? null;
        return {
          userId,
          workDate: userId ? workDate(userId, p.at) : null,
          source: 'DEVICE' as const,
          punchedAt: p.at,
          deviceId: device.id,
          deviceUserId: p.deviceUserId,
          verify: p.verify,
          via,
          importBatchId: opts.importBatchId ?? null,
        };
      });
      const inserted = await this.db
        .insert(punches)
        .values(chunk)
        .onConflictDoNothing()
        .returning({ userId: punches.userId, workDate: punches.workDate, deviceUserId: punches.deviceUserId, at: punches.punchedAt, verify: punches.verify });
      added += inserted.length;
      duplicates += chunk.length - inserted.length;
      for (const r of inserted) {
        if (r.userId && r.workDate) touched.add(`${r.userId}|${r.workDate}`);
        if (!r.userId) {
          const key = `${r.deviceUserId}|${localDate(r.at, tz)}`;
          const u = unknown.get(key);
          if (u) u.count++;
          else unknown.set(key, { firstAt: r.at, count: 1, verify: r.verify });
        }
      }
    }

    for (const [key, u] of unknown) {
      const [badge, date] = key.split('|');
      const exKey = `UNLINKED_BADGE:${badge}:${date}`;
      const [existing] = await this.db.select().from(attendanceExceptions).where(eq(attendanceExceptions.key, exKey));
      const data = { deviceId: device.id, deviceName: device.name, verify: u.verify };
      if (!existing) {
        await this.db
          .insert(attendanceExceptions)
          .values({ key: exKey, type: 'UNLINKED_BADGE', deviceUserId: badge, workDate: date, data: { ...data, firstAt: u.firstAt.toISOString(), count: u.count } })
          .onConflictDoNothing();
      } else if (existing.status === 'OPEN') {
        const prev = existing.data as { firstAt?: string; count?: number };
        const firstAt = prev.firstAt && Date.parse(prev.firstAt) < u.firstAt.getTime() ? prev.firstAt : u.firstAt.toISOString();
        await this.db
          .update(attendanceExceptions)
          .set({ data: { ...prev, ...data, firstAt, count: (prev.count ?? 0) + u.count } })
          .where(eq(attendanceExceptions.id, existing.id));
      }
    }

    const lastAt = parsed[parsed.length - 1].at;
    await this.db
      .update(devices)
      .set({ lastSeenAt: now, ...(added && (!device.lastPunchAt || lastAt > device.lastPunchAt) ? { lastPunchAt: lastAt } : {}) })
      .where(and(eq(devices.id, device.id)));
    await this.days.recomputeMany(touched, now);
    for (const userId of new Set([...touched].map((k) => k.split('|')[0]))) {
      this.domain.emit('punch', { userId, kind: null, punchedAt: lastAt });
    }
    return { added, duplicates, unknownUserIds: [...new Set([...unknown.keys()].map((k) => k.split('|')[0]))], errors };
  }

  async touch(deviceId: string, extra: Partial<typeof devices.$inferInsert> = {}) {
    await this.db.update(devices).set({ lastSeenAt: new Date(), ...extra }).where(eq(devices.id, deviceId));
  }
}
