import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { env } from '../config/env';

/** Socket.IO settings: the web app's origin may connect (browsers reach the API host directly). */
export class VoIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      path: '/socket.io',
      cors: { origin: env().WEB_ORIGIN, credentials: false },
      transports: ['websocket', 'polling'],
      maxHttpBufferSize: 100_000,
      pingInterval: 25_000,
      pingTimeout: 20_000,
    });
  }
}
