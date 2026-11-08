import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RedirectIfSignedIn } from '@/components/layout/guards';
import { loginResponse, me, mockApi, renderApp } from '@/test/utils';
import { LoginPage } from './LoginPage';

const config = { body: { companyName: 'Acme Corp', primaryColor: '#2563eb', logoUrl: null, sessionTimeoutMinutes: 30, ssoProviders: [], deviceHost: null, realtimeUrl: null } };

function App() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
      <Route path="/" element={<p>Home screen</p>} />
    </Routes>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    document.cookie = 'vo_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('shows field errors without calling the API when the form is empty', async () => {
    const calls = mockApi({ 'GET /config': config });
    renderApp(<App />, { route: '/login' });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/auth/login')).toBe(false);
  });

  it('shows the server message for wrong credentials', async () => {
    mockApi({
      'GET /config': config,
      'POST /auth/login': { status: 401, body: { statusCode: 401, message: 'Incorrect email or password', code: 'INVALID_CREDENTIALS' } },
    });
    renderApp(<App />, { route: '/login' });
    await userEvent.type(await screen.findByLabelText('Work email'), 'ana@acme.test');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('asks for the 2-step code, then signs in', async () => {
    const calls = mockApi({
      'GET /config': config,
      'POST /auth/login': { body: { mfaRequired: true, mfaToken: 'mfa-token' } },
      'POST /auth/login/mfa': { body: loginResponse(me('EMPLOYEE')) },
      'POST /auth/activity': { body: {} },
    });
    renderApp(<App />, { route: '/login' });
    await userEvent.type(await screen.findByLabelText('Work email'), 'employee@acme.test');
    await userEvent.type(screen.getByLabelText('Password'), 'OfficePass2026!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const code = await screen.findByLabelText('Code from your authenticator app');
    await userEvent.type(code, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    await waitFor(() => expect(screen.getByText('Home screen')).toBeInTheDocument());
    expect(calls.find((c) => c.path === '/auth/login/mfa')?.body).toEqual({ mfaToken: 'mfa-token', code: '123456' });
  });

  it('explains an SSO sign-in failure', async () => {
    mockApi({ 'GET /config': config });
    renderApp(<App />, { route: '/login?error=sso_no_account' });
    expect(await screen.findByRole('alert')).toHaveTextContent("There's no account for that email yet");
  });
});
