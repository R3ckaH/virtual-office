/**
 * Sample data for local development and demos: one company, departments, users for every role,
 * and the Phase 2 attendance setup (schedules, devices, badge links). Demo punches: see seed-demo.ts.
 * Idempotent: running it again updates the same rows. Refuses to run in production.
 *   pnpm --filter @vo/api db:seed
 */
import 'dotenv/config';
import type { Role, WorkSetup } from '@vo/shared';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../auth/auth.service';
import { createDb, createPool } from './client';
import {
  attendanceSettings,
  departments,
  devices,
  deviceUserLinks,
  orgSettings,
  scheduleAssignments,
  scheduleDays,
  users,
  workSchedules,
} from './schema';

export const SEED_PASSWORD = 'OfficePass2026!';

type SeedUser = {
  email: string;
  fullName: string;
  title: string;
  role: Role;
  dept: string;
  timezone: string;
  manager?: string;
  password?: boolean;
  deactivated?: boolean;
  /** Phase 2 */
  setup?: WorkSetup;
  tracked?: boolean;
  schedule?: ScheduleKey;
  badge?: string;
  enrolledWith?: string;
};

type ScheduleKey = 'day' | 'mid' | 'night' | 'hybrid';

export const SEED_USERS: SeedUser[] = [
  { email: 'admin@acme.test', fullName: 'Maria Santos', title: 'Operations Director', role: 'ADMIN', dept: 'Operations', timezone: 'Asia/Manila', schedule: 'day', badge: '0012', enrolledWith: 'Fingerprint, face' },
  { email: 'manager@acme.test', fullName: 'Jose Reyes', title: 'Engineering Lead', role: 'MANAGER', dept: 'Engineering', timezone: 'Asia/Manila', manager: 'admin@acme.test', setup: 'HYBRID', schedule: 'hybrid', badge: '0033', enrolledWith: 'Face' },
  { email: 'employee@acme.test', fullName: 'Ana Cruz', title: 'Software Engineer', role: 'EMPLOYEE', dept: 'Engineering', timezone: 'Asia/Manila', manager: 'manager@acme.test', setup: 'REMOTE', schedule: 'day' },
  { email: 'emily.carter@acme.test', fullName: 'Emily Carter', title: 'QA Engineer', role: 'EMPLOYEE', dept: 'Engineering', timezone: 'America/New_York', manager: 'manager@acme.test', setup: 'REMOTE', schedule: 'night' },
  { email: 'sales.manager@acme.test', fullName: 'Daniel Brooks', title: 'Sales Manager', role: 'MANAGER', dept: 'Sales', timezone: 'America/New_York', manager: 'admin@acme.test', setup: 'REMOTE', schedule: 'night' },
  { email: 'carlo.mendoza@acme.test', fullName: 'Carlo Mendoza', title: 'Account Executive', role: 'EMPLOYEE', dept: 'Sales', timezone: 'Asia/Manila', manager: 'sales.manager@acme.test', schedule: 'day', badge: '0015', enrolledWith: 'Fingerprint' },
  { email: 'hr@acme.test', fullName: 'Grace Lim', title: 'HR Specialist', role: 'HR', dept: 'Human Resources', timezone: 'Asia/Manila', manager: 'admin@acme.test', schedule: 'day', badge: '0021', enrolledWith: 'Face' },
  { email: 'invited@acme.test', fullName: 'Liza Garcia', title: 'Support Associate', role: 'EMPLOYEE', dept: 'Operations', timezone: 'Asia/Manila', manager: 'admin@acme.test', password: false, schedule: 'day', badge: '0018', enrolledWith: 'Fingerprint' },
  { email: 'former@acme.test', fullName: 'Mark Villanueva', title: 'Former Contractor', role: 'EMPLOYEE', dept: 'Sales', timezone: 'Asia/Manila', manager: 'sales.manager@acme.test', deactivated: true, badge: '0052', enrolledWith: 'Fingerprint' },
  // Phase 2: the rest of the attendance mockup's team
  { email: 'paolo.aquino@acme.test', fullName: 'Paolo Aquino', title: 'Junior Engineer', role: 'EMPLOYEE', dept: 'Engineering', timezone: 'Asia/Manila', manager: 'manager@acme.test', schedule: 'day', badge: '0011', enrolledWith: 'Face' },
  { email: 'kim.navarro@acme.test', fullName: 'Kim Navarro', title: 'Operations Analyst', role: 'EMPLOYEE', dept: 'Operations', timezone: 'Asia/Manila', manager: 'admin@acme.test', schedule: 'day', badge: '0013', enrolledWith: 'Face' },
  { email: 'ryan.torres@acme.test', fullName: 'Ryan Torres', title: 'Sales Development Rep', role: 'EMPLOYEE', dept: 'Sales', timezone: 'Asia/Manila', manager: 'sales.manager@acme.test', schedule: 'day', badge: '0016', enrolledWith: 'Fingerprint' },
  { email: 'joy.delacruz@acme.test', fullName: 'Joy Dela Cruz', title: 'Recruiter', role: 'EMPLOYEE', dept: 'Human Resources', timezone: 'Asia/Manila', manager: 'hr@acme.test', schedule: 'mid', badge: '0041', enrolledWith: 'Face' },
  { email: 'kevin.lim@acme.test', fullName: 'Kevin Lim', title: 'Graphic Designer', role: 'EMPLOYEE', dept: 'Operations', timezone: 'Asia/Manila', manager: 'admin@acme.test', schedule: 'day' },
  { email: 'nico.ramos@acme.test', fullName: 'Nico Ramos', title: 'Backend Engineer', role: 'EMPLOYEE', dept: 'Engineering', timezone: 'Asia/Manila', manager: 'manager@acme.test', setup: 'REMOTE', schedule: 'day' },
  { email: 'tess.bautista@acme.test', fullName: 'Tess Bautista', title: 'DevOps Engineer', role: 'EMPLOYEE', dept: 'Engineering', timezone: 'Asia/Manila', manager: 'manager@acme.test', setup: 'REMOTE', schedule: 'day' },
  { email: 'bea.villanueva@acme.test', fullName: 'Bea Villanueva', title: 'Frontend Engineer', role: 'EMPLOYEE', dept: 'Engineering', timezone: 'Asia/Manila', manager: 'manager@acme.test', setup: 'REMOTE', schedule: 'day' },
  { email: 'sam.porter@acme.test', fullName: 'Sam Porter', title: 'Account Executive', role: 'EMPLOYEE', dept: 'Sales', timezone: 'America/New_York', manager: 'sales.manager@acme.test', setup: 'REMOTE', schedule: 'night' },
  // Leaders: placeholders until the real names are confirmed. Attendance isn't tracked for them.
  { email: 'pastor@acme.test', fullName: 'Ptr. Joel Santiago', title: 'Senior Pastor', role: 'ADMIN', dept: 'Leadership', timezone: 'Asia/Manila', tracked: false },
  { email: 'andrew.tan@acme.test', fullName: 'Andrew Tan', title: 'Agency CEO', role: 'MANAGER', dept: 'Leadership', timezone: 'Asia/Manila', manager: 'pastor@acme.test', tracked: false },
  { email: 'rachel.uy@acme.test', fullName: 'Rachel Uy', title: 'Agency CEO', role: 'MANAGER', dept: 'Leadership', timezone: 'Asia/Manila', manager: 'pastor@acme.test', tracked: false },
  { email: 'ben.ocampo@acme.test', fullName: 'Ben Ocampo', title: 'Agency CEO', role: 'MANAGER', dept: 'Leadership', timezone: 'Asia/Manila', manager: 'pastor@acme.test', tracked: false },
  { email: 'faith.castillo@acme.test', fullName: 'Faith Castillo', title: 'Agency CEO', role: 'MANAGER', dept: 'Leadership', timezone: 'Asia/Manila', manager: 'pastor@acme.test', tracked: false },
];

/** Work schedules, all written in Manila time. */
export const SEED_SCHEDULES: Record<ScheduleKey, { name: string; start: string; end: string; onsiteDays?: number[] }> = {
  day: { name: 'Day shift', start: '08:00', end: '17:00' },
  mid: { name: 'Mid shift', start: '10:00', end: '19:00' },
  night: { name: 'US hours (night shift)', start: '21:00', end: '06:00' },
  hybrid: { name: 'Hybrid, on-site Mon/Wed/Thu', start: '08:00', end: '17:00', onsiteDays: [1, 3, 4] },
};

export const SEED_DEVICES = [
  { key: 'main', name: 'Main entrance terminal', model: 'Face and fingerprint terminal', serialNumber: 'CCMAIN0001', location: 'Ground floor lobby', connection: 'PUSH' as const },
  { key: 'studio', name: '2F Studio terminal', model: 'Fingerprint terminal', serialNumber: 'CCSTUDIO02', location: '2nd floor studio', connection: 'AGENT' as const },
  { key: 'warehouse', name: 'Warehouse unit', model: 'Older fingerprint unit, no network', serialNumber: null, location: 'Warehouse', connection: 'FILE' as const },
];

const DEPARTMENTS: { name: string; head: string }[] = [
  { name: 'Operations', head: 'admin@acme.test' },
  { name: 'Engineering', head: 'manager@acme.test' },
  { name: 'Sales', head: 'sales.manager@acme.test' },
  { name: 'Human Resources', head: 'hr@acme.test' },
  { name: 'Leadership', head: 'pastor@acme.test' },
];

export async function seed(url = process.env.DATABASE_URL!) {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== '1') {
    throw new Error('Refusing to seed a production database');
  }
  const pool = createPool(url);
  const db = createDb(pool);
  try {
    await db.insert(orgSettings).values({ id: 1, companyName: 'Acme Corp' }).onConflictDoNothing();

    const deptIds = new Map<string, string>();
    for (const d of DEPARTMENTS) {
      const [row] = await db
        .insert(departments)
        .values({ name: d.name })
        .onConflictDoUpdate({ target: departments.name, set: { name: d.name } })
        .returning();
      deptIds.set(d.name, row.id);
    }

    const passwordHash = await hashPassword(SEED_PASSWORD);
    const userIds = new Map<string, string>();
    // Two passes so managers exist before their reports reference them.
    for (const u of SEED_USERS) {
      const values = {
        email: u.email,
        fullName: u.fullName,
        title: u.title,
        role: u.role,
        timezone: u.timezone,
        departmentId: deptIds.get(u.dept)!,
        status: u.deactivated ? ('DEACTIVATED' as const) : ('ACTIVE' as const),
        deactivatedAt: u.deactivated ? new Date() : null,
        passwordHash: u.password === false ? null : passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        workSetup: u.setup ?? ('ONSITE' as const),
        attendanceTracked: u.tracked ?? true,
      };
      const [row] = await db
        .insert(users)
        .values(values)
        .onConflictDoUpdate({ target: users.email, set: values })
        .returning({ id: users.id });
      userIds.set(u.email, row.id);
    }
    for (const u of SEED_USERS) {
      await db
        .update(users)
        .set({ managerId: u.manager ? userIds.get(u.manager)! : null })
        .where(eq(users.id, userIds.get(u.email)!));
    }
    for (const d of DEPARTMENTS) {
      await db.update(departments).set({ headUserId: userIds.get(d.head)! }).where(eq(departments.id, deptIds.get(d.name)!));
    }

    // ---- Phase 2: attendance rules, schedules, devices, badge links
    await db.insert(attendanceSettings).values({ id: 1 }).onConflictDoNothing();
    const scheduleIds = new Map<ScheduleKey, string>();
    for (const [key, sc] of Object.entries(SEED_SCHEDULES) as [ScheduleKey, (typeof SEED_SCHEDULES)[ScheduleKey]][]) {
      const [row] = await db
        .insert(workSchedules)
        .values({ name: sc.name, timezone: 'Asia/Manila' })
        .onConflictDoUpdate({ target: workSchedules.name, set: { timezone: 'Asia/Manila' } })
        .returning();
      scheduleIds.set(key, row.id);
      await db.delete(scheduleDays).where(eq(scheduleDays.scheduleId, row.id));
      await db.insert(scheduleDays).values(
        [1, 2, 3, 4, 5].map((weekday) => ({
          scheduleId: row.id,
          weekday,
          startTime: sc.start,
          endTime: sc.end,
          onsite: sc.onsiteDays ? sc.onsiteDays.includes(weekday) : true,
        })),
      );
    }
    for (const u of SEED_USERS) {
      if (!u.schedule) continue;
      await db
        .insert(scheduleAssignments)
        .values({ userId: userIds.get(u.email)!, scheduleId: scheduleIds.get(u.schedule)!, effectiveFrom: '2026-01-01' })
        .onConflictDoUpdate({
          target: [scheduleAssignments.userId, scheduleAssignments.effectiveFrom],
          set: { scheduleId: scheduleIds.get(u.schedule)! },
        });
    }
    const deviceIds = new Map<string, string>();
    for (const d of SEED_DEVICES) {
      const existing = await db.query.devices.findFirst({ where: eq(devices.name, d.name) });
      const values = { name: d.name, model: d.model, serialNumber: d.serialNumber, location: d.location, connection: d.connection, timezone: 'Asia/Manila' };
      const [row] = existing
        ? await db.update(devices).set(values).where(eq(devices.id, existing.id)).returning()
        : await db.insert(devices).values(values).returning();
      deviceIds.set(d.key, row.id);
    }
    for (const u of SEED_USERS) {
      if (!u.badge) continue;
      const values = { deviceUserId: u.badge, userId: userIds.get(u.email)!, enrolledWith: u.enrolledWith ?? null };
      await db.insert(deviceUserLinks).values(values).onConflictDoUpdate({ target: deviceUserLinks.deviceUserId, set: values });
    }

    return { departments: deptIds, users: userIds, schedules: scheduleIds, devices: deviceIds };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seeded. Sign in with any of these (password: %s):', SEED_PASSWORD);
      for (const u of SEED_USERS) {
        const note = u.deactivated ? ' (deactivated)' : u.password === false ? ' (invite pending, no password)' : '';
        console.log(`  ${u.role.padEnd(8)} ${u.email}${note}`);
      }
      console.log('For sample punches on the attendance board, run: pnpm --filter @vo/api db:seed:demo');
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
