import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from './audit/audit.service';
import { AuthEventsService } from './auth/auth-events.service';
import { AuthService } from './auth/auth.service';
import { SessionsService } from './auth/sessions.service';
import { SsoService } from './auth/sso.service';
import { TokensService } from './auth/tokens.service';
import { env } from './config/env';
import { DbModule } from './db/db.module';
import { MailService } from './mail/mail.service';
import { SettingsService } from './settings/settings.service';
import { UserReader } from './users/user-reader';

/** Shared services every feature module can inject. */
@Global()
@Module({
  imports: [
    DbModule,
    JwtModule.registerAsync({
      useFactory: () => ({ secret: env().JWT_SECRET, signOptions: { algorithm: 'HS256', issuer: 'virtual-office' }, verifyOptions: { algorithms: ['HS256'], issuer: 'virtual-office' } }),
    }),
  ],
  providers: [
    AuditService,
    AuthEventsService,
    AuthService,
    SessionsService,
    SsoService,
    TokensService,
    MailService,
    SettingsService,
    UserReader,
  ],
  exports: [
    JwtModule,
    AuditService,
    AuthEventsService,
    AuthService,
    SessionsService,
    SsoService,
    TokensService,
    MailService,
    SettingsService,
    UserReader,
  ],
})
export class CoreModule {}
