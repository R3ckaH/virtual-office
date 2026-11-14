import type { CompanySettingsDto, CompanySettingsInput, NotificationKind } from '@vo/shared';
import { LOGO_MAX_BYTES, LOGO_TYPES, NOTIFICATION_KINDS, NOTIFICATION_LABELS } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Alert, Button, Field, Input, PageHeader, Panel, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { allTimeZones, cityOf, offsetLabel } from '@/lib/format';

const SWATCHES = ['#2563eb', '#1d4ed8', '#7c3aed', '#0f766e', '#16a34a', '#b45309', '#be123c', '#0f172a'];

/** Contrast of white text on a color (WCAG), to warn about brand colors that are too light. */
function contrastOnWhiteText(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return 1.05 / (L + 0.05);
}

export function CompanySettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['company-settings'], queryFn: () => api<CompanySettingsDto>('/admin/company') });
  const [form, setForm] = useState<CompanySettingsInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (q.data && !form) {
      const { logoUrl: _l, mailConfigured: _m, ...rest } = q.data;
      void _l;
      void _m;
      setForm(rest);
    }
  }, [q.data, form]);

  const refresh = (d: CompanySettingsDto) => {
    qc.setQueryData(['company-settings'], d);
    void qc.invalidateQueries({ queryKey: ['public-config'] });
  };
  const save = useMutation({
    mutationFn: () => api<CompanySettingsDto>('/admin/company', { method: 'PATCH', json: form }),
    onSuccess: (d) => {
      refresh(d);
      toast('Settings saved.');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t save the settings.'),
  });
  const logo = useMutation({
    mutationFn: async (f: File | null) => {
      if (!f) return api<CompanySettingsDto>('/admin/company/logo', { method: 'DELETE' });
      if (!LOGO_TYPES.includes(f.type)) throw new Error('Use a PNG, JPG or WebP image.');
      if (f.size > LOGO_MAX_BYTES) throw new Error(`Keep the logo under ${LOGO_MAX_BYTES / 1024} KB.`);
      return api<CompanySettingsDto>('/admin/company/logo', { method: 'PUT', body: f, headers: { 'content-type': f.type } });
    },
    onSuccess: (d) => {
      refresh(d);
      toast(d.logoUrl ? 'Logo updated.' : 'Logo removed.');
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Upload failed.', 'danger'),
  });

  if (q.isLoading || !form) return <Spinner />;
  const set = <K extends keyof CompanySettingsInput>(k: K, v: CompanySettingsInput[K]) => setForm({ ...form, [k]: v });
  const setNotify = (k: NotificationKind, v: boolean) => setForm({ ...form, notifications: { ...form.notifications, [k]: v } });
  const contrast = /^#[0-9a-fA-F]{6}$/.test(form.primaryColor) ? contrastOnWhiteText(form.primaryColor) : 0;
  const zones = [...new Set([form.defaultTimezone, 'Asia/Manila', 'America/New_York', ...allTimeZones()])];

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    save.mutate();
  }

  return (
    <>
      <PageHeader title="Company settings" description="Your company’s name, look, time zone, sign-in timeout and which emails go out." />
      <form onSubmit={submit} noValidate className="space-y-6">
        {error && <Alert>{error}</Alert>}
        <Panel title="Branding">
          <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
            <div className="space-y-4">
              <Field label="Company name">{(f) => <Input id={f.id} value={form.companyName} onChange={(e) => set('companyName', e.target.value)} maxLength={80} />}</Field>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Brand color</legend>
                <div className="flex flex-wrap items-center gap-2">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      aria-pressed={form.primaryColor.toLowerCase() === c}
                      onClick={() => set('primaryColor', c)}
                      className="h-8 w-8 rounded-full ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-ink"
                      style={{ background: c }}
                    />
                  ))}
                  <label className="ml-2 inline-flex items-center gap-2 text-sm">
                    <input type="color" value={form.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line" />
                    <span className="font-mono text-xs">{form.primaryColor}</span>
                  </label>
                </div>
                {contrast > 0 && contrast < 4.5 && <p className="mt-2 text-sm text-warn">This color is light: buttons will use dark text so they stay readable.</p>}
              </fieldset>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Logo</p>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-line bg-sunken">
                  {q.data?.logoUrl ? <img src={q.data.logoUrl} alt="Current logo" className="h-full w-full object-contain" /> : <span className="text-xl font-bold text-muted">{form.companyName.slice(0, 1)}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <Button type="button" size="sm" variant="secondary" onClick={() => file.current?.click()} loading={logo.isPending}>
                    <ImagePlus className="h-4 w-4" aria-hidden /> Upload
                  </Button>
                  {q.data?.logoUrl && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => logo.mutate(null)}>
                      <Trash2 className="h-4 w-4" aria-hidden /> Remove
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">Square PNG, JPG or WebP, up to 200 KB.</p>
              <input
                ref={file}
                type="file"
                hidden
                accept={LOGO_TYPES.join(',')}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) logo.mutate(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Time and sign-in">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company time zone" hint="Work days, reports and holidays follow this time zone.">
              {(f) => (
                <Select id={f.id} aria-describedby={f.describedBy} value={form.defaultTimezone} onChange={(e) => set('defaultTimezone', e.target.value)}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {cityOf(z)} ({offsetLabel(z)})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Sign out after inactivity (minutes)" hint="People get a warning a minute before.">
              {(f) => <Input id={f.id} aria-describedby={f.describedBy} type="number" min={5} max={480} value={form.sessionTimeoutMinutes} onChange={(e) => set('sessionTimeoutMinutes', Number(e.target.value))} />}
            </Field>
          </div>
        </Panel>

        <Panel title="Emails" description="In-app notifications always show. These switch the matching emails on or off.">
          {!q.data?.mailConfigured && (
            <div className="mb-4">
              <Alert tone="warn">Email isn’t connected yet (no SMTP settings on the server), so nothing is sent; emails are written to the server log instead.</Alert>
            </div>
          )}
          <ul className="space-y-3">
            {NOTIFICATION_KINDS.map((k) => (
              <li key={k}>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={form.notifications[k]} onChange={(e) => setNotify(k, e.target.checked)} />
                  <span>
                    <span className="block font-medium">{NOTIFICATION_LABELS[k].label}</span>
                    <span className="block text-muted">{NOTIFICATION_LABELS[k].hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>
    </>
  );
}
