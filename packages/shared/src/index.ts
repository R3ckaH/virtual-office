import { z } from 'zod';
import { isValidTimeZone } from './time';

export * from './time';
export * from './attendance';
export * from './presence';

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

export const ROLES = ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  HR: 'HR',
  MANAGER: 'Manager / Team Lead',
  EMPLOYEE: 'Employee',
};

export const USER_STATUSES = ['ACTIVE', 'DEACTIVATED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const AUTH_EVENT_TYPES = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGIN_LOCKED',
  'LOGOUT',
  'SESSION_TIMEOUT',
  'FORCED_LOGOUT',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET',
  'PASSWORD_CHANGED',
  'MFA_ENABLED',
  'MFA_DISABLED',
  'MFA_FAILED',
  'REFRESH_TOKEN_REUSE',
] as const;
export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

export const SSO_PROVIDERS = ['google', 'microsoft'] as const;
export type SsoProvider = (typeof SSO_PROVIDERS)[number];

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

export const PASSWORD_MIN_LENGTH = 12;

/** Passwords: 12+ chars with at least one letter and one number. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, 'Use at most 128 characters')
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'Include at least one letter and one number');


export const timeZoneSchema = z.string().refine(isValidTimeZone, 'Unknown time zone');

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
const nameSchema = z.string().trim().min(1, 'Required').max(120);
const uuid = z.string().uuid();

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaCodeSchema = z
  .string()
  .trim()
  .regex(/^(\d{6}|[a-z0-9]{5}-[a-z0-9]{5})$/i, 'Enter the 6-digit code or a recovery code');

export const mfaLoginSchema = z.object({
  mfaToken: z.string().min(1),
  code: mfaCodeSchema,
});
export type MfaLoginInput = z.infer<typeof mfaLoginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const mfaEnableSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });
export const mfaDisableSchema = z.object({
  password: z.string().min(1).max(128),
  code: mfaCodeSchema,
});

export const updateProfileSchema = z.object({
  fullName: nameSchema.optional(),
  timezone: timeZoneSchema.optional(),
  title: z.string().trim().max(120).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/* ------------------------------------------------------------------ */
/* Users & departments (admin)                                         */
/* ------------------------------------------------------------------ */

export const createUserSchema = z.object({
  email: emailSchema,
  fullName: nameSchema,
  title: z.string().trim().max(120).nullable().optional(),
  role: z.enum(ROLES),
  departmentId: uuid.nullable().optional(),
  managerId: uuid.nullable().optional(),
  timezone: timeZoneSchema,
  sendInvite: z.boolean().default(true),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .omit({ sendInvite: true })
  .partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  departmentId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const departmentSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  headUserId: uuid.nullable().optional(),
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

export const listAuthEventsQuerySchema = z.object({
  userId: uuid.optional(),
  type: z.enum(AUTH_EVENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListAuthEventsQuery = z.infer<typeof listAuthEventsQuerySchema>;

export const listAuditLogsQuerySchema = z.object({
  actorId: uuid.optional(),
  entityType: z.string().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

/* ------------------------------------------------------------------ */
/* DTOs returned by the API                                            */
/* ------------------------------------------------------------------ */

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  title: string | null;
  avatarUrl: string | null;
  role: Role;
  status: UserStatus;
  timezone: string;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
  mfaEnabled: boolean;
  /** true while sign-in is locked after too many failed attempts */
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface MeDto extends UserDto {
  permissions: Permission[];
}

export interface DepartmentDto {
  id: string;
  name: string;
  headUserId: string | null;
  headUserName: string | null;
  memberCount: number;
}

export interface SessionDto {
  id: string;
  ip: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  createdAt: string;
  lastActivityAt: string;
  current: boolean;
}

export interface AuthEventDto {
  id: string;
  userId: string | null;
  userName: string | null;
  email: string | null;
  type: AuthEventType;
  ip: string | null;
  browser: string | null;
  os: string | null;
  detail: string | null;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  /** the affected person or department's name, when known */
  entityName: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LoginResponse {
  mfaRequired: false;
  accessToken: string;
  expiresIn: number;
  user: MeDto;
  sessionTimeoutMinutes: number;
}

export interface MfaChallengeResponse {
  mfaRequired: true;
  mfaToken: string;
}

export interface PublicConfigDto {
  companyName: string;
  primaryColor: string;
  logoUrl: string | null;
  sessionTimeoutMinutes: number;
  ssoProviders: SsoProvider[];
  /** Where biometric terminals and the sync agent connect (the API's own host, e.g. the Railway
   *  domain). null when the API is served from the same host as the web app. */
  deviceHost: string | null;
  /** where the browser opens the live (Socket.IO) connection; null = this site */
  realtimeUrl: string | null;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  errors?: Record<string, string[]>;
}

/* ------------------------------------------------------------------ */
/* Permissions (single source of truth for API guards and UI)          */
/* ------------------------------------------------------------------ */

export const PERMISSIONS = [
  'users.read', // list/view users (managers: direct reports only)
  'users.manage', // create/edit/deactivate/force-logout
  'departments.manage',
  'authEvents.read',
  'auditLogs.read',
  'team.read', // manager views of direct reports + first approval of their corrections
  'attendance.manage', // HR board, exceptions, schedules, attendance rules, final approval of corrections
  'devices.manage', // biometric devices, badge links, log imports
  'reports.read',
  'settings.manage',
  'rooms.manage', // office floor rooms: names, types, owners, members
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  HR: ['users.read', 'attendance.manage', 'devices.manage', 'reports.read'],
  MANAGER: ['users.read', 'team.read', 'reports.read'],
  EMPLOYEE: [],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
