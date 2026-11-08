/**
 * Virtual Office schema.
 * Phase 1: auth, roles, users, login/logout logging, audit.
 * Phase 2: schedules, punches (web + biometric), computed attendance days, exceptions, corrections, devices.
 * Phase 3: office floor rooms, room members, presence (room, chosen status, last seen).
 * All timestamps are `timestamptz` (stored in UTC). Tables/columns use snake_case.
 * Generate a migration after editing: `pnpm --filter @vo/api db:generate`
 */
import { relations } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  AUTH_EVENT_TYPES,
  CORRECTION_ACTIONS,
  CORRECTION_STATUSES,
  DAY_OVERRIDE_KINDS,
  DAY_STATUSES,
  DEFAULT_RULES,
  DEVICE_CONNECTIONS,
  EXCEPTION_STATUSES,
  EXCEPTION_TYPES,
  FLOOR_SPOTS,
  MANUAL_STATUSES,
  PUNCH_KINDS,
  PUNCH_SOURCES,
  ROLES,
  ROOM_KINDS,
  USER_STATUSES,
  WORK_SETUPS,
} from '@vo/shared';

const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () =>
  ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const roleEnum = pgEnum('role', ROLES);
export const userStatusEnum = pgEnum('user_status', USER_STATUSES);
export const authEventTypeEnum = pgEnum('auth_event_type', AUTH_EVENT_TYPES);
export const tokenPurposeEnum = pgEnum('token_purpose', ['PASSWORD_RESET', 'INVITE']);
export const workSetupEnum = pgEnum('work_setup', WORK_SETUPS);
export const punchSourceEnum = pgEnum('punch_source', PUNCH_SOURCES);
export const punchKindEnum = pgEnum('punch_kind', PUNCH_KINDS);
export const dayStatusEnum = pgEnum('day_status', DAY_STATUSES);
export const dayOverrideKindEnum = pgEnum('day_override_kind', DAY_OVERRIDE_KINDS);
export const exceptionTypeEnum = pgEnum('exception_type', EXCEPTION_TYPES);
export const exceptionStatusEnum = pgEnum('exception_status', EXCEPTION_STATUSES);
export const correctionStatusEnum = pgEnum('correction_status', CORRECTION_STATUSES);
export const correctionActionEnum = pgEnum('correction_action', CORRECTION_ACTIONS);
export const deviceConnectionEnum = pgEnum('device_connection', DEVICE_CONNECTIONS);
export const roomKindEnum = pgEnum('room_kind', ROOM_KINDS);
export const floorSpotEnum = pgEnum('floor_spot', FLOOR_SPOTS);
export const manualStatusEnum = pgEnum('manual_status', MANUAL_STATUSES);
export const preferSourceEnum = pgEnum('prefer_source', ['WEB', 'DEVICE']);

/** Single-row table of company-wide settings (id is always 1). */
export const orgSettings = pgTable('org_settings', {
  id: integer('id').primaryKey().default(1),
  companyName: text('company_name').notNull().default('Acme Corp'),
  primaryColor: text('primary_color').notNull().default('#2563eb'),
  logoUrl: text('logo_url'),
  defaultTimezone: text('default_timezone').notNull().default('Asia/Manila'),
  sessionTimeoutMinutes: integer('session_timeout_minutes').notNull().default(30),
  updatedAt: updatedAt(),
});

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  headUserId: uuid('head_user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** stored lower-case */
    email: text('email').notNull().unique(),
    /** argon2id hash; null until an invited user sets a password (or SSO-only) */
    passwordHash: text('password_hash'),
    fullName: text('full_name').notNull(),
    title: text('title'),
    avatarUrl: text('avatar_url'),
    role: roleEnum('role').notNull().default('EMPLOYEE'),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    timezone: text('timezone').notNull().default('Asia/Manila'),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    managerId: uuid('manager_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    /** TOTP secret, AES-256-GCM encrypted. Set during setup, active once mfaEnabled. */
    mfaSecretEnc: text('mfa_secret_enc'),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: ts('locked_until'),
    passwordChangedAt: ts('password_changed_at'),
    lastLoginAt: ts('last_login_at'),
    deactivatedAt: ts('deactivated_at'),
    /** false for leaders (Senior Pastor, agency CEOs): no clock, not on the attendance board */
    attendanceTracked: boolean('attendance_tracked').notNull().default(true),
    workSetup: workSetupEnum('work_setup').notNull().default('ONSITE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('users_department_idx').on(t.departmentId),
    index('users_manager_idx').on(t.managerId),
    index('users_status_idx').on(t.status),
  ],
);

export const ssoIdentities = pgTable(
  'sso_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('sso_provider_subject_uq').on(t.provider, t.subject), index('sso_user_idx').on(t.userId)],
);

/** One row per signed-in browser. Revoking it signs that browser out on its next request. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** sha256 of the current refresh-token secret (rotated on every refresh) */
    refreshHash: text('refresh_hash').notNull(),
    /** previous hash, still accepted for a few seconds so two tabs refreshing at once don't trip reuse detection */
    previousRefreshHash: text('previous_refresh_hash'),
    refreshRotatedAt: ts('refresh_rotated_at'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    browser: text('browser'),
    os: text('os'),
    device: text('device'),
    authMethod: text('auth_method').notNull().default('password'),
    createdAt: createdAt(),
    /** last real user activity (drives the inactivity timeout), not background polling */
    lastActivityAt: ts('last_activity_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
    revokedReason: text('revoked_reason'),
    revokedById: uuid('revoked_by_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('sessions_user_active_idx').on(t.userId, t.revokedAt)],
);

/** Login/logout history: every sign-in, failure, sign-out, timeout and forced logout. */
export const authEvents = pgTable(
  'auth_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** email as typed; kept for failed attempts against unknown accounts */
    email: text('email'),
    sessionId: uuid('session_id'),
    type: authEventTypeEnum('type').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    browser: text('browser'),
    os: text('os'),
    detail: text('detail'),
    createdAt: createdAt(),
  },
  (t) => [
    index('auth_events_user_idx').on(t.userId, t.createdAt),
    index('auth_events_type_idx').on(t.type, t.createdAt),
    index('auth_events_created_idx').on(t.createdAt),
  ],
);

/** Single-use tokens for password reset and account invites (only the sha256 hash is stored). */
export const oneTimeTokens = pgTable(
  'one_time_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: tokenPurposeEnum('purpose').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('ott_user_purpose_idx').on(t.userId, t.purpose)],
);

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: ts('used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('mfa_codes_user_idx').on(t.userId)],
);

/** Append-only record of administrative changes. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entityType, t.entityId),
    index('audit_actor_idx').on(t.actorId, t.createdAt),
    index('audit_created_idx').on(t.createdAt),
  ],
);

/* ---------------- Phase 2: attendance ---------------- */

const dateCol = (name: string) => date(name, { mode: 'string' });

/** Single row (id 1) of attendance rules, editable by HR. */
export const attendanceSettings = pgTable('attendance_settings', {
  id: integer('id').primaryKey().default(1),
  graceMinutes: integer('grace_minutes').notNull().default(DEFAULT_RULES.graceMinutes),
  duplicateWindowMinutes: integer('duplicate_window_minutes').notNull().default(DEFAULT_RULES.duplicateWindowMinutes),
  mismatchMinutes: integer('mismatch_minutes').notNull().default(DEFAULT_RULES.mismatchMinutes),
  noPunchAfterMinutes: integer('no_punch_after_minutes').notNull().default(DEFAULT_RULES.noPunchAfterMinutes),
  missingOutAfterMinutes: integer('missing_out_after_minutes').notNull().default(DEFAULT_RULES.missingOutAfterMinutes),
  autoClockOutHours: integer('auto_clock_out_hours').notNull().default(DEFAULT_RULES.autoClockOutHours),
  deviceWinsOnsite: boolean('device_wins_onsite').notNull().default(DEFAULT_RULES.deviceWinsOnsite),
  updatedAt: updatedAt(),
});

export const workSchedules = pgTable('work_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  timezone: text('timezone').notNull().default('Asia/Manila'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One row per working weekday. end <= start means the shift ends the next day. */
export const scheduleDays = pgTable(
  'schedule_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => workSchedules.id, { onDelete: 'cascade' }),
    /** ISO weekday 1 = Monday ... 7 = Sunday */
    weekday: integer('weekday').notNull(),
    /** 'HH:MM' wall-clock in the schedule's time zone */
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    /** for Hybrid people: an on-site day */
    onsite: boolean('onsite').notNull().default(true),
  },
  (t) => [uniqueIndex('schedule_days_uq').on(t.scheduleId, t.weekday)],
);

/** Which schedule a person follows from a date onward (latest effective_from <= date wins). */
export const scheduleAssignments = pgTable(
  'schedule_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scheduleId: uuid('schedule_id').references(() => workSchedules.id, { onDelete: 'cascade' }),
    effectiveFrom: dateCol('effective_from').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('schedule_assignments_uq').on(t.userId, t.effectiveFrom)],
);

/** Leave, a day off, or a one-off shift for one person on one date. */
export const dayOverrides = pgTable(
  'day_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: dateCol('work_date').notNull(),
    kind: dayOverrideKindEnum('kind').notNull(),
    startTime: text('start_time'),
    endTime: text('end_time'),
    onsite: boolean('onsite'),
    note: text('note'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('day_overrides_uq').on(t.userId, t.workDate)],
);

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  model: text('model'),
  /** device serial (ADMS "SN"); required for cloud push */
  serialNumber: text('serial_number').unique(),
  location: text('location'),
  connection: deviceConnectionEnum('connection').notNull(),
  /** the zone the device's own clock is set to; device times arrive without an offset */
  timezone: text('timezone').notNull().default('Asia/Manila'),
  /** comma-separated IPs allowed to push; empty = any */
  allowedIps: text('allowed_ips'),
  /** sha256 of the device/agent token */
  tokenHash: text('token_hash'),
  active: boolean('active').notNull().default(true),
  lastSeenAt: ts('last_seen_at'),
  lastPunchAt: ts('last_punch_at'),
  /** ADMS ATTLOG stamp the device last uploaded */
  lastStamp: text('last_stamp'),
  syncRequestedAt: ts('sync_requested_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A device user / badge ID (the number enrolled on the terminals) linked to an employee. */
export const deviceUserLinks = pgTable('device_user_links', {
  deviceUserId: text('device_user_id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  enrolledWith: text('enrolled_with'),
  linkedById: uuid('linked_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  total: integer('total').notNull().default(0),
  added: integer('added').notNull().default(0),
  duplicates: integer('duplicates').notNull().default(0),
  unknownUserIds: jsonb('unknown_user_ids').$type<string[]>().notNull().default([]),
  errors: jsonb('errors').$type<string[]>().notNull().default([]),
  uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

/** Every raw punch. Nothing is deleted: HR edits mark punches as removed and add HR punches. */
export const punches = pgTable(
  'punches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** null until the device user ID is linked to someone */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** the shift this punch belongs to (an overnight shift keeps its start date) */
    workDate: dateCol('work_date'),
    source: punchSourceEnum('source').notNull(),
    /** explicit kind from the web clock or HR; device punches leave it empty and the rules decide */
    kind: punchKindEnum('kind'),
    punchedAt: ts('punched_at').notNull(),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    deviceUserId: text('device_user_id'),
    /** how the device read the person: fingerprint, face, card, password */
    verify: text('verify'),
    /** 'push' | 'agent' | 'file' | 'web' | 'hr' | 'auto' */
    via: text('via').notNull(),
    location: text('location'),
    ip: text('ip'),
    note: text('note'),
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, { onDelete: 'set null' }),
    /** set by the rules: within the duplicate window of an earlier punch */
    merged: boolean('merged').notNull().default(false),
    /** removed by HR or replaced by an approved correction */
    removedAt: ts('removed_at'),
    removedById: uuid('removed_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('punches_user_date_idx').on(t.userId, t.workDate),
    index('punches_at_idx').on(t.punchedAt),
    index('punches_badge_idx').on(t.deviceUserId),
    // re-importing or re-sending the same device log never duplicates a punch
    uniqueIndex('punches_device_uq').on(t.deviceId, t.deviceUserId, t.punchedAt),
  ],
);

/** The computed result for one person and work date (rebuilt from punches whenever they change). */
export const attendanceDays = pgTable(
  'attendance_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: dateCol('work_date').notNull(),
    status: dayStatusEnum('status').notNull(),
    scheduleStart: ts('schedule_start'),
    scheduleEnd: ts('schedule_end'),
    onsite: boolean('onsite').notNull().default(true),
    firstIn: ts('first_in'),
    lastOut: ts('last_out'),
    openSince: ts('open_since'),
    workedMinutes: integer('worked_minutes').notNull().default(0),
    breakMinutes: integer('break_minutes').notNull().default(0),
    lateMinutes: integer('late_minutes').notNull().default(0),
    mergedCount: integer('merged_count').notNull().default(0),
    /** HR decisions that survive recomputation */
    excused: boolean('excused').notNull().default(false),
    preferSource: preferSourceEnum('prefer_source'),
    note: text('note'),
    computedAt: ts('computed_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('attendance_days_uq').on(t.userId, t.workDate), index('attendance_days_date_idx').on(t.workDate)],
);

export const attendanceExceptions = pgTable(
  'attendance_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** TYPE:subject:date, so the same exception is never raised twice */
    key: text('key').notNull().unique(),
    type: exceptionTypeEnum('type').notNull(),
    status: exceptionStatusEnum('status').notNull().default('OPEN'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    deviceUserId: text('device_user_id'),
    workDate: dateCol('work_date').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    resolution: text('resolution'),
    resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: ts('resolved_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('attendance_exceptions_status_idx').on(t.status, t.workDate), index('attendance_exceptions_user_idx').on(t.userId)],
);

/** Employee asks → manager approves → HR approves → the timesheet changes. */
export const correctionRequests = pgTable(
  'correction_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: dateCol('work_date').notNull(),
    action: correctionActionEnum('action').notNull(),
    punchId: uuid('punch_id').references(() => punches.id, { onDelete: 'set null' }),
    kind: punchKindEnum('kind'),
    originalAt: ts('original_at'),
    requestedAt: ts('requested_at'),
    reason: text('reason').notNull(),
    status: correctionStatusEnum('status').notNull(),
    /** who gives the first approval (the requester's manager at the time of asking) */
    managerId: uuid('manager_id').references(() => users.id, { onDelete: 'set null' }),
    managerDecidedAt: ts('manager_decided_at'),
    managerNote: text('manager_note'),
    hrId: uuid('hr_id').references(() => users.id, { onDelete: 'set null' }),
    hrDecidedAt: ts('hr_decided_at'),
    hrNote: text('hr_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('corrections_status_idx').on(t.status), index('corrections_user_idx').on(t.userId), index('corrections_manager_idx').on(t.managerId)],
);

/* ---------------- Phase 3: office floor & presence ---------------- */

/** One room per spot on the floor plan. Admins rename them and choose how each behaves. */
export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  spot: floorSpotEnum('spot').notNull().unique(),
  name: text('name').notNull(),
  kind: roomKindEnum('kind').notNull(),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  /** private office owner / host who can summon people */
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** People who may walk into a PRIVATE or LEADERS room without knocking. */
export const roomMembers = pgTable(
  'room_members',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] }), index('room_members_user_idx').on(t.userId)],
);

/**
 * Where each person last was and what they chose to show. Live connection state is kept in memory;
 * this row survives restarts and reconnects.
 */
export const presence = pgTable('presence', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  enteredAt: ts('entered_at'),
  manualStatus: manualStatusEnum('manual_status'),
  message: text('message'),
  lastSeenAt: ts('last_seen_at'),
  updatedAt: updatedAt(),
});

/* ---------------- relations (for the relational query API) ---------------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
  manager: one(users, { fields: [users.managerId], references: [users.id], relationName: 'manager' }),
  reports: many(users, { relationName: 'manager' }),
  sessions: many(sessions),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  head: one(users, { fields: [departments.headUserId], references: [users.id] }),
  members: many(users),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type Punch = typeof punches.$inferSelect;
export type AttendanceDay = typeof attendanceDays.$inferSelect;
export type AttendanceException = typeof attendanceExceptions.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type CorrectionRequest = typeof correctionRequests.$inferSelect;
export type WorkSchedule = typeof workSchedules.$inferSelect;
export type ScheduleDay = typeof scheduleDays.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Presence = typeof presence.$inferSelect;
