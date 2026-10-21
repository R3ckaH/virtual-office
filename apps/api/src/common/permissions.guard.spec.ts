import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, passwordSchema, ROLE_PERMISSIONS } from '@vo/shared';
import { IS_PUBLIC, PERMISSIONS_KEY, ROLES_KEY } from './auth-context';
import { PermissionsGuard } from './permissions.guard';

function ctxFor(role: string | null, meta: Record<string, unknown>): { guard: PermissionsGuard; ctx: ExecutionContext } {
  const reflector = {
    getAllAndOverride: (key: string) => meta[key],
    getAllAndMerge: (key: string) => meta[key],
  } as unknown as Reflector;
  const req = { auth: role ? { user: { role } } : undefined };
  const ctx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { guard: new PermissionsGuard(reflector), ctx };
}

describe('PermissionsGuard', () => {
  it('lets public routes through', () => {
    const { guard, ctx } = ctxFor(null, { [IS_PUBLIC]: true });
    expect(guard.canActivate(ctx)).toBe(true);
  });
  it('allows admins on admin permissions', () => {
    const { guard, ctx } = ctxFor('ADMIN', { [PERMISSIONS_KEY]: ['users.manage'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });
  it.each(['MANAGER', 'EMPLOYEE'])('blocks %s from users.manage', (role) => {
    const { guard, ctx } = ctxFor(role, { [PERMISSIONS_KEY]: ['users.manage'] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
  it('checks role lists', () => {
    const ok = ctxFor('MANAGER', { [ROLES_KEY]: ['ADMIN', 'MANAGER'] });
    expect(ok.guard.canActivate(ok.ctx)).toBe(true);
    const no = ctxFor('EMPLOYEE', { [ROLES_KEY]: ['ADMIN', 'MANAGER'] });
    expect(() => no.guard.canActivate(no.ctx)).toThrow(ForbiddenException);
  });
});

describe('shared RBAC + password rules', () => {
  it('employees have no elevated permissions; admins have all', () => {
    expect(ROLE_PERMISSIONS.EMPLOYEE).toEqual([]);
    expect(hasPermission('ADMIN', 'auditLogs.read')).toBe(true);
    expect(hasPermission('MANAGER', 'users.read')).toBe(true);
    expect(hasPermission('MANAGER', 'users.manage')).toBe(false);
  });
  it('enforces 12+ chars with a letter and a number', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('onlyletterslong').success).toBe(false);
    expect(passwordSchema.safeParse('123456789012').success).toBe(false);
    expect(passwordSchema.safeParse('GoodPassword2026').success).toBe(true);
  });
});
