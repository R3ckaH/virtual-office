import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission, Role } from '@vo/shared';
import type { Request } from 'express';
import type { Session, User } from '../db/schema';

export interface AuthContext {
  user: User;
  session: Session;
}

export type AuthedRequest = Request & { auth?: AuthContext };

export const IS_PUBLIC = 'isPublic';
/** Opt an endpoint out of authentication (login, forgot password, public config...). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS_KEY = 'permissions';
/** Require every listed permission (see ROLE_PERMISSIONS in @vo/shared). */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const ROLES_KEY = 'roles';
/** Require one of the listed roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.auth!;
});

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.auth!.user;
});
