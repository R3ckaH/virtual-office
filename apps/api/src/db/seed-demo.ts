/**
 * DEV ONLY: fills the attendance board with a realistic week, modelled on the HR mockup:
 * today's punches (only those already in the past), the previous four working days, a few
 * exceptions and correction requests. Re-running replaces the demo punches for those days.
 *   pnpm --filter @vo/api db:seed:demo
 */
import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { addDays, isoWeekday, localDate, zonedToUtc } from '@vo/shared';
import { and, gte, inArray, lte } from 'drizzle-orm';
import { AppModule } from '../app.module';
import { DayService } from '../attendance/day.service';
import { IngestService } from '../devices/ingest.service';
import { DB, Db } from './client';
import { attendanceDays, attendanceExceptions, correctionRequests, dayOverrides, devices, punches } from './schema';
import { seed, SEED_USERS } from './seed';

const TZ = 'Asia/Manila';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to add demo data to production');
  const { users: ids } = await seed();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get<Db>(DB);
    const days = app.get(DayService);
    const ingest = app.get(IngestService, { strict: false });
    const now = new Date();
    const today = localDate(now, TZ);
    const id = (email: string) => ids.get(email)!;

    // the previous four working days, plus today
    const past: string[] = [];
    for (let d = addDays(today, -1); past.length < 4; d = addDays(d, -1)) if (isoWeekday(d) <= 5) past.unshift(d);
    const first = addDays(past[0], -1);
    const tracked = SEED_USERS.filter((u) => u.schedule && !u.deactivated).map((u) => id(u.email));

    // clear earlier demo data for these days
    await db.delete(correctionRequests).where(and(gte(correctionRequests.workDate, first), inArray(correctionRequests.userId, tracked)));
    await db.delete(attendanceExceptions).where(gte(attendanceExceptions.workDate, first));
    await db.delete(punches).where(gte(punches.punchedAt, zonedToUtc(first, '00:00', TZ)));
    await db.delete(attendanceDays).where(and(gte(attendanceDays.workDate, first), lte(attendanceDays.workDate, addDays(today, 1))));
    await db.delete(dayOverrides).where(gte(dayOverrides.workDate, first));

    const [main, studio] = await Promise.all([
      db.query.devices.findFirst({ where: (d, { eq }) => eq(d.name, 'Main entrance terminal') }),
      db.query.devices.findFirst({ where: (d, { eq }) => eq(d.name, '2F Studio terminal') }),
    ]);
    if (!main || !studio) throw new Error('Run the base seed first');

    const at = (date: string, time: string) => zonedToUtc(date, time, TZ);
    const jitter = (seedText: string, spread: number) => {
      let h = 0;
      for (const c of seedText) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return (h % (spread * 2 + 1)) - spread;
    };
    const plus = (time: string, mins: number) => {
      const [h, m] = time.split(':').map(Number);
      const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    };
    const devicePunches = new Map<string, { deviceUserId: string; at: string; verify: string }[]>(); // per device id
    const pushDevice = (deviceId: string, badge: string, date: string, time: string, verify = 'Fingerprint') => {
      if (at(date, time) > now) return;
      const list = devicePunches.get(deviceId) ?? [];
      list.push({ deviceUserId: badge, at: `${date} ${time.length === 5 ? `${time}:00` : time}`, verify });
      devicePunches.set(deviceId, list);
    };
    const web: (typeof punches.$inferInsert)[] = [];
    const pushWeb = (email: string, workDate: string, date: string, time: string, kind: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END', location: string, note?: string) => {
      if (at(date, time) > now) return;
      web.push({ userId: id(email), workDate, source: 'WEB', kind, punchedAt: at(date, time), via: 'web', location, note, createdById: id(email) });
    };

    const homes: Record<string, string> = {
      'employee@acme.test': 'Virtual Office, Bulacan',
      'nico.ramos@acme.test': 'Virtual Office, Cebu City',
      'tess.bautista@acme.test': 'Virtual Office, Pasig',
      'bea.villanueva@acme.test': 'Virtual Office, Makati',
      'emily.carter@acme.test': 'Virtual Office, New York',
      'sales.manager@acme.test': 'Virtual Office, New York',
      'sam.porter@acme.test': 'Virtual Office, New York',
      'manager@acme.test': 'Virtual Office, Quezon City (home network)',
    };

    // ---- the previous four working days: ordinary days
    for (const d of past) {
      for (const u of SEED_USERS) {
        if (!u.schedule || u.deactivated || u.tracked === false) continue;
        const k = `${u.email}${d}`;
        if (u.schedule === 'night') {
          pushWeb(u.email, d, d, plus('20:58', jitter(k, 5)), 'IN', homes[u.email]);
          pushWeb(u.email, d, addDays(d, 1), plus('06:02', jitter(k + 'o', 6)), 'OUT', homes[u.email]);
          continue;
        }
        const start = u.schedule === 'mid' ? '10:00' : '08:00';
        const end = u.schedule === 'mid' ? '19:00' : '17:00';
        const inT = plus(start, jitter(k, 9) - 4);
        const outT = plus(end, Math.abs(jitter(k + 'o', 15)));
        const remote = u.setup === 'REMOTE' || (u.setup === 'HYBRID' && ![1, 3, 4].includes(isoWeekday(d)));
        if (remote || !u.badge) {
          pushWeb(u.email, d, d, inT, 'IN', homes[u.email] ?? 'Virtual Office');
          pushWeb(u.email, d, d, outT, 'OUT', homes[u.email] ?? 'Virtual Office');
        } else {
          const dev = u.email === 'paolo.aquino@acme.test' ? studio.id : main.id;
          pushDevice(dev, u.badge, d, `${inT}:${String(Math.abs(jitter(k + 's', 29))).padStart(2, '0')}`, u.enrolledWith?.includes('Face') ? 'Face' : 'Fingerprint');
          pushDevice(dev, u.badge, d, plus(start, 240), u.enrolledWith?.includes('Face') ? 'Face' : 'Fingerprint');
          pushDevice(dev, u.badge, d, plus(start, 300 + Math.abs(jitter(k + 'b', 4))), u.enrolledWith?.includes('Face') ? 'Face' : 'Fingerprint');
          pushDevice(dev, u.badge, d, outT, u.enrolledWith?.includes('Face') ? 'Face' : 'Fingerprint');
        }
      }
    }
    // a couple of real-life wrinkles on past days, for the correction requests below
    const [d4, d3, d2, d1] = past;
    const pastWeb = web.filter((w) => !(w.userId === id('bea.villanueva@acme.test') && w.workDate === d2 && w.kind === 'OUT'));
    web.length = 0;
    web.push(...pastWeb);
    const tessFix = web.find((w) => w.userId === id('tess.bautista@acme.test') && w.workDate === d4 && w.kind === 'IN');
    if (tessFix) tessFix.punchedAt = at(d4, '09:12');
    devicePunches.set(main.id, (devicePunches.get(main.id) ?? []).filter((p) => !(p.deviceUserId === '0016' && p.at.startsWith(d1) && p.at.slice(11, 13) === '07')));
    pushWeb('ryan.torres@acme.test', d1, d1, '08:06', 'IN', 'Virtual Office, phone');

    // ---- today, as in the mockup
    const t = today;
    const isWeekday = isoWeekday(t) <= 5;
    if (isWeekday) {
      pushDevice(main.id, '0012', t, '07:52:10');
      pushDevice(studio.id, '0011', t, '07:40:12', 'Face');
      pushDevice(main.id, '0015', t, '07:49:02');
      pushDevice(main.id, '0015', t, '07:49:31');
      pushDevice(main.id, '0015', t, '07:50:05');
      pushDevice(main.id, '0013', t, '08:00:30', 'Face');
      pushDevice(main.id, '0016', t, '08:03:41');
      pushDevice(main.id, '0016', t, '10:25:00');
      pushDevice(main.id, '0021', t, '07:58:20', 'Face');
      pushDevice(main.id, '0021', t, '10:05:00', 'Face');
      pushDevice(main.id, '0018', t, '08:14:40');
      pushDevice(main.id, '0041', t, '10:21:00', 'Face');
      pushDevice(main.id, '0047', t, '08:12:00'); // Kevin's new badge, not linked yet
      pushDevice(main.id, '0033', t, '08:31:00', 'Face');
      pushWeb('manager@acme.test', t, t, '07:55', 'IN', homes['manager@acme.test']);
      pushWeb('employee@acme.test', t, t, '08:02', 'IN', homes['employee@acme.test']);
      pushWeb('nico.ramos@acme.test', t, t, '08:10', 'IN', homes['nico.ramos@acme.test'], 'Power interruption, back on at 8:08');
      pushWeb('tess.bautista@acme.test', t, t, '07:58', 'IN', homes['tess.bautista@acme.test']);
      pushWeb('bea.villanueva@acme.test', t, t, '08:00', 'IN', homes['bea.villanueva@acme.test']);
      // US hours: Emily forgot to clock out last night; Daniel's shift ended normally
      const y = d1;
      web.splice(0, web.length, ...web.filter((w) => !(w.workDate === y && (w.userId === id('emily.carter@acme.test') || w.userId === id('sales.manager@acme.test')))));
      pushWeb('emily.carter@acme.test', y, y, '20:57', 'IN', homes['emily.carter@acme.test']);
      pushWeb('sales.manager@acme.test', y, y, '21:02', 'IN', homes['sales.manager@acme.test']);
      pushWeb('sales.manager@acme.test', y, t, '06:05', 'OUT', homes['sales.manager@acme.test']);
    }
    // Sam is on vacation leave
    for (const d of [d1, t, addDays(t, 1)]) {
      await db.insert(dayOverrides).values({ userId: id('sam.porter@acme.test'), workDate: d, kind: 'LEAVE', note: 'Vacation leave (approved by Daniel Brooks)' }).onConflictDoNothing();
    }
    web.splice(0, web.length, ...web.filter((w) => !(w.userId === id('sam.porter@acme.test') && w.workDate === d1)));

    if (web.length) await db.insert(punches).values(web);
    const allDevices = await db.select().from(devices);
    for (const [deviceId, list] of devicePunches) {
      const dev = allDevices.find((d) => d.id === deviceId)!;
      await ingest.ingest(dev, list, dev.connection === 'AGENT' ? 'agent' : 'push', { now });
    }

    // ---- correction requests, as in the mockup
    const bea = id('bea.villanueva@acme.test');
    const ryan = id('ryan.torres@acme.test');
    const tess = id('tess.bautista@acme.test');
    const jose = id('manager@acme.test');
    const ryanPunch = await db.query.punches.findFirst({ where: (p, { and, eq }) => and(eq(p.userId, ryan), eq(p.workDate, d1), eq(p.source, 'WEB')) });
    const tessPunch = await db.query.punches.findFirst({ where: (p, { and, eq }) => and(eq(p.userId, tess), eq(p.workDate, d4), eq(p.kind, 'IN')) });
    await db.insert(correctionRequests).values([
      {
        userId: bea,
        workDate: d2,
        action: 'ADD',
        kind: 'OUT',
        requestedAt: at(d2, '17:10'),
        reason: 'Forgot to clock out before logging off. My last activity in the Virtual Office was 5:08 PM.',
        status: 'PENDING_HR',
        managerId: jose,
        managerDecidedAt: at(d2, '18:30'),
      },
      ...(ryanPunch
        ? [
            {
              userId: ryan,
              workDate: d1,
              action: 'CHANGE' as const,
              punchId: ryanPunch.id,
              kind: 'IN' as const,
              originalAt: ryanPunch.punchedAt,
              requestedAt: at(d1, '07:58'),
              reason: 'The biometric wouldn’t read my finger, so I clocked in on my phone. The guard’s logbook shows 7:58 AM.',
              status: 'PENDING_MANAGER' as const,
              managerId: id('sales.manager@acme.test'),
            },
          ]
        : []),
      ...(tessPunch
        ? [
            {
              userId: tess,
              workDate: d4,
              action: 'CHANGE' as const,
              punchId: tessPunch.id,
              kind: 'IN' as const,
              originalAt: tessPunch.punchedAt,
              requestedAt: at(d4, '07:30'),
              reason: 'Power outage in Pasig. I worked offline from 7:30 AM; commit history attached.',
              status: 'PENDING_HR' as const,
              managerId: jose,
              managerDecidedAt: at(d4, '12:00'),
            },
          ]
        : []),
    ]);

    // ---- compute every day in the range
    for (const userId of tracked) for (const d of [...past, t]) await days.recompute(userId, d, now);
    console.log(`Demo attendance ready for ${past[0]} to ${t} (${web.length} web punches, ${[...devicePunches.values()].reduce((s, l) => s + l.length, 0)} device punches).`);
    if (!isWeekday) console.log('Today is a weekend, so only the past working days have punches.');
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
