/**
 * Virtual Office schema.
 * Phase 1: auth, roles, users, login/logout logging, audit.
 * Phase 2: schedules, punches (web + biometric), computed attendance days, exceptions, corrections, devices.
 * Phase 3: office floor rooms, room members, presence (room, chosen status, last seen).
 * Phase 4: meetings (scheduled, instant, room calls), invitees, attendance, reminders, recordings, calendar feeds.
 * Phase 5: chat channels, members (read state), messages, reactions, files (stored in the database).
 * All timestamps are `timestamptz` (stored in UTC). Tables/columns use snake_case.
 * Generate a migration after editing: `pnpm --filter @vo/api db:generate`
 */
import { relations, sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  bigserial,
  bigint,
  boolean,
  customType,
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
  CHANNEL_KINDS,
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
  MEETING_KINDS,
  MEETING_STATUSES,
  RECORDING_STATUSES,
  RECURRENCES,
  RSVPS,
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
export const meetingKindEnum = pgEnum('meeting_kind', MEETING_KINDS);
export const meetingStatusEnum = pgEnum('meeting_status', MEETING_STATUSES);
export const recurrenceEnum = pgEnum('recurrence', RECURRENCES);
export const rsvpEnum = pgEnum('rsvp', RSVPS);
export const recordingStatusEnum = pgEnum('recording_status', RECORDING_STATUSES);
export const channelKindEnum = pgEnum('channel_kind', CHANNEL_KINDS);
export const preferSourceEnum = pgEnum('prefer_source', ['WEB', 'DEVICE']);

/** Single-row table of company-wide settings (id is always 1). */
export const orgSettings = pgTable('org_settings', {
  id: integer('id').primaryKey().default(1),
  companyName: text('company_name').notNull().default('Acme Corp'),
  primaryColor: text('primary_color').notNull().default('#2563eb'),
  logoUrl: text('logo_url'),
  defaultTimezone: text('default_timezone').notNull().default('Asia/Manila'),
  sessionTimeoutMinutes: integer('session_timeout_minutes').notNull().default(30),
  /** Phase 4: an Admin allows meeting recordings (they also need storage configured on the server) */
  recordingEnabled: boolean('recording_enabled').notNull().default(false),
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

/* ---------------- Phase 4: meetings ---------------- */

/** Scheduled meetings, instant calls and the ongoing call of each office meeting room. */
export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: meetingKindEnum('kind').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    hostId: uuid('host_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** first occurrence (instant calls: when the call started) */
    startsAt: ts('starts_at').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    timezone: text('timezone').notNull(),
    recurrence: recurrenceEnum('recurrence').notNull().default('NONE'),
    /** last local date a repeating meeting happens on (inclusive) */
    recurrenceUntil: date('recurrence_until'),
    /** where on the office floor it happens (optional); for ROOM calls, the room itself */
    officeRoomId: uuid('office_room_id').references(() => rooms.id, { onDelete: 'set null' }),
    status: meetingStatusEnum('status').notNull().default('ACTIVE'),
    /** bumped on every change so calendar apps replace the old copy */
    sequence: integer('sequence').notNull().default(0),
    endedAt: ts('ended_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('meetings_host_idx').on(t.hostId),
    index('meetings_starts_idx').on(t.startsAt),
    uniqueIndex('meetings_room_call_uq').on(t.officeRoomId).where(sql`kind = 'ROOM'`),
  ],
);

export const meetingInvitees = pgTable(
  'meeting_invitees',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    response: rsvpEnum('response').notNull().default('PENDING'),
    respondedAt: ts('responded_at'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.userId] }), index('meeting_invitees_user_idx').on(t.userId)],
);

/** One row per time someone joined a call (from LiveKit's webhooks). */
export const meetingAttendance = pgTable(
  'meeting_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    occurrenceStart: ts('occurrence_start').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** LiveKit participant session id, so duplicate webhooks are ignored */
    participantSid: text('participant_sid').notNull(),
    joinedAt: ts('joined_at').notNull(),
    leftAt: ts('left_at'),
  },
  (t) => [
    uniqueIndex('meeting_attendance_sid_uq').on(t.participantSid),
    index('meeting_attendance_meeting_idx').on(t.meetingId, t.occurrenceStart),
    index('meeting_attendance_user_idx').on(t.userId),
  ],
);

/** Reminders already sent, so the minute job never sends one twice. */
export const meetingNotifications = pgTable(
  'meeting_notifications',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    occurrenceStart: ts('occurrence_start').notNull(),
    kind: text('kind').notNull(),
    sentAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.occurrenceStart, t.kind] })],
);

export const meetingRecordings = pgTable(
  'meeting_recordings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    occurrenceStart: ts('occurrence_start').notNull(),
    egressId: text('egress_id').notNull().unique(),
    status: recordingStatusEnum('status').notNull().default('STARTING'),
    startedById: uuid('started_by_id').references(() => users.id, { onDelete: 'set null' }),
    startedAt: ts('started_at').notNull(),
    endedAt: ts('ended_at'),
    /** object key in the recordings bucket */
    fileKey: text('file_key'),
    sizeBytes: integer('size_bytes'),
    durationSeconds: integer('duration_seconds'),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('meeting_recordings_meeting_idx').on(t.meetingId)],
);

/** Private calendar subscription links (hash of the secret token). */
export const calendarFeeds = pgTable('calendar_feeds', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  /** the token itself, encrypted (AES-256-GCM), so the link can be shown again */
  tokenEnc: text('token_enc').notNull(),
  createdAt: createdAt(),
});

/* ---------------- Phase 5: chat ---------------- */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: channelKindEnum('kind').notNull(),
    name: text('name'),
    description: text('description'),
    isPrivate: boolean('is_private').notNull().default(false),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'cascade' }),
    /** DMs and group messages: the sorted member ids, so the same people always get the same conversation */
    dmKey: text('dm_key'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    lastSeq: bigint('last_seq', { mode: 'number' }).notNull().default(0),
    lastMessageAt: ts('last_message_at'),
    archivedAt: ts('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('channels_dm_key_uq').on(t.dmKey),
    uniqueIndex('channels_department_uq').on(t.departmentId).where(sql`kind = 'DEPARTMENT'`),
    uniqueIndex('channels_announcements_uq').on(t.kind).where(sql`kind = 'ANNOUNCEMENTS'`),
  ],
);

export const channelMembers = pgTable(
  'channel_members',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadSeq: bigint('last_read_seq', { mode: 'number' }).notNull().default(0),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] }), index('channel_members_user_idx').on(t.userId)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** global, increasing: orders messages and counts unread */
    seq: bigserial('seq', { mode: 'number' }).notNull().unique(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull().default(''),
    mentionIds: uuid('mention_ids').array().notNull().default(sql`'{}'::uuid[]`),
    clientId: text('client_id'),
    editedAt: ts('edited_at'),
    deletedAt: ts('deleted_at'),
    pinnedAt: ts('pinned_at'),
    pinnedById: uuid('pinned_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('messages_channel_seq_idx').on(t.channelId, t.seq),
    uniqueIndex('messages_client_id_uq').on(t.authorId, t.clientId),
    index('messages_mentions_idx').using('gin', t.mentionIds),
    index('messages_search_idx').using('gin', sql`to_tsvector('simple', ${t.body})`),
    index('messages_pinned_idx').on(t.channelId).where(sql`pinned_at IS NOT NULL AND deleted_at IS NULL`),
  ],
);

export const messageReactions = pgTable(
  'message_reactions',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

/** Files shared in chat. Uploaded first (no message yet), then attached when the message is sent. */
export const chatFiles = pgTable(
  'chat_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    uploaderId: uuid('uploader_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    data: bytea('data').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('chat_files_message_idx').on(t.messageId)],
);

export type Channel = typeof channels.$inferSelect;
export type Message = typeof messages.$inferSelect;

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
export type Meeting = typeof meetings.$inferSelect;
export type MeetingRecording = typeof meetingRecordings.$inferSelect;
