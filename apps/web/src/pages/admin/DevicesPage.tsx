import type {
  AttendanceRules,
  DeviceConnection,
  DeviceDto,
  DeviceTokenDto,
  DeviceUserDto,
  ImportResultDto,
  PersonSetupDto,
  PunchDto,
} from '@vo/shared';
import { DEVICE_CONNECTION_LABELS, DEVICE_CONNECTIONS } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Cloud, Copy, FileUp, Monitor, Plus, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clock, dayName } from '@/components/attendance/parts';
import { Alert, Badge, Button, Dialog, EmptyState, Field, Input, PageHeader, Panel, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { allTimeZones, formatRelative } from '@/lib/format';

const WAYS: { c: DeviceConnection; icon: typeof Cloud; text: string; foot: string }[] = [
  { c: 'PUSH', icon: Cloud, text: 'The device sends each punch straight to the Virtual Office over the internet. Most modern terminals support this (often called ADMS, Cloud Server or HTTP push).', foot: 'Real time. Recommended.' },
  { c: 'AGENT', icon: Monitor, text: 'A small program on one office PC reads the devices over the office network every minute and uploads new punches. For older units without cloud push.', foot: 'About 1 minute behind.' },
  { c: 'FILE', icon: FileUp, text: 'Export the attendance log from the device (USB stick or its software) and upload it here. Works with any brand as a fallback.', foot: 'Manual. Duplicates are skipped.' },
];

export function DevicesPage() {
  const { user } = useAuth();
  const tz = user!.timezone;
  const devices = useQuery({ queryKey: ['devices'], queryFn: () => api<DeviceDto[]>('/devices'), refetchInterval: 30_000 });
  const [editing, setEditing] = useState<DeviceDto | 'new' | null>(null);
  const [token, setToken] = useState<{ device: DeviceDto; token: string } | null>(null);
  const [punchesOf, setPunchesOf] = useState<DeviceDto | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Biometric devices"
        description="Connect the office terminals so every punch lands in Attendance next to Virtual Office clock-ins."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden /> Add a device
          </Button>
        }
      />

      <section aria-labelledby="ways-h">
        <h2 id="ways-h" className="mb-3 text-base font-semibold">
          Three ways to connect, whatever the brand
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {WAYS.map((w) => (
            <div key={w.c} className="rounded-card border border-line bg-surface p-4">
              <p className="flex items-center gap-2 font-semibold">
                <w.icon className="h-4 w-4 text-brand-fg" aria-hidden /> {DEVICE_CONNECTION_LABELS[w.c]}
              </p>
              <p className="mt-1.5 text-sm text-muted">{w.text}</p>
              <p className="mt-2 text-xs font-semibold">{w.foot}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="devices-h">
        <h2 id="devices-h" className="mb-3 text-base font-semibold">
          Devices
        </h2>
        {devices.isLoading && <Spinner />}
        {devices.data?.length === 0 && <EmptyState title="No devices yet">Add the office terminals to start receiving punches.</EmptyState>}
        <div className="grid gap-3 lg:grid-cols-3">
          {devices.data?.map((d) => <DeviceCard key={d.id} d={d} tz={tz} onEdit={() => setEditing(d)} onPunches={() => setPunchesOf(d)} />)}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ImportPanel devices={devices.data ?? []} />
        <RulesPanel />
      </div>
      <DeviceUsers tz={tz} />

      <DeviceDialog
        open={!!editing}
        device={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onToken={(device, t) => {
          setEditing(null);
          setToken({ device, token: t });
        }}
      />
      <TokenDialog value={token} onClose={() => setToken(null)} />
      <PunchesDialog device={punchesOf} tz={tz} onClose={() => setPunchesOf(null)} />
    </div>
  );
}

function DeviceCard({ d, tz, onEdit, onPunches }: { d: DeviceDto; tz: string; onEdit: () => void; onPunches: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const sync = useMutation({
    mutationFn: () => api(`/devices/${d.id}/sync`, { method: 'POST' }),
    onSuccess: () => {
      toast(d.connection === 'PUSH' ? `${d.name} will upload on its next check-in` : `The sync agent will read ${d.name} on its next run`);
      void qc.invalidateQueries({ queryKey: ['devices'] });
    },
  });
  const status = !d.active ? { label: 'Turned off', tone: 'neutral' as const } : d.connection === 'FILE' ? { label: 'Offline', tone: 'neutral' as const } : d.online ? { label: 'Online', tone: 'ok' as const } : { label: 'Not responding', tone: 'danger' as const };
  return (
    <article className="flex flex-col rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{d.name}</h3>
          <p className="text-sm text-muted">{d.model ?? '—'}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Connection</dt>
        <dd>{DEVICE_CONNECTION_LABELS[d.connection]}</dd>
        <dt className="text-muted">Location</dt>
        <dd>{d.location ?? '—'}</dd>
        <dt className="text-muted">Last punch</dt>
        <dd>
          {d.lastPunchAt ? (
            <>
              {dayName(new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(d.lastPunchAt)))}, {clock(d.lastPunchAt, tz)}
              {d.lastPunchName && `, ${d.lastPunchName}`}
            </>
          ) : (
            'None yet'
          )}
        </dd>
        <dt className="text-muted">Today / people</dt>
        <dd className="tabular">
          {d.connection === 'FILE' ? '—' : d.punchesToday} / {d.enrolled}
        </dd>
        {d.connection !== 'FILE' && (
          <>
            <dt className="text-muted">Checked in</dt>
            <dd>{formatRelative(d.lastSeenAt)}</dd>
          </>
        )}
      </dl>
      {d.connection === 'FILE' && (
        <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
          This unit keeps punches in its own memory. Export the log weekly (or before payroll cutoff) and upload it below.
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {d.connection !== 'FILE' && (
          <Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => sync.mutate()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Sync now
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onPunches}>
          View punches
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Settings
        </Button>
      </div>
    </article>
  );
}

function DeviceDialog({ open, device, onClose, onToken }: { open: boolean; device: DeviceDto | null; onClose: () => void; onToken: (d: DeviceDto, token: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const blank = { name: '', model: '', serialNumber: '', location: '', connection: 'PUSH' as DeviceConnection, timezone: 'Asia/Manila', allowedIps: '', active: true };
  const [v, setV] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!open) return;
    setV(
      device
        ? {
            name: device.name,
            model: device.model ?? '',
            serialNumber: device.serialNumber ?? '',
            location: device.location ?? '',
            connection: device.connection,
            timezone: device.timezone,
            allowedIps: device.allowedIps ?? '',
            active: device.active,
          }
        : blank,
    );
    setError(null);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, device]);
  const fail = (e: unknown) => {
    setError(e instanceof ApiError ? e.message : 'That didn’t work');
    if (e instanceof ApiError) setErrors(e.fieldErrors);
  };
  const save = useMutation({
    mutationFn: () =>
      api<DeviceDto & { token?: string | null }>(device ? `/devices/${device.id}` : '/devices', {
        method: device ? 'PUT' : 'POST',
        json: { ...v, model: v.model || null, serialNumber: v.serialNumber || null, location: v.location || null, allowedIps: v.allowedIps || null },
      }),
    onSuccess: (d) => {
      toast(device ? `Saved ${d.name}` : `Added ${d.name}`);
      void qc.invalidateQueries({ queryKey: ['devices'] });
      if (d.token) onToken(d, d.token);
      else onClose();
    },
    onError: fail,
  });
  const rotate = useMutation({
    mutationFn: () => api<DeviceTokenDto>(`/devices/${device!.id}/token`, { method: 'POST' }),
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: ['devices'] });
      onToken(device!, t.token);
    },
    onError: fail,
  });
  const set = (patch: Partial<typeof v>) => setV((x) => ({ ...x, ...patch }));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={device ? `${device.name} settings` : 'Add a device'}
      footer={
        <>
          {device && device.connection !== 'FILE' && (
            <Button variant="ghost" className="mr-auto" loading={rotate.isPending} onClick={() => rotate.mutate()}>
              {device.hasToken ? 'New access token' : 'Create access token'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button data-autofocus loading={save.isPending} onClick={() => save.mutate()}>
            {device ? 'Save' : 'Add device'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name?.[0]}>
            {({ id, invalid }) => <Input id={id} value={v.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={invalid} placeholder="Main entrance terminal" />}
          </Field>
          <Field label="Brand and model" hint="If you know it">
            {({ id, describedBy }) => <Input id={id} value={v.model} onChange={(e) => set({ model: e.target.value })} aria-describedby={describedBy} />}
          </Field>
          <Field label="How it connects">
            {({ id }) => (
              <Select id={id} value={v.connection} onChange={(e) => set({ connection: e.target.value as DeviceConnection })}>
                {DEVICE_CONNECTIONS.map((c) => (
                  <option key={c} value={c}>
                    {DEVICE_CONNECTION_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Serial number (SN)" error={errors.serialNumber?.[0]} hint={v.connection === 'PUSH' ? 'Required: the device identifies itself by it' : 'Optional'}>
            {({ id, describedBy, invalid }) => <Input id={id} value={v.serialNumber} onChange={(e) => set({ serialNumber: e.target.value.trim() })} aria-describedby={describedBy} aria-invalid={invalid} />}
          </Field>
          <Field label="Location">{({ id }) => <Input id={id} value={v.location} onChange={(e) => set({ location: e.target.value })} placeholder="Ground floor lobby" />}</Field>
          <Field label="Device clock time zone" hint="Devices send times without a zone">
            {({ id, describedBy }) => (
              <Select id={id} value={v.timezone} onChange={(e) => set({ timezone: e.target.value })} aria-describedby={describedBy}>
                {allTimeZones().map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {v.connection === 'PUSH' && (
          <Field label="Only accept pushes from these IPs (optional)" hint="Comma-separated, e.g. the office’s public IP. Recommended, since cloud push has no password.">
            {({ id, describedBy }) => <Input id={id} value={v.allowedIps} onChange={(e) => set({ allowedIps: e.target.value })} aria-describedby={describedBy} placeholder="203.0.113.10" />}
          </Field>
        )}
        {device && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={v.active} onChange={(e) => set({ active: e.target.checked })} />
            Accept punches from this device
          </label>
        )}
      </div>
    </Dialog>
  );
}

function TokenDialog({ value, onClose }: { value: { device: DeviceDto; token: string } | null; onClose: () => void }) {
  const toast = useToast();
  const d = value?.device;
  const origin = window.location.origin;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast('Couldn’t copy; select the text instead', 'danger');
    }
  };
  return (
    <Dialog
      open={!!value}
      onClose={onClose}
      size="lg"
      title={d ? `Connect ${d.name}` : ''}
      description="Copy the access token now. For security it isn’t shown again; you can always create a new one."
      footer={
        <Button data-autofocus onClick={onClose}>
          Done
        </Button>
      }
    >
      {value && (
        <div className="space-y-4 text-sm">
          <Field label="Access token">
            {({ id }) => (
              <div className="flex gap-2">
                <Input id={id} readOnly value={value.token} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button variant="secondary" onClick={() => void copy(value.token)} aria-label="Copy token">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Field>
          {d!.connection === 'AGENT' ? (
            <div>
              <p className="font-medium">Set up the sync agent on an office PC</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">
                <li>Copy the sync agent to a PC that’s always on and on the same network as the device.</li>
                <li>
                  In its <code>config.json</code>, set <code>apiUrl</code> to <code>{origin}/api</code>, paste this token, and add the device’s IP address.
                </li>
                <li>Start it. The device shows Online here within a minute.</li>
              </ol>
            </div>
          ) : (
            <div>
              <p className="font-medium">Set up cloud push on the device</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">
                <li>On the device: Menu → Comm. (or Network) → Cloud Server / ADMS.</li>
                <li>
                  Server address: the API’s host name (for this site, <code>{window.location.host}</code> unless the API is on its own address), port 443 with HTTPS.
                </li>
                <li>
                  Check the serial number in Menu → System Info matches <code>{d!.serialNumber ?? '(not set)'}</code>.
                </li>
                <li>Devices that can post JSON can use the token above with <code>POST /api/ingest/punches</code>.</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function PunchesDialog({ device, tz, onClose }: { device: DeviceDto | null; tz: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['device-punches', device?.id], queryFn: () => api<PunchDto[]>(`/devices/${device!.id}/punches`), enabled: !!device });
  return (
    <Dialog open={!!device} onClose={onClose} size="lg" title={device ? `${device.name}: today’s punches` : ''}>
      {q.isLoading ? (
        <Spinner />
      ) : !q.data?.length ? (
        <EmptyState title="No punches today" />
      ) : (
        <ul className="divide-y divide-line text-sm">
          {q.data.map((p) => (
            <li key={p.id} className="flex items-center gap-4 py-2">
              <span className="tabular w-20 font-semibold">{clock(p.at, tz)}</span>
              <span className="w-16 text-muted">{p.deviceUserId}</span>
              <span className="flex-1">{p.note}</span>
              <span className="text-xs text-muted">{p.verify}</span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function ImportPanel({ devices }: { devices: DeviceDto[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [deviceId, setDeviceId] = useState('');
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  const fileDevices = [...devices].sort((a, b) => (a.connection === 'FILE' ? -1 : 1) - (b.connection === 'FILE' ? -1 : 1));
  useEffect(() => {
    if (!deviceId && fileDevices[0]) setDeviceId(fileDevices[0].id);
  }, [deviceId, fileDevices]);
  const lastImport = devices.map((d) => d.lastImport).filter(Boolean).sort((a, b) => b!.createdAt.localeCompare(a!.createdAt))[0];
  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api<ImportResultDto>(`/devices/${deviceId}/import`, { method: 'POST', body: fd });
    },
    onSuccess: (r) => {
      setResult(r);
      toast(`${r.added} punches added`);
      void qc.invalidateQueries({ queryKey: ['devices'] });
      void qc.invalidateQueries({ queryKey: ['device-users'] });
      void qc.invalidateQueries({ queryKey: ['hr-board'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Upload failed', 'danger'),
  });
  const pick = (f: File | undefined) => f && deviceId && upload.mutate(f);
  const shown = result ?? lastImport ?? null;
  return (
    <Panel title="Import a log file">
      <div className="space-y-3">
        <Field label="From which device">
          {({ id }) => (
            <Select id={id} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              {fileDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={clsx('flex flex-col items-center gap-2 rounded-card border-2 border-dashed px-6 py-8 text-center', drag ? 'border-brand bg-brand/5' : 'border-line')}
        >
          <Upload className="h-6 w-6 text-muted" aria-hidden />
          <p className="font-medium">Drop the device’s attendance log here</p>
          <p className="text-sm text-muted">.dat, .txt, .csv or .xlsx exported by the device or its software</p>
          <input ref={input} type="file" accept=".dat,.txt,.csv,.xlsx,.log" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose a log file" />
          <Button variant="secondary" size="sm" loading={upload.isPending} disabled={!deviceId} onClick={() => input.current?.click()}>
            Choose a file
          </Button>
        </div>
        {shown && (
          <p className="text-sm text-muted" role="status">
            {result ? 'Imported' : 'Last import'}: {dayName(shown.createdAt.slice(0, 10))} from {shown.deviceName ?? 'a device'} ({shown.filename}), {shown.added} punches added, {shown.duplicates} duplicates skipped
            {shown.unknownUserIds.length ? `, ${shown.unknownUserIds.length} unknown user ID${shown.unknownUserIds.length === 1 ? '' : 's'} (${shown.unknownUserIds.join(', ')})` : ''}.
            {shown.errors.length > 0 && <span className="mt-1 block text-warn">{shown.errors.slice(0, 3).join(' ')}</span>}
          </p>
        )}
      </div>
    </Panel>
  );
}

function RulesPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const rules = useQuery({ queryKey: ['attendance-rules'], queryFn: () => api<AttendanceRules>('/attendance/settings') });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<AttendanceRules | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open && rules.data) {
      setV(rules.data);
      setError(null);
    }
  }, [open, rules.data]);
  const save = useMutation({
    mutationFn: () => api<AttendanceRules>('/attendance/settings', { method: 'PUT', json: v }),
    onSuccess: () => {
      toast('Rules saved');
      void qc.invalidateQueries({ queryKey: ['attendance-rules'] });
      setOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That didn’t work'),
  });
  const r = rules.data;
  const num = (k: keyof AttendanceRules, label: string, hint: string) => (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => <Input id={id} type="number" min={0} value={String(v?.[k] ?? '')} onChange={(e) => setV((x) => x && { ...x, [k]: Number(e.target.value) })} aria-describedby={describedBy} />}
    </Field>
  );
  return (
    <Panel
      title="Attendance rules"
      action={
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={!r}>
          Edit
        </Button>
      }
    >
      {!r ? (
        <Spinner />
      ) : (
        <dl className="space-y-2.5 text-sm">
          <Rule k="Grace period" v={`${r.graceMinutes} minutes after scheduled start`} />
          <Rule k="Duplicate punches" v={`Merged when within ${r.duplicateWindowMinutes} minutes`} />
          <Rule k="First and last punch" v="First punch is clock-in, last punch is clock-out; punches in between are breaks" />
          <Rule k="Hybrid rule" v={r.deviceWinsOnsite ? 'On on-site days, the biometric time counts over a web clock-in' : 'The web clock-in counts'} />
          <Rule k="Auto clock-out" v={`After ${r.autoClockOutHours} hours, flagged for HR review`} />
          <Rule k="Leaders" v="Not tracked (switch off per person in Schedules & setup)" />
        </dl>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Attendance rules"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button data-autofocus loading={save.isPending} onClick={() => save.mutate()}>
              Save rules
            </Button>
          </>
        }
      >
        {v && (
          <div className="grid gap-4 sm:grid-cols-2">
            {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
            {num('graceMinutes', 'Grace period (minutes)', 'Late after this')}
            {num('duplicateWindowMinutes', 'Merge duplicates within (minutes)', 'Repeated scans')}
            {num('mismatchMinutes', 'Web vs biometric mismatch (minutes)', 'On on-site days')}
            {num('noPunchAfterMinutes', 'No punch after (minutes)', 'From shift start')}
            {num('missingOutAfterMinutes', 'Missing clock-out after (minutes)', 'From shift end')}
            {num('autoClockOutHours', 'Auto clock-out after (hours)', 'From clock-in')}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-4 w-4" checked={v.deviceWinsOnsite} onChange={(e) => setV({ ...v, deviceWinsOnsite: e.target.checked })} />
              On on-site days, the biometric clock-in counts over a web clock-in
            </label>
          </div>
        )}
      </Dialog>
    </Panel>
  );
}

function Rule({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3">
      <dt className="font-medium">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}

function DeviceUsers({ tz }: { tz: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['device-users'], queryFn: () => api<DeviceUserDto[]>('/device-users') });
  const people = useQuery({ queryKey: ['attendance-people'], queryFn: () => api<PersonSetupDto[]>('/attendance/people') });
  const [editing, setEditing] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const link = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string | null }) => api<DeviceUserDto>(`/device-users/${encodeURIComponent(id)}`, { method: 'PUT', json: { userId } }),
    onSuccess: (u) => {
      toast(u.userName ? `${u.deviceUserId} linked to ${u.userName}. Their punches now count.` : `${u.deviceUserId} unlinked`);
      setEditing(null);
      for (const k of ['device-users', 'hr-board', 'hr-exceptions']) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'That didn’t work', 'danger'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/device-users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Removed the link');
      void qc.invalidateQueries({ queryKey: ['device-users'] });
    },
  });
  const unlinked = (list.data ?? []).filter((u) => !u.userId).length;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Device users and employees {unlinked > 0 && <Badge tone="danger">{unlinked} not linked</Badge>}
        </span>
      }
      description="Each person enrolled on a device has a user ID. Link it once and their punches follow them."
    >
      {list.isLoading ? (
        <Spinner />
      ) : !list.data?.length ? (
        <EmptyState title="No device users yet">They appear when a device sends its first punch, or when you link one.</EmptyState>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-5 pb-2 font-medium">Device user ID</th>
                <th className="px-2 pb-2 font-medium">Employee</th>
                <th className="px-2 pb-2 font-medium">Enrolled with</th>
                <th className="px-2 pb-2 font-medium">Status</th>
                <th className="px-5 pb-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((u) => (
                <tr key={u.deviceUserId} className="border-t border-line">
                  <td className="tabular px-5 py-2 font-mono">{u.deviceUserId}</td>
                  <td className="px-2">
                    {editing === u.deviceUserId ? (
                      <Select aria-label={`Employee for ${u.deviceUserId}`} value={pick} onChange={(e) => setPick(e.target.value)} className="h-9">
                        <option value="">Choose…</option>
                        {people.data
                          ?.filter((p) => p.attendanceTracked)
                          .map((p) => (
                            <option key={p.user.id} value={p.user.id}>
                              {p.user.fullName}
                            </option>
                          ))}
                      </Select>
                    ) : u.userName ? (
                      <span>
                        {u.userName}
                        {!u.userActive && <span className="text-muted"> (deactivated)</span>}
                      </span>
                    ) : (
                      <span className="text-muted">
                        {u.punchesToday ? `${u.punchesToday} punch${u.punchesToday === 1 ? '' : 'es'} today` : 'Unknown'}
                        {u.lastPunchAt && `, last ${clock(u.lastPunchAt, tz)}`}
                      </span>
                    )}
                  </td>
                  <td className="px-2 text-muted">{u.enrolledWith ?? '—'}</td>
                  <td className="px-2">{u.userId ? u.userActive ? <Badge tone="ok">Linked</Badge> : <Badge>Former employee</Badge> : <Badge tone="danger">Not linked</Badge>}</td>
                  <td className="whitespace-nowrap px-5 text-right">
                    {editing === u.deviceUserId ? (
                      <>
                        <Button size="sm" disabled={!pick} loading={link.isPending} onClick={() => link.mutate({ id: u.deviceUserId, userId: pick })}>
                          Link
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : u.userId && !u.userActive ? (
                      <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(u.deviceUserId)}>
                        Remove link
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={u.userId ? 'ghost' : 'secondary'}
                        onClick={() => {
                          setEditing(u.deviceUserId);
                          setPick(u.userId ?? '');
                        }}
                      >
                        {u.userId ? 'Change' : 'Link to employee'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(list.data ?? []).some((u) => u.userId && !u.userActive) && (
        <p className="mt-3 text-xs text-muted">Former employees: also delete their enrollment on the device itself so the badge can’t be used.</p>
      )}
    </Panel>
  );
}
