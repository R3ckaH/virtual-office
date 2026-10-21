import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { dateQuerySchema, deviceSchema, linkDeviceUserSchema, type DateQuery, type DeviceInput, type LinkDeviceUserInput } from '@vo/shared';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import type { User } from '../db/schema';
import { DevicesService } from './devices.service';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

@Controller('devices')
@RequirePermissions('devices.manage')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list() {
    return this.devices.list();
  }

  @Post()
  create(@Body(new ZodPipe(deviceSchema)) body: DeviceInput, @CurrentUser() actor: User, @Req() req: Request) {
    return this.devices.create(body, actor, req.ip ?? null);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(deviceSchema)) body: DeviceInput, @CurrentUser() actor: User, @Req() req: Request) {
    return this.devices.update(id, body, actor, req.ip ?? null);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User, @Req() req: Request) {
    await this.devices.remove(id, actor, req.ip ?? null);
    return { ok: true };
  }

  @Post(':id/token')
  token(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User, @Req() req: Request) {
    return this.devices.rotateToken(id, actor, req.ip ?? null);
  }

  @Post(':id/sync')
  sync(@Param('id', ParseUUIDPipe) id: string) {
    return this.devices.requestSync(id);
  }

  @Get(':id/punches')
  punches(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodPipe(dateQuerySchema)) q: DateQuery) {
    return this.devices.devicePunches(id, q.date);
  }

  @Post(':id/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  import(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    return this.devices.importFile(id, file, actor, req.ip ?? null);
  }
}

@Controller('device-users')
@RequirePermissions('devices.manage')
export class DeviceUsersController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list() {
    return this.devices.deviceUsers();
  }

  @Put(':deviceUserId')
  link(
    @Param('deviceUserId') deviceUserId: string,
    @Body(new ZodPipe(linkDeviceUserSchema)) body: LinkDeviceUserInput,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    return this.devices.linkDeviceUser(deviceUserId, body, actor, req.ip ?? null);
  }

  @Delete(':deviceUserId')
  async remove(@Param('deviceUserId') deviceUserId: string, @CurrentUser() actor: User, @Req() req: Request) {
    await this.devices.removeDeviceUser(deviceUserId, actor, req.ip ?? null);
    return { ok: true };
  }
}
