import type {
  AttendanceDayDto,
  AttendanceRules,
  ExceptionDto,
  ExceptionType,
  PersonRefDto,
  PunchDto,
} from '@vo/shared';
import type { AttendanceDay, AttendanceException, Punch } from '../db/schema';
import type { PunchRole } from './engine';
import { localDate } from '@vo/shared';
import { clockTime, dayLabel, duration } from './format';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toDayDto(d: AttendanceDay): AttendanceDayDto {
  return {
    userId: d.userId,
    workDate: d.workDate,
    status: d.status,
    scheduleStart: iso(d.scheduleStart),
    scheduleEnd: iso(d.scheduleEnd),
    onsite: d.onsite,
    firstIn: iso(d.firstIn),
    lastOut: iso(d.lastOut),
    openSince: iso(d.openSince),
    workedMinutes: d.workedMinutes,
    breakMinutes: d.breakMinutes,
    lateMinutes: d.lateMinutes,
    excused: d.excused,
    preferSource: d.preferSource,
    mergedCount: d.mergedCount,
    note: d.note,
    computedAt: d.computedAt.toISOString(),
  };
}

export interface PunchRow {
  punch: Punch;
  deviceName: string | null;
  createdByName: string | null;
}

export function toPunchDto(r: PunchRow, role: PunchRole | undefined): PunchDto {
  const p = r.punch;
  return {
    id: p.id,
    at: p.punchedAt.toISOString(),
    source: p.source,
    kind: p.kind,
    role: p.removedAt ? 'REMOVED' : (role ?? (p.merged ? 'MERGED' : 'NOT_USED')),
    deviceId: p.deviceId,
    deviceName: r.deviceName,
    deviceUserId: p.deviceUserId,
    verify: p.verify,
    location: p.location ?? r.deviceName,
    note: p.note,
    createdByName: r.createdByName,
  };
}

export function personRef(u: {
  id: string;
  fullName: string;
  title: string | null;
  avatarUrl: string | null;
  departmentName?: string | null;
}): PersonRefDto {
  return { id: u.id, fullName: u.fullName, title: u.title, avatarUrl: u.avatarUrl, departmentName: u.departmentName ?? null };
}

/** Plain-language title and detail for an exception, in the company's time zone. */
export function describeException(
  e: AttendanceException,
  ctx: { userName: string | null; tz: string; rules: AttendanceRules; now: Date },
): { title: string; detail: string } {
  const d = e.data as Record<string, string | number | boolean | null | undefined>;
  const name = ctx.userName ?? 'Someone';
  const t = (v: unknown) => (typeof v === 'string' ? clockTime(new Date(v), ctx.tz) : '—');
  const label = typeof d.scheduleLabel === 'string' ? d.scheduleLabel : null;
  const type = e.type as ExceptionType;
  switch (type) {
    case 'LATE': {
      const web = d.source === 'WEB';
      return {
        title: `${name} ${web ? 'clocked in' : 'badged in'} ${d.lateMinutes} minutes late${web ? ' (web)' : ''}`,
        detail: `Scheduled ${t(d.scheduleStart)} with a ${ctx.rules.graceMinutes}-minute grace period. First punch ${t(d.firstIn)}${
          d.where ? ` at ${d.where}` : ''
        }.`,
      };
    }
    case 'NO_PUNCH':
      return {
        title: e.workDate < localDate(ctx.now, ctx.tz) ? `${name} didn’t clock in` : `${name} hasn’t clocked in`,
        detail: `Scheduled ${label ?? t(d.scheduleStart)} on ${dayLabel(e.workDate)}. No punch ${Math.round(
          ctx.rules.noPunchAfterMinutes / 60,
        )} hours after the start and no leave on file.`,
      };
    case 'MISSING_OUT': {
      const since = typeof d.firstIn === 'string' ? new Date(d.firstIn) : null;
      const hours = since ? duration((ctx.now.getTime() - since.getTime()) / 60_000) : null;
      return d.auto
        ? {
            title: `${name} was clocked out automatically`,
            detail: `Shift ${label ?? '—'}. Clocked in at ${t(d.firstIn)} with no clock-out, so the system clocked them out at ${t(
              d.autoOutAt ?? d.suggestedOut,
            )}. Check the real time.`,
          }
        : {
            title: `${name} has been clocked in for ${hours ?? 'a long time'}`,
            detail: `Shift ${label ?? '—'}. Clocked in at ${t(d.firstIn)}, no clock-out. Auto clock-out runs at ${ctx.rules.autoClockOutHours} hours.`,
          };
    }
    case 'MISMATCH': {
      const gap =
        typeof d.webAt === 'string' && typeof d.deviceAt === 'string'
          ? Math.round(Math.abs(Date.parse(d.deviceAt) - Date.parse(d.webAt)) / 60_000)
          : 0;
      return {
        title: `${name} clocked in on the web at ${t(d.webAt)}, then badged in at ${t(d.deviceAt)}`,
        detail: `${gap} minutes apart${d.webWhere ? `. Web clock-in from ${d.webWhere}` : ''}${
          d.deviceWhere ? `, biometric at ${d.deviceWhere}` : ''
        }. Company rule: on on-site days, the biometric time counts.`,
      };
    }
    case 'DUPLICATES':
      return {
        title: `${name} punched ${Number(d.mergedCount ?? 1) + 1} times within ${ctx.rules.duplicateWindowMinutes} minutes`,
        detail: `The first one was kept; the others were merged.`,
      };
    case 'UNLINKED_BADGE':
      return {
        title: `Badge ${e.deviceUserId} punched in at ${t(d.firstAt)} but isn’t linked to anyone`,
        detail: `${d.deviceName ?? 'A device'}${d.verify ? `, ${String(d.verify).toLowerCase()}` : ''}. ${d.count ?? 1} punch${
          Number(d.count ?? 1) === 1 ? '' : 'es'
        } on ${dayLabel(e.workDate)}. Link the badge to a person and the punches follow them.`,
      };
  }
}

export function toExceptionDto(
  e: AttendanceException,
  extra: { userName: string | null; resolvedByName: string | null },
  ctx: { tz: string; rules: AttendanceRules; now: Date },
): ExceptionDto {
  const { title, detail } = describeException(e, { ...ctx, userName: extra.userName });
  const data = e.data as Record<string, unknown>;
  return {
    id: e.id,
    type: e.type,
    status: e.status,
    userId: e.userId,
    userName: extra.userName,
    workDate: e.workDate,
    deviceUserId: e.deviceUserId,
    title,
    detail,
    suggestedOut: typeof data.suggestedOut === 'string' ? data.suggestedOut : null,
    resolution: e.resolution,
    resolvedByName: extra.resolvedByName,
    resolvedAt: iso(e.resolvedAt),
    createdAt: e.createdAt.toISOString(),
  };
}
