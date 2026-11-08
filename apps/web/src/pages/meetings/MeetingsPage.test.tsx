import type { MeetingDto, OccurrenceDto } from '@vo/shared';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallPrompts } from '@/components/meetings/CallPrompts';
import { RequireAuth } from '@/components/layout/guards';
import { ToastProvider } from '@/components/ui/toast';
import { CallsProvider, useCalls } from '@/lib/calls';
import { loginResponse, me, mockApi, renderApp } from '@/test/utils';
import { MeetingsPage } from './MeetingsPage';

const MANAGER = me('MANAGER', ['meetings.schedule']);
const EMPLOYEE = me('EMPLOYEE');
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const occ = (over: Partial<OccurrenceDto> = {}): OccurrenceDto => ({
  meetingId: 'm1',
  start: inMinutes(5),
  end: inMinutes(35),
  title: 'Daily standup',
  kind: 'SCHEDULED',
  hostName: 'Jose Reyes',
  myResponse: 'PENDING',
  isHost: false,
  inviteeCount: 4,
  officeRoomId: null,
  recurrence: 'WEEKDAYS',
  liveCount: 2,
  ...over,
});
const meeting = (over: Partial<MeetingDto> = {}): MeetingDto => ({
  id: 'm1',
  kind: 'SCHEDULED',
  title: 'Daily standup',
  description: 'What I did, what’s next, blockers',
  hostId: 'u-jose',
  hostName: 'Jose Reyes',
  startsAt: inMinutes(5),
  durationMinutes: 30,
  timezone: 'Asia/Manila',
  recurrence: 'DAILY',
  recurrenceUntil: null,
  officeRoomId: null,
  status: 'ACTIVE',
  invitees: [
    { userId: EMPLOYEE.id, fullName: 'Ana Cruz', response: 'PENDING' },
    { userId: 'u-emily', fullName: 'Emily Carter', response: 'ACCEPTED' },
  ],
  myResponse: 'PENDING',
  canEdit: false,
  liveCount: 2,
  ...over,
});

beforeEach(() => {
  document.cookie = 'vo_csrf=test-csrf';
  localStorage.setItem('vo.meetings.view', 'list');
});

describe('Meetings page', () => {
  it('lists your meetings and lets you reply and see who’s coming', async () => {
    const calls = mockApi({
      'POST /auth/refresh': { body: loginResponse(EMPLOYEE) },
      'GET /meetings': { body: [occ()] },
      'GET /meetings/m1': { body: meeting() },
      'POST /meetings/m1/respond': { body: meeting({ myResponse: 'ACCEPTED', invitees: [{ userId: EMPLOYEE.id, fullName: 'Ana Cruz', response: 'ACCEPTED' }] }) },
    });
    renderApp(<RequireAuth><MeetingsPage /></RequireAuth>);
    const item = await screen.findByRole('button', { name: /Daily standup/ });
    expect(within(item).getByText('Reply needed')).toBeInTheDocument();
    expect(within(item).getByText('2 in the call')).toBeInTheDocument();
    // employees can't schedule
    expect(screen.queryByRole('button', { name: /Schedule/ })).toBeNull();

    await userEvent.click(item);
    const dialog = await screen.findByRole('dialog', { name: 'Daily standup' });
    expect(await within(dialog).findByText('Emily Carter')).toBeInTheDocument();
    expect(within(dialog).getByText('Every day')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Join \(2 in the call\)/ })).toBeEnabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes' }));
    expect(calls.find((c) => c.path === '/meetings/m1/respond')!.body).toEqual({ response: 'ACCEPTED' });
    expect(await within(dialog).findByRole('button', { name: 'Yes', pressed: true })).toBeInTheDocument();
  });

  it('schedules a meeting in the chosen time zone', async () => {
    const calls = mockApi({
      'POST /auth/refresh': { body: loginResponse(MANAGER) },
      'GET /meetings': { body: [] },
      'POST /meetings': { status: 201, body: meeting({ id: 'm2', title: 'Sprint planning', canEdit: true }) },
      'GET /meetings/m2': { body: meeting({ id: 'm2', title: 'Sprint planning', canEdit: true, myResponse: null }) },
    });
    renderApp(<RequireAuth><MeetingsPage /></RequireAuth>);
    expect(await screen.findByText('Nothing on your calendar for the next 30 days')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /Schedule/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Schedule a meeting' });
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Sprint planning');
    const date = within(dialog).getByLabelText('Date');
    await userEvent.clear(date);
    await userEvent.type(date, '2027-01-04');
    const time = within(dialog).getByLabelText('Start time');
    await userEvent.clear(time);
    await userEvent.type(time, '09:00');
    await userEvent.selectOptions(within(dialog).getByLabelText('Length'), '60');
    await userEvent.selectOptions(within(dialog).getByLabelText('Repeat'), 'WEEKLY');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schedule' }));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/meetings')!.body).toMatchObject({
      title: 'Sprint planning',
      startsAt: '2027-01-04T01:00:00.000Z', // 9:00 in Manila
      durationMinutes: 60,
      timezone: 'Asia/Manila',
      recurrence: 'WEEKLY',
      recurrenceUntil: null,
      inviteeIds: [],
    });
    expect(await screen.findByRole('dialog', { name: 'Sprint planning' })).toBeInTheDocument();
  });

  it('needs a title', async () => {
    const calls = mockApi({ 'POST /auth/refresh': { body: loginResponse(MANAGER) }, 'GET /meetings': { body: [] } });
    renderApp(<RequireAuth><MeetingsPage /></RequireAuth>);
    await userEvent.click((await screen.findAllByRole('button', { name: /Schedule/ }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Schedule a meeting' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schedule' }));
    expect(within(dialog).getByText('Give the meeting a title')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/meetings')).toBe(false);
  });
});

/* ---- ringing ---- */

type Cb = (d: unknown) => void;
const handlers = new Map<string, Set<Cb>>();
vi.mock('@/lib/presence', () => ({
  usePresence: () => ({
    on: (ev: string, cb: Cb) => {
      handlers.set(ev, (handlers.get(ev) ?? new Set()).add(cb));
      return () => handlers.get(ev)!.delete(cb);
    },
    people: {},
    rooms: [],
  }),
}));
const emit = (ev: string, d: unknown) => act(() => handlers.get(ev)?.forEach((cb) => cb(d)));

function Active() {
  const { active } = useCalls();
  return <p>{active ? `In call ${active.meetingId}` : 'No call'}</p>;
}

describe('Incoming calls', () => {
  it('rings, and Answer joins the call; Decline tells the caller', async () => {
    const calls = mockApi({
      'POST /meetings/c1/join': { body: { url: 'ws://lk', token: 't', meetingId: 'c1', occurrenceStart: inMinutes(0), title: 'Ana and Emily', kind: 'INSTANT', isHost: false, canRecord: false, recording: false } },
      'POST /calls/c2/decline': { status: 204 },
    });
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <CallsProvider>
            <CallPrompts />
            <Active />
          </CallsProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    emit('call:incoming', { meetingId: 'c1', fromId: 'u-ana', fromName: 'Ana Cruz', title: 'Ana and Emily', startedAt: inMinutes(0) });
    emit('call:incoming', { meetingId: 'c2', fromId: 'u-kim', fromName: 'Kim Navarro', title: 'Kim and Emily', startedAt: inMinutes(0) });
    expect(screen.getByRole('alertdialog', { name: 'Ana Cruz is calling' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Decline call from Kim Navarro' }));
    expect(calls.some((c) => c.path === '/calls/c2/decline')).toBe(true);
    expect(screen.queryByRole('alertdialog', { name: 'Kim Navarro is calling' })).toBeNull();

    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Ana Cruz is calling' })).getByRole('button', { name: /Answer/ }));
    expect(await screen.findByText('In call c1')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // the caller hung up before you answered: the prompt goes away
    emit('call:incoming', { meetingId: 'c3', fromId: 'u-kim', fromName: 'Kim Navarro', title: 'x', startedAt: inMinutes(0) });
    emit('call:ended', { meetingId: 'c3', reason: 'cancelled' });
    expect(screen.queryByRole('alertdialog', { name: 'Kim Navarro is calling' })).toBeNull();
  });

  it('shows a reminder before a meeting starts', async () => {
    mockApi({});
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <CallsProvider>
            <CallPrompts />
          </CallsProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    emit('meeting:reminder', { meetingId: 'm9', title: 'Weekly team meeting', start: inMinutes(10) });
    const r = screen.getByRole('alertdialog', { name: 'Weekly team meeting starts soon' });
    await userEvent.click(within(r).getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
