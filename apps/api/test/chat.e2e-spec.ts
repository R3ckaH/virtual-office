/**
 * Phase 5 end to end: channels (department, announcements, custom, DMs), messages, mentions,
 * unread counts, reactions, edit/delete, pins on the Home screen, files with signed links,
 * search, and live delivery over the office connection.
 */
import type { AddressInfo } from 'node:net';
import type { ChannelDto, FileDto, MessageDto, MessagesPageDto } from '@vo/shared';
import { ChatService } from '../src/chat/chat.service';
import { http, setup, signIn, Signed, TestCtx } from './helpers';
import { Client, connectSocket } from './socket';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a0e1f6d70000000049454e44ae426082', 'hex');

describe('Phase 5: chat and announcements', () => {
  let ctx: TestCtx;
  let url: string;
  let chat: ChatService;
  const clients: Client[] = [];
  const users = new Map<string, Signed>();
  const EMAILS = ['admin@acme.test', 'manager@acme.test', 'employee@acme.test', 'emily.carter@acme.test', 'carlo.mendoza@acme.test', 'hr@acme.test', 'andrew.tan@acme.test', 'nico.ramos@acme.test'];

  beforeAll(async () => {
    ctx = await setup();
    await ctx.app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
    chat = ctx.app.get(ChatService);
    for (const e of EMAILS) users.set(e, await signIn(ctx, e));
  });
  afterEach(() => {
    while (clients.length) clients.pop()!.close();
  });
  afterAll(() => ctx.close());

  const as = (email: string) => users.get(email)!;
  const id = (email: string) => ctx.ids.get(email)!;
  const api = (email: string) => ({
    get: (p: string) => http(ctx).get(`/api/chat${p}`).set(as(email).auth),
    post: (p: string, body?: object) => http(ctx).post(`/api/chat${p}`).set(as(email).auth).send(body ?? {}),
    put: (p: string, body: object) => http(ctx).put(`/api/chat${p}`).set(as(email).auth).send(body),
    patch: (p: string, body: object) => http(ctx).patch(`/api/chat${p}`).set(as(email).auth).send(body),
    del: (p: string) => http(ctx).delete(`/api/chat${p}`).set(as(email).auth),
  });
  const channels = async (email: string) => (await api(email).get('/channels')).body as ChannelDto[];
  const find = async (email: string, pred: (c: ChannelDto) => boolean) => (await channels(email)).find(pred)!;
  const send = (email: string, channelId: string, body: string, extra: object = {}) => api(email).post(`/channels/${channelId}/messages`, { body, ...extra });

  it('puts everyone in announcements and their department channel', async () => {
    const ana = await channels('employee@acme.test');
    expect(ana.map((c) => `${c.kind}:${c.name}`).sort()).toEqual(['ANNOUNCEMENTS:Announcements', 'DEPARTMENT:Engineering']);
    const ann = ana.find((c) => c.kind === 'ANNOUNCEMENTS')!;
    expect(ann.canPost).toBe(false);
    expect((await find('andrew.tan@acme.test', (c) => c.kind === 'ANNOUNCEMENTS')).canPost).toBe(true); // leader
    expect((await find('hr@acme.test', (c) => c.kind === 'ANNOUNCEMENTS')).canPost).toBe(true);
    expect((await find('manager@acme.test', (c) => c.kind === 'ANNOUNCEMENTS')).canPost).toBe(false);
    expect((await api('employee@acme.test').get('/me')).body).toEqual({ canCreateChannels: false, canAnnounce: false });
    expect((await api('andrew.tan@acme.test').get('/me')).body).toEqual({ canCreateChannels: true, canAnnounce: true });

    // Carlo (Sales) can't read Engineering
    const eng = ana.find((c) => c.kind === 'DEPARTMENT')!;
    expect((await api('carlo.mendoza@acme.test').get(`/channels/${eng.id}/messages`)).status).toBe(404);
    expect((await send('carlo.mendoza@acme.test', eng.id, 'hi')).status).toBe(403);
  });

  it('delivers messages live, counts unread and mentions, and clears them when read', async () => {
    const eng = await find('employee@acme.test', (c) => c.kind === 'DEPARTMENT');
    const emily = await connectSocket(url, as('emily.carter@acme.test').token, clients);
    const res = await send('employee@acme.test', eng.id, 'Morning @Emily Carter, can you check **the build**?', { mentionIds: [id('emily.carter@acme.test'), id('carlo.mendoza@acme.test')], clientId: 'c-1' });
    expect(res.status).toBe(201);
    const m = res.body as MessageDto;
    expect(m.mentionIds).toEqual([id('emily.carter@acme.test')]); // Carlo isn't in the channel
    expect(await emily.waitFor('chat:message', (x) => x.id === m.id)).toMatchObject({ authorName: 'Ana Cruz', channelId: eng.id });

    // a retried send with the same client id isn't posted twice
    const again = await send('employee@acme.test', eng.id, 'Morning @Emily Carter, can you check **the build**?', { clientId: 'c-1' });
    expect(again.body.id).toBe(m.id);

    const before = await find('emily.carter@acme.test', (c) => c.id === eng.id);
    expect(before).toMatchObject({ unread: 1, mentions: 1 });
    expect((await find('employee@acme.test', (c) => c.id === eng.id)).unread).toBe(0); // your own

    expect((await api('emily.carter@acme.test').post(`/channels/${eng.id}/read`, { seq: m.seq })).status).toBe(204);
    expect(await find('emily.carter@acme.test', (c) => c.id === eng.id)).toMatchObject({ unread: 0, mentions: 0 });

    expect((await send('employee@acme.test', eng.id, '   ')).status).toBe(400);
  });

  it('pages through history', async () => {
    const eng = await find('nico.ramos@acme.test', (c) => c.kind === 'DEPARTMENT');
    for (let i = 1; i <= 7; i++) await send('nico.ramos@acme.test', eng.id, `note ${i}`);
    const last = (await api('nico.ramos@acme.test').get(`/channels/${eng.id}/messages?limit=3`)).body as MessagesPageDto;
    expect(last.messages.map((x) => x.body)).toEqual(['note 5', 'note 6', 'note 7']);
    expect(last.hasBefore).toBe(true);
    const older = (await api('nico.ramos@acme.test').get(`/channels/${eng.id}/messages?limit=3&before=${last.messages[0].seq}`)).body as MessagesPageDto;
    expect(older.messages.map((x) => x.body)).toEqual(['note 2', 'note 3', 'note 4']);
    const around = (await api('nico.ramos@acme.test').get(`/channels/${eng.id}/messages?limit=4&around=${last.messages[0].seq}`)).body as MessagesPageDto;
    expect(around.messages.map((x) => x.body)).toEqual(['note 3', 'note 4', 'note 5', 'note 6']);
  });

  it('edits, reacts and deletes', async () => {
    const eng = await find('employee@acme.test', (c) => c.kind === 'DEPARTMENT');
    const m = (await send('employee@acme.test', eng.id, 'Deploy at 3')).body as MessageDto;
    expect((await api('emily.carter@acme.test').put(`/messages/${m.id}`, { body: 'hacked' })).status).toBe(403);
    const edited = await api('employee@acme.test').put(`/messages/${m.id}`, { body: 'Deploy at 4' });
    expect(edited.body).toMatchObject({ body: 'Deploy at 4' });
    expect(edited.body.editedAt).toBeTruthy();

    const r = await api('emily.carter@acme.test').post(`/messages/${m.id}/reactions`, { emoji: '👍' });
    expect(r.body.reactions).toEqual([{ emoji: '👍', count: 1, userIds: [id('emily.carter@acme.test')] }]);
    expect((await api('emily.carter@acme.test').post(`/messages/${m.id}/reactions`, { emoji: '🍕' })).status).toBe(400);
    const un = await api('emily.carter@acme.test').del(`/messages/${m.id}/reactions/${encodeURIComponent('👍')}`);
    expect(un.body.reactions).toEqual([]);

    expect((await api('emily.carter@acme.test').del(`/messages/${m.id}`)).status).toBe(403);
    expect((await api('employee@acme.test').del(`/messages/${m.id}`)).status).toBe(204);
    const page = (await api('emily.carter@acme.test').get(`/channels/${eng.id}/messages`)).body as MessagesPageDto;
    expect(page.messages.find((x) => x.id === m.id)).toMatchObject({ deleted: true, body: '' });
  });

  it('opens one conversation per set of people', async () => {
    const dm = await api('employee@acme.test').post('/dms', { userIds: [id('carlo.mendoza@acme.test')] });
    expect(dm.status).toBe(200);
    expect(dm.body).toMatchObject({ kind: 'DM', name: 'Carlo Mendoza', isPrivate: true });
    const same = await api('carlo.mendoza@acme.test').post('/dms', { userIds: [id('employee@acme.test')] });
    expect(same.body.id).toBe(dm.body.id);
    expect(same.body.name).toBe('Ana Cruz');
    await send('carlo.mendoza@acme.test', dm.body.id, 'Lunch?');
    // admins can't read other people's conversations
    expect((await api('admin@acme.test').get(`/channels/${dm.body.id}/messages`)).status).toBe(404);

    const group = await api('employee@acme.test').post('/dms', { userIds: [id('carlo.mendoza@acme.test'), id('emily.carter@acme.test')] });
    expect(group.body).toMatchObject({ kind: 'GROUP', name: 'Carlo, Emily' });
    expect((await api('emily.carter@acme.test').post(`/channels/${group.body.id}/leave`)).status).toBe(204);
    expect((await api('carlo.mendoza@acme.test').post(`/channels/${dm.body.id}/leave`)).status).toBe(400);
  });

  it('lets managers create channels; public ones can be joined, private ones need an invite', async () => {
    expect((await api('employee@acme.test').post('/channels', { name: 'Random' })).status).toBe(403);
    const pub = await api('manager@acme.test').post('/channels', { name: 'Prayer requests', description: 'Share and pray', memberIds: [id('employee@acme.test')] });
    expect(pub.status).toBe(201);
    expect(pub.body).toMatchObject({ kind: 'CUSTOM', canManage: true, memberCount: 2 });
    expect((await api('hr@acme.test').post('/channels', { name: 'prayer REQUESTS' })).status).toBe(409);

    const browse = (await api('carlo.mendoza@acme.test').get('/channels/browse')).body as ChannelDto[];
    expect(browse.find((c) => c.id === pub.body.id)).toMatchObject({ isMember: false });
    // can read a public channel before joining, not post
    expect((await api('carlo.mendoza@acme.test').get(`/channels/${pub.body.id}/messages`)).status).toBe(200);
    expect((await send('carlo.mendoza@acme.test', pub.body.id, 'hi')).status).toBe(403);
    expect((await api('carlo.mendoza@acme.test').post(`/channels/${pub.body.id}/join`)).body.isMember).toBe(true);

    const priv = (await api('hr@acme.test').post('/channels', { name: 'HR team', isPrivate: true })).body as ChannelDto;
    expect((await api('carlo.mendoza@acme.test').get('/channels/browse')).body.some((c: ChannelDto) => c.id === priv.id)).toBe(false);
    expect((await api('carlo.mendoza@acme.test').post(`/channels/${priv.id}/join`)).status).toBe(403);
    expect((await api('carlo.mendoza@acme.test').get(`/channels/${priv.id}/messages`)).status).toBe(404);

    // only the creator (or an admin) manages it
    expect((await api('employee@acme.test').patch(`/channels/${pub.body.id}`, { name: 'Prayer' })).status).toBe(403);
    expect((await api('manager@acme.test').patch(`/channels/${pub.body.id}`, { name: 'Prayer wall' })).body.name).toBe('Prayer wall');
    expect((await api('manager@acme.test').post(`/channels/${pub.body.id}/members`, { userIds: [id('nico.ramos@acme.test')] })).status).toBe(200);
    expect((await api('manager@acme.test').del(`/channels/${pub.body.id}/members/${id('carlo.mendoza@acme.test')}`)).status).toBe(204);
    expect((await api('admin@acme.test').post(`/channels/${pub.body.id}/archive`)).status).toBe(204);
    expect((await channels('employee@acme.test')).some((c) => c.id === pub.body.id)).toBe(false);
  });

  it('leaders post announcements and pin them to everyone’s home', async () => {
    const ann = await find('andrew.tan@acme.test', (c) => c.kind === 'ANNOUNCEMENTS');
    expect((await send('employee@acme.test', ann.id, 'hello all')).status).toBe(403);
    const m = (await send('andrew.tan@acme.test', ann.id, 'Town hall on Friday at 4 PM')).body as MessageDto;
    expect((await api('employee@acme.test').post(`/messages/${m.id}/pin`)).status).toBe(403);
    const pinned = await api('andrew.tan@acme.test').post(`/messages/${m.id}/pin`);
    expect(pinned.body.pinnedByName).toBe('Andrew Tan');
    const home = (await api('employee@acme.test').get('/announcements')).body;
    expect(home).toEqual([expect.objectContaining({ body: 'Town hall on Friday at 4 PM', channelName: 'Announcements' })]);
    // employees can still react
    expect((await api('employee@acme.test').post(`/messages/${m.id}/reactions`, { emoji: '🙏' })).status).toBe(200);
    await api('hr@acme.test').del(`/messages/${m.id}/pin`);
    expect((await api('employee@acme.test').get('/announcements')).body).toEqual([]);
  });

  it('shares files through signed links and rejects unsafe ones', async () => {
    const eng = await find('employee@acme.test', (c) => c.kind === 'DEPARTMENT');
    const up = await http(ctx).post('/api/chat/files?name=screen.png').set(as('employee@acme.test').auth).set('Content-Type', 'application/octet-stream').send(PNG);
    expect(up.status).toBe(201);
    const f = up.body as FileDto;
    expect(f).toMatchObject({ name: 'screen.png', contentType: 'image/png', isImage: true, size: PNG.length });

    const bad = await http(ctx).post('/api/chat/files?name=page.svg').set(as('employee@acme.test').auth).set('Content-Type', 'application/octet-stream').send(Buffer.from('<svg/>'));
    expect(bad.status).toBe(400);
    const fake = await http(ctx).post('/api/chat/files?name=photo.png').set(as('employee@acme.test').auth).set('Content-Type', 'application/octet-stream').send(Buffer.from('not an image'));
    expect(fake.body.code).toBe('FILE_MISMATCH');

    // someone else can't attach your upload; you can
    expect((await send('emily.carter@acme.test', eng.id, 'mine', { fileIds: [f.id] })).status).toBe(400);
    const m = (await send('employee@acme.test', eng.id, '', { fileIds: [f.id] })).body as MessageDto;
    expect(m.files).toHaveLength(1);

    const link = new URL(m.files[0].url, 'http://x');
    const dl = await http(ctx).get(`${link.pathname}${link.search}`).buffer(true);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('image/png');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(dl.body as Buffer, PNG)).toBe(0);
    expect((await http(ctx).get(`${link.pathname}?exp=${link.searchParams.get('exp')}&sig=forged`)).status).toBe(404);
    expect((await http(ctx).get(`${link.pathname}?exp=1&sig=${link.searchParams.get('sig')}`)).status).toBe(404);

    // uploads never sent are cleaned up after a day
    await http(ctx).post('/api/chat/files?name=notes.txt').set(as('employee@acme.test').auth).set('Content-Type', 'application/octet-stream').send(Buffer.from('draft'));
    expect(await chat.removeOrphanFiles(new Date(Date.now() + 25 * 3_600_000))).toBe(1);
  });

  it('searches only conversations you’re in', async () => {
    const eng = await find('employee@acme.test', (c) => c.kind === 'DEPARTMENT');
    await send('employee@acme.test', eng.id, 'The quarterly roadmap is ready');
    const hits = (await api('emily.carter@acme.test').get('/search?q=quarter road')).body;
    expect(hits[0]).toMatchObject({ channelName: 'Engineering', message: expect.objectContaining({ body: 'The quarterly roadmap is ready' }) });
    expect((await api('carlo.mendoza@acme.test').get('/search?q=roadmap')).body).toEqual([]);
    expect((await api('carlo.mendoza@acme.test').get('/search?q=a')).status).toBe(400);
  });

  it('moves people between department channels when their department changes', async () => {
    const sales = await find('carlo.mendoza@acme.test', (c) => c.kind === 'DEPARTMENT');
    const engDept = (await http(ctx).get('/api/departments').set(as('admin@acme.test').auth)).body.find((d: { name: string }) => d.name === 'Engineering');
    const carlo = await connectSocket(url, as('carlo.mendoza@acme.test').token, clients);
    expect((await http(ctx).patch(`/api/users/${id('carlo.mendoza@acme.test')}`).set(as('admin@acme.test').auth).send({ departmentId: engDept.id })).status).toBe(200);
    await carlo.waitFor('chat:channel', (e) => e.channelId === sales.id && !!e.removed);
    const now = await channels('carlo.mendoza@acme.test');
    expect(now.filter((c) => c.kind === 'DEPARTMENT').map((c) => c.name)).toEqual(['Engineering']);
  });

  it('relays typing to the other members', async () => {
    const eng = await find('employee@acme.test', (c) => c.kind === 'DEPARTMENT');
    const ana = await connectSocket(url, as('employee@acme.test').token, clients);
    const nico = await connectSocket(url, as('nico.ramos@acme.test').token, clients);
    expect(await ana.send('chat:typing', { channelId: eng.id })).toEqual({ ok: true });
    expect(await nico.waitFor('chat:typing', (t) => t.channelId === eng.id)).toMatchObject({ name: 'Ana Cruz' });
  });
});
