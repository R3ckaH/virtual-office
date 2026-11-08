/**
 * Phase 4 end to end: scheduled meetings (invites, RSVPs, repeats, .ics, reminders, calendar feed),
 * instant calls (ringing, decline), office room calls, LiveKit join tokens and signed webhooks
 * (attendance log, "In a meeting" status), and the recording switch.
 */
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import type { JoinDto, MeetingDto, OccurrenceDto, RoomDto } from '@vo/shared';
import { MeetingsService } from '../src/meetings/meetings.service';
import { http, setup, signIn, Signed, TestCtx } from './helpers';
import { Client, connectSocket } from './socket';

const MIN = 60_000;
const payload = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

describe('Phase 4: meetings and calls', () => {
  let ctx: TestCtx;
  let url: string;
  let svc: MeetingsService;
  const clients: Client[] = [];
  const users = new Map<string, Signed>();

  beforeAll(async () => {
    ctx = await setup();
    await ctx.app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
    svc = ctx.app.get(MeetingsService);
    for (const e of ['manager@acme.test', 'employee@acme.test', 'emily.carter@acme.test', 'admin@acme.test', 'nico.ramos@acme.test', 'hr@acme.test']) {
      users.set(e, await signIn(ctx, e));
    }
  });
  afterEach(() => {
    while (clients.length) clients.pop()!.close();
  });
  afterAll(() => ctx.close());

  const as = (email: string) => users.get(email)!;
  const id = (email: string) => ctx.ids.get(email)!;
  const connect = (email: string) => connectSocket(url, as(email).token, clients);
  const api = (email: string) => ({
    get: (p: string) => http(ctx).get(`/api${p}`).set(as(email).auth),
    post: (p: string, body?: object) => http(ctx).post(`/api${p}`).set(as(email).auth).send(body ?? {}),
    put: (p: string, body: object) => http(ctx).put(`/api${p}`).set(as(email).auth).send(body),
    patch: (p: string, body: object) => http(ctx).patch(`/api${p}`).set(as(email).auth).send(body),
  });

  const schedule = (over: Record<string, unknown> = {}) => ({
    title: 'Sprint planning',
    description: 'Plan the next two weeks',
    startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    durationMinutes: 45,
    timezone: 'Asia/Manila',
    recurrence: 'NONE',
    inviteeIds: [id('employee@acme.test'), id('emily.carter@acme.test')],
    ...over,
  });

  /** A webhook signed the way LiveKit signs them. */
  async function hook(event: Record<string, unknown>, secret = 'secret') {
    const body = JSON.stringify({ id: `EV_${Math.random()}`, createdAt: String(Math.floor(Date.now() / 1000)), ...event });
    const at = new AccessToken('devkey', secret);
    at.sha256 = createHash('sha256').update(body).digest('base64');
    return http(ctx)
      .post('/api/livekit/webhook')
      .set('Content-Type', 'application/webhook+json')
      .set('Authorization', await at.toJwt())
      .send(body);
  }

  const outboxFor = (email: string) => ctx.mail.outbox.filter((m) => m.to === email);

  describe('scheduling', () => {
    it('only managers, HR and admins can schedule', async () => {
      expect((await api('employee@acme.test').post('/meetings', schedule())).status).toBe(403);
      const bad = await api('manager@acme.test').post('/meetings', schedule({ title: '', durationMinutes: 2 }));
      expect(bad.status).toBe(400);
    });

    it('invites people with a calendar file, takes replies, and resets them when the time changes', async () => {
      ctx.mail.outbox.length = 0;
      const res = await api('manager@acme.test').post('/meetings', schedule());
      expect(res.status).toBe(201);
      const m = res.body as MeetingDto;
      expect(m.invitees.map((i) => i.fullName).sort()).toEqual(['Ana Cruz', 'Emily Carter']);
      expect(m.canEdit).toBe(true);

      const invite = outboxFor('employee@acme.test')[0];
      expect(invite.subject).toBe('Invitation: Sprint planning');
      const ics = String(invite.attachments![0].content);
      expect(ics).toContain('METHOD:REQUEST');
      expect(ics).toContain('SUMMARY:Sprint planning');
      expect(ics).toContain('DTSTART;TZID=Asia/Manila:');

      // invitees see it; others don't
      const range = `from=${new Date().toISOString()}&to=${new Date(Date.now() + 7 * 86_400_000).toISOString()}`;
      const anaCal = (await api('employee@acme.test').get(`/meetings?${range}`)).body as OccurrenceDto[];
      expect(anaCal.find((o) => o.meetingId === m.id)).toMatchObject({ title: 'Sprint planning', isHost: false, myResponse: 'PENDING', inviteeCount: 2 });
      expect(((await api('nico.ramos@acme.test').get(`/meetings?${range}`)).body as OccurrenceDto[]).some((o) => o.meetingId === m.id)).toBe(false);
      expect((await api('nico.ramos@acme.test').get(`/meetings/${m.id}`)).status).toBe(404);

      // RSVP
      const r = await api('employee@acme.test').post(`/meetings/${m.id}/respond`, { response: 'ACCEPTED' });
      expect(r.status).toBe(200);
      expect(r.body.myResponse).toBe('ACCEPTED');
      expect((await api('nico.ramos@acme.test').post(`/meetings/${m.id}/respond`, { response: 'ACCEPTED' })).status).toBe(403);
      // invitees can't edit
      expect((await api('employee@acme.test').put(`/meetings/${m.id}`, schedule())).status).toBe(403);

      // new time + Emily removed: Ana must reply again, Emily gets a cancellation
      ctx.mail.outbox.length = 0;
      const moved = await api('manager@acme.test').put(`/meetings/${m.id}`, schedule({ startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), inviteeIds: [id('employee@acme.test')] }));
      expect(moved.status).toBe(200);
      expect(moved.body.invitees).toEqual([expect.objectContaining({ fullName: 'Ana Cruz', response: 'PENDING' })]);
      expect(outboxFor('employee@acme.test')[0].subject).toBe('Updated: Sprint planning');
      expect(String(outboxFor('employee@acme.test')[0].attachments![0].content)).toContain('SEQUENCE:1');
      expect(outboxFor('emily.carter@acme.test')[0].subject).toBe('Cancelled: Sprint planning');
      expect(String(outboxFor('emily.carter@acme.test')[0].attachments![0].content)).toContain('METHOD:CANCEL');

      // cancel
      ctx.mail.outbox.length = 0;
      expect((await api('manager@acme.test').post(`/meetings/${m.id}/cancel`)).status).toBe(204);
      expect(outboxFor('employee@acme.test')[0].subject).toBe('Cancelled: Sprint planning');
      expect(((await api('employee@acme.test').get(`/meetings?${range}`)).body as OccurrenceDto[]).some((o) => o.meetingId === m.id)).toBe(false);
      expect((await api('employee@acme.test').post(`/meetings/${m.id}/join`)).body.code).toBe('CANCELLED');
    });

    it('repeats keep the local time and stop on the last date', async () => {
      // Mondays 9:00 Manila from a known Monday for three weeks
      const res = await api('manager@acme.test').post(
        '/meetings',
        schedule({ title: 'Team weekly', startsAt: '2027-01-04T09:00:00+08:00', recurrence: 'WEEKLY', recurrenceUntil: '2027-01-18', durationMinutes: 30 }),
      );
      expect(res.status).toBe(201);
      const cal = (await api('employee@acme.test').get('/meetings?from=2027-01-01T00:00:00Z&to=2027-02-01T00:00:00Z')).body as OccurrenceDto[];
      expect(cal.filter((o) => o.meetingId === res.body.id).map((o) => o.start)).toEqual([
        '2027-01-04T01:00:00.000Z',
        '2027-01-11T01:00:00.000Z',
        '2027-01-18T01:00:00.000Z',
      ]);
      // a weekday meeting set for a Sunday starts on Monday
      const wk = await api('manager@acme.test').post('/meetings', schedule({ title: 'Weekday sync', startsAt: '2027-01-03T09:00:00+08:00', recurrence: 'WEEKDAYS' }));
      expect(wk.body.startsAt).toBe('2027-01-04T01:00:00.000Z');
      // invitee downloads the .ics
      const ics = await api('employee@acme.test').get(`/meetings/${res.body.id}/ics`);
      expect(ics.headers['content-type']).toContain('text/calendar');
      expect(ics.text).toContain('RRULE:FREQ=WEEKLY');
    });
  });

  describe('joining', () => {
    it('opens 15 minutes before the start and gives a LiveKit token for this occurrence', async () => {
      const later = (await api('manager@acme.test').post('/meetings', schedule({ title: 'Later' }))).body as MeetingDto;
      const early = await api('employee@acme.test').post(`/meetings/${later.id}/join`);
      expect(early.status).toBe(409);
      expect(early.body.code).toBe('NOT_STARTED');

      const start = new Date(Date.now() + 10 * MIN);
      const soon = (await api('manager@acme.test').post('/meetings', schedule({ title: 'Standup', startsAt: start.toISOString() }))).body as MeetingDto;
      const j = await api('employee@acme.test').post(`/meetings/${soon.id}/join`);
      expect(j.status).toBe(200);
      const join = j.body as JoinDto;
      expect(join.url).toBe('ws://127.0.0.1:7880');
      expect(join.isHost).toBe(false);
      expect(join.canRecord).toBe(false);
      const claims = payload(join.token);
      expect(claims.sub).toBe(id('employee@acme.test'));
      expect(claims.video).toMatchObject({ roomJoin: true, room: `m_${soon.id}_${Math.floor(start.getTime() / 1000)}`, canPublish: true });
      expect(claims.video.roomAdmin).toBeFalsy();

      const host = (await api('manager@acme.test').post(`/meetings/${soon.id}/join`)).body as JoinDto;
      expect(host.isHost).toBe(true);
      expect(payload(host.token).video.roomAdmin).toBe(true);

      expect((await api('nico.ramos@acme.test').post(`/meetings/${soon.id}/join`)).status).toBe(404);
    });
  });

  describe('LiveKit webhooks', () => {
    it('rejects unsigned or wrongly signed webhooks', async () => {
      expect((await http(ctx).post('/api/livekit/webhook').set('Content-Type', 'application/webhook+json').send('{}')).status).toBe(401);
      expect((await hook({ event: 'room_started' }, 'not-the-secret')).status).toBe(401);
    });

    it('logs attendance and shows people as In a meeting while they are in the call', async () => {
      const m = (await api('manager@acme.test').post('/meetings', schedule({ title: 'Live one', startsAt: new Date(Date.now() - 5 * MIN).toISOString() }))).body as MeetingDto;
      const join = (await api('employee@acme.test').post(`/meetings/${m.id}/join`)).body as JoinDto;
      const room = payload(join.token).video.room as string;

      const nico = await connect('nico.ramos@acme.test');
      await connect('employee@acme.test');
      const ana = id('employee@acme.test');

      expect((await hook({ event: 'participant_joined', room: { name: room, sid: 'RM_1' }, participant: { sid: 'PA_1', identity: ana, joinedAt: String(Math.floor(Date.now() / 1000) - 120) } })).status).toBe(200);
      await nico.waitFor('presence:update', (p) => p.userId === ana && p.status === 'IN_MEETING');
      expect((await api('manager@acme.test').get(`/meetings/${m.id}`)).body.liveCount).toBe(1);

      // the same event twice (LiveKit retries) doesn't double count
      await hook({ event: 'participant_joined', room: { name: room, sid: 'RM_1' }, participant: { sid: 'PA_1', identity: ana } });

      await hook({ event: 'participant_left', room: { name: room, sid: 'RM_1' }, participant: { sid: 'PA_1', identity: ana } });
      await nico.waitFor('presence:update', (p) => p.userId === ana && p.status === 'AVAILABLE');

      const att = await api('manager@acme.test').get(`/meetings/${m.id}/attendance`);
      expect(att.status).toBe(200);
      expect(att.body).toHaveLength(1);
      expect(att.body[0]).toMatchObject({ fullName: 'Ana Cruz', joins: 1 });
      expect(att.body[0].seconds).toBeGreaterThanOrEqual(115);
      expect(att.body[0].lastLeftAt).toBeTruthy();

      expect((await api('hr@acme.test').get(`/meetings/${m.id}/attendance`)).status).toBe(200);
      expect((await api('employee@acme.test').get(`/meetings/${m.id}/attendance`)).status).toBe(403);
    });
  });

  describe('instant calls', () => {
    it('rings the person, and tells the caller when they decline', async () => {
      const ana = await connect('employee@acme.test');
      const emily = await connect('emily.carter@acme.test');
      const res = await api('employee@acme.test').post('/calls', { userIds: [id('emily.carter@acme.test')] });
      expect(res.status).toBe(200);
      const call = res.body as JoinDto;
      expect(call.kind).toBe('INSTANT');
      expect(call.isHost).toBe(true);

      const ring = await emily.waitFor('call:incoming', (c) => c.meetingId === call.meetingId);
      expect(ring).toMatchObject({ fromName: 'Ana Cruz', title: 'Ana Cruz and Emily Carter' });

      expect((await api('emily.carter@acme.test').post(`/calls/${call.meetingId}/decline`)).status).toBe(204);
      expect(await ana.waitFor('call:ended', (e) => e.meetingId === call.meetingId)).toMatchObject({ reason: 'declined', byName: 'Emily Carter' });
    });

    it('stops ringing when the person joins, and ends when the room closes', async () => {
      await connect('employee@acme.test');
      const emily = await connect('emily.carter@acme.test');
      const call = (await api('employee@acme.test').post('/calls', { userIds: [id('emily.carter@acme.test')] })).body as JoinDto;
      await emily.waitFor('call:incoming', (c) => c.meetingId === call.meetingId);
      const answer = await api('emily.carter@acme.test').post(`/meetings/${call.meetingId}/join`);
      expect(answer.status).toBe(200);
      expect(await emily.waitFor('call:ended', (e) => e.meetingId === call.meetingId)).toMatchObject({ reason: 'answered' });

      const room = payload(call.token).video.room;
      await hook({ event: 'room_finished', room: { name: room, sid: 'RM_2' } });
      const after = await api('emily.carter@acme.test').post(`/meetings/${call.meetingId}/join`);
      expect(after.body.code).toBe('ENDED');
    });

    it('won’t call someone who is offline', async () => {
      const res = await api('employee@acme.test').post('/calls', { userIds: [id('hr@acme.test')] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('OFFLINE');
      expect((await api('employee@acme.test').post('/calls', { userIds: [id('employee@acme.test')] })).status).toBe(400);
    });
  });

  describe('office room calls', () => {
    it('everyone standing in a meeting room joins the same call', async () => {
      const ana = await connect('employee@acme.test');
      const nico = await connect('nico.ramos@acme.test');
      const huddle = ana.snapshot.rooms.find((r: RoomDto) => r.spot === 'huddle')!;
      const lobby = ana.snapshot.rooms.find((r: RoomDto) => r.spot === 'lobby')!;

      const notThere = await api('employee@acme.test').post(`/rooms/${huddle.id}/call`);
      expect(notThere.status).toBe(403);
      expect(notThere.body.code).toBe('NOT_IN_ROOM');

      await ana.send('room:enter', { roomId: huddle.id });
      await nico.send('room:enter', { roomId: huddle.id });
      const a = (await api('employee@acme.test').post(`/rooms/${huddle.id}/call`)).body as JoinDto;
      const n = (await api('nico.ramos@acme.test').post(`/rooms/${huddle.id}/call`)).body as JoinDto;
      expect(a.kind).toBe('ROOM');
      expect(a.title).toBe('Huddle room call');
      expect(n.meetingId).toBe(a.meetingId);
      expect(payload(n.token).video.room).toBe(payload(a.token).video.room);

      await ana.send('room:enter', { roomId: lobby.id });
      expect((await api('employee@acme.test').post(`/rooms/${lobby.id}/call`)).status).toBe(400);
    });
  });

  describe('reminders', () => {
    it('reminds the host and invitees once, 10 minutes before', async () => {
      const now = new Date();
      const m = (await api('manager@acme.test').post('/meetings', schedule({ title: 'Reminder me', startsAt: new Date(now.getTime() + 10 * MIN).toISOString() }))).body as MeetingDto;
      await api('emily.carter@acme.test').post(`/meetings/${m.id}/respond`, { response: 'DECLINED' });
      const ana = await connect('employee@acme.test');
      ctx.mail.outbox.length = 0;
      expect(await svc.runReminders(now)).toBeGreaterThanOrEqual(1);
      expect(await ana.waitFor('meeting:reminder', (r) => r.meetingId === m.id)).toMatchObject({ title: 'Reminder me' });
      expect(outboxFor('employee@acme.test').map((x) => x.subject)).toContain('Starting soon: Reminder me');
      expect(outboxFor('manager@acme.test').map((x) => x.subject)).toContain('Starting soon: Reminder me');
      expect(outboxFor('emily.carter@acme.test').filter((x) => x.subject === 'Starting soon: Reminder me')).toHaveLength(0); // declined
      ctx.mail.outbox.length = 0;
      await svc.runReminders(now);
      expect(outboxFor('employee@acme.test').filter((x) => x.subject === 'Starting soon: Reminder me')).toHaveLength(0);
    });
  });

  describe('calendar subscription', () => {
    it('gives a private link that Google Calendar or Outlook can follow, and can be reset', async () => {
      expect((await api('employee@acme.test').get('/me/calendar-feed')).body).toEqual({});
      const first = (await api('employee@acme.test').post('/me/calendar-feed')).body as { url: string };
      expect(first.url).toMatch(/^http:\/\/localhost:5173\/api\/calendar\/feed\/[A-Za-z0-9_-]+\.ics$/);
      expect((await api('employee@acme.test').get('/me/calendar-feed')).body.url).toBe(first.url);

      const path = new URL(first.url).pathname;
      const feed = await http(ctx).get(path);
      expect(feed.status).toBe(200);
      expect(feed.text).toContain('BEGIN:VCALENDAR');
      expect(feed.text).toContain('SUMMARY:Team weekly');
      expect(feed.text).toContain('STATUS:CANCELLED'); // cancelled ones stay, marked cancelled, so calendars remove them

      const second = (await api('employee@acme.test').post('/me/calendar-feed')).body as { url: string };
      expect(second.url).not.toBe(first.url);
      expect((await http(ctx).get(path)).status).toBe(404);
      expect((await http(ctx).get('/api/calendar/feed/nope.ics')).status).toBe(404);
    });
  });

  describe('recording', () => {
    it('is off until an admin turns it on and storage is connected', async () => {
      expect((await api('manager@acme.test').get('/admin/meeting-settings')).status).toBe(403);
      const s = await api('admin@acme.test').get('/admin/meeting-settings');
      expect(s.body).toEqual({ recordingEnabled: false, storageConfigured: false, videoConfigured: true });
      const on = await api('admin@acme.test').patch('/admin/meeting-settings', { recordingEnabled: true });
      expect(on.body.recordingEnabled).toBe(true);

      const m = (await api('manager@acme.test').post('/meetings', schedule({ title: 'Rec', startsAt: new Date().toISOString() }))).body as MeetingDto;
      const j = (await api('manager@acme.test').post(`/meetings/${m.id}/join`)).body as JoinDto;
      expect(j.canRecord).toBe(false); // no storage yet
      const r = await api('manager@acme.test').post(`/meetings/${m.id}/recording/start`);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('RECORDING_OFF');
      expect((await api('manager@acme.test').get(`/meetings/${m.id}/recordings`)).body).toEqual([]);
    });
  });
});
