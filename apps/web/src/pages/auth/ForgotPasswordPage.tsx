import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@vo/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Alert, Button, Field, Input } from '@/components/ui';
import { apiRaw } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await apiRaw('/auth/forgot-password', { method: 'POST', json: values });
      setSentTo(values.email);
    } catch (e) {
      setError(applyServerErrors(e, form.setError, ['email']));
    }
  });

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <div className="space-y-5">
          <p className="text-muted">
            If <span className="font-medium text-ink">{sentTo}</span> belongs to an active account, we&apos;ve sent a link to
            reset your password. It expires in 1 hour.
          </p>
          <Link to="/login" className="inline-block text-sm text-brand-fg hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your work email and we'll send you a reset link.">
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Field label="Work email" error={form.formState.errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="email" autoComplete="email" autoFocus aria-describedby={describedBy} aria-invalid={invalid} {...form.register('email')} />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Send reset link
        </Button>
        <p className="text-center text-sm">
          <Link to="/login" className="text-brand-fg hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
