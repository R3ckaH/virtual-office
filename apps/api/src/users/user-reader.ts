import { Inject, Injectable } from '@nestjs/common';
import { MeDto, ROLE_PERMISSIONS, UserDto } from '@vo/shared';
import { eq, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, Db } from '../db/client';
import { departments, User, users } from '../db/schema';

const manager = alias(users, 'manager');

export function toUserDto(u: User, departmentName: string | null, managerName: string | null): UserDto {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    title: u.title,
    avatarUrl: u.avatarUrl,
    role: u.role,
    status: u.status,
    timezone: u.timezone,
    departmentId: u.departmentId,
    departmentName,
    managerId: u.managerId,
    managerName,
    mfaEnabled: u.mfaEnabled,
    locked: !!u.lockedUntil && u.lockedUntil.getTime() > Date.now(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Reads users together with their department and manager names. */
@Injectable()
export class UserReader {
  constructor(@Inject(DB) private readonly db: Db) {}

  baseQuery() {
    return this.db
      .select({ user: users, departmentName: departments.name, managerName: manager.fullName })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .leftJoin(manager, eq(manager.id, users.managerId));
  }

  async findOne(where: SQL): Promise<UserDto | null> {
    const [row] = await this.baseQuery().where(where).limit(1);
    return row ? toUserDto(row.user, row.departmentName, row.managerName) : null;
  }

  async byId(id: string) {
    return this.findOne(eq(users.id, id));
  }

  async me(id: string): Promise<MeDto | null> {
    const dto = await this.byId(id);
    return dto ? { ...dto, permissions: [...ROLE_PERMISSIONS[dto.role]] } : null;
  }
}
