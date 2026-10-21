import type { BoardDto, ExceptionDto } from '@vo/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from '@/components/layout/guards';
import { loginResponse, me, mockApi, renderApp } from '@/test/utils';
import { HrAttendancePage } from './HrAttendancePage';

const HR = me('HR', ['users.read', 'attendance.manage', 'devices.manage', 'reports.read']);
const person = (id: string, fullName: string) => ({ id, fullName, title: null, avatarUrl: null, departmentName: 'Ops' });
const dayOf = (userId: string, status: string, extra: Record<string, unknown> = {}) => ({
  userId,
  workDate: '2026-10-01',
  status,
  scheduleStart: '2026-10-01T00:00:00.000Z',
  scheduleEnd: '2026-10-01T09:00:00.000Z',
  onsite: true,
  firstIn: null,
  lastOut: null,
  openSince: null,
  workedMinutes: 0,
  breakMinutes: 0,
  lateMinutes: 0,
  excused: false,
  preferSource: null,
  mergedCount: 0,
  note: null,
  computedAt: '2026-10-01T02:00:00.000Z',
  ...extra,
});
const board: BoardDto = {
  date: '2026-10-01',
  timezone: 'Asia/Manila',
  generatedAt: '2026-10-01T02:24:00.000Z',
  kpis: { working: 2, onsite: 1, remote: 1, late: 1, noPunch: 0, onLeave: 0, openExceptions: 1, pendingCorrections: 0 },
  rows: [
    { user: person('a', 'Ana Cruz'), workSetup: 'REMOTE', scheduleLabel: null, day: dayOf('a', 'ON_TIME', { firstIn: '2026-10-01T00:02:00.000Z', openSince: '2026-10-01T00:02:00.000Z' }) as never, inSource: 'WEB', bothSources: false, note: null },
    { user: person('l', 'Liza Garcia'), workSetup: 'ONSITE', scheduleLabel: null, day: dayOf('l', 'LATE', { lateMinutes: 14, firstIn: '2026-10-01T00:14:40.000Z', openSince: '2026-10-01T00:14:40.000Z' }) as never, inSource: 'DEVICE', bothSources: false, note: null },
  ],
  untracked: { count: 1, names: ['Ptr. Joel Santiago'] },
};
const lateLiza: ExceptionDto = {
  id: 'e1',
  type: 'LATE',
  status: 'OPEN',
  userId: 'l',
  userName: 'Liza Garcia',
  workDate: '2026-10-01',
  deviceUserId: null,
  title: 'Liza Garcia badged in 14 minutes late',
  detail: 'Scheduled 8:00 AM with a 5-minute grace period.',
  suggestedOut: null,
  resolution: null,
  resolvedByName: null,
  resolvedAt: null,
  createdAt: '2026-10-01T00:15:00.000Z',
};

function setup() {
  document.cookie = 'vo_csrf=test-csrf';
  return mockApi({
    'POST /auth/refresh': { body: loginResponse(HR) },
    'POST /auth/activity': { body: {} },
    'GET /attendance/board': { body: board },
    'GET /attendance/live': { body: [] },
    'GET /attendance/exceptions': { body: [lateLiza] },
    'GET /attendance/corrections': { body: [] },
    'GET /attendance/settings': { body: { graceMinutes: 5, duplicateWindowMinutes: 2, mismatchMinutes: 15, noPunchAfterMinutes: 120, missingOutAfterMinutes: 60, autoClockOutHours: 14, deviceWinsOnsite: true } },
    'POST /attendance/exceptions/e1/resolve': { status: 201, body: { ...lateLiza, status: 'RESOLVED', resolution: 'Late arrival excused.' } },
  });
}

describe('HR attendance board', () => {
  it('shows the board, filters to people who need attention, and notes who isn’t tracked', async () => {
    setup();
    renderApp(<RequireAuth><HrAttendancePage /></RequireAuth>);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Ana Cruz')).toBeInTheDocument();
    expect(within(table).getByText('Late 14m')).toBeInTheDocument();
    expect(screen.getByText(/Not tracked: Ptr. Joel Santiago/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Needs attention (1)' }));
    expect(within(screen.getByRole('table')).queryByText('Ana Cruz')).toBeNull();
    expect(within(screen.getByRole('table')).getByText('Liza Garcia')).toBeInTheDocument();
  });

  it('excuses a late arrival from the Exceptions tab', async () => {
    const calls = setup();
    renderApp(<RequireAuth><HrAttendancePage /></RequireAuth>);
    await userEvent.click(await screen.findByRole('tab', { name: /Exceptions/ }));
    expect(await screen.findByText('Liza Garcia badged in 14 minutes late')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excuse' }));
    expect(await screen.findByText('Late arrival excused.')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/attendance/exceptions/e1/resolve')!.body).toEqual({ action: 'EXCUSE' });
  });
});
