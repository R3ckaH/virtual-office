import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/lib/auth';

type Handler = (init: RequestInit & { url: string }) => { status?: number; body?: unknown };

/** Minimal fetch mock keyed by "METHOD /path". */
export function mockApi(routes: Record<string, Handler | { status?: number; body?: unknown }>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace(/^\/api/, '').split('?')[0];
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const route = routes[`${method} ${path}`];
      const r = typeof route === 'function' ? route({ ...init, url }) : route;
      const status = r?.status ?? (route ? 200 : 404);
      const body = r?.body ?? (route ? {} : { statusCode: 404, message: 'Not found' });
      return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
  return calls;
}

export function renderApp(ui: ReactNode, { route = '/' } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <ToastProvider>{ui}</ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const me = (role: 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE', permissions: string[] = []) => ({
  id: '00000000-0000-4000-8000-000000000001',
  email: `${role.toLowerCase()}@acme.test`,
  fullName: role === 'ADMIN' ? 'Maria Santos' : role === 'HR' ? 'Grace Lim' : 'Ana Cruz',
  title: null,
  avatarUrl: null,
  role,
  status: 'ACTIVE',
  timezone: 'Asia/Manila',
  departmentId: null as string | null,
  departmentName: 'Engineering',
  managerId: null,
  managerName: 'Jose Reyes',
  mfaEnabled: false,
  locked: false,
  lastLoginAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  permissions,
});

export const loginResponse = (user: ReturnType<typeof me>) => ({
  mfaRequired: false,
  accessToken: 'test.token.value',
  expiresIn: 600,
  sessionTimeoutMinutes: 30,
  user,
});
