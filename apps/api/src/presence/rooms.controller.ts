import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import { updateRoomSchema, type UpdateRoomInput } from '@vo/shared';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import type { User } from '../db/schema';
import { PresenceService } from './presence.service';
import { RoomsService } from './rooms.service';

@Controller()
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly presence: PresenceService,
  ) {}

  /** The floor as it is right now (the live connection sends the same thing on connect). */
  @Get('floor')
  floor(@CurrentUser() me: User) {
    return this.presence.snapshot(me.id);
  }

  @Get('rooms')
  list() {
    return this.rooms.list();
  }

  @Patch('rooms/:id')
  @RequirePermissions('rooms.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateRoomSchema)) body: UpdateRoomInput,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    return this.rooms.update(id, body, actor, req.ip ?? null);
  }
}
