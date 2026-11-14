/**
 * Phase 6: leave, tasks and end-of-day reports.
 */
import { z } from 'zod';
import { dateSchema } from './attendance';

const uuid = z.string().uuid();

/* ================================================================ */
/* Leave                                                             */
/* ================================================================ */

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: 'Waiting for approval',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
  CANCELLED: 'Cancelled',
};

/** Leave can be filed up to this far ahead, and up to this far back (for sick days filed on return). */
export const LEAVE_MAX_AHEAD_DAYS = 366;
export const LEAVE_MAX_BACK_DAYS = 60;
export const LEAVE_MAX_SPAN_DAYS = 120;

const halfDays = (max: number) =>
  z.coerce
    .number()
    .min(-max)
    .max(max)
    .refine((n) => Number.isInteger(n * 2), 'Use whole or half days');

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a color'),
  paid: z.boolean().default(true),
  /** days everyone gets each calendar year; null = no balance kept (e.g. unpaid or statutory leave) */
  yearlyDays: halfDays(365).nullable().refine((n) => n === null || n >= 0, 'Can’t be negative'),
  active: z.boolean().default(true),
});
export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;

export interface LeaveTypeDto {
  id: string;
  name: string;
  color: string;
  paid: boolean;
  yearlyDays: number | null;
  active: boolean;
  /** requests already filed with this type (it can then only be turned off, not deleted) */
  inUse: boolean;
}

export const leaveRequestSchema = z
  .object({
    typeId: uuid,
    startDate: dateSchema,
    endDate: dateSchema,
    reason: z.string().trim().min(1, 'Add a short reason').max(1000),
  })
  .refine((r) => r.endDate >= r.startDate, { message: 'The last day must be on or after the first day', path: ['endDate'] });
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const leavePreviewSchema = z.object({ typeId: uuid, startDate: dateSchema, endDate: dateSchema, userId: uuid.optional() });
export type LeavePreviewQuery = z.infer<typeof leavePreviewSchema>;

export const leaveDecisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
});
export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>;

export const leaveAdjustmentSchema = z.object({
  userId: uuid,
  typeId: uuid,
  year: z.coerce.number().int().min(2020).max(2100),
  days: halfDays(365).refine((n) => n !== 0, 'Enter the number of days to add or take away'),
  note: z.string().trim().min(1, 'Say why').max(300),
});
export type LeaveAdjustmentInput = z.infer<typeof leaveAdjustmentSchema>;

export const leaveListSchema = z.object({
  scope: z.enum(['mine', 'approvals', 'all']).default('mine'),
  status: z.enum(LEAVE_STATUSES).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  userId: uuid.optional(),
});
export type LeaveListQuery = z.infer<typeof leaveListSchema>;

export const leaveCalendarSchema = z.object({ from: dateSchema, to: dateSchema, departmentId: uuid.optional() });
export type LeaveCalendarQuery = z.infer<typeof leaveCalendarSchema>;

export interface LeaveDayDto {
  date: string;
  /** counted against the balance (a working day) */
  counted: boolean;
  /** why it isn't counted: rest day, holiday name… */
  note: string | null;
}

export interface LeavePreviewDto {
  days: number;
  dates: LeaveDayDto[];
  /** remaining balance after this request, for types with a balance */
  remainingAfter: number | null;
  /** other requests (pending or approved) overlapping these dates */
  overlaps: { id: string; startDate: string; endDate: string; typeName: string; status: LeaveStatus }[];
}

export interface LeaveBalanceDto {
  typeId: string;
  typeName: string;
  color: string;
  paid: boolean;
  year: number;
  /** yearly allowance; null when the type keeps no balance */
  allowance: number | null;
  adjustments: number;
  used: number;
  pending: number;
  /** allowance + adjustments - used; null when no balance is kept */
  remaining: number | null;
}

export interface LeaveRequestDto {
  id: string;
  userId: string;
  userName: string;
  departmentName: string | null;
  typeId: string;
  typeName: string;
  color: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  /** who is asked to approve: the manager's name, or "HR" */
  approverName: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  canDecide: boolean;
  canCancel: boolean;
}

export interface LeaveAdjustmentDto {
  id: string;
  typeName: string;
  year: number;
  days: number;
  note: string;
  byName: string | null;
  createdAt: string;
}

/** Who's away on the team calendar. Peers see "On leave"; managers, HR and admins see the type. */
export interface LeaveCalendarEntryDto {
  id: string;
  userId: string;
  userName: string;
  departmentName: string | null;
  startDate: string;
  endDate: string;
  typeName: string | null;
  color: string;
  status: LeaveStatus;
}

export interface HolidayDto {
  id: string;
  date: string;
  name: string;
  kind: HolidayKind;
}
export const HOLIDAY_KINDS = ['REGULAR', 'SPECIAL'] as const;
export type HolidayKind = (typeof HOLIDAY_KINDS)[number];
export const HOLIDAY_KIND_LABELS: Record<HolidayKind, string> = { REGULAR: 'Regular holiday', SPECIAL: 'Special non-working day' };

export const holidaySchema = z.object({
  date: dateSchema,
  name: z.string().trim().min(2).max(80),
  kind: z.enum(HOLIDAY_KINDS).default('REGULAR'),
});
export type HolidayInput = z.infer<typeof holidaySchema>;

/** Working days in a range for leave: skips rest days and holidays. */
export function formatDays(n: number) {
  return `${n % 1 ? n.toFixed(1) : n} ${n === 1 ? 'day' : 'days'}`;
}

/* ================================================================ */
/* Tasks                                                             */
/* ================================================================ */

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done' };

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(200),
  description: z.string().trim().max(4000).nullable().default(null),
  status: z.enum(TASK_STATUSES).default('TODO'),
  /** null = unassigned (a team task anyone in the department can pick up) */
  assigneeId: uuid.nullable().default(null),
  /** the team the task belongs to; null = a personal task */
  departmentId: uuid.nullable().default(null),
  dueDate: dateSchema.nullable().default(null),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: uuid.nullable().optional(),
  departmentId: uuid.nullable().optional(),
  dueDate: dateSchema.nullable().optional(),
  /** position within its column (lower first) */
  position: z.number().min(-1e9).max(1e9).optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const tasksQuerySchema = z.object({
  /** mine: assigned to me or my personal tasks; team: my department's tasks; person: someone I manage */
  scope: z.enum(['mine', 'team', 'person']).default('mine'),
  userId: uuid.optional(),
  departmentId: uuid.optional(),
  /** also return done tasks completed more than 14 days ago */
  includeOldDone: z.coerce.boolean().default(false),
});
export type TasksQuery = z.infer<typeof tasksQuerySchema>;

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string | null;
  createdByName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  dueDate: string | null;
  completedAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

/* ================================================================ */
/* End-of-day reports                                                */
/* ================================================================ */

export const dailyReportSchema = z.object({
  accomplished: z.string().trim().min(1, 'Write what you got done today').max(4000),
  blockers: z.string().trim().max(2000).default(''),
  plan: z.string().trim().max(2000).default(''),
  /** defaults to your current work day */
  workDate: dateSchema.optional(),
});
export type DailyReportInput = z.infer<typeof dailyReportSchema>;

export interface DailyReportDto {
  id: string;
  userId: string;
  userName: string;
  workDate: string;
  accomplished: string;
  blockers: string;
  plan: string;
  submittedAt: string;
  updatedAt: string;
  /** tasks this person marked done that day */
  tasksDone: { id: string; title: string }[];
}

export interface MyDailyReportDto {
  workDate: string;
  /** your department asks for a report before you clock out on the web */
  required: boolean;
  report: DailyReportDto | null;
  /** tasks you finished today, to start the report from */
  tasksDone: { id: string; title: string }[];
}

export const teamReportsSchema = z.object({ date: dateSchema.optional(), departmentId: uuid.optional() });
export type TeamReportsQuery = z.infer<typeof teamReportsSchema>;

export interface TeamReportRowDto {
  userId: string;
  fullName: string;
  departmentName: string | null;
  /** worked that day (clocked in) */
  worked: boolean;
  required: boolean;
  report: DailyReportDto | null;
}

export interface TeamReportsDto {
  date: string;
  rows: TeamReportRowDto[];
}

/* ================================================================ */
/* Real-time                                                         */
/* ================================================================ */

/** A heads-up shown as a pop-up wherever the person is in the app. */
export interface NoticeDto {
  title: string;
  body: string;
  /** app path to open, e.g. /leave?open=… */
  link: string | null;
}

export interface WorkServerEvents {
  notice: NoticeDto;
  'leave:changed': { id: string };
  'tasks:changed': { id: string };
}
