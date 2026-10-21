import type { Config } from 'tailwindcss';

/** Colors are CSS variables (see src/index.css) so light/dark and company branding switch at runtime. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Figtree Variable"', 'system-ui', 'sans-serif'] },
      colors: {
        canvas: v('canvas'),
        surface: v('surface'),
        sunken: v('sunken'),
        ink: v('ink'),
        muted: v('muted'),
        line: v('line'),
        brand: v('brand'),
        'brand-ink': v('brand-ink'),
        'brand-fg': v('brand-fg'),
        rail: v('rail'),
        'rail-ink': v('rail-ink'),
        ok: v('ok'),
        warn: v('warn'),
        danger: v('danger'),
      },
      borderRadius: { card: '14px' },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
    },
  },
  plugins: [],
} satisfies Config;
