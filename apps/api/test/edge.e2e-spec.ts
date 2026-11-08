import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import { SEED_PASSWORD, setup, TestCtx, http } from './helpers';

const SECRET = 'edge-secret-edge-secret-edge-secret-0123';

describe('Vercel edge guard (ORIGIN_SECRET)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    process.env.ORIGIN_SECRET = SECRET; // read lazily by createApp()
    ctx = await setup();
  });
  afterAll(async () => {
    delete process.env.ORIGIN_SECRET;
    await ctx.close();
  });

  it('refuses requests that did not come through the proxy', async () => {
    const res = await http(ctx).get('/api/config');
    expect(res.status).toBe(403);
  });

  it('refuses a wrong secret', async () => {
    const res = await http(ctx).get('/api/config').set('x-origin-secret', SECRET.replace('0', '1'));
    expect(res.status).toBe(403);
  });

  it('lets the health check through without the secret', async () => {
    const res = await http(ctx).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('lets device traffic reach its own checks without the secret', async () => {
    expect((await http(ctx).get('/iclock/cdata?SN=NOT-REGISTERED')).status).toBe(401);
    expect((await http(ctx).get('/api/ingest/status')).status).toBe(401);
  });

  it('still refuses look-alike paths', async () => {
    expect((await http(ctx).get('/api/healthz')).status).toBe(403);
    expect((await http(ctx).get('/api/ingestx/status')).status).toBe(403);
  });

  it('lets the live office connection (Socket.IO) in without the secret; it signs in with the access token instead', async () => {
    await ctx.app.listen(0, '127.0.0.1');
    const port = (ctx.app.getHttpServer().address() as AddressInfo).port;
    // sign in through the "proxy"
    const login = await http(ctx).post('/api/auth/login').set('x-origin-secret', SECRET).send({ email: 'employee@acme.test', password: SEED_PASSWORD });
    const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], auth: { token: login.body.accessToken }, reconnection: false, forceNew: true });
    const snap = await new Promise<{ rooms: unknown[] }>((resolve, reject) => {
      socket.once('floor:snapshot', resolve);
      socket.once('connect_error', reject);
    });
    expect(snap.rooms).toHaveLength(9);
    socket.disconnect();
    // and polling (the fallback transport) isn't served by the HTTP stack either
    expect((await http(ctx).get('/socket.io/?EIO=4&transport=polling')).status).not.toBe(403);
  });

  it('serves proxied requests and never lets them be cached', async () => {
    const res = await http(ctx).get('/api/config').set('x-origin-secret', SECRET);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('records the client IP Vercel forwarded, not the proxy hop', async () => {
    const res = await http(ctx)
      .post('/api/auth/login')
      .set('x-origin-secret', SECRET)
      .set('x-forwarded-for', '203.0.113.7, 100.64.0.2')
      .send({ email: 'employee@acme.test', password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    const [ev] = await ctx.sql<{ ip: string }>(
      `select e.ip from auth_events e join users u on u.id = e.user_id
        where u.email = $1 and e.type = 'LOGIN_SUCCESS' order by e.created_at desc limit 1`,
      ['employee@acme.test'],
    );
    expect(ev.ip).toBe('203.0.113.7');
  });
});
