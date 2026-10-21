import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@vo/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { Alert, Button, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePublicConfig } from '@/lib/config';
import { applyServerErrors } from '@/lib/forms';
import { AuthLayout } from './AuthLayout';

const SSO_ERRORS: Record<string, string> = {
  sso_no_account: "There's no account for that email yet. Ask your administrator to add you.",
  sso_deactivated: 'This account is deactivated. Contact your administrator.',
  sso_unverified_email: "That account's email isn't verified with the provider.",
  sso_failed: "Sign-in with that provider didn't complete. Try again.",
};

const NOTICE_TONE: Record<string, 'warn' | 'info'> = { SESSION_TIMEOUT: 'info', FORCED_LOGOUT: 'warn', ACCOUNT_DEACTIVATED: 'warn' };

function SsoButtons({ next }: { next: string }) {
  const { data } = usePublicConfig();
  const providers = data?.ssoProviders ?? [];
  if (!providers.length) return null;
  const label = { google: 'Continue with Google', microsoft: 'Continue with Microsoft' } as const;
  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <a
          key={p}
          href={`/api/auth/sso/${p}/start?returnTo=${encodeURIComponent(next)}`}
          className="flex h-10 w-full items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium hover:bg-sunken"
        >
          {label[p]}
        </a>
      ))}
      <div className="flex items-center gap-3 py-2 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> or use your email <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

const mfaForm = z.object({ code: z.string().trim().min(6, 'Enter the 6-digit code').max(11) });

function MfaStep({ mfaToken, onBack }: { mfaToken: string; onBack: () => void }) {
  const { loginMfa } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const form = useForm<{ code: string }>({ resolver: zodResolver(mfaForm) });

  const submit = form.handleSubmit(async ({ code }) => {
    setError(null);
    try {
      await loginMfa(mfaToken, code);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'MFA_EXPIRED') return onBack();
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.');
      form.setValue('code', '');
      form.setFocus('code');
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error && <Alert>{error}</Alert>}
      <Field
        label={useRecovery ? 'Recovery code' : 'Code from your authenticator app'}
        error={form.formState.errors.code?.message}
        hint={useRecovery ? 'Each recovery code works once.' : undefined}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            autoFocus
            autoComplete="one-time-code"
            inputMode={useRecovery ? 'text' : 'numeric'}
            placeholder={useRecovery ? 'xxxxx-xxxxx' : '123456'}
            className="tabular tracking-widest"
            {...form.register('code')}
          />
        )}
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
        Verify and sign in
      </Button>
      <div className="flex justify-between text-sm">
        <button type="button" className="text-brand-fg hover:underline" onClick={() => setUseRecovery((v) => !v)}>
          {useRecovery ? 'Use authenticator code' : 'Use a recovery code'}
        </button>
        <button type="button" className="text-muted hover:text-ink" onClick={onBack}>
          Start over
        </button>
      </div>
    </form>
  );
}

export function LoginPage() {
  const { login, notice, clearNotice } = useAuth();
  const params = new URLSearchParams(useLocation().search);
  const next = params.get('next') ?? '/';
  const ssoError = params.get('error');
  const [error, setError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    clearNotice();
    try {
      const challenge = await login(values);
      if (challenge) setMfaToken(challenge.mfaToken);
    } catch (e) {
      setError(applyServerErrors(e, form.setError, ['email', 'password']));
      form.resetField('password');
    }
  });

  if (mfaToken) {
    return (
      <AuthLayout title="Two-step verification" subtitle="Open your authenticator app and enter the current code.">
        <MfaStep mfaToken={mfaToken} onBack={() => setMfaToken(null)} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back to the office.">
      <div className="space-y-5">
        {notice && (
          <Alert tone={NOTICE_TONE[notice.code] ?? 'info'}>{notice.message}</Alert>
        )}
        {ssoError && SSO_ERRORS[ssoError] && <Alert>{SSO_ERRORS[ssoError]}</Alert>}
        <SsoButtons next={next} />
        <form onSubmit={submit} noValidate className="space-y-5">
          {error && <Alert>{error}</Alert>}
          <Field label="Work email" error={form.formState.errors.email?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="email" autoComplete="username" autoFocus aria-describedby={describedBy} aria-invalid={invalid} {...form.register('email')} />
            )}
          </Field>
          <Field label="Password" error={form.formState.errors.password?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="password" autoComplete="current-password" aria-describedby={describedBy} aria-invalid={invalid} {...form.register('password')} />
            )}
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
            Sign in
          </Button>
          <p className="text-center text-sm">
            <Link to="/forgot-password" className="text-brand-fg hover:underline">
              Forgot your password?
            </Link>
          </p>
        </form>
      </div>
    </AuthLayout>
  );
}
