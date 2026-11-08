/**
 * Phase 3 end to end: the live connection (Socket.IO) and the rooms API.
 * Real sockets against a listening app: auth, rooms and access rules, knocks, summons,
 * statuses (manual, idle, room, timesheet break), force-logout and room admin.
 */
import type { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import type { Ack, FloorSnapshotDto, KnockDto, PresencePersonDto, RoomDto, ServerEvents, SummonDto } from '@vo/shared';
import { http, setup, signIn, Signed, TestCtx } from './helpers';

type Events = { [K in keyof ServerEvents]: ServerEvents[K] };

interface Client {
  socket: Socket;
  me: string;
  snapshot: FloorSnapshotDto;
  received: { event: keyof Events; data: unknown }[];
  waitFor<E extends keyof Events>(event: E, match?: (d: Events[E]) => boolean, ms?: number): Promise<Events[E]>;
  send<T = unknown>(event: string, payload: unknown): Promise<Ack<T>>;
  close(): void;
}

describe('Phase 3: presence and the office floor', () => {
  let ctx: TestCtx;
  let url: string;
  const clients: Client[] = [];
  const signed = new Map<string, Signed>();

  beforeAll(async () => {
    ctx = await setup();
    await ctx.app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterEach(() => {
    while (clients.length) clients.pop()!.close();
  });
  afterAll(() => ctx.close());

  async function login(email: string) {
    const s = await signIn(ctx, email);
    signed.set(email, s);
    return s;
  }

  function connect(token: string): Promise<Client> {
    return new Promise((resolve, reject) => {
      const socket = io(url, { transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true });
      const received: Client['received'] = [];
      const waiters: { event: string; match: (d: unknown) => boolean; resolve: (d: unknown) => void }[] = [];
      socket.onAny((event: keyof Events, data: unknown) => {
        received.push({ event, data });
        for (const w of [...waiters]) {
          if (w.event === event && w.match(data)) {
            waiters.splice(waiters.indexOf(w), 1);
            w.resolve(data);
          }
        }
      });
      const client: Client = {
        socket,
        me: '',
        snapshot: undefined as unknown as FloorSnapshotDto,
        received,
        waitFor: (event, match = () => true, ms = 3000) =>
          new Promise((res, rej) => {
            const hit = received.find((r) => r.event === event && match(r.data as never));
            if (hit) return res(hit.data as never);
            const t = setTimeout(() => rej(new Error(`timed out waiting for ${event}`)), ms);
            waiters.push({ event, match: match as (d: unknown) => boolean, resolve: (d) => (clearTimeout(t), res(d as never)) });
          }),
        send: (event, payload) => new Promise((res) => socket.emit(event, payload, res)),
        close: () => socket.disconnect(),
      };
      socket.once('floor:snapshot', (snap: FloorSnapshotDto) => {
        client.snapshot = snap;
        client.me = snap.me;
        clients.push(client);
        resolve(client);
      });
      socket.once('connect_error', (e: Error & { data?: { code?: string } }) => reject(Object.assign(e, { code: e.data?.code })));
    });
  }

  const enter = async (email: string) => connect((await login(email)).token);
  const room = (c: Client, spot: RoomDto['spot']) => c.snapshot.rooms.find((r) => r.spot === spot)!;
  const person = (snap: FloorSnapshotDto, id: string) => snap.people.find((p) => p.userId === id)!;
  const update = (c: Client, userId: string, match: (p: PresencePersonDto) => boolean) =>
    c.waitFor('presence:update', (p) => p.userId === userId && match(p));
  const floor = async (s: Signed) => (await http(ctx).get('/api/floor').set(s.auth)).body as FloorSnapshotDto;

  describe('connecting', () => {
    it('refuses a connection without a valid access token', async () => {
      await expect(connect('')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      await expect(connect('not-a-token')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    });

    it('puts people in their home room and tells everyone they arrived', async () => {
      const ana = await enter('employee@acme.test'); // Engineering
      expect(ana.snapshot.rooms).toHaveLength(9);
      const me = person(ana.snapshot, ana.me);
      expect(me.roomId).toBe(room(ana, 'eng').id);
      expect(me.status).toBe('AVAILABLE');

      const joel = await enter('pastor@acme.test'); // owns the Senior Pastor's office
      expect(person(joel.snapshot, joel.me).roomId).toBe(room(joel, 'pastor').id);
      await update(ana, joel.me, (p) => p.status === 'AVAILABLE' && p.roomId === room(ana, 'pastor').id);

      const maria = await enter('admin@acme.test'); // Operations
      expect(person(maria.snapshot, maria.me).roomId).toBe(room(maria, 'ops').id);

      // someone with no department room starts in the open area
      const grace = await enter('hr@acme.test'); // Human Resources: no room of its own
      expect(person(grace.snapshot, grace.me).roomId).toBe(room(grace, 'lobby').id);
    });

    it('shows people as offline once their last tab closes', async () => {
      const ana = await enter('employee@acme.test');
      const nico = await enter('nico.ramos@acme.test');
      nico.close();
      const off = await update(ana, nico.me, (p) => p.status === 'OFFLINE');
      expect(off.roomId).toBeNull();
      expect(off.lastSeenAt).toBeTruthy();
    });
  });

  describe('walking around', () => {
    it('anyone can walk into open, department, meeting and break rooms; the room sets the status', async () => {
      const ana = await enter('employee@acme.test');
      const tess = await enter('tess.bautista@acme.test');

      expect(await ana.send('room:enter', { roomId: room(ana, 'sales').id })).toEqual({ ok: true });
      await update(tess, ana.me, (p) => p.roomId === room(ana, 'sales').id && p.status === 'AVAILABLE');

      await ana.send('room:enter', { roomId: room(ana, 'huddle').id });
      await update(tess, ana.me, (p) => p.roomId === room(ana, 'huddle').id && p.status === 'IN_MEETING');

      await ana.send('room:enter', { roomId: room(ana, 'break').id });
      await update(tess, ana.me, (p) => p.status === 'ON_BREAK');

      const saved = await ctx.sql<{ room_id: string }>('select room_id from presence where user_id = $1', [ana.me]);
      expect(saved[0].room_id).toBe(room(ana, 'break').id);
    });

    it('rejects bad input and unknown rooms with a readable answer', async () => {
      const ana = await enter('employee@acme.test');
      expect(await ana.send('room:enter', { roomId: 'nope' })).toMatchObject({ ok: false, code: 'INVALID' });
      expect(await ana.send('room:enter', { roomId: '00000000-0000-4000-8000-000000000000' })).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
    });

    it('a room holds as many people as it has seats', async () => {
      const focus = (c: Client) => room(c, 'focus'); // 2 seats, no owner: usable by anyone while empty
      const a = await enter('employee@acme.test');
      expect(await a.send('room:enter', { roomId: focus(a).id })).toEqual({ ok: true });
      // now someone is inside, so the next person knocks
      const b = await enter('nico.ramos@acme.test');
      expect(await b.send('room:enter', { roomId: focus(b).id })).toMatchObject({ ok: false, code: 'KNOCK_REQUIRED' });
    });
  });

  describe('private rooms and knocking', () => {
    it('a private office needs a knock, and someone inside lets you in', async () => {
      const ana = await enter('employee@acme.test');
      const office = room(ana, 'pastor');

      expect(await ana.send('room:enter', { roomId: office.id })).toMatchObject({ ok: false, code: 'KNOCK_REQUIRED' });
      expect(await ana.send('knock:send', { roomId: office.id })).toMatchObject({ ok: false, code: 'NO_ONE_IN' });

      const joel = await enter('pastor@acme.test');
      const sent = (await ana.send<KnockDto>('knock:send', { roomId: office.id })) as { ok: true; data: KnockDto };
      expect(sent.ok).toBe(true);
      const knock = await joel.waitFor('knock:incoming');
      expect(knock).toMatchObject({ roomId: office.id, fromId: ana.me, fromName: 'Ana Cruz' });

      // only someone inside can answer
      const maria = await enter('admin@acme.test');
      expect(await maria.send('knock:answer', { id: knock.id, accept: true })).toMatchObject({ ok: false, code: 'NOT_INSIDE' });

      expect(await joel.send('knock:answer', { id: knock.id, accept: true })).toEqual({ ok: true });
      expect(await ana.waitFor('knock:answered')).toMatchObject({ accepted: true, byName: 'Ptr. Joel Santiago' });
      await update(maria, ana.me, (p) => p.roomId === office.id);
      // a second answer finds the knock gone
      expect(await joel.send('knock:answer', { id: knock.id, accept: false })).toMatchObject({ ok: false, code: 'KNOCK_GONE' });
    });

    it('a declined knock leaves you outside', async () => {
      const joel = await enter('pastor@acme.test');
      const ana = await enter('employee@acme.test');
      await ana.send('knock:send', { roomId: room(ana, 'pastor').id });
      const knock = await joel.waitFor('knock:incoming');
      await joel.send('knock:answer', { id: knock.id, accept: false });
      expect(await ana.waitFor('knock:answered')).toMatchObject({ accepted: false });
      expect(person(await floor(signed.get('employee@acme.test')!), ana.me).roomId).toBe(room(ana, 'eng').id);
    });

    it('the leaders’ room lets its owner and members walk in; others knock', async () => {
      const andrew = await enter('andrew.tan@acme.test'); // CEO, member
      const ana = await enter('employee@acme.test');
      const strategy = room(ana, 'ceo');
      expect(await andrew.send('room:enter', { roomId: strategy.id })).toEqual({ ok: true });
      await update(ana, andrew.me, (p) => p.status === 'IN_MEETING');
      expect(await ana.send('room:enter', { roomId: strategy.id })).toMatchObject({ ok: false, code: 'KNOCK_REQUIRED' });
      expect(await andrew.send('knock:send', { roomId: strategy.id })).toMatchObject({ ok: false, code: 'ALREADY_HERE' });
    });
  });

  describe('summons', () => {
    it('the owner calls people to the strategy room, and ending it sends them back', async () => {
      const joel = await enter('pastor@acme.test');
      const andrew = await enter('andrew.tan@acme.test');
      const rachel = await enter('rachel.uy@acme.test');
      const ana = await enter('employee@acme.test');
      const strategy = room(joel, 'ceo');
      const andrewHome = person(andrew.snapshot, andrew.me).roomId;

      // only the owner (or an admin) can summon
      expect(await andrew.send('summon:send', { roomId: strategy.id, userIds: [rachel.me] })).toMatchObject({ ok: false, code: 'NOT_HOST' });

      const res = await joel.send<{ sent: number }>('summon:send', { roomId: strategy.id, userIds: [andrew.me, rachel.me] });
      expect(res).toEqual({ ok: true, data: { sent: 2, offline: [] } });
      // the host walks to the room
      await update(ana, joel.me, (p) => p.roomId === strategy.id);
      const meetings = await ana.waitFor('meetings:update', (m) => m.length === 1 && m[0].pendingIds.length === 2);
      expect(meetings[0]).toMatchObject({ roomId: strategy.id, hostId: joel.me });

      const inv = await andrew.waitFor('summon:incoming');
      expect(inv).toMatchObject({ roomName: 'CEO Strategy Room', hostName: 'Ptr. Joel Santiago' } satisfies Partial<SummonDto>);
      expect(await andrew.send('summon:answer', { id: inv.id, accept: true })).toEqual({ ok: true });
      await update(ana, andrew.me, (p) => p.roomId === strategy.id && p.status === 'IN_MEETING');

      const inv2 = await rachel.waitFor('summon:incoming');
      await rachel.send('summon:answer', { id: inv2.id, accept: false });
      await ana.waitFor('meetings:update', (m) => m.length === 1 && m[0].pendingIds.length === 0);

      // someone else can't end it
      expect(await ana.send('meeting:end', { roomId: strategy.id })).toMatchObject({ ok: false, code: 'NOT_HOST' });
      expect(await joel.send('meeting:end', { roomId: strategy.id })).toEqual({ ok: true });
      await update(ana, andrew.me, (p) => p.roomId === andrewHome);
      await update(ana, joel.me, (p) => p.roomId === room(ana, 'pastor').id);
      await ana.waitFor('meetings:update', (m) => m.length === 0);
    });

    it('offline people are listed instead of invited', async () => {
      const joel = await enter('pastor@acme.test');
      const res = await joel.send('summon:send', { roomId: room(joel, 'ceo').id, userIds: [ctx.ids.get('faith.castillo@acme.test')!] });
      expect(res).toEqual({ ok: true, data: { sent: 0, offline: ['Faith Castillo'] } });
      await joel.send('meeting:end', { roomId: room(joel, 'ceo').id });
    });
  });

  describe('statuses', () => {
    it('a chosen status and message win over the room and idle; automatic comes back when cleared', async () => {
      const ana = await enter('employee@acme.test');
      const tess = await enter('tess.bautista@acme.test');

      expect(await ana.send('status:set', { status: 'BUSY', message: '  Shipping the release  ' })).toEqual({ ok: true });
      await update(tess, ana.me, (p) => p.status === 'BUSY' && p.message === 'Shipping the release' && p.manualStatus === 'BUSY');

      await ana.send('room:enter', { roomId: room(ana, 'huddle').id });
      await update(tess, ana.me, (p) => p.roomId === room(ana, 'huddle').id && p.status === 'BUSY');

      await ana.send('status:set', { status: null, message: null });
      await update(tess, ana.me, (p) => p.status === 'IN_MEETING' && p.message === null);

      await ana.send('room:enter', { roomId: room(ana, 'eng').id });
      await ana.send('activity:idle', { idle: true });
      await update(tess, ana.me, (p) => p.status === 'AWAY');
      await ana.send('activity:idle', { idle: false });
      await update(tess, ana.me, (p) => p.status === 'AVAILABLE' && p.roomId === room(ana, 'eng').id);

      expect(await ana.send('status:set', { status: 'AVAILABLE', message: null })).toMatchObject({ ok: false, code: 'INVALID' });
      expect(await ana.send('status:set', { status: null, message: 'x'.repeat(81) })).toMatchObject({ ok: false, code: 'INVALID' });
    });

    it('idle only counts when every open tab is idle', async () => {
      const s = await login('employee@acme.test');
      const tab1 = await connect(s.token);
      const tab2 = await connect(s.token);
      const tess = await enter('tess.bautista@acme.test');
      await tab1.send('activity:idle', { idle: true });
      await tab2.send('room:enter', { roomId: room(tab2, 'sales').id });
      await update(tess, tab1.me, (p) => p.roomId === room(tess, 'sales').id && p.status === 'AVAILABLE');
      await tab2.send('activity:idle', { idle: true });
      await update(tess, tab1.me, (p) => p.status === 'AWAY');
    });

    it('starting a break on the clock walks you to the break room, and ending it walks you back', async () => {
      const ana = await enter('employee@acme.test');
      const tess = await enter('tess.bautista@acme.test');
      const s = signed.get('employee@acme.test')!;
      const clock = (action: string) => http(ctx).post('/api/me/clock').set(s.auth).set('x-csrf-token', s.csrf).send({ action });

      expect((await clock('IN')).status).toBe(201);
      expect((await clock('BREAK_START')).status).toBe(201);
      await update(tess, ana.me, (p) => p.roomId === room(tess, 'break').id && p.status === 'ON_BREAK');

      expect((await clock('BREAK_END')).status).toBe(201);
      await update(tess, ana.me, (p) => p.roomId === room(tess, 'eng').id && p.status === 'AVAILABLE');
      await clock('OUT');
    });
  });

  describe('sessions', () => {
    it('signing someone out ends their live connection and shows them offline', async () => {
      const ana = await enter('employee@acme.test');
      const maria = await enter('admin@acme.test');
      const admin = signed.get('admin@acme.test')!;
      const res = await http(ctx).post(`/api/users/${ana.me}/force-logout`).set(admin.auth).set('x-csrf-token', admin.csrf);
      expect(res.status).toBeLessThan(300);
      expect(await ana.waitFor('session:ended')).toMatchObject({ code: 'FORCED_LOGOUT' });
      await update(maria, ana.me, (p) => p.status === 'OFFLINE');
      // and the old token can't reconnect
      await expect(connect(signed.get('employee@acme.test')!.token)).rejects.toMatchObject({ code: 'FORCED_LOGOUT' });
    });
  });

  describe('rooms admin', () => {
    it('only admins change rooms; changes reach everyone at once and are audited', async () => {
      const ana = await enter('employee@acme.test');
      const admin = await login('admin@acme.test');
      const focus = room(ana, 'focus');
      const body = { name: 'Quiet room', kind: 'PRIVATE', departmentId: null, ownerId: ctx.ids.get('kevin.lim@acme.test')!, memberIds: [ana.me] };

      const forbidden = await http(ctx).patch(`/api/rooms/${focus.id}`).set(signed.get('employee@acme.test')!.auth).set('x-csrf-token', signed.get('employee@acme.test')!.csrf).send(body);
      expect(forbidden.status).toBe(403);

      const res = await http(ctx).patch(`/api/rooms/${focus.id}`).set(admin.auth).set('x-csrf-token', admin.csrf).send(body);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Quiet room', ownerId: body.ownerId, memberIds: [ana.me], capacity: 2 });
      const pushed = await ana.waitFor('rooms:update');
      expect(pushed.find((r) => r.id === focus.id)?.name).toBe('Quiet room');
      // Ana is now a member, so she walks straight in
      expect(await ana.send('room:enter', { roomId: focus.id })).toEqual({ ok: true });

      const audit = await ctx.sql('select action from audit_logs where entity_id = $1', [focus.id]);
      expect(audit).toEqual([{ action: 'room.update' }]);

      const bad = await http(ctx)
        .patch(`/api/rooms/${focus.id}`)
        .set(admin.auth)
        .set('x-csrf-token', admin.csrf)
        .send({ ...body, memberIds: [ctx.ids.get('former@acme.test')!] });
      expect(bad.status).toBe(400);
    });

    it('everyone can read the floor over plain HTTP too', async () => {
      const s = await login('carlo.mendoza@acme.test');
      const snap = await floor(s);
      expect(snap.me).toBe(s.userId);
      expect(snap.rooms.map((r) => r.spot)).toEqual(['pastor', 'ceo', 'eng', 'huddle', 'sales', 'lobby', 'ops', 'break', 'focus']);
      expect(snap.people.find((p) => p.fullName === 'Mark Villanueva')).toBeUndefined(); // deactivated
      expect((await http(ctx).get('/api/floor')).status).toBe(401);
    });
  });
});
