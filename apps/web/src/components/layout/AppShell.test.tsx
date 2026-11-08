import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RequireAuth, RequirePermission } from '@/components/layout/guards';
import { loginResponse, me, mockApi, renderApp } from '@/test/utils';
import { AppShell } from './AppShell';

const config = { body: { companyName: 'Acme Corp', primaryColor: '#2563eb', logoUrl: null, sessionTimeoutMinutes: 30, ssoProviders: [], deviceHost: null, realtimeUrl: null } };
const ADMIN_PERMS = ['users.read', 'users.manage', 'departments.manage', 'authEvents.read', 'auditLogs.read', 'team.read', 'reports.read', 'settings.manage'];

function App() {
  return (
    <Routes>
      <Route path="/login" element={<p>Login screen</p>} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<p>Home screen</p>} />
        <Route path="admin/users" element={<RequirePermission permission="users.manage"><p>People admin</p></RequirePermission>} />
      </Route>
    </Routes>
  );
}

function signedInAs(user: ReturnType<typeof me>) {
  document.cookie = 'vo_csrf=test-csrf';
  return mockApi({
    'GET /config': config,
    'POST /auth/refresh': { body: loginResponse(user) },
    'POST /auth/activity': { body: {} },
    'GET /org/timezones': { body: [{ timezone: 'Asia/Manila', people: 6 }, { timezone: 'America/New_York', people: 2 }] },
  });
}

describe('AppShell navigation (RBAC in the UI)', () => {
  beforeEach(() => {
    document.cookie = 'vo_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('sends signed-out visitors to the login page', async () => {
    mockApi({ 'GET /config': config });
    renderApp(<App />, { route: '/admin/users' });
    expect(await screen.findByText('Login screen')).toBeInTheDocument();
  });

  it('restores the session on load and sends the CSRF header', async () => {
    const calls = signedInAs(me('EMPLOYEE'));
    renderApp(<App />);
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.find(([u]) => u === '/api/auth/refresh')![1];
    expect(new Headers(init.headers).get('x-csrf-token')).toBe('test-csrf');
  });

  it('hides admin and reports links from employees and blocks the page', async () => {
    signedInAs(me('EMPLOYEE'));
    renderApp(<App />, { route: '/admin/users' });
    expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0];
    expect(within(nav).queryByRole('link', { name: /People/ })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /Reports/ })).toBeNull();
    expect(within(nav).getByRole('link', { name: /Home/ })).toBeInTheDocument();
  });

  it('shows the admin section to admins', async () => {
    signedInAs(me('ADMIN', ADMIN_PERMS));
    renderApp(<App />, { route: '/admin/users' });
    expect(await screen.findByText('People admin')).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0];
    for (const name of [/People/, /Departments/, /Login history/, /Audit log/, /Reports/]) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('shows clocks for the team time zones', async () => {
    signedInAs(me('EMPLOYEE'));
    renderApp(<App />);
    const clocks = await screen.findByRole('list', { name: 'Team time zones' });
    expect(await within(clocks).findByText('New York')).toBeInTheDocument();
    expect(within(clocks).getByText('Manila (you)')).toBeInTheDocument();
  });

  it('shows HR the attendance pages but not People admin', async () => {
    signedInAs(me('HR', ['users.read', 'attendance.manage', 'devices.manage', 'reports.read']));
    renderApp(<App />);
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0];
    expect(within(nav).getByRole('link', { name: /Attendance board/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Biometric devices/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Schedules & setup/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /^People/ })).toBeNull();
  });
});
