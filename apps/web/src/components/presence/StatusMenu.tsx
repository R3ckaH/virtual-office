import type { ManualStatus } from '@vo/shared';
import { MANUAL_STATUSES, PRESENCE_LABELS } from '@vo/shared';
import { clsx } from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { usePresence } from '@/lib/presence';
import { StatusDot } from './StatusDot';

const HELP: Record<ManualStatus | 'AUTO', string> = {
  AUTO: 'Follows your room, breaks and activity',
  BUSY: 'Heads down; knocks still reach you',
  IN_MEETING: 'On a call outside the office',
  AWAY: 'Stepped away for a while',
};

/** Your status in the header: automatic, or one you pick, plus a short message everyone sees. */
export function StatusMenu() {
  const { me, people, connection, send } = usePresence();
  const toast = useToast();
  const mine = me ? people[me] : undefined;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ManualStatus | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setChoice(mine?.manualStatus ?? null);
    setMessage(mine?.message ?? '');
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mine) {
    return (
      <span className="hidden items-center gap-1.5 text-sm text-muted sm:inline-flex" role="status">
        <StatusDot status="OFFLINE" />
        {connection === 'online' || connection === 'offline' ? 'Offline' : 'Connecting…'}
      </span>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await send('status:set', { status: choice, message: message.trim() || null });
    setSaving(false);
    if (!res.ok) return toast(res.message, 'danger');
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex max-w-[16rem] items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sunken"
      >
        <StatusDot status={mine.status} label className="font-medium" />
        {mine.message && <span className="hidden truncate text-muted md:inline">· {mine.message}</span>}
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
      </button>
      {open && (
        <form onSubmit={save} role="dialog" aria-label="Set your status" className="absolute right-0 z-40 mt-2 w-80 rounded-card border border-line bg-surface p-3 shadow-xl">
          <fieldset>
            <legend className="px-1 pb-2 text-sm font-semibold">Your status</legend>
            <div className="space-y-1">
              {([null, ...MANUAL_STATUSES] as (ManualStatus | null)[]).map((s) => {
                const selected = choice === s;
                return (
                  <label
                    key={s ?? 'auto'}
                    className={clsx(
                      'flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand',
                      selected ? 'bg-sunken' : 'hover:bg-sunken/60',
                    )}
                  >
                    <input type="radio" name="status" className="sr-only" checked={selected} onChange={() => setChoice(s)} />
                    <span className="mt-0.5">
                      <StatusDot status={s ?? (mine.manualStatus ? 'AVAILABLE' : mine.status)} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{s ? PRESENCE_LABELS[s] : 'Automatic'}</span>
                      <span className="block text-xs text-muted">{HELP[s ?? 'AUTO']}</span>
                    </span>
                    {selected && <Check className="mt-0.5 h-4 w-4 text-brand-fg" aria-hidden />}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="mt-3 block px-1 text-sm font-medium" htmlFor="status-message">
            Message <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="status-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={80}
            placeholder="e.g. Back at 2:00 PM"
            className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              Save status
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
