import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AttendanceModule } from './attendance/attendance.module';
import { AdminLogsController } from './audit/admin-logs.controller';
import { DevicesModule } from './devices/devices.module';
import { ChatModule } from './chat/chat.module';
import { WorkModule } from './work/work.module';
import { InsightsModule } from './insights/insights.module';
import { MeetingsModule } from './meetings/meetings.module';
import { PresenceModule } from './presence/presence.module';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { SsoController } from './auth/sso.controller';
import { PermissionsGuard } from './common/permissions.guard';
import { CoreModule } from './core.module';
import { DepartmentsController } from './departments/departments.controller';
import { DepartmentsService } from './departments/departments.service';
import { OrgController } from './settings/org.controller';
import { PublicController } from './settings/public.controller';
import { MeController } from './users/me.controller';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Module({
  imports: [
    CoreModule,
    AttendanceModule,
    DevicesModule,
    PresenceModule,
    MeetingsModule,
    ChatModule,
    WorkModule,
    InsightsModule,
    // Global default; auth endpoints use a stricter per-route limit. Swap to Redis storage when scaling out.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
  ],
  controllers: [
    PublicController,
    OrgController,
    AuthController,
    SsoController,
    MeController,
    UsersController,
    DepartmentsController,
    AdminLogsController,
  ],
  providers: [
    UsersService,
    DepartmentsService,
    // Order matters: rate limit → authenticate → authorize (RBAC).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
