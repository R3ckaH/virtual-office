import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { env } from './config/env';

/** Builds the configured app. Shared by main.ts and the e2e tests. */
export async function createApp(): Promise<INestApplication> {
  const e = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: e.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });
  if (e.TRUST_PROXY) app.set('trust proxy', 1); // correct client IPs behind Azure's front end
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });
  // ADMS devices post plain-text attendance logs to /iclock/* (often with no or odd content types)
  app.useBodyParser('text', { type: (req: { url?: string }) => (req.url ?? '').startsWith('/iclock/'), limit: '2mb' });
  app.enableCors({ origin: [e.WEB_ORIGIN], credentials: true });
  app.setGlobalPrefix('api', { exclude: ['iclock/cdata', 'iclock/getrequest', 'iclock/devicecmd'] });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
