import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema, PASSWORD_MIN_LENGTH, updateProfileSchema, type MeDto, type SessionDto } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import { z } from 'zod';
import { Alert, Badge, Button, Dialog, Field, Input, PageHeader, Panel, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { allTimeZones, formatDateTime, formatRelative, offsetLabel } from '@/lib/format';

function ProfileForm() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const schema = updateProfileSchema.required({ fullName: true, timezone: true });
  type V = z.infer<typeof schema>;
  const form = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: user!.fullName, title: user!.title ?? '', timezone: user!.timezone },
  });
  const submit = form.handleSubmit(async (v) => {
    try {
      const me = await api<MeDto>('/me', { method: 'PATCH', json: { ...v, title: v.title || null } });
      setUser(me);
      form.reset({ fullName: me.fullName, title: me.title ?? '', timezone: me.timezone });
      toast('Profile saved');
    } catch (e) {
      const msg = applyServerErrors(e, form.setError, ['fullName', 'title', 'timezone']);
      if (msg) toast(msg, 'danger');
    }
  });
  return (
    <Panel title="Profile" description="Times across the app are shown in your time zone.">
      <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" error={form.formState.errors.fullName?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} autoComplete="name" aria-describedby={describedBy} aria-invalid={invalid} {...form.register('fullName')} />}
        </Field>
        <Field label="Job title" error={form.formState.errors.title?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register('title')} />}
        </Field>
        <Field label="Time zone" error={form.formState.errors.timezone?.message} className="sm:col-span-2">
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register('timezone')}>
              {allTimeZones().map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')} ({offsetLabel(tz)})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
            Save profile
          </Button>
        </div>
      </form>
    </Panel>
  );
}

const pwSchema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: "Passwords don't match" });

function PasswordForm() {
  const toast = useToast();
  const qc = useQueryClient();
  const form = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) });
  const submit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      const r = await api<{ otherSessionsSignedOut: number }>('/me/password', { method: 'POST', json: { currentPassword, newPassword } });
      form.reset({ currentPassword: '', newPassword: '', confirm: '' });
      void qc.invalidateQueries({ queryKey: ['my-sessions'] });
      toast(r.otherSessionsSignedOut ? `Password changed. Signed out of ${r.otherSessionsSignedOut} other device(s).` : 'Password changed');
    } catch (e) {
      const msg = applyServerErrors(e, form.setError, ['currentPassword', 'newPassword']);
      if (msg) form.setError('currentPassword', { message: msg });
    }
  });
  return (
    <Panel title="Password" description="Changing it signs you out everywhere except this device.">
      <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-3">
        <input type="text" autoComplete="username" hidden readOnly />
        <Field label="Current password" error={form.formState.errors.currentPassword?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="current-password" aria-describedby={describedBy} aria-invalid={invalid} {...form.register('currentPassword')} />}
        </Field>
        <Field label="New password" error={form.formState.errors.newPassword?.message} hint={`${PASSWORD_MIN_LENGTH}+ characters, a letter and a number`}>
          {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} aria-invalid={invalid} {...form.register('newPassword')} />}
        </Field>
        <Field label="Confirm new password" error={form.formState.errors.confirm?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} aria-invalid={invalid} {...form.register('confirm')} />}
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" variant="secondary" loading={form.formState.isSubmitting}>
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function TwoFactor() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshMe = async () => setUser(await api<MeDto>('/me'));

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      setSetup(await api('/auth/mfa/setup', { method: 'POST' }));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not start setup', 'danger');
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api<{ recoveryCodes: string[] }>('/auth/mfa/enable', { method: 'POST', json: { code } });
      setCodes(r.recoveryCodes);
      setSetup(null);
      setCode('');
      await refreshMe();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not verify the code');
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setError(null);
    setBusy(true);
    try {
      await api('/auth/mfa/disable', { method: 'POST', json: { password, code } });
      setDisableOpen(false);
      setPassword('');
      setCode('');
      await refreshMe();
      toast('Two-step sign-in is off');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not turn it off');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={
        <span id="security" className="flex items-center gap-2">
          Two-step sign-in {user!.mfaEnabled ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>}
        </span>
      }
      description="After your password, you'll enter a code from an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password."
    >
      {codes ? (
        <div className="space-y-4">
          <Alert tone="ok" title="Two-step sign-in is on">
            Save these recovery codes somewhere safe. Each works once if you lose your phone. They won&apos;t be shown again.
          </Alert>
          <ul className="grid grid-cols-2 gap-2 rounded-lg bg-sunken p-4 font-mono text-sm sm:grid-cols-5">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(codes.join('\n')).then(() => toast('Copied'))}>
              Copy codes
            </Button>
            <Button onClick={() => setCodes(null)}>I saved them</Button>
          </div>
        </div>
      ) : setup ? (
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <img src={setup.qrDataUrl} alt="QR code to add this account to your authenticator app" className="h-44 w-44 rounded-lg border border-line bg-white p-2" />
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Scan the QR code with your authenticator app.</li>
              <li>
                Can&apos;t scan? Enter this key: <code className="break-all rounded bg-sunken px-1.5 py-0.5 text-ink">{setup.secret}</code>
              </li>
              <li>Type the 6-digit code the app shows.</li>
            </ol>
            <Field label="6-digit code" error={error ?? undefined}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className="tabular max-w-[10rem] tracking-widest"
                />
              )}
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => void confirm()} loading={busy} disabled={code.length !== 6}>
                Turn on
              </Button>
              <Button variant="ghost" onClick={() => setSetup(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : user!.mfaEnabled ? (
        <Button variant="secondary" onClick={() => setDisableOpen(true)}>
          Turn off two-step sign-in
        </Button>
      ) : (
        <Button onClick={() => void start()} loading={busy}>
          <ShieldCheck className="h-4 w-4" aria-hidden /> Set up two-step sign-in
        </Button>
      )}

      <Dialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Turn off two-step sign-in?"
        description="Your account will only be protected by your password."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisableOpen(false)}>
              Keep it on
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void disable()}>
              Turn off
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Password">
            {({ id }) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Field label="Authenticator or recovery code">
            {({ id }) => <Input id={id} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.trim())} />}
          </Field>
        </div>
      </Dialog>
    </Panel>
  );
}

function Devices() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['my-sessions'], queryFn: () => api<SessionDto[]>('/auth/sessions') });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-sessions'] });
      toast('Signed out of that device');
    },
  });
  return (
    <Panel title="Signed-in devices">
      <ul className="divide-y divide-line">
        {(q.data ?? []).map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            {s.device === 'mobile' ? <Smartphone className="h-5 w-5 text-muted" aria-hidden /> : <Laptop className="h-5 w-5 text-muted" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {s.browser ?? 'Unknown browser'} on {s.os ?? 'unknown system'} {s.current && <Badge tone="ok">This device</Badge>}
              </p>
              <p className="text-xs text-muted">
                {s.ip ?? 'IP unknown'} · signed in {formatDateTime(s.createdAt, user!.timezone)} · active {formatRelative(s.lastActivityAt)}
              </p>
            </div>
            {!s.current && (
              <Button size="sm" variant="secondary" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id)}>
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ProfilePage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' });
  }, [hash]);
  return (
    <div>
      <PageHeader title="Profile & security" />
      <div className="space-y-6">
        <ProfileForm />
        <PasswordForm />
        <TwoFactor />
        <Devices />
      </div>
    </div>
  );
}
