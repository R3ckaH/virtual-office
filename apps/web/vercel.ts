/**
 * Vercel configuration for the web app. It runs at build time, so each copy of the office (one
 * Vercel project per company) points at its own API through environment variables:
 *
 *   API_UPSTREAM   the API's public address, e.g. https://acme-api.up.railway.app   (required for a new copy)
 *   ORIGIN_SECRET  the secret the API expects from this proxy (same value as on the API)
 *
 * Without API_UPSTREAM it falls back to the first office's API, so that deployment keeps working unchanged.
 * Plain object on purpose (no imports): Vercel reads this before dependencies are installed.
 */
const FIRST_OFFICE_API = 'https://voapi-production-b809.up.railway.app';

const api = (process.env.API_UPSTREAM || FIRST_OFFICE_API).trim().replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(api)) {
  throw new Error(`API_UPSTREAM must look like https://your-api.example.com (got "${api}")`);
}

export const config = {
  framework: 'vite',
  installCommand: 'pnpm install --frozen-lockfile',
  buildCommand: 'pnpm build',
  outputDirectory: 'dist',
  routes: [
    {
      src: '/api/(.*)',
      dest: `${api}/api/$1`,
      transforms: [
        {
          type: 'request.headers',
          op: 'set',
          target: { key: 'x-origin-secret' },
          args: '$ORIGIN_SECRET',
          env: ['ORIGIN_SECRET'],
        },
      ],
    },
    {
      src: '/(.*)',
      headers: {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
        'Content-Security-Policy': `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'sha256-2gU7/kidvUEEqLwnsWrzt5TaXBCzN3e0oRi7C5PXySc='; connect-src 'self' wss: https://*.livekit.cloud ${api}; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
      },
      continue: true,
    },
    {
      src: '/assets/(.*)',
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
};
