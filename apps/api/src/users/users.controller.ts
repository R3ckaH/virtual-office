import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  type CreateUserInput,
  type ListUsersQuery,
  type UpdateUserInput,
} from '@vo/shared';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import type { User } from '../db/schema';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  list(@Query(new ZodPipe(listUsersQuerySchema)) q: ListUsersQuery, @CurrentUser() actor: User) {
    return this.users.list(q, actor);
  }

  @Get('manager-options')
  @RequirePermissions('users.manage')
  managerOptions() {
    return this.users.managerOptions();
  }

  @Get(':id')
  @RequirePermissions('users.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.users.get(id, actor);
  }

  @Post()
  @RequirePermissions('users.manage')
  create(@Body(new ZodPipe(createUserSchema)) body: CreateUserInput, @CurrentUser() actor: User, @Req() req: Request) {
    return this.users.create(body, actor, req.ip ?? null);
  }

  @Patch(':id')
  @RequirePermissions('users.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateUserSchema)) body: UpdateUserInput,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    return this.users.update(id, body, actor, req.ip ?? null);
  }

  @Post(':id/deactivate')
  @RequirePermissions('users.manage')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User, @Req() req: Request) {
    return this.users.deactivate(id, actor, req.ip ?? null);
  }

  /** Reactivates a deactivated account, or clears a lockout on an active one. */
  @Post(':id/activate')
  @RequirePermissions('users.manage')
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User, @Req() req: Request) {
    return this.users.activate(id, actor, req.ip ?? null);
  }

  @Post(':id/force-logout')
  @RequirePermissions('users.manage')
  forceLogout(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User, @Req() req: Request) {
    return this.users.forceLogout(id, actor, req.ip ?? null);
  }

  @Post(':id/reset-mfa')
  @RequirePermissions('users.manage')
  resetMfa(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User, @Req() req: Request) {
    return this.users.resetMfa(id, actor, req.ip ?? null);
  }

  @Post(':id/send-password-link')
  @RequirePermissions('users.manage')
  sendLink(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User, @Req() req: Request) {
    return this.users.sendPasswordLink(id, actor, req.ip ?? null);
  }

  @Get(':id/sessions')
  @RequirePermissions('users.manage')
  sessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.sessionsFor(id);
  }
}
