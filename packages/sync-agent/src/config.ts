import { readFileSync } from 'node:fs';
import { z } from 'zod';

const device = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('zkteco'),
    name: z.string().min(1),
    token: z.string().startsWith('vod_', 'Paste the access token from Biometric devices → Settings'),
    ip: z.string().min(1),
    port: z.number().int().default(4370),
    timeoutMs: z.number().int().default(10_000),
  }),
  z.object({
    type: z.literal('folder'),
    name: z.string().min(1),
    token: z.string().startsWith('vod_', 'Paste the access token from Biometric devices → Settings'),
    path: z.string().min(1),
  }),
]);

export const configSchema = z.object({
  apiUrl: z
    .string()
    .url()
    .transform((u) => u.replace(/\/+$/, '')),
  intervalSeconds: z.number().int().min(15).max(3600).default(60),
  /** how far back to resend on each run; the server skips anything it already has */
  overlapHours: z.number().int().min(1).max(24 * 31).default(48),
  devices: z.array(device).min(1),
});

export type AgentConfig = z.infer<typeof configSchema>;
export type DeviceConfig = AgentConfig['devices'][number];

export function loadConfig(path: string): AgentConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Couldn't read ${path}: ${(e as Error).message}`);
  }
  const r = configSchema.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`${path} has problems:\n${issues}`);
  }
  if (!r.data.apiUrl.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(r.data.apiUrl + '/')) {
    throw new Error('apiUrl must use https:// (tokens must not travel unencrypted)');
  }
  return r.data;
}
