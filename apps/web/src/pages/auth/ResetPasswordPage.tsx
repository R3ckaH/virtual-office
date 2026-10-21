import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema, PASSWORD_MIN_LENGTH } from '@vo/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { Alert, Button, Field, Input, Spinner } from '@/components/ui';
import { apiRaw } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { AuthLayout } from './AuthLayout';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: "Passwords don't match" });
type Values = z.infer<typeof schema>;

/** Handles both "reset my password" links and "set up your account" invite links. */
export function ResetPasswordPage() {
  const token = new URLSearchParams(useLocation().search).get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = useQuery({
    queryKey: ['reset-token', token],
    queryFn: () => apiRaw<{ email: string; fullName: string; purpose: 'INVITE' | 'PASSWORD_RESET' }>('/auth/reset-password/validate', { method: 'POST', json: { token } }),
    enabled: token.length >= 20,
    retry: false,
  });
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const invite = info.data?.purpose === 'INVITE';

  const submit = form.handleSubmit(async ({ password }) => {
    setError(null);
    try {
      await apiRaw('/auth/reset-password', { method: 'POST', json: { token, password } });
      setDone(true);
    } catch (e) {
      setError(applyServerErrors(e, form.setError, ['password']));
    }
  });

  if (!token || info.isError) {
    return (
      <AuthLayout title="This link has expired">
        <div className="space-y-4">
          <p className="text-muted">Reset and invite links work once and expire. Request a new one to continue.</p>
          <Link to="/forgot-password" className="text-sm text-brand-fg hover:underline">
            Get a new reset link
          </Link>
        </div>
      </AuthLayout>
    );
  }
  if (info.isLoading) {
    return (
      <AuthLayout title="One moment">
        <Spinner label="Checking your link" />
      </AuthLayout>
    );
  }
  if (done) {
    return (
      <AuthLayout title={invite ? "You're all set" : 'Password updated'}>
        <div className="space-y-5">
          <p className="text-muted">
            {invite ? 'Your account is ready.' : 'For your security, you were signed out on all devices.'} Sign in with your new password.
          </p>
          <Link to="/login" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand font-medium text-brand-ink">
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={invite ? `Welcome, ${info.data!.fullName.split(' ')[0]}` : 'Choose a new password'}
      subtitle={invite ? `Set a password for ${info.data!.email} to finish setting up your account.` : `For ${info.data!.email}`}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <input type="email" autoComplete="username" value={info.data!.email} readOnly hidden />
        <Field label="New password" error={form.formState.errors.password?.message} hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="password" autoComplete="new-password" autoFocus aria-describedby={describedBy} aria-invalid={invalid} {...form.register('password')} />
          )}
        </Field>
        <Field label="Confirm password" error={form.formState.errors.confirm?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} aria-invalid={invalid} {...form.register('confirm')} />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          {invite ? 'Set password' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
