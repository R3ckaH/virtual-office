import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { env } from './config/env';

async function bootstrap() {
  const app = await createApp();
  await app.listen(env().PORT);
  Logger.log(`API listening on http://localhost:${env().PORT}/api`, 'Bootstrap');
}
bootstrap();
