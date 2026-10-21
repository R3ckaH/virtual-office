import type { ClockStateDto } from '@vo/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from '@/components/layout/guards';
import { loginResponse, me, mockApi, renderApp } from '@/test/utils';
import { TimeClockCard } from './TimeClockCard';

const day = (over: Partial<NonNullable<ClockStateDto['day']>> = {}) => ({
  userId: 'u1',
  workDate: '2026-10-01',
  status: 'SCHEDULED' as const,
  scheduleStart: '2026-10-01T00:00:00.000Z',
  scheduleEnd: '2026-10-01T09:00:00.000Z',
  onsite: false,
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
  computedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});
const state = (over: Partial<ClockStateDto>): ClockStateDto => ({ tracked: true, workDate: '2026-10-01', timezone: 'Asia/Manila', day: day(), punches: [], allowed: ['IN'], ...over });

function signedIn(routes: Parameters<typeof mockApi>[0]) {
  document.cookie = 'vo_csrf=test-csrf';
  return mockApi({ 'POST /auth/refresh': { body: loginResponse(me('EMPLOYEE')) }, 'POST /auth/activity': { body: {} }, ...routes });
}

describe('Time clock card', () => {
  it('shows the shift and clocks in', async () => {
    const after = state({
      day: day({ status: 'ON_TIME', firstIn: new Date().toISOString(), openSince: new Date().toISOString() }),
      allowed: ['BREAK_START', 'OUT'],
      punches: [{ id: 'p1', at: new Date().toISOString(), source: 'WEB', kind: 'IN', role: 'IN', deviceId: null, deviceName: null, deviceUserId: null, verify: null, location: 'Virtual Office', note: null, createdByName: null }],
    });
    const calls = signedIn({ 'GET /me/clock': { body: state({}) }, 'POST /me/clock': { status: 201, body: after } });
    renderApp(<RequireAuth><TimeClockCard /></RequireAuth>);
    expect(await screen.findByText('Your shift today: 8:00 AM – 5:00 PM.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Clock in/ }));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/me/clock')!.body).toEqual({ action: 'IN' });
    expect(await screen.findByRole('button', { name: /Start break/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clock out/ })).toBeInTheDocument();
    expect(screen.getByText(/Clocked in at/)).toBeInTheDocument();
    expect(screen.getByText('On time')).toBeInTheDocument();
  });

  it('says so when attendance isn’t tracked (leaders), with no buttons', async () => {
    signedIn({ 'GET /me/clock': { body: state({ tracked: false, day: null, allowed: [] }) } });
    renderApp(<RequireAuth><TimeClockCard /></RequireAuth>);
    expect(await screen.findByText(/isn’t tracked for your role/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clock in/ })).toBeNull();
  });

  it('shows the server’s message when the action is no longer allowed', async () => {
    signedIn({
      'GET /me/clock': { body: state({}) },
      'POST /me/clock': { status: 409, body: { statusCode: 409, message: 'You can’t clock in right now. Refresh to see your latest status.', code: 'CLOCK_STATE' } },
    });
    renderApp(<RequireAuth><TimeClockCard /></RequireAuth>);
    await userEvent.click(await screen.findByRole('button', { name: /Clock in/ }));
    expect(await screen.findByText(/You can’t clock in right now/)).toBeInTheDocument();
  });
});
