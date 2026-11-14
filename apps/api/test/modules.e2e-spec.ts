import { http, setup, signIn, TestCtx } from './helpers';

describe('optional modules (MODULES)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    process.env.MODULES = 'none'; // read lazily by createApp()
    ctx = await setup();
  });
  afterAll(async () => {
    delete process.env.MODULES;
    await ctx.close();
  });

  it('tells the web app which modules are on', async () => {
    const res = await http(ctx).get('/api/config').expect(200);
    expect(res.body.modules).toEqual([]);
  });

  it('answers 404 for a module that is off, for admins and for devices', async () => {
    const admin = await signIn(ctx, 'admin@acme.test');
    await admin.agent.get('/api/devices').set(admin.auth).expect(404);
    await admin.agent.get('/api/device-users').set(admin.auth).expect(404);
    await http(ctx).get('/iclock/cdata?SN=ABC123').expect(404);
    await http(ctx).post('/api/ingest/punches').send({}).expect(404);
  });

  it('leaves the rest of the office working', async () => {
    const admin = await signIn(ctx, 'admin@acme.test');
    await admin.agent.get('/api/users').set(admin.auth).expect(200);
  });
});
