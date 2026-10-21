import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateUserInput, ListUsersQuery, Paged, UpdateUserInput, UserDto } from '@vo/shared';
import { and, asc, count, eq, ilike, inArray, ne, or, SQL } from 'drizzle-orm';
import { AuditService, diff } from '../audit/audit.service';
import { AuthEventsService } from '../auth/auth-events.service';
import { AuthService, INVITE_TTL_MS } from '../auth/auth.service';
import { SessionsService } from '../auth/sessions.service';
import { env } from '../config/env';
import { DB, Db } from '../db/client';
import { departments, User, users } from '../db/schema';
import { actionEmail, MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { toUserDto, UserReader } from './user-reader';

const auditable = (u: User) => ({
  email: u.email,
  fullName: u.fullName,
  title: u.title,
  role: u.role,
  status: u.status,
  timezone: u.timezone,
  departmentId: u.departmentId,
  managerId: u.managerId,
});

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reader: UserReader,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly events: AuthEventsService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  /** Admins and HR see everyone; managers see their direct reports. */
  async list(q: ListUsersQuery, actor: User): Promise<Paged<UserDto>> {
    const where: SQL[] = [];
    if (actor.role === 'MANAGER') where.push(eq(users.managerId, actor.id));
    if (q.search) {
      const term = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(or(ilike(users.fullName, term), ilike(users.email, term))!);
    }
    if (q.role) where.push(eq(users.role, q.role));
    if (q.status) where.push(eq(users.status, q.status));
    if (q.departmentId) where.push(eq(users.departmentId, q.departmentId));
    const cond = where.length ? and(...where) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      this.reader
        .baseQuery()
        .where(cond)
        .orderBy(asc(users.fullName))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: count() }).from(users).where(cond),
    ]);
    return {
      items: rows.map((r) => toUserDto(r.user, r.departmentName, r.managerName)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async get(id: string, actor: User): Promise<UserDto> {
    const dto = await this.reader.byId(id);
    const allowed =
      dto &&
      (actor.role === 'ADMIN' || actor.role === 'HR' || actor.id === id || (actor.role === 'MANAGER' && dto.managerId === actor.id));
    if (!allowed) throw new NotFoundException('User not found'); // 404, not 403: don't confirm existence
    return dto;
  }

  private async loadOrThrow(id: string): Promise<User> {
    const u = await this.db.query.users.findFirst({ where: eq(users.id, id) });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  private async validateRefs(input: { departmentId?: string | null; managerId?: string | null }, userId?: string) {
    if (input.departmentId) {
      const d = await this.db.query.departments.findFirst({ where: eq(departments.id, input.departmentId) });
      if (!d) throw new BadRequestException({ message: 'Department not found', errors: { departmentId: ['Not found'] } });
    }
    if (input.managerId) {
      if (input.managerId === userId) {
        throw new BadRequestException({ message: 'A person cannot be their own manager', errors: { managerId: ['Pick someone else'] } });
      }
      const m = await this.db.query.users.findFirst({ where: eq(users.id, input.managerId) });
      if (!m || m.status !== 'ACTIVE' || (m.role !== 'ADMIN' && m.role !== 'MANAGER')) {
        throw new BadRequestException({
          message: 'Manager must be an active Manager or Admin',
          errors: { managerId: ['Must be an active Manager or Admin'] },
        });
      }
      if (userId) await this.assertNoCycle(userId, input.managerId);
    }
  }

  /** Stops A → B → A reporting loops. */
  private async assertNoCycle(userId: string, managerId: string) {
    let current: string | null = managerId;
    for (let depth = 0; current && depth < 50; depth++) {
      if (current === userId) {
        throw new BadRequestException({ message: 'That would create a reporting loop', errors: { managerId: ['Creates a loop'] } });
      }
      const next: { managerId: string | null } | undefined = await this.db.query.users.findFirst({
        where: eq(users.id, current),
        columns: { managerId: true },
      });
      current = next?.managerId ?? null;
    }
  }

  private async assertNotLastAdmin(u: User) {
    if (u.role !== 'ADMIN' || u.status !== 'ACTIVE') return;
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE'), ne(users.id, u.id)));
    if (n === 0) throw new ConflictException('You cannot remove the last active Admin');
  }

  async create(input: CreateUserInput, actor: User, ip: string | null): Promise<UserDto> {
    const exists = await this.db.query.users.findFirst({ where: eq(users.email, input.email), columns: { id: true } });
    if (exists) throw new ConflictException({ message: 'A user with this email already exists', errors: { email: ['Already in use'] } });
    await this.validateRefs(input);

    const [created] = await this.db
      .insert(users)
      .values({
        email: input.email,
        fullName: input.fullName,
        title: input.title ?? null,
        role: input.role,
        timezone: input.timezone,
        departmentId: input.departmentId ?? null,
        managerId: input.managerId ?? null,
      })
      .returning();
    await this.audit.record({
      actorId: actor.id,
      action: 'user.create',
      entityType: 'user',
      entityId: created.id,
      after: auditable(created),
      ip,
    });
    if (input.sendInvite) await this.sendAccountEmail(created);
    return (await this.reader.byId(created.id))!;
  }

  async update(id: string, input: UpdateUserInput, actor: User, ip: string | null): Promise<UserDto> {
    const before = await this.loadOrThrow(id);
    if (input.email && input.email !== before.email) {
      const taken = await this.db.query.users.findFirst({ where: eq(users.email, input.email), columns: { id: true } });
      if (taken) throw new ConflictException({ message: 'A user with this email already exists', errors: { email: ['Already in use'] } });
    }
    if (input.role && input.role !== 'ADMIN') await this.assertNotLastAdmin(before);
    if (id === actor.id && input.role && input.role !== actor.role) {
      throw new ForbiddenException('You cannot change your own role');
    }
    await this.validateRefs(input, id);

    const [after] = await this.db.update(users).set(input).where(eq(users.id, id)).returning();
    const d = diff(auditable(before), auditable(after));
    if (d.changed) {
      await this.audit.record({ actorId: actor.id, action: 'user.update', entityType: 'user', entityId: id, ...d, ip });
    }
    return (await this.reader.byId(id))!;
  }

  async deactivate(id: string, actor: User, ip: string | null): Promise<UserDto> {
    if (id === actor.id) throw new ForbiddenException('You cannot deactivate your own account');
    const u = await this.loadOrThrow(id);
    if (u.status === 'DEACTIVATED') return (await this.reader.byId(id))!;
    await this.assertNotLastAdmin(u);
    await this.db.update(users).set({ status: 'DEACTIVATED', deactivatedAt: new Date() }).where(eq(users.id, id));
    const revoked = await this.sessions.revokeAllForUser(id, 'deactivated', actor.id);
    await this.events.log({
      type: 'FORCED_LOGOUT',
      userId: id,
      detail: `account deactivated by ${actor.fullName}; ${revoked} session(s) ended`,
      client: { ip },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'user.deactivate',
      entityType: 'user',
      entityId: id,
      before: { status: 'ACTIVE' },
      after: { status: 'DEACTIVATED', sessionsEnded: revoked },
      ip,
    });
    return (await this.reader.byId(id))!;
  }

  async activate(id: string, actor: User, ip: string | null): Promise<UserDto> {
    const u = await this.loadOrThrow(id);
    await this.db
      .update(users)
      .set({ status: 'ACTIVE', deactivatedAt: null, failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, id));
    await this.audit.record({
      actorId: actor.id,
      action: u.status === 'ACTIVE' ? 'user.unlock' : 'user.activate',
      entityType: 'user',
      entityId: id,
      before: { status: u.status, lockedUntil: u.lockedUntil },
      after: { status: 'ACTIVE', lockedUntil: null },
      ip,
    });
    return (await this.reader.byId(id))!;
  }

  async forceLogout(id: string, actor: User, ip: string | null) {
    const u = await this.loadOrThrow(id);
    const revoked = await this.sessions.revokeAllForUser(u.id, 'forced', actor.id);
    await this.events.log({
      type: 'FORCED_LOGOUT',
      userId: u.id,
      detail: `by ${actor.fullName}; ${revoked} session(s) ended`,
      client: { ip },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'user.force_logout',
      entityType: 'user',
      entityId: u.id,
      after: { sessionsEnded: revoked },
      ip,
    });
    return { sessionsEnded: revoked };
  }

  async resetMfa(id: string, actor: User, ip: string | null) {
    const u = await this.loadOrThrow(id);
    if (!u.mfaEnabled) return { ok: true };
    await this.auth.clearMfa(u.id);
    await this.events.log({ type: 'MFA_DISABLED', userId: u.id, detail: `reset by ${actor.fullName}`, client: { ip } });
    await this.audit.record({ actorId: actor.id, action: 'user.reset_mfa', entityType: 'user', entityId: u.id, ip });
    return { ok: true };
  }

  /** Sends an invite (no password yet) or a password reset link. */
  async sendPasswordLink(id: string, actor: User, ip: string | null) {
    const u = await this.loadOrThrow(id);
    if (u.status !== 'ACTIVE') throw new ConflictException('Activate this account first');
    const kind = await this.sendAccountEmail(u);
    await this.audit.record({
      actorId: actor.id,
      action: kind === 'INVITE' ? 'user.send_invite' : 'user.send_password_reset',
      entityType: 'user',
      entityId: u.id,
      ip,
    });
    return { sent: kind };
  }

  private async sendAccountEmail(u: User): Promise<'INVITE' | 'PASSWORD_RESET'> {
    const { companyName } = await this.settings.get();
    const invite = !u.passwordHash;
    const token = invite
      ? await this.auth.issueToken(u.id, 'INVITE', INVITE_TTL_MS)
      : await this.auth.issueToken(u.id, 'PASSWORD_RESET', 60 * 60_000);
    const url = `${env().WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      to: u.email,
      subject: invite ? `You're invited to the ${companyName} Virtual Office` : `Reset your ${companyName} Virtual Office password`,
      ...actionEmail({
        companyName,
        greeting: `Hi ${u.fullName},`,
        body: invite
          ? `An account has been created for you. Set your password to get started. This link expires in 7 days.`
          : 'An administrator sent you a link to set a new password. It works once and expires in 1 hour.',
        actionLabel: invite ? 'Set up my account' : 'Reset password',
        actionUrl: url,
        footer: invite ? 'Questions? Reply to your administrator.' : "If you didn't expect this, contact your administrator.",
      }),
    });
    return invite ? 'INVITE' : 'PASSWORD_RESET';
  }

  async sessionsFor(id: string) {
    await this.loadOrThrow(id);
    return this.sessions.listActive(id);
  }

  /** Lightweight list for pickers (manager / department head). */
  async managerOptions() {
    return this.db
      .select({ id: users.id, fullName: users.fullName, role: users.role })
      .from(users)
      .where(and(eq(users.status, 'ACTIVE'), inArray(users.role, ['ADMIN', 'MANAGER'])))
      .orderBy(asc(users.fullName));
  }
}
