import { clsx } from 'clsx';
import { initials } from '@/lib/format';

/** Initials avatar with a stable color per person (photos arrive with profile uploads later). */
const hues = [210, 160, 30, 280, 340, 190, 100, 250];
function hueFor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return hues[h % hues.length];
}

export function Avatar({ name, src, size = 'md', className }: { name: string; src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const dims = size === 'xs' ? 'h-5 w-5 text-[9px]' : size === 'sm' ? 'h-7 w-7 text-2xs' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-xs';
  if (src) return <img src={src} alt="" className={clsx('rounded-full object-cover', dims, className)} />;
  const hue = hueFor(name);
  return (
    <span
      aria-hidden
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', dims, className)}
      style={{ background: `hsl(${hue} 55% 88%)`, color: `hsl(${hue} 60% 25%)` }}
    >
      {initials(name)}
    </span>
  );
}
