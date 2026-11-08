import type { Permission } from '@vo/shared';
import { ROLE_LABELS } from '@vo/shared';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  DoorOpen,
  Clock,
  FileClock,
  Fingerprint,
  Home,
  KeyRound,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  Network,
  Settings,
  Sun,
  UserCog,
  Users,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar } from '@/components/ui/avatar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePublicConfig } from '@/lib/config';
import { cityOf, formatTime } from '@/lib/format';
import { ThemeChoice, useTheme } from '@/lib/theme';
import { PresencePrompts } from '@/components/presence/PresencePrompts';
import { StatusMenu } from '@/components/presence/StatusMenu';
import { PresenceProvider } from '@/lib/presence';
import { IdleGuard } from './IdleGuard';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** release phase for modules that aren't built yet */
  phase?: number;
}

const WORK: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/floor', label: 'Office Floor', icon: Building2 },
  { to: '/meetings', label: 'Meetings', icon: Video, phase: 4 },
  { to: '/chat', label: 'Chat', icon: MessageSquare, phase: 5 },
  { to: '/tasks', label: 'Tasks', icon: ListChecks, phase: 6 },
  { to: '/attendance', label: 'Attendance', icon: Clock },
  { to: '/leave', label: 'Leave', icon: CalendarDays, phase: 6 },
  { to: '/reports', label: 'Reports', icon: BarChart3, permission: 'reports.read', phase: 7 },
];

const ADMIN: NavItem[] = [
  { to: '/admin/users', label: 'People', icon: Users, permission: 'users.manage' },
  { to: '/admin/attendance', label: 'Attendance board', icon: ClipboardCheck, permission: 'attendance.manage' },
  { to: '/admin/schedules', label: 'Schedules & setup', icon: CalendarClock, permission: 'attendance.manage' },
  { to: '/admin/devices', label: 'Biometric devices', icon: Fingerprint, permission: 'devices.manage' },
  { to: '/admin/rooms', label: 'Office rooms', icon: DoorOpen, permission: 'rooms.manage' },
  { to: '/admin/departments', label: 'Departments', icon: Network, permission: 'departments.manage' },
  { to: '/admin/login-history', label: 'Login history', icon: KeyRound, permission: 'authEvents.read' },
  { to: '/admin/audit-log', label: 'Audit log', icon: FileClock, permission: 'auditLogs.read' },
];

function NavGroup({ label, items, onNavigate }: { label?: string; items: NavItem[]; onNavigate: () => void }) {
  const { can } = useAuth();
  const visible = items.filter((i) => !i.permission || can(i.permission));
  if (!visible.length) return null;
  return (
    <div className="space-y-0.5">
      {label && <p className="px-3 pb-1 pt-5 text-xs font-medium text-rail-ink/60">{label}</p>}
      {visible.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-offset-rail',
              isActive ? 'bg-white/15 text-white' : 'text-rail-ink/85 hover:bg-white/10 hover:text-white',
            )
          }
        >
          <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="flex-1">{item.label}</span>
          {item.phase && <span className="text-2xs font-normal text-rail-ink/50">Soon</span>}
        </NavLink>
      ))}
    </div>
  );
}

/** Live clocks for the time zones the team works in. Helps plan across Manila / US hours. */
function TeamClocks() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['org-timezones'],
    queryFn: () => api<{ timezone: string; people: number }[]>('/org/timezones'),
    staleTime: 10 * 60_000,
  });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const zones = [user!.timezone, ...(data ?? []).map((z) => z.timezone).filter((z) => z !== user!.timezone)].slice(0, 3);
  return (
    <ul className="hidden items-center gap-5 md:flex" aria-label="Team time zones">
      {zones.map((tz, i) => (
        <li key={tz} className="flex items-baseline gap-1.5 text-sm">
          <span className="tabular font-semibold">{formatTime(now, tz)}</span>
          <span className="text-muted">{i === 0 ? `${cityOf(tz)} (you)` : cityOf(tz)}</span>
        </li>
      ))}
    </ul>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const themes: { v: ThemeChoice; label: string; icon: LucideIcon }[] = [
    { v: 'light', label: 'Light', icon: Sun },
    { v: 'dark', label: 'Dark', icon: Moon },
    { v: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-sunken"
      >
        <Avatar name={user!.fullName} src={user!.avatarUrl} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-4">{user!.fullName}</span>
          <span className="block text-xs text-muted">{ROLE_LABELS[user!.role]}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-xl">
          <div className="px-2 pb-2 pt-1">
            <p className="text-sm font-medium">{user!.fullName}</p>
            <p className="truncate text-xs text-muted">{user!.email}</p>
          </div>
          <fieldset className="border-t border-line px-2 py-2">
            <legend className="sr-only">Theme</legend>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-sunken p-1">
              {themes.map((t) => (
                <label
                  key={t.v}
                  className={clsx(
                    'flex cursor-pointer items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand',
                    theme === t.v ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink',
                  )}
                >
                  <input type="radio" name="theme" value={t.v} checked={theme === t.v} onChange={() => setTheme(t.v)} className="sr-only" />
                  <t.icon className="h-3.5 w-3.5" aria-hidden />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="border-t border-line pt-1">
            <NavLink to="/settings/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sunken">
              <UserCog className="h-4 w-4 text-muted" aria-hidden /> Profile & security
            </NavLink>
            <button
              type="button"
              onClick={() => void logout('user')}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-sunken"
            >
              <LogOut className="h-4 w-4 text-muted" aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const config = usePublicConfig();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setNavOpen(false), [location.pathname]);

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col bg-rail px-3 pb-4 pt-5 text-rail-ink">
      <div className="mb-4 flex items-center gap-2.5 px-3">
        {config.data?.logoUrl ? (
          <img src={config.data.logoUrl} alt="" className="h-8 w-8 rounded-lg" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
            {(config.data?.companyName ?? 'V').charAt(0)}
          </span>
        )}
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-white">{config.data?.companyName ?? 'Virtual Office'}</span>
          <span className="block text-xs text-rail-ink/60">Virtual Office</span>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavGroup items={WORK} onNavigate={() => setNavOpen(false)} />
        <NavGroup label="Admin & HR" items={ADMIN} onNavigate={() => setNavOpen(false)} />
      </div>
      <NavGroup items={[{ to: '/settings/profile', label: 'Settings', icon: Settings }]} onNavigate={() => setNavOpen(false)} />
    </nav>
  );

  return (
    <PresenceProvider>
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>
      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
            {sidebar}
            <button type="button" onClick={() => setNavOpen(false)} className="absolute right-3 top-5 rounded-md p-1 text-rail-ink" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setNavOpen(true)} className="rounded-md p-1.5 hover:bg-sunken lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold lg:hidden">{config.data?.companyName ?? 'Virtual Office'}</span>
          <TeamClocks />
          <div className="ml-auto flex items-center gap-2">
            <StatusMenu />
            <UserMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 outline-none sm:px-6 lg:py-8">
          {children ?? <Outlet />}
        </main>
      </div>
      <IdleGuard />
      <PresencePrompts />
    </div>
    </PresenceProvider>
  );
}
