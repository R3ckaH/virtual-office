import type { PresenceStatus } from '@vo/shared';
import { PRESENCE_COLORS, PRESENCE_LABELS } from '@vo/shared';
import { clsx } from 'clsx';

/** Colored status dot. Away is hollow and Busy has a bar, so status never depends on color alone. */
export function StatusDot({ status, className, label = false }: { status: PresenceStatus; className?: string; label?: boolean }) {
  const color = PRESENCE_COLORS[status];
  return (
    <span className={clsx('inline-flex items-center gap-1.5', className)}>
      <span
        aria-hidden
        className="relative inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={status === 'AWAY' || status === 'OFFLINE' ? { border: `2px solid ${color}` } : { background: color }}
      >
        {status === 'BUSY' && <span className="absolute inset-x-[2px] top-[4px] h-[2px] rounded bg-white" />}
      </span>
      {label ? <span>{PRESENCE_LABELS[status]}</span> : <span className="sr-only">{PRESENCE_LABELS[status]}</span>}
    </span>
  );
}
