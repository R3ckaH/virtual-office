import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === '1' || v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  API_ORIGIN: z.string().url().default('http://localhost:4000'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(600),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(14),
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),
  /** requests per minute per IP on login/forgot/reset endpoints */
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(10),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Virtual Office <no-reply@example.com>'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  MICROSOFT_CLIENT_ID: z.string().optional().default(''),
  MICROSOFT_CLIENT_SECRET: z.string().optional().default(''),
  MICROSOFT_TENANT: z.string().default('organizations'),
  TRUST_PROXY: bool.default(false),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parsed, validated environment. Fails fast at startup on a bad config. */
export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProd = () => env().NODE_ENV === 'production';
