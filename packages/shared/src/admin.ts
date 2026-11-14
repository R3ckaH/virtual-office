/**
 * Phase 7: dashboards, reports with exports, and company settings.
 */
import { z } from 'zod';
import { dateSchema } from './attendance';
import type { OccurrenceDto } from './meetings';
import type { LeaveBalanceDto, TaskDto } from './work';

const uuid = z.string().uuid();

/* ================================================================ */
/* Dashboards                                                        */
/* ================================================================ */

export interface MyDashboardDto {
  today: { workDate: string; workedMinutes: number; status: string | null; scheduledMinutes: number | null };
  week: { from: string; to: string; workedMinutes: number; scheduledMinutes: number; daysWorked: number };
  upcomingMeetings: OccurrenceDto[];
  tasks: { open: number; dueSoon: TaskDto[] };
  leave: LeaveBalanceDto[];
  dailyReport: { required: boolean; submitted: boolean };
}

export interface TeamPersonDto {
  userId: string;
  fullName: string;
  departmentName: string | null;
}

export interface TeamDashboardDto {
  /** whose numbers these are: "your team", a department, or the whole company */
  scopeLabel: string;
  date: string;
  headcount: number;
  online: TeamPersonDto[];
  late: (TeamPersonDto & { lateMinutes: number; firstIn: string })[];
  absent: TeamPersonDto[];
  notIn: TeamPersonDto[];
  onLeave: (TeamPersonDto & { typeName: string | null })[];
  week: { from: string; to: string; people: (TeamPersonDto & { workedMinutes: number; scheduledMinutes: number; lateDays: number })[] };
  pending: { leave: number; corrections: number; reportsMissingYesterday: number };
}

export const teamDashboardSchema = z.object({ departmentId: uuid.optional() });

/* ================================================================ */
/* Reports                                                           */
/* ================================================================ */

export const REPORT_KINDS = ['attendance', 'tardiness', 'overtime', 'meetings', 'logins', 'leave'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_INFO: Record<ReportKind, { title: string; description: string }> = {
  attendance: { title: 'Attendance summary', description: 'Per person: days worked, hours, late days, absences, leave and overtime.' },
  tardiness: { title: 'Tardiness', description: 'Every late clock-in, with how late.' },
  overtime: { title: 'Overtime and early outs', description: 'Days worked past the end of the shift, and days ended early.' },
  meetings: { title: 'Meeting attendance', description: 'Who joined each meeting, when, and for how long.' },
  logins: { title: 'Login history', description: 'Sign-ins, sign-outs and failed attempts, with IP and device.' },
  leave: { title: 'Leave', description: 'Leave filed in the period, with status and days.' },
};
export const EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Minutes past the end of a shift before they count as overtime. */
export const OVERTIME_MIN_MINUTES = 30;
/** Leaving this many minutes or more before the end of a shift counts as an early out. */
export const EARLY_OUT_MIN_MINUTES = 15;

export const reportQuerySchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    departmentId: uuid.optional(),
    userId: uuid.optional(),
    format: z.enum(EXPORT_FORMATS).optional(),
  })
  .refine((q) => q.to >= q.from, { message: 'The end date must be on or after the start', path: ['to'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 366, { message: 'Pick up to a year', path: ['to'] });
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export type ReportColumnType = 'text' | 'number' | 'minutes' | 'hours' | 'date' | 'datetime';
export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}
export type ReportCell = string | number | null;

export interface ReportDto {
  kind: ReportKind;
  title: string;
  /** "1–31 Oct 2026 · Engineering" */
  subtitle: string;
  timezone: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  totals: Record<string, ReportCell> | null;
  generatedAt: string;
}

/** "7 h 05 min", for minutes columns. */
export function formatMinutes(m: number | null | undefined) {
  if (m === null || m === undefined) return '';
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${h} h ${String(r).padStart(2, '0')} min` : `${r} min`;
}

/* ================================================================ */
/* Company settings                                                  */
/* ================================================================ */

export const NOTIFICATION_KINDS = ['meetingInvites', 'meetingReminders', 'leaveRequests', 'leaveDecisions', 'corrections', 'dailyReportReminder'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const NOTIFICATION_LABELS: Record<NotificationKind, { label: string; hint: string }> = {
  meetingInvites: { label: 'Meeting invites and changes', hint: 'With a calendar file for Google Calendar or Outlook.' },
  meetingReminders: { label: 'Meeting reminders', hint: '10 minutes before each meeting.' },
  leaveRequests: { label: 'New leave requests', hint: 'To the person who approves them.' },
  leaveDecisions: { label: 'Leave approved or not approved', hint: 'To the person who filed it.' },
  corrections: { label: 'Timesheet corrections', hint: 'Requests and decisions.' },
  dailyReportReminder: { label: 'End-of-day report reminder', hint: 'At the end of the shift, to people whose department requires a report and who haven’t filed it.' },
};
export type NotificationSettings = Record<NotificationKind, boolean>;
export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  meetingInvites: true,
  meetingReminders: true,
  leaveRequests: true,
  leaveDecisions: true,
  corrections: true,
  dailyReportReminder: false,
};

export const companySettingsSchema = z.object({
  companyName: z.string().trim().min(2).max(80),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a color'),
  defaultTimezone: z.string().min(3).max(64),
  sessionTimeoutMinutes: z.coerce.number().int().min(5).max(480),
  notifications: z.object(Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, z.boolean()])) as Record<NotificationKind, z.ZodBoolean>),
});
export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

export interface CompanySettingsDto extends CompanySettingsInput {
  logoUrl: string | null;
  mailConfigured: boolean;
}

export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
