import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Req } from '@nestjs/common';
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from '@vo/shared';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { AuthContext, CurrentAuth } from '../common/auth-context';
import { DomainEvents } from '../common/domain-events';
import { clientInfo } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { DB, Db } from '../db/client';
import { users } from '../db/schema';
import { UserReader } from './user-reader';

/** The signed-in user's own profile. Available to every role. */
@Controller('me')
export class MeController {
  constructor(
    private readonly reader: UserReader,
    private readonly auth: AuthService,
    @Inject(DB) private readonly db: Db,
    private readonly domain: DomainEvents,
  ) {}

  @Get()
  me(@CurrentAuth() a: AuthContext) {
    return this.reader.me(a.user.id);
  }

  @Patch()
  async update(@CurrentAuth() a: AuthContext, @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput) {
    if (Object.keys(body).length) {
      await this.db.update(users).set(body).where(eq(users.id, a.user.id));
      this.domain.emit('userChanged', { userId: a.user.id });
    }
    return this.reader.me(a.user.id);
  }

  @Post('password')
  @HttpCode(200)
  changePassword(
    @CurrentAuth() a: AuthContext,
    @Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(a.user, a.session, body, clientInfo(req));
  }
}
