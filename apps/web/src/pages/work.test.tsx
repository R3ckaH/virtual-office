import type { LeaveBalanceDto, LeavePreviewDto, LeaveRequestDto, LeaveTypeDto, ReportDto, TaskDto } from '@vo/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/components/layout/guards';
import { loginResponse, me, mockApi, renderApp } from '@/test/utils';
import { LeavePage } from './leave/LeavePage';
import { ReportsPage } from './reports/ReportsPage';
import { TasksPage } from './tasks/TasksPage';

vi.mock('@/lib/presence', () => ({
  usePresence: () => ({ people: {}, rooms: [], me: 'u-me', send: vi.fn(), on: () => () => undefined, connection: 'online' }),
}));

const EMPLOYEE = { ...me('EMPLOYEE'), departmentId: 'd-eng', departmentName: 'Engineering' };
const MANAGER = { ...me('MANAGER', ['team.read', 'reports.read']), departmentId: 'd-eng', departmentName: 'Engineering' };

beforeEach(() => {
  document.cookie = 'vo_csrf=test-csrf';
});

const TYPES: LeaveTypeDto[] = [{ id: 't-vac', name: 'Vacation', color: '#16a34a', paid: true, yearlyDays: 15, active: true, inUse: true }];
const BALANCES: LeaveBalanceDto[] = [{ typeId: 't-vac', typeName: 'Vacation', color: '#16a34a', paid: true, year: 2026, allowance: 15, adjustments: 0, used: 3, pending: 0, remaining: 12 }];
const request = (over: Partial<LeaveRequestDto> = {}): LeaveRequestDto => ({
  id: 'r1',
  userId: 'u-ana',
  userName: 'Ana Cruz',
  departmentName: 'Engineering',
  typeId: 't-vac',
  typeName: 'Vacation',
  color: '#16a34a',
  startDate: '2026-12-21',
  endDate: '2026-12-23',
  days: 3,
  reason: 'Family trip',
  status: 'PENDING',
  approverName: 'Jose Reyes',
  decidedByName: null,
  decidedAt: null,
  decisionNote: null,
  createdAt: '2026-11-10T01:00:00Z',
  canDecide: false,
  canCancel: true,
  ...over,
});

describe('Leave', () => {
  it('shows the balance and files leave with a live day count', async () => {
    const preview: LeavePreviewDto = {
      days: 2,
      dates: [
        { date: '2026-12-24', counted: true, note: null },
        { date: '2026-12-25', counted: false, note: 'Christmas Day' },
        { date: '2026-12-26', counted: true, note: null },
      ],
      remainingAfter: 10,
      overlaps: [],
    };
    const calls = mockApi({
      'POST /auth/refresh': { body: loginResponse(EMPLOYEE) },
      'GET /leave/balances': { body: BALANCES },
      'GET /leave/requests': { body: [] },
      'GET /leave/types': { body: TYPES },
      'GET /leave/preview': { body: preview },
      'POST /leave/requests': { status: 201, body: request({ id: 'r2', startDate: '2026-12-24', endDate: '2026-12-26', days: 2 }) },
      'GET /leave/requests/r2': { body: request({ id: 'r2', startDate: '2026-12-24', endDate: '2026-12-26', days: 2 }) },
    });
    renderApp(<RequireAuth><LeavePage /></RequireAuth>);
    expect(await screen.findByText(/of 15 days left/)).toBeInTheDocument();
    // employees don't get an approvals tab
    expect(screen.queryByRole('tab', { name: /To approve/ })).toBeNull();

    await userEvent.click(screen.getAllByRole('button', { name: /File leave/ })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'File leave' });
    const first = within(dialog).getByLabelText('First day');
    await userEvent.clear(first);
    await userEvent.type(first, '2026-12-24');
    const last = within(dialog).getByLabelText('Last day');
    await userEvent.clear(last);
    await userEvent.type(last, '2026-12-26');
    expect(await within(dialog).findByText(/Christmas Day/)).toBeInTheDocument();
    expect(within(dialog).getByText('10 days left after this.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Holidays with family');
    await userEvent.click(within(dialog).getByRole('button', { name: 'File 2 days' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/leave/requests')).toBe(true));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/leave/requests')!.body).toEqual({ typeId: 't-vac', startDate: '2026-12-24', endDate: '2026-12-26', reason: 'Holidays with family' });
  });

  it('lets a manager approve from the queue', async () => {
    const calls = mockApi({
      'POST /auth/refresh': { body: loginResponse(MANAGER) },
      'GET /leave/balances': { body: [] },
      'GET /leave/requests': (init) => ({ body: String(init.url).includes('status=PENDING') ? [request({ canDecide: true, canCancel: false })] : [] }),
      'POST /leave/requests/r1/decision': { body: request({ status: 'APPROVED', decidedByName: 'Jose Reyes' }) },
    });
    renderApp(<RequireAuth><LeavePage /></RequireAuth>);
    await userEvent.click(await screen.findByRole('tab', { name: 'To approve (1)' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Approve Ana Cruz’s leave' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/leave/requests/r1/decision')?.body).toEqual({ approve: true }));
  });
});

describe('Tasks', () => {
  const task = (over: Partial<TaskDto>): TaskDto => ({
    id: 'k1',
    title: 'Write release notes',
    description: null,
    status: 'TODO',
    assigneeId: 'u-me',
    assigneeName: 'Ana Cruz',
    createdById: 'u-me',
    createdByName: 'Ana Cruz',
    departmentId: null,
    departmentName: null,
    dueDate: null,
    completedAt: null,
    position: 1,
    createdAt: '2026-11-10T01:00:00Z',
    updatedAt: '2026-11-10T01:00:00Z',
    canEdit: true,
    canDelete: true,
    ...over,
  });

  it('shows the board, moves a card and adds a task', async () => {
    let list = [task({}), task({ id: 'k2', title: 'Fix login bug', status: 'IN_PROGRESS', dueDate: '2020-01-01' })];
    const calls = mockApi({
      'POST /auth/refresh': { body: loginResponse(EMPLOYEE) },
      'GET /tasks': () => ({ body: list }),
      'PATCH /tasks/k1': () => {
        list = list.map((t) => (t.id === 'k1' ? { ...t, status: 'IN_PROGRESS' as const } : t));
        return { body: list[0] };
      },
      'POST /tasks': { status: 201, body: task({ id: 'k3', title: 'Plan sprint' }) },
    });
    renderApp(<RequireAuth><TasksPage /></RequireAuth>);
    const todo = await screen.findByRole('region', { name: 'To do, 1' });
    expect(within(todo).getByText('Write release notes')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'In progress, 1' })).getByText(/Overdue/)).toBeInTheDocument();
    await userEvent.click(within(todo).getByRole('button', { name: 'Move “Write release notes” to In progress' }));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ status: 'IN_PROGRESS' });
    expect(await screen.findByRole('region', { name: 'In progress, 2' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /New task/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Plan sprint');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add task' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/tasks')?.body).toMatchObject({ title: 'Plan sprint', status: 'TODO', departmentId: null }));
  });
});

describe('Reports', () => {
  it('shows the report and its totals', async () => {
    const report: ReportDto = {
      kind: 'attendance',
      title: 'Attendance summary',
      subtitle: 'Nov 1 – Nov 14, 2026 · Your team',
      timezone: 'Asia/Manila',
      columns: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'minutes', label: 'Time worked', type: 'minutes' },
        { key: 'late', label: 'Late days', type: 'number' },
      ],
      rows: [{ name: 'Ana Cruz', minutes: 4830, late: 2 }],
      totals: { name: '1 people', minutes: 4830, late: 2 },
      generatedAt: '2026-11-14T02:00:00Z',
    };
    mockApi({ 'POST /auth/refresh': { body: loginResponse(MANAGER) }, 'GET /reports/attendance': { body: report } });
    renderApp(<RequireAuth><ReportsPage /></RequireAuth>);
    const table = await screen.findByRole('region', { name: 'Attendance summary' });
    expect(within(table).getAllByText('80 h 30 min')).toHaveLength(2);
    expect(within(table).getByText(/Your team/)).toBeInTheDocument();
    // managers don't see the login history
    expect(screen.queryByRole('radio', { name: 'Login history' })).toBeNull();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeEnabled();
  });
});
