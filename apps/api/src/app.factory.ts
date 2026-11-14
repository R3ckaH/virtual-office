import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { edgeGuard, noStore } from './common/edge-guard';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { env } from './config/env';
import { VoIoAdapter } from './presence/socket.adapter';

/** Builds the configured app. Shared by main.ts and the e2e tests. */
export async function createApp(): Promise<INestApplication> {
  const e = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: e.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });
  // Behind one reverse proxy (Railway's edge), take the client IP it adds. Requests that come
  // through Vercel get their IP from edgeGuard instead, once the secret checks out.
  if (e.TRUST_PROXY || e.ORIGIN_SECRET) app.set('trust proxy', 1);
  if (e.ORIGIN_SECRET) app.use(edgeGuard(e.ORIGIN_SECRET)); // only accept traffic from the Vercel proxy
  else if (e.NODE_ENV === 'production') console.warn('ORIGIN_SECRET is not set: the API accepts direct traffic.');
  app.use(noStore);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });
  // ADMS devices post plain-text attendance logs to /iclock/* (often with no or odd content types)
  app.useBodyParser('text', { type: (req: { url?: string }) => (req.url ?? '').startsWith('/iclock/'), limit: '2mb' });
  // LiveKit webhooks are verified against the exact body bytes, so keep them as text
  app.useBodyParser('text', { type: (req: { url?: string }) => (req.url ?? '').startsWith('/api/livekit/webhook'), limit: '1mb' });
  // chat files are uploaded as the raw file body (up to 10 MB)
  app.useBodyParser('raw', { type: (req: { url?: string; method?: string }) => req.method === 'POST' && (req.url ?? '').startsWith('/api/chat/files'), limit: '11mb' });
  // company logo upload (raw image, small)
  app.useBodyParser('raw', { type: (req: { url?: string; method?: string }) => req.method === 'PUT' && (req.url ?? '').startsWith('/api/admin/company/logo'), limit: '300kb' });
  app.enableCors({ origin: [e.WEB_ORIGIN], credentials: true });
  app.setGlobalPrefix('api', { exclude: ['iclock/cdata', 'iclock/getrequest', 'iclock/devicecmd'] });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useWebSocketAdapter(new VoIoAdapter(app));
  app.enableShutdownHooks();
  return app;
}
