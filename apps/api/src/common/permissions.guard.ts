import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, Permission, Role } from '@vo/shared';
import { AuthedRequest, IS_PUBLIC, PERMISSIONS_KEY, ROLES_KEY } from './auth-context';

/** Global RBAC guard. Runs after AuthGuard; role always comes from the DB, never from the token. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().auth?.user;
    if (!user) throw new ForbiddenException('Not allowed');

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('You do not have access to this');

    const perms = this.reflector.getAllAndMerge<Permission[]>(PERMISSIONS_KEY, targets) ?? [];
    if (perms.some((p) => !hasPermission(user.role, p))) throw new ForbiddenException('You do not have access to this');
    return true;
  }
}
