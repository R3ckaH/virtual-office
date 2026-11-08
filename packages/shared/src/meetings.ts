import { z } from 'zod';
import { addDays, DATE_RE, isoWeekday, isValidTimeZone, localDate, localTime, zonedToUtc } from './time';

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

/** SCHEDULED: on the calendar. INSTANT: a call started from someone's card. ROOM: the ongoing call in an office meeting room. */
export const MEETING_KINDS = ['SCHEDULED', 'INSTANT', 'ROOM'] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const RECURRENCES = ['NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY'] as const;
export type Recurrence = (typeof RECURRENCES)[number];
export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  NONE: 'Does not repeat',
  DAILY: 'Every day',
  WEEKDAYS: 'Every weekday (Mon–Fri)',
  WEEKLY: 'Every week',
};

export const RSVPS = ['PENDING', 'ACCEPTED', 'TENTATIVE', 'DECLINED'] as const;
export type Rsvp = (typeof RSVPS)[number];
export const RSVP_LABELS: Record<Rsvp, string> = { PENDING: 'No reply yet', ACCEPTED: 'Going', TENTATIVE: 'Maybe', DECLINED: 'Not going' };

export const MEETING_STATUSES = ['ACTIVE', 'CANCELLED', 'ENDED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const RECORDING_STATUSES = ['STARTING', 'RECORDING', 'PROCESSING', 'READY', 'FAILED'] as const;
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

/** People can join this long before a scheduled start, and until this long after the end. */
export const JOIN_EARLY_MINUTES = 15;
export const JOIN_LATE_MINUTES = 60;
/** Reminders go out this long before each occurrence. */
export const REMINDER_MINUTES = 10;
/** An unanswered call stops ringing after this. */
export const RING_SECONDS = 45;

/* ------------------------------------------------------------------ */
/* Input schemas                                                        */
/* ------------------------------------------------------------------ */

const id = z.string().uuid();

export const scheduleMeetingSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the meeting a title').max(120),
    description: z
      .string()
      .trim()
      .max(2000, 'Keep the agenda under 2,000 characters')
      .nullable()
      .optional()
      .transform((v) => v || null),
    startsAt: z.string().datetime({ offset: true, message: 'Pick a start date and time' }),
    durationMinutes: z.coerce.number().int().min(5, 'At least 5 minutes').max(480, 'At most 8 hours'),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
    recurrence: z.enum(RECURRENCES).default('NONE'),
    recurrenceUntil: z.string().regex(DATE_RE, 'Pick an end date').nullable().optional().transform((v) => v ?? null),
    inviteeIds: z.array(id).max(100, 'Invite at most 100 people').default([]),
    officeRoomId: id.nullable().optional().transform((v) => v ?? null),
  })
  .superRefine((v, ctx) => {
    if (v.recurrence !== 'NONE' && v.recurrenceUntil && v.recurrenceUntil < localDate(new Date(v.startsAt), v.timezone)) {
      ctx.addIssue({ code: 'custom', path: ['recurrenceUntil'], message: 'The last date must be on or after the first meeting' });
    }
  });
export type ScheduleMeetingInput = z.infer<typeof scheduleMeetingSchema>;

export const respondSchema = z.object({ response: z.enum(['ACCEPTED', 'TENTATIVE', 'DECLINED']) });
export type RespondInput = z.infer<typeof respondSchema>;

export const startCallSchema = z.object({ userIds: z.array(id).min(1, 'Pick someone to call').max(8, 'Call at most 8 people at once') });
export type StartCallInput = z.infer<typeof startCallSchema>;

export const meetingRangeSchema = z
  .object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) })
  .refine((v) => Date.parse(v.to) > Date.parse(v.from), { message: '"to" must be after "from"', path: ['to'] })
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= 62 * 86_400_000, { message: 'At most 62 days at a time', path: ['to'] });
export type MeetingRange = z.infer<typeof meetingRangeSchema>;

export const meetingSettingsSchema = z.object({ recordingEnabled: z.boolean() });
export type MeetingSettingsInput = z.infer<typeof meetingSettingsSchema>;

/* ------------------------------------------------------------------ */
/* DTOs                                                                 */
/* ------------------------------------------------------------------ */

export interface MeetingPersonDto {
  userId: string;
  fullName: string;
  response: Rsvp;
}

export interface MeetingDto {
  id: string;
  kind: MeetingKind;
  title: string;
  description: string | null;
  hostId: string;
  hostName: string;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  recurrence: Recurrence;
  recurrenceUntil: string | null;
  officeRoomId: string | null;
  status: MeetingStatus;
  invitees: MeetingPersonDto[];
  /** your reply, or null if you're the host / not invited */
  myResponse: Rsvp | null;
  canEdit: boolean;
  /** people in the call right now */
  liveCount: number;
}

/** One occurrence on the calendar. */
export interface OccurrenceDto {
  meetingId: string;
  start: string;
  end: string;
  title: string;
  kind: MeetingKind;
  hostName: string;
  myResponse: Rsvp | null;
  isHost: boolean;
  inviteeCount: number;
  officeRoomId: string | null;
  recurrence: Recurrence;
  liveCount: number;
}

export interface JoinDto {
  /** LiveKit server (wss://…) */
  url: string;
  token: string;
  meetingId: string;
  occurrenceStart: string;
  title: string;
  kind: MeetingKind;
  isHost: boolean;
  /** recording is allowed here (setting on, storage connected, you're the host or an admin) */
  canRecord: boolean;
  recording: boolean;
}

export interface AttendanceRowDto {
  userId: string;
  fullName: string;
  occurrenceStart: string;
  firstJoinedAt: string;
  lastLeftAt: string | null;
  /** total time in the call, summed over rejoins */
  seconds: number;
  joins: number;
}

export interface RecordingDto {
  id: string;
  meetingId: string;
  occurrenceStart: string;
  status: RecordingStatus;
  startedByName: string;
  startedAt: string;
  endedAt: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
}

export interface CallDto {
  meetingId: string;
  fromId: string;
  fromName: string;
  title: string;
  startedAt: string;
}

export interface MeetingSettingsDto {
  recordingEnabled: boolean;
  /** storage for recordings is configured on the server */
  storageConfigured: boolean;
  /** video is configured on the server (LiveKit URL and keys) */
  videoConfigured: boolean;
}

export interface CalendarFeedDto {
  /** private subscribe URL (webcal/https). Treat like a password. */
  url: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Recurrence                                                           */
/* ------------------------------------------------------------------ */

export interface RecurringLike {
  startsAt: string | Date;
  durationMinutes: number;
  timezone: string;
  recurrence: Recurrence;
  recurrenceUntil: string | null;
}

/**
 * Occurrence start times between `from` and `to` (an occurrence counts if it overlaps the range).
 * Repeats keep the same local wall-clock time in the meeting's time zone, across DST changes.
 * At most `limit` occurrences.
 */
export function expandOccurrences(m: RecurringLike, from: Date, to: Date, limit = 500): Date[] {
  const first = new Date(m.startsAt);
  const durMs = m.durationMinutes * 60_000;
  if (m.recurrence === 'NONE') return first.getTime() < to.getTime() && first.getTime() + durMs > from.getTime() ? [first] : [];

  const time = localTime(first, m.timezone);
  // localTime has minute precision; keep any seconds so the first occurrence is exactly `startsAt`
  const subMinute = ((first.getTime() % 60_000) + 60_000) % 60_000;
  const firstDate = localDate(first, m.timezone);
  const weekday = isoWeekday(firstDate);
  const until = m.recurrenceUntil;
  // start scanning a day before `from` (in the meeting's zone), but never before the first meeting
  let date = localDate(new Date(Math.max(first.getTime(), from.getTime() - durMs - 86_400_000)), m.timezone);
  if (date < firstDate) date = firstDate;
  const out: Date[] = [];
  for (let guard = 0; guard < 4000 && out.length < limit; guard++) {
    if (until && date > until) break;
    const wd = isoWeekday(date);
    const matches = m.recurrence === 'DAILY' || (m.recurrence === 'WEEKDAYS' && wd <= 5) || (m.recurrence === 'WEEKLY' && wd === weekday);
    if (matches) {
      const at = new Date(zonedToUtc(date, time, m.timezone).getTime() + subMinute);
      if (at.getTime() >= to.getTime()) break;
      if (at.getTime() + durMs > from.getTime() && at.getTime() >= first.getTime()) out.push(at);
    }
    date = addDays(date, 1);
  }
  return out;
}

/** The occurrence happening at `at`, or the next one starting within `withinMs`. */
export function currentOccurrence(m: RecurringLike, at: Date, earlyMs: number, lateMs: number): Date | null {
  const list = expandOccurrences(m, new Date(at.getTime() - m.durationMinutes * 60_000 - lateMs), new Date(at.getTime() + earlyMs + 1));
  return (
    list.find((s) => at.getTime() >= s.getTime() - earlyMs && at.getTime() <= s.getTime() + m.durationMinutes * 60_000 + lateMs) ?? null
  );
}

/* ------------------------------------------------------------------ */
/* iCalendar (.ics)                                                     */
/* ------------------------------------------------------------------ */

export interface IcsEvent {
  uid: string;
  sequence: number;
  title: string;
  description: string | null;
  url: string;
  startsAt: string | Date;
  durationMinutes: number;
  timezone: string;
  recurrence: Recurrence;
  recurrenceUntil: string | null;
  organizer: { name: string; email: string };
  attendees: { name: string; email: string; response: Rsvp }[];
  cancelled: boolean;
  location: string;
  updatedAt: Date;
}

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Lines longer than 75 octets are folded (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const PARTSTAT: Record<Rsvp, string> = { PENDING: 'NEEDS-ACTION', ACCEPTED: 'ACCEPTED', TENTATIVE: 'TENTATIVE', DECLINED: 'DECLINED' };

function vevent(e: IcsEvent): string[] {
  const start = new Date(e.startsAt);
  const local = (d: Date) => `${localDate(d, e.timezone).replace(/-/g, '')}T${localTime(d, e.timezone).replace(':', '')}00`;
  const end = new Date(start.getTime() + e.durationMinutes * 60_000);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${icsUtc(e.updatedAt)}`,
    `DTSTART;TZID=${e.timezone}:${local(start)}`,
    `DTEND;TZID=${e.timezone}:${local(end)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText([e.description, `Join: ${e.url}`].filter(Boolean).join('\n\n'))}`,
    `URL:${e.url}`,
    `LOCATION:${icsText(e.location)}`,
    `ORGANIZER;CN=${icsText(e.organizer.name)}:mailto:${e.organizer.email}`,
    ...e.attendees.map((a) => `ATTENDEE;CN=${icsText(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=${PARTSTAT[a.response]};RSVP=TRUE:mailto:${a.email}`),
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
  ];
  if (e.recurrence !== 'NONE') {
    const until = e.recurrenceUntil ? `;UNTIL=${icsUtc(zonedToUtc(e.recurrenceUntil, '23:59', e.timezone))}` : '';
    const rule =
      e.recurrence === 'DAILY'
        ? 'FREQ=DAILY'
        : e.recurrence === 'WEEKDAYS'
          ? 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
          : `FREQ=WEEKLY;BYDAY=${['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][isoWeekday(localDate(start, e.timezone)) - 1]}`;
    lines.push(`RRULE:${rule}${until}`);
  }
  if (!e.cancelled) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${REMINDER_MINUTES}M`, 'END:VALARM');
  lines.push('END:VEVENT');
  return lines;
}

/**
 * A calendar file. METHOD:REQUEST for invites and updates, CANCEL for cancellations, PUBLISH for feeds.
 * Times use the meeting's IANA time zone (TZID), which Google Calendar and Outlook both understand.
 */
export function buildIcs(events: IcsEvent[], method: 'REQUEST' | 'CANCEL' | 'PUBLISH', calName?: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Virtual Office//Meetings//EN', 'CALSCALE:GREGORIAN', `METHOD:${method}`];
  if (calName) lines.push(`X-WR-CALNAME:${icsText(calName)}`, 'X-PUBLISHED-TTL:PT15M', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M');
  for (const e of events) lines.push(...vevent(e));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
