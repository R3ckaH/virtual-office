import { Controller, Get, Query } from '@nestjs/common';
import {
  listAuditLogsQuerySchema,
  listAuthEventsQuerySchema,
  type ListAuditLogsQuery,
  type ListAuthEventsQuery,
} from '@vo/shared';
import { AuthEventsService } from '../auth/auth-events.service';
import { RequirePermissions } from '../common/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import { AuditService } from './audit.service';

@Controller()
export class AdminLogsController {
  constructor(
    private readonly events: AuthEventsService,
    private readonly audit: AuditService,
  ) {}

  /** Login / logout history */
  @Get('auth-events')
  @RequirePermissions('authEvents.read')
  authEvents(@Query(new ZodPipe(listAuthEventsQuerySchema)) q: ListAuthEventsQuery) {
    return this.events.list(q);
  }

  @Get('audit-logs')
  @RequirePermissions('auditLogs.read')
  auditLogs(@Query(new ZodPipe(listAuditLogsQuerySchema)) q: ListAuditLogsQuery) {
    return this.audit.list(q);
  }
}
