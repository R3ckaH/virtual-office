import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { FloorSpot, RoomDto, UpdateRoomInput } from '@vo/shared';
import { FLOOR_SPOTS, spotCapacity } from '@vo/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DB, Db } from '../db/client';
import { departments, roomMembers, rooms, User, users } from '../db/schema';

/** Rooms on the office floor, cached in memory (there are only a handful). */
@Injectable()
export class RoomsService {
  private cache: RoomDto[] | null = null;
  private listeners: ((rooms: RoomDto[]) => void)[] = [];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  onChange(l: (rooms: RoomDto[]) => void) {
    this.listeners.push(l);
  }

  async list(): Promise<RoomDto[]> {
    if (this.cache) return this.cache;
    const rows = await this.db.select().from(rooms);
    const members = await this.db.select().from(roomMembers);
    const order = (s: FloorSpot) => FLOOR_SPOTS.indexOf(s);
    this.cache = rows
      .map((r) => ({
        id: r.id,
        spot: r.spot,
        name: r.name,
        kind: r.kind,
        departmentId: r.departmentId,
        ownerId: r.ownerId,
        memberIds: members.filter((m) => m.roomId === r.id).map((m) => m.userId),
        capacity: spotCapacity(r.spot),
      }))
      .sort((a, b) => order(a.spot) - order(b.spot));
    return this.cache;
  }

  async get(id: string): Promise<RoomDto | undefined> {
    return (await this.list()).find((r) => r.id === id);
  }

  invalidate() {
    this.cache = null;
  }

  async update(id: string, input: UpdateRoomInput, actor: User, ip: string | null): Promise<RoomDto> {
    const before = await this.get(id);
    if (!before) throw new NotFoundException('Room not found');

    const memberIds = [...new Set(input.memberIds)].filter((m) => m !== input.ownerId);
    const people = [input.ownerId, ...memberIds].filter((x): x is string => !!x);
    if (people.length) {
      const found = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, people), eq(users.status, 'ACTIVE')));
      if (found.length !== new Set(people).size) {
        throw new BadRequestException({ message: 'Pick active people only', errors: { memberIds: ['Someone on the list is not an active user'] } });
      }
    }
    if (input.departmentId) {
      const [d] = await this.db.select({ id: departments.id }).from(departments).where(eq(departments.id, input.departmentId));
      if (!d) throw new BadRequestException({ message: 'Department not found', errors: { departmentId: ['Not found'] } });
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(rooms)
        .set({ name: input.name, kind: input.kind, departmentId: input.departmentId, ownerId: input.ownerId })
        .where(eq(rooms.id, id));
      await tx.delete(roomMembers).where(eq(roomMembers.roomId, id));
      if (memberIds.length) await tx.insert(roomMembers).values(memberIds.map((userId) => ({ roomId: id, userId })));
    });
    this.invalidate();
    const after = (await this.get(id))!;
    await this.audit.record({
      actorId: actor.id,
      action: 'room.update',
      entityType: 'room',
      entityId: id,
      before: { name: before.name, kind: before.kind, departmentId: before.departmentId, ownerId: before.ownerId, memberIds: before.memberIds },
      after: { name: after.name, kind: after.kind, departmentId: after.departmentId, ownerId: after.ownerId, memberIds: after.memberIds },
      ip,
    });
    const all = await this.list();
    for (const l of this.listeners) l(all);
    return after;
  }
}
