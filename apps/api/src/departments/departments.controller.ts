import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { departmentSchema, type DepartmentInput } from '@vo/shared';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import type { User } from '../db/schema';
import { DepartmentsService } from './departments.service';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  /** Any signed-in user can read the department list (used across the app). */
  @Get()
  list() {
    return this.departments.list();
  }

  @Post()
  @RequirePermissions('departments.manage')
  create(@Body(new ZodPipe(departmentSchema)) body: DepartmentInput, @CurrentUser() actor: User, @Req() req: Request) {
    return this.departments.create(body, actor, req.ip ?? null);
  }

  @Patch(':id')
  @RequirePermissions('departments.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(departmentSchema)) body: DepartmentInput,
    @CurrentUser() actor: User,
    @Req() req: Request,
  ) {
    return this.departments.update(id, body, actor, req.ip ?? null);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('departments.manage')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User, @Req() req: Request) {
    return this.departments.remove(id, actor, req.ip ?? null);
  }
}
