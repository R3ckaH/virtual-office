import type { ChannelDto, MessageDto, PresencePersonDto } from '@vo/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/components/layout/guards';
import { loginResponse, me, mockApi, renderApp } from '@/test/utils';
import { ChatPage } from './ChatPage';

const ANA = me('EMPLOYEE');
const ch = (over: Partial<ChannelDto>): ChannelDto => ({
  id: 'c-eng',
  kind: 'DEPARTMENT',
  name: 'Engineering',
  description: null,
  isPrivate: false,
  departmentId: 'd1',
  people: [],
  memberCount: 6,
  isMember: true,
  canManage: false,
  canPost: true,
  lastSeq: 12,
  lastMessageAt: new Date().toISOString(),
  lastReadSeq: 10,
  unread: 2,
  mentions: 1,
  archivedAt: null,
  ...over,
});
const CHANNELS = [
  ch({ id: 'c-ann', kind: 'ANNOUNCEMENTS', name: 'Announcements', canPost: false, unread: 1, mentions: 0, departmentId: null }),
  ch({}),
  ch({ id: 'c-dm', kind: 'DM', name: 'Emily Carter', isPrivate: true, people: [{ userId: 'u-emily', fullName: 'Emily Carter', avatarUrl: null }], unread: 3, mentions: 0, departmentId: null }),
];
const msg = (over: Partial<MessageDto>): MessageDto => ({
  id: 'm1',
  seq: 11,
  channelId: 'c-eng',
  authorId: 'u-emily',
  authorName: 'Emily Carter',
  authorAvatarUrl: null,
  body: 'Build is green **again**',
  mentionIds: [],
  files: [],
  reactions: [{ emoji: '🎉', count: 2, userIds: ['u-x', 'u-y'] }],
  createdAt: new Date().toISOString(),
  editedAt: null,
  deleted: false,
  pinnedAt: null,
  pinnedByName: null,
  clientId: null,
  ...over,
});

const people: Record<string, Partial<PresencePersonDto>> = {
  'u-emily': { userId: 'u-emily', fullName: 'Emily Carter', status: 'AVAILABLE' },
};
vi.mock('@/lib/presence', () => ({
  usePresence: () => ({ people, rooms: [], send: vi.fn().mockResolvedValue({ ok: true }), on: () => () => undefined, connection: 'online' }),
}));

beforeEach(() => {
  document.cookie = 'vo_csrf=test-csrf';
  Element.prototype.scrollIntoView = vi.fn();
});

const page = (route: string) =>
  renderApp(
    <RequireAuth>
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:channelId" element={<ChatPage />} />
      </Routes>
    </RequireAuth>,
    { route },
  );

describe('Chat', () => {
  it('lists conversations with unread counts and mentions', async () => {
    mockApi({
      'POST /auth/refresh': { body: loginResponse(ANA) },
      'GET /chat/me': { body: { canCreateChannels: false, canAnnounce: false } },
      'GET /chat/channels': { body: CHANNELS },
      'GET /chat/channels/c-eng/messages': { body: { messages: [], hasBefore: false, hasAfter: false } },
      'GET /chat/channels/c-eng/members': { body: [] },
    });
    page('/chat/c-eng');
    const nav = await screen.findByRole('navigation', { name: 'Conversations' });
    expect(await within(nav).findByRole('link', { name: /Engineering/ })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByLabelText('1 mentions')).toBeInTheDocument();
    expect(within(nav).getByLabelText('3 unread')).toBeInTheDocument();
    // employees can't create channels
    expect(within(nav).queryByRole('button', { name: 'Create a channel' })).toBeNull();
  });

  it('shows messages and sends one with a mention', async () => {
    const calls = mockApi({
      'POST /auth/refresh': { body: loginResponse(ANA) },
      'GET /chat/me': { body: { canCreateChannels: false, canAnnounce: false } },
      'GET /chat/channels': { body: CHANNELS },
      'GET /chat/channels/c-eng/messages': { body: { messages: [msg({})], hasBefore: false, hasAfter: false } },
      'GET /chat/channels/c-eng/members': { body: [{ userId: 'u-emily', fullName: 'Emily Carter', avatarUrl: null, title: 'QA Engineer' }, { userId: ANA.id, fullName: ANA.fullName, avatarUrl: null, title: null }] },
      'POST /chat/channels/c-eng/messages': (init) => ({ status: 201, body: msg({ id: 'm2', seq: 13, authorId: ANA.id, authorName: ANA.fullName, ...JSON.parse(String(init.body)), reactions: [] }) }),
      'POST /chat/channels/c-eng/read': { status: 204 },
    });
    page('/chat/c-eng');
    expect(await screen.findByText('again', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🎉 2' })).toBeInTheDocument();

    const box = screen.getByRole('textbox', { name: 'Message #Engineering' });
    await userEvent.type(box, 'Thanks @Emi');
    expect(await screen.findByRole('option', { name: /Emily Carter/ })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    await userEvent.type(box, 'great work{Enter}');
    const sent = calls.find((c) => c.method === 'POST' && c.path === '/chat/channels/c-eng/messages')!.body as { body: string; mentionIds: string[] };
    expect(sent.body).toBe('Thanks @Emily Carter great work');
    expect(sent.mentionIds).toEqual(['u-emily']);
    expect(await screen.findByText('great work', { exact: false, selector: 'span' })).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('employees can read announcements but not post', async () => {
    mockApi({
      'POST /auth/refresh': { body: loginResponse(ANA) },
      'GET /chat/me': { body: { canCreateChannels: false, canAnnounce: false } },
      'GET /chat/channels': { body: CHANNELS },
      'GET /chat/channels/c-ann/messages': { body: { messages: [msg({ channelId: 'c-ann', body: 'Town hall Friday', pinnedAt: new Date().toISOString(), pinnedByName: 'Andrew Tan' })], hasBefore: false, hasAfter: false } },
      'POST /chat/channels/c-ann/read': { status: 204 },
    });
    page('/chat/c-ann');
    expect(await screen.findByText('Town hall Friday')).toBeInTheDocument();
    expect(screen.getByText(/Pinned by Andrew Tan/)).toBeInTheDocument();
    expect(screen.getByText('Leaders, HR and admins post announcements. You can react to them.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Message/ })).toBeNull();
  });
});
