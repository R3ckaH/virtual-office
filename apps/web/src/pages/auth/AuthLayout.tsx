import { ReactNode } from 'react';
import { usePublicConfig } from '@/lib/config';

/** A quiet line drawing of an office floor: the front door metaphor for the sign-in screens. */
function FloorPlan() {
  const rooms = [
    { x: 20, y: 20, w: 170, h: 120, label: 'Engineering', people: [[60, 80], [100, 95], [140, 70]] },
    { x: 190, y: 20, w: 130, h: 120, label: 'Sales', people: [[235, 85], [275, 100]] },
    { x: 320, y: 20, w: 100, h: 120, label: 'Meeting room', people: [] },
    { x: 20, y: 140, w: 120, h: 110, label: 'Pantry', people: [[75, 205]] },
    { x: 140, y: 140, w: 180, h: 110, label: 'Lobby', people: [[210, 200], [250, 190]] },
    { x: 320, y: 140, w: 100, h: 110, label: 'Manager', people: [[370, 200]] },
  ];
  return (
    <svg viewBox="0 0 440 270" className="w-full max-w-md" role="img" aria-label="Illustration of the office floor">
      <g fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5">
        {rooms.map((r) => (
          <rect key={r.label} x={r.x} y={r.y} width={r.w} height={r.h} rx="4" />
        ))}
        {/* doorways */}
        <path d="M205 250h30" stroke="rgb(var(--rail))" strokeWidth="4" strokeOpacity="1" />
        <path d="M205 250v14m30-14v14" strokeOpacity="0.5" />
      </g>
      {rooms.map((r) => (
        <g key={`${r.label}-l`}>
          <text x={r.x + 10} y={r.y + 20} fontSize="11" fill="currentColor" fillOpacity="0.7" fontWeight="500">
            {r.label}
          </text>
          {r.people.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="7" fill="rgb(var(--brand))" fillOpacity={0.55 + i * 0.15} />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  const { data } = usePublicConfig();
  const company = data?.companyName ?? 'Virtual Office';
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between bg-rail p-10 text-rail-ink lg:flex">
        <div className="flex items-center gap-2.5">
          {data?.logoUrl ? (
            <img src={data.logoUrl} alt="" className="h-9 w-9 rounded-lg" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-bold text-brand-ink">{company.charAt(0)}</span>
          )}
          <span className="text-lg font-semibold text-white">{company}</span>
        </div>
        <div className="space-y-8">
          <FloorPlan />
          <div className="max-w-md">
            <p className="text-3xl font-semibold leading-tight text-white">Your office, wherever you work.</p>
            <p className="mt-3 text-rail-ink/75">Clock in, see who&apos;s around, and walk into a meeting room with your team.</p>
          </div>
        </div>
        <p className="text-sm text-rail-ink/50">Protected under the Data Privacy Act of 2012 (RA 10173).</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="text-lg font-semibold">{company}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
