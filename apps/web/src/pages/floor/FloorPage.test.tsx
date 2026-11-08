import type { PresencePersonDto, RoomDto } from '@vo/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PresencePrompts } from '@/components/presence/PresencePrompts';
import { StatusMenu } from '@/components/presence/StatusMenu';
import type { PresenceState } from '@/lib/presence';
import { renderApp } from '@/test/utils';
import { FloorPage } from './FloorPage';

const ME = 'u-ana';
const room = (spot: RoomDto['spot'], name: string, kind: RoomDto['kind'], over: Partial<RoomDto> = {}): RoomDto => ({
  id: `r-${spot}`,
  spot,
  name,
  kind,
  departmentId: null,
  ownerId: null,
  memberIds: [],
  capacity: 5,
  ...over,
});
const ROOMS = [
  room('pastor', 'Senior Pastor’s office', 'PRIVATE', { ownerId: 'u-joel', capacity: 3 }),
  room('ceo', 'CEO Strategy Room', 'LEADERS', { ownerId: 'u-joel', memberIds: ['u-andrew'], capacity: 9 }),
  room('eng', 'Engineering', 'DEPARTMENT'),
  room('huddle', 'Huddle room', 'MEETING', { capacity: 6 }),
  room('sales', 'Sales', 'DEPARTMENT'),
  room('lobby', 'Lobby', 'OPEN'),
  room('ops', 'Operations & HR', 'DEPARTMENT', { capacity: 3 }),
  room('break', 'Break Room', 'BREAK', { capacity: 6 }),
  room('focus', 'Focus booth', 'PRIVATE', { capacity: 2 }),
];
const person = (userId: string, fullName: string, over: Partial<PresencePersonDto> = {}): PresencePersonDto => ({
  userId,
  fullName,
  title: null,
  departmentName: null,
  timezone: 'Asia/Manila',
  avatarUrl: null,
  status: 'AVAILABLE',
  manualStatus: null,
  message: null,
  roomId: 'r-eng',
  enteredAt: '2026-11-08T01:00:00.000Z',
  lastSeenAt: null,
  ...over,
});

let state: PresenceState;
const send = vi.fn();

vi.mock('@/lib/presence', () => ({
  usePresence: () => state,
  useOccupants: () => {
    const m = new Map<string, PresencePersonDto[]>();
    for (const p of Object.values(state.people)) {
      if (!p.roomId || p.status === 'OFFLINE') continue;
      m.set(p.roomId, [...(m.get(p.roomId) ?? []), p]);
    }
    return m;
  },
}));

beforeEach(() => {
  send.mockReset().mockResolvedValue({ ok: true });
  const people = [
    person(ME, 'Ana Cruz', { title: 'Software Engineer', departmentName: 'Engineering' }),
    person('u-joel', 'Ptr. Joel Santiago', { roomId: 'r-pastor' }),
    person('u-emily', 'Emily Carter', { timezone: 'America/New_York', status: 'AWAY', message: 'Late shift', roomId: 'r-sales' }),
    person('u-sam', 'Sam Porter', { status: 'OFFLINE', roomId: null, lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString() }),
  ];
  state = {
    connection: 'online',
    me: ME,
    rooms: ROOMS,
    people: Object.fromEntries(people.map((p) => [p.userId, p])),
    meetings: [],
    knocks: [],
    summons: [],
    myKnock: null,
    knockAnswer: null,
    send,
    dismissSummon: vi.fn(),
  };
});

describe('Office floor', () => {
  it('shows every room, who is in it, and who is offline', async () => {
    renderApp(<FloorPage />);
    expect(screen.getByRole('heading', { name: 'Office floor' })).toBeInTheDocument();
    expect(screen.getByText('3 in the office · 1 offline')).toBeInTheDocument();
    for (const r of ROOMS) expect(screen.getByRole('button', { name: new RegExp(`^${r.name}`) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Engineering, 1 person\. You’re here/ })).toBeInTheDocument();
    expect(screen.getByText('Sam Porter')).toBeInTheDocument();
  });

  it('walks into an open room', async () => {
    renderApp(<FloorPage />);
    await userEvent.click(screen.getByRole('button', { name: /^Lobby/ }));
    expect(send).toHaveBeenCalledWith('room:enter', { roomId: 'r-lobby' });
  });

  it('asks before knocking on a private office, then knocks', async () => {
    renderApp(<FloorPage />);
    await userEvent.click(screen.getByRole('button', { name: /^Senior Pastor’s office/ }));
    expect(send).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Knock on Senior Pastor’s office?' });
    expect(within(dialog).getByText(/Ptr\. Joel Santiago will get a notification/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Knock' }));
    expect(send).toHaveBeenCalledWith('knock:send', { roomId: 'r-pastor' });
  });

  it('won’t knock on an empty room', async () => {
    renderApp(<FloorPage />);
    await userEvent.click(screen.getByRole('button', { name: /^CEO Strategy Room/ }));
    const dialog = screen.getByRole('dialog', { name: 'Knock on CEO Strategy Room?' });
    expect(within(dialog).getByText(/No one is in CEO Strategy Room right now/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Knock' })).toBeDisabled();
  });

  it('shows a person’s status, message and local time when you click them', async () => {
    renderApp(<FloorPage />);
    await userEvent.click(screen.getByRole('button', { name: /^Emily Carter, Away/ }));
    expect(screen.getByText('Late shift', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText(/in New York/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Message/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Call/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go to Sales' })).toBeInTheDocument();
  });

  it('lets the room owner call members and end the meeting', async () => {
    state = { ...state, me: 'u-joel', people: { ...state.people, 'u-andrew': person('u-andrew', 'Andrew Tan', { roomId: 'r-lobby' }) } };
    send.mockResolvedValue({ ok: true, data: { sent: 1, offline: [] } });
    renderApp(<FloorPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Call everyone online' }));
    expect(send).toHaveBeenCalledWith('summon:send', { roomId: 'r-ceo', userIds: ['u-andrew'] });
    expect(await screen.findByText(/Called 1 person to CEO Strategy Room/)).toBeInTheDocument();
  });
});

describe('Status menu', () => {
  it('sets a status and a message', async () => {
    renderApp(<StatusMenu />);
    await userEvent.click(screen.getByRole('button', { name: /Available/ }));
    const dialog = screen.getByRole('dialog', { name: 'Set your status' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Busy/ }));
    await userEvent.type(within(dialog).getByLabelText(/Message/), 'Shipping the release');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save status' }));
    expect(send).toHaveBeenCalledWith('status:set', { status: 'BUSY', message: 'Shipping the release' });
  });
});

describe('Knocks and summons', () => {
  it('lets you answer a knock from anywhere in the app', async () => {
    state = { ...state, knocks: [{ id: 'k1', roomId: 'r-eng', fromId: 'u-x', fromName: 'Kim Navarro', createdAt: new Date().toISOString() }] };
    renderApp(<PresencePrompts />);
    expect(screen.getByText('Kim Navarro is knocking')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Let them in' }));
    expect(send).toHaveBeenCalledWith('knock:answer', { id: 'k1', accept: true });
  });

  it('shows a summons with Join and Not now', async () => {
    state = { ...state, summons: [{ id: 's1', roomId: 'r-ceo', roomName: 'CEO Strategy Room', hostId: 'u-joel', hostName: 'Ptr. Joel Santiago', createdAt: new Date().toISOString() }] };
    renderApp(<PresencePrompts />);
    expect(screen.getByText('Ptr. Joel Santiago is calling you')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(send).toHaveBeenCalledWith('summon:answer', { id: 's1', accept: false });
  });
});
