import type { DepartmentDto, ExportFormat, ReportCell, ReportColumn, ReportDto, ReportKind } from '@vo/shared';
import { addDays, formatMinutes, localDate, REPORT_INFO, REPORT_KINDS } from '@vo/shared';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert, Button, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, qs, tokenStore } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePresence } from '@/lib/presence';

type Preset = 'this-month' | 'last-month' | 'last-30' | 'this-year' | 'custom';
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-30', label: 'Last 30 days' },
  { id: 'this-year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
];

function presetRange(p: Preset, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  const monthStart = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
  switch (p) {
    case 'last-month':
      return { from: monthStart(y, m - 1), to: addDays(monthStart(y, m), -1) };
    case 'last-30':
      return { from: addDays(today, -29), to: today };
    case 'this-year':
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: monthStart(y, m), to: today };
  }
}

function cell(c: ReportColumn, v: ReportCell, tz: string) {
  if (v === null || v === undefined || v === '') return '';
  if (c.type === 'minutes' && typeof v === 'number') return formatMinutes(v);
  if (c.type === 'datetime' && typeof v === 'string' && v.includes('T')) {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v));
  }
  if (c.type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${v}T12:00:00Z`));
  }
  return String(v);
}

export function ReportsPage() {
  const { user, can } = useAuth();
  const { people } = usePresence();
  const toast = useToast();
  const everyone = can('attendance.manage') || user!.role === 'ADMIN';
  const kinds = REPORT_KINDS.filter((k) => k !== 'logins' || can('authEvents.read'));
  const today = localDate(new Date(), user!.timezone);
  const [kind, setKind] = useState<ReportKind>('attendance');
  const [preset, setPreset] = useState<Preset>('this-month');
  const [custom, setCustom] = useState(() => presetRange('this-month', today));
  const range = preset === 'custom' ? custom : presetRange(preset, today);
  const [dept, setDept] = useState('');
  const [person, setPerson] = useState('');
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api<DepartmentDto[]>('/departments'), enabled: everyone });
  const directory = useMemo(() => Object.values(people).sort((a, b) => a.fullName.localeCompare(b.fullName)), [people]);
  const params = { from: range.from, to: range.to, departmentId: dept || undefined, userId: person || undefined };
  const valid = range.from && range.to && range.to >= range.from;
  const q = useQuery({ queryKey: ['reports', kind, params], queryFn: () => api<ReportDto>(`/reports/${kind}${qs(params)}`), enabled: !!valid });

  async function download(format: ExportFormat) {
    setBusy(format);
    try {
      const res = await fetch(`/api/reports/${kind}${qs({ ...params, format })}`, { headers: { authorization: `Bearer ${tokenStore.get()}` }, credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'The export didn’t work.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind}-${range.from}-to-${range.to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setBusy(null);
    }
  }

  const r = q.data;
  return (
    <>
      <PageHeader
        title="Reports"
        description={everyone ? 'Attendance, tardiness, overtime, meetings, leave and sign-ins for any period up to a year.' : 'The same reports, for the people you manage.'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void download('csv')} loading={busy === 'csv'} disabled={!r}>
              <Download className="h-4 w-4" aria-hidden /> CSV
            </Button>
            <Button variant="secondary" onClick={() => void download('xlsx')} loading={busy === 'xlsx'} disabled={!r}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden /> Excel
            </Button>
            <Button variant="secondary" onClick={() => void download('pdf')} loading={busy === 'pdf'} disabled={!r}>
              <FileText className="h-4 w-4" aria-hidden /> PDF
            </Button>
          </div>
        }
      />

      <div role="radiogroup" aria-label="Report" className="mb-4 flex flex-wrap gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={clsx('rounded-full border px-3 py-1.5 text-sm font-medium', kind === k ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface hover:bg-sunken')}
          >
            {REPORT_INFO[k].title}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted">{REPORT_INFO[kind].description}</p>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Period" className="w-44">
          {(f) => (
            <Select id={f.id} value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {preset === 'custom' && (
          <>
            <Field label="From" className="w-40">
              {(f) => <Input id={f.id} type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />}
            </Field>
            <Field label="To" className="w-40">
              {(f) => <Input id={f.id} type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />}
            </Field>
          </>
        )}
        {everyone && (
          <Field label="Department" className="w-48">
            {(f) => (
              <Select id={f.id} value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">All</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Person" className="w-56">
          {(f) => (
            <Select id={f.id} value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">{everyone ? 'Everyone' : 'Everyone I manage'}</option>
              {directory.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {!valid ? (
        <Alert tone="warn">Pick an end date on or after the start date.</Alert>
      ) : q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <Alert>{q.error instanceof ApiError ? q.error.message : 'Couldn’t build the report.'}</Alert>
      ) : !r?.rows.length ? (
        <EmptyState title="Nothing in this period">{r?.subtitle}</EmptyState>
      ) : (
        <section aria-label={r.title} className="overflow-hidden rounded-card border border-line bg-surface">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="font-semibold">{r.title}</h2>
            <p className="text-sm text-muted">
              {r.subtitle} · {r.rows.length} rows · times in {r.timezone}
            </p>
          </header>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sunken text-left text-xs text-muted">
                <tr>
                  {r.columns.map((c) => (
                    <th key={c.key} scope="col" className={clsx('whitespace-nowrap px-3 py-2 font-medium', c.type !== 'text' && c.type !== 'date' && c.type !== 'datetime' && 'text-right')}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.rows.slice(0, 1000).map((row, i) => (
                  <tr key={i} className="hover:bg-sunken/40">
                    {r.columns.map((c) => (
                      <td key={c.key} className={clsx('px-3 py-2', c.type === 'text' ? 'max-w-xs truncate' : 'whitespace-nowrap', c.type !== 'text' && c.type !== 'date' && c.type !== 'datetime' && 'text-right tabular')} title={c.type === 'text' ? String(row[c.key] ?? '') : undefined}>
                        {cell(c, row[c.key], r.timezone)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {r.totals && (
                <tfoot className="border-t-2 border-line bg-sunken/60 font-semibold">
                  <tr>
                    {r.columns.map((c) => (
                      <td key={c.key} className={clsx('whitespace-nowrap px-3 py-2', c.type !== 'text' && c.type !== 'date' && c.type !== 'datetime' && 'text-right tabular')}>
                        {cell(c, r.totals![c.key] ?? null, r.timezone)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {r.rows.length > 1000 && <p className="border-t border-line px-4 py-2 text-xs text-muted">Showing the first 1,000 rows. Exports include all {r.rows.length}.</p>}
        </section>
      )}
    </>
  );
}
