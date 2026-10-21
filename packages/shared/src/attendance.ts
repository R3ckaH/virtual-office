import { z } from 'zod';
import { DATE_RE, isValidTimeZone, TIME_RE } from './time';

/* ------------------------------------------------------------------ */
/* Attendance enums                                                    */
/* ------------------------------------------------------------------ */

export const WORK_SETUPS = ['ONSITE', 'REMOTE', 'HYBRID'] as const;
export type WorkSetup = (typeof WORK_SETUPS)[number];
export const WORK_SETUP_LABELS: Record<WorkSetup, string> = { ONSITE: 'On-site', REMOTE: 'Remote', HYBRID: 'Hybrid' };

/** WEB = Virtual Office clock, DEVICE = biometric terminal (push, agent or file), HR = added by HR, SYSTEM = auto clock-out */
export const PUNCH_SOURCES = ['WEB', 'DEVICE', 'HR', 'SYSTEM'] as const;
export type PunchSource = (typeof PUNCH_SOURCES)[number];

export const PUNCH_KINDS = ['IN', 'OUT', 'BREAK_START', 'BREAK_END'] as const;
export type PunchKind = (typeof PUNCH_KINDS)[number];
export const PUNCH_KIND_LABELS: Record<PunchKind, string> = {
  IN: 'Clock in',
  OUT: 'Clock out',
  BREAK_START: 'Break out',
  BREAK_END: 'Back from break',
};

export const DAY_STATUSES = [
  'OFF', // not scheduled, no punches
  'SCHEDULED', // shift hasn't started yet
  'NO_PUNCH', // shift started, nothing yet
  'ON_TIME', // working, arrived on time
  'WORKING', // working on an unscheduled day
  'LATE',
  'EXCUSED', // late, excused by HR
  'ON_BREAK',
  'MISMATCH', // web and biometric times don't match
  'MISSING_OUT',
  'DONE',
  'ABSENT', // shift over, never punched
  'LEAVE',
  'DAY_OFF',
] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];
export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  OFF: 'Off',
  SCHEDULED: 'Not started',
  NO_PUNCH: 'No punch yet',
  ON_TIME: 'On time',
  WORKING: 'Working',
  LATE: 'Late',
  EXCUSED: 'Late, excused',
  ON_BREAK: 'On break',
  MISMATCH: 'Times don’t match',
  MISSING_OUT: 'Missing clock-out',
  DONE: 'Shift done',
  ABSENT: 'Absent',
  LEAVE: 'On leave',
  DAY_OFF: 'Day off',
};
/** Statuses that mean the person is clocked in right now */
export const WORKING_STATUSES: readonly DayStatus[] = ['ON_TIME', 'WORKING', 'LATE', 'EXCUSED', 'ON_BREAK', 'MISMATCH', 'MISSING_OUT'];
/** Statuses shown under "Needs attention" */
export const FLAGGED_STATUSES: readonly DayStatus[] = ['LATE', 'NO_PUNCH', 'MISSING_OUT', 'MISMATCH', 'ABSENT'];

export const DAY_OVERRIDE_KINDS = ['LEAVE', 'DAY_OFF', 'SHIFT'] as const;
export type DayOverrideKind = (typeof DAY_OVERRIDE_KINDS)[number];

export const EXCEPTION_TYPES = ['UNLINKED_BADGE', 'MISSING_OUT', 'MISMATCH', 'NO_PUNCH', 'LATE', 'DUPLICATES'] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];
export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  UNLINKED_BADGE: 'Unlinked badge',
  MISSING_OUT: 'Missing clock-out',
  MISMATCH: 'Web and biometric don’t match',
  NO_PUNCH: 'No punch',
  LATE: 'Late',
  DUPLICATES: 'Duplicate punches',
};

/** OPEN needs HR; RESOLVED was handled by a person; DISMISSED stopped applying (e.g. the person punched in) */
export const EXCEPTION_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

export const CORRECTION_STATUSES = ['PENDING_MANAGER', 'PENDING_HR', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

export const CORRECTION_ACTIONS = ['ADD', 'CHANGE', 'REMOVE'] as const;
export type CorrectionAction = (typeof CORRECTION_ACTIONS)[number];

export const DEVICE_CONNECTIONS = ['PUSH', 'AGENT', 'FILE'] as const;
export type DeviceConnection = (typeof DEVICE_CONNECTIONS)[number];
export const DEVICE_CONNECTION_LABELS: Record<DeviceConnection, string> = {
  PUSH: 'Cloud push',
  AGENT: 'Office sync agent',
  FILE: 'File import',
};

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

export const attendanceRulesSchema = z.object({
  graceMinutes: z.coerce.number().int().min(0).max(120),
  duplicateWindowMinutes: z.coerce.number().int().min(0).max(30),
  mismatchMinutes: z.coerce.number().int().min(1).max(240),
  noPunchAfterMinutes: z.coerce.number().int().min(5).max(720),
  missingOutAfterMinutes: z.coerce.number().int().min(5).max(720),
  autoClockOutHours: z.coerce.number().int().min(4).max(24),
  /** On on-site days the biometric time counts over a web clock-in */
  deviceWinsOnsite: z.boolean(),
});
export type AttendanceRules = z.infer<typeof attendanceRulesSchema>;

export const DEFAULT_RULES: AttendanceRules = {
  graceMinutes: 5,
  duplicateWindowMinutes: 2,
  mismatchMinutes: 15,
  noPunchAfterMinutes: 120,
  missingOutAfterMinutes: 60,
  autoClockOutHours: 14,
  deviceWinsOnsite: true,
};

/* ------------------------------------------------------------------ */
/* Input schemas                                                       */
/* ------------------------------------------------------------------ */

const uuid = z.string().uuid();
export const dateSchema = z.string().regex(DATE_RE, 'Use YYYY-MM-DD');
export const timeSchema = z.string().regex(TIME_RE, 'Use HH:MM (24-hour)');
const isoDateTime = z.string().datetime({ offset: true, message: 'Use an ISO date and time' });
const tzSchema = z.string().refine(isValidTimeZone, 'Unknown time zone');
const note = z.string().trim().max(500);

export const clockSchema = z.object({
  action: z.enum(PUNCH_KINDS),
  note: note.optional(),
});
export type ClockInput = z.infer<typeof clockSchema>;

export const dateQuerySchema = z.object({ date: dateSchema.optional() });
export type DateQuery = z.infer<typeof dateQuerySchema>;

export const rangeQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((v) => v.from <= v.to, { message: 'From must be on or before To', path: ['to'] });
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

export const scheduleDaySchema = z.object({
  /** ISO weekday: 1 = Monday ... 7 = Sunday */
  weekday: z.number().int().min(1).max(7),
  start: timeSchema,
  end: timeSchema,
  /** For Hybrid people: is this an on-site day? */
  onsite: z.boolean().default(true),
});
export type ScheduleDayInput = z.infer<typeof scheduleDaySchema>;

export const scheduleSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  timezone: tzSchema,
  days: z
    .array(scheduleDaySchema)
    .max(7)
    .refine((d) => new Set(d.map((x) => x.weekday)).size === d.length, 'Each weekday can appear once'),
});
export type ScheduleInput = z.infer<typeof scheduleSchema>;

export const personSetupSchema = z.object({
  workSetup: z.enum(WORK_SETUPS).optional(),
  attendanceTracked: z.boolean().optional(),
  scheduleId: uuid.nullable().optional(),
  /** When the schedule change takes effect (defaults to today) */
  effectiveFrom: dateSchema.optional(),
});
export type PersonSetupInput = z.infer<typeof personSetupSchema>;

export const dayOverrideSchema = z
  .object({
    userId: uuid,
    date: dateSchema,
    kind: z.enum(DAY_OVERRIDE_KINDS),
    start: timeSchema.optional(),
    end: timeSchema.optional(),
    onsite: z.boolean().optional(),
    note: note.optional(),
  })
  .refine((v) => v.kind !== 'SHIFT' || (v.start && v.end), { message: 'A custom shift needs a start and end', path: ['start'] });
export type DayOverrideInput = z.infer<typeof dayOverrideSchema>;

export const resolveExceptionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('EXCUSE'), note: note.optional() }),
  z.object({ action: z.literal('KEEP'), note: note.optional() }),
  z.object({ action: z.literal('ACK'), note: note.optional() }),
  z.object({ action: z.literal('SET_CLOCK_OUT'), at: isoDateTime, note: note.optional() }),
  z.object({ action: z.literal('USE_DEVICE'), note: note.optional() }),
  z.object({ action: z.literal('USE_WEB'), note: note.optional() }),
  z.object({ action: z.literal('LINK_BADGE'), userId: uuid, note: note.optional() }),
]);
export type ResolveExceptionInput = z.infer<typeof resolveExceptionSchema>;

export const adjustTimesSchema = z
  .object({
    in: isoDateTime,
    out: isoDateTime.nullable(),
    reason: z.string().trim().min(3, 'Say why the times changed').max(500),
  })
  .refine((v) => !v.out || v.out > v.in, { message: 'Clock-out must be after clock-in', path: ['out'] });
export type AdjustTimesInput = z.infer<typeof adjustTimesSchema>;

export const dayNoteSchema = z.object({ note: note.nullable() });
export type DayNoteInput = z.infer<typeof dayNoteSchema>;

export const createCorrectionSchema = z
  .object({
    date: dateSchema,
    action: z.enum(CORRECTION_ACTIONS),
    /** the punch to change or remove */
    punchId: uuid.optional(),
    kind: z.enum(PUNCH_KINDS).optional(),
    /** the corrected time (ADD and CHANGE) */
    at: isoDateTime.optional(),
    reason: z.string().trim().min(5, 'Tell your manager what happened').max(1000),
  })
  .refine((v) => v.action === 'REMOVE' || !!v.at, { message: 'Pick the correct time', path: ['at'] })
  .refine((v) => v.action === 'ADD' || !!v.punchId, { message: 'Pick the punch to fix', path: ['punchId'] })
  .refine((v) => v.action !== 'ADD' || !!v.kind, { message: 'Pick clock in or clock out', path: ['kind'] });
export type CreateCorrectionInput = z.infer<typeof createCorrectionSchema>;

export const decisionSchema = z.object({
  approve: z.boolean(),
  note: note.optional(),
});
export type DecisionInput = z.infer<typeof decisionSchema>;

export const listCorrectionsQuerySchema = z.object({
  status: z.enum(CORRECTION_STATUSES).optional(),
});
export type ListCorrectionsQuery = z.infer<typeof listCorrectionsQuerySchema>;

export const listExceptionsQuerySchema = z.object({
  status: z.enum(EXCEPTION_STATUSES).optional(),
  date: dateSchema.optional(),
});
export type ListExceptionsQuery = z.infer<typeof listExceptionsQuerySchema>;

export const deviceSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  model: z.string().trim().max(120).nullable().optional(),
  serialNumber: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/, 'Letters, numbers, - and _ only')
    .nullable()
    .optional(),
  location: z.string().trim().max(120).nullable().optional(),
  connection: z.enum(DEVICE_CONNECTIONS),
  /** time zone the device's clock is set to */
  timezone: tzSchema,
  /** optional comma-separated list of IPs allowed to push for this device */
  allowedIps: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

export const linkDeviceUserSchema = z.object({
  userId: uuid.nullable(),
  enrolledWith: z.string().trim().max(60).nullable().optional(),
});
export type LinkDeviceUserInput = z.infer<typeof linkDeviceUserSchema>;

const DEVICE_LOCAL_TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

/** Punches sent by the sync agent or a device that can post JSON */
export const ingestSchema = z.object({
  punches: z
    .array(
      z.object({
        deviceUserId: z.string().trim().min(1).max(32),
        /** ISO with offset, or the device's local wall-clock time 'YYYY-MM-DD HH:MM:SS' */
        at: z.string().refine((v) => DEVICE_LOCAL_TIME.test(v) || !Number.isNaN(Date.parse(v)), 'Unreadable time'),
        verify: z.string().trim().max(30).optional(),
        status: z.coerce.number().int().optional(),
      }),
    )
    .max(5000),
});
export type IngestInput = z.infer<typeof ingestSchema>;

/* ------------------------------------------------------------------ */
/* DTOs                                                                */
/* ------------------------------------------------------------------ */

export interface PunchDto {
  id: string;
  at: string;
  source: PunchSource;
  kind: PunchKind | null;
  /** what the punch counted as after the rules ran */
  role: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END' | 'MERGED' | 'NOT_USED' | 'REMOVED';
  deviceId: string | null;
  deviceName: string | null;
  deviceUserId: string | null;
  verify: string | null;
  location: string | null;
  note: string | null;
  createdByName: string | null;
}

export interface AttendanceDayDto {
  userId: string;
  workDate: string;
  status: DayStatus;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  onsite: boolean;
  firstIn: string | null;
  lastOut: string | null;
  /** start of the segment being worked right now, so screens can count up live */
  openSince: string | null;
  workedMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  excused: boolean;
  preferSource: 'WEB' | 'DEVICE' | null;
  mergedCount: number;
  note: string | null;
  computedAt: string;
}

export interface PersonRefDto {
  id: string;
  fullName: string;
  title: string | null;
  avatarUrl: string | null;
  departmentName: string | null;
}

export interface BoardRowDto {
  user: PersonRefDto;
  workSetup: WorkSetup;
  scheduleLabel: string | null;
  day: AttendanceDayDto | null;
  inSource: PunchSource | null;
  bothSources: boolean;
  note: string | null;
}

export interface BoardDto {
  date: string;
  timezone: string;
  generatedAt: string;
  kpis: {
    working: number;
    onsite: number;
    remote: number;
    late: number;
    noPunch: number;
    onLeave: number;
    openExceptions: number;
    pendingCorrections: number;
  };
  rows: BoardRowDto[];
  untracked: { count: number; names: string[] };
}

export interface LivePunchDto {
  id: string;
  at: string;
  userId: string | null;
  name: string;
  what: string;
  source: PunchSource;
  where: string | null;
}

export interface ExceptionDto {
  id: string;
  type: ExceptionType;
  status: ExceptionStatus;
  userId: string | null;
  userName: string | null;
  workDate: string;
  deviceUserId: string | null;
  title: string;
  detail: string;
  /** suggested clock-out (end of shift) for MISSING_OUT */
  suggestedOut: string | null;
  resolution: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface CorrectionDto {
  id: string;
  userId: string;
  userName: string;
  workDate: string;
  action: CorrectionAction;
  kind: PunchKind | null;
  punchId: string | null;
  originalAt: string | null;
  requestedAt: string | null;
  summary: string;
  reason: string;
  status: CorrectionStatus;
  managerId: string | null;
  managerName: string | null;
  managerDecidedAt: string | null;
  managerNote: string | null;
  hrName: string | null;
  hrDecidedAt: string | null;
  hrNote: string | null;
  createdAt: string;
}

export interface ScheduleDto {
  id: string;
  name: string;
  timezone: string;
  days: ScheduleDayInput[];
  memberCount: number;
  label: string;
}

export interface PersonSetupDto {
  user: PersonRefDto;
  role: string;
  status: string;
  workSetup: WorkSetup;
  attendanceTracked: boolean;
  scheduleId: string | null;
  scheduleName: string | null;
  effectiveFrom: string | null;
}

export interface DayOverrideDto {
  id: string;
  userId: string;
  userName: string;
  date: string;
  kind: DayOverrideKind;
  start: string | null;
  end: string | null;
  onsite: boolean | null;
  note: string | null;
}

export interface DeviceDto {
  id: string;
  name: string;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  connection: DeviceConnection;
  timezone: string;
  allowedIps: string | null;
  active: boolean;
  online: boolean;
  hasToken: boolean;
  lastSeenAt: string | null;
  lastPunchAt: string | null;
  lastPunchName: string | null;
  punchesToday: number;
  enrolled: number;
  syncRequestedAt: string | null;
  lastImport: ImportResultDto | null;
}

export interface DeviceTokenDto {
  token: string;
}

export interface DeviceUserDto {
  deviceUserId: string;
  userId: string | null;
  userName: string | null;
  userActive: boolean;
  enrolledWith: string | null;
  lastPunchAt: string | null;
  punchesToday: number;
}

export interface ImportResultDto {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  filename: string;
  total: number;
  added: number;
  duplicates: number;
  unknownUserIds: string[];
  errors: string[];
  createdAt: string;
}

export interface IngestResultDto {
  added: number;
  duplicates: number;
  unknownUserIds: string[];
}

export interface ClockStateDto {
  tracked: boolean;
  workDate: string;
  timezone: string;
  day: AttendanceDayDto | null;
  punches: PunchDto[];
  allowed: PunchKind[];
}

export interface DayDetailDto {
  user: PersonRefDto;
  workSetup: WorkSetup;
  scheduleLabel: string | null;
  day: AttendanceDayDto | null;
  punches: PunchDto[];
  week: { date: string; workedMinutes: number; status: DayStatus | null }[];
  leaveNote: string | null;
}

export interface MyDayDto {
  date: string;
  day: AttendanceDayDto | null;
  punches: PunchDto[];
}
