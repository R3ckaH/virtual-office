import type { ModuleKey, PublicConfigDto } from '@vo/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiRaw } from './api';

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** White or dark text on the brand color, whichever reads better (WCAG relative luminance). */
export function brandInk([r, g, b]: [number, number, number]): string {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (1.05) / (L + 0.05) >= 4.5 ? '255 255 255' : '17 24 39';
}

/** Branding and sign-in options, available before login. Applies the brand color to the page. */
export function usePublicConfig() {
  const q = useQuery({
    queryKey: ['public-config'],
    queryFn: () => apiRaw<PublicConfigDto>('/config'),
    staleTime: 5 * 60_000,
  });
  const color = q.data?.primaryColor;
  useEffect(() => {
    const rgb = color ? hexToRgb(color) : null;
    if (!rgb) return;
    document.documentElement.style.setProperty('--brand', rgb.join(' '));
    document.documentElement.style.setProperty('--brand-ink', brandInk(rgb));
    // Lighter tint of the brand for text on dark backgrounds.
    document.documentElement.style.setProperty('--brand-fg-dark', rgb.map((c) => Math.round(c + (255 - c) * 0.4)).join(' '));
  }, [color]);
  useEffect(() => {
    if (q.data?.companyName) document.title = `${q.data.companyName} · Virtual Office`;
  }, [q.data?.companyName]);
  return q;
}

/** Optional modules that are switched on for this copy of the office. Empty until the config has loaded. */
export function useModules(): ModuleKey[] {
  const q = useQuery({ queryKey: ['public-config'], queryFn: () => apiRaw<PublicConfigDto>('/config'), staleTime: 5 * 60_000 });
  return q.data?.modules ?? [];
}
