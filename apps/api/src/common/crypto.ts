import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encrypt(plain: string): string {
  const key = Buffer.from(env().DATA_ENCRYPTION_KEY, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string): string {
  const key = Buffer.from(env().DATA_ENCRYPTION_KEY, 'base64');
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Recovery codes look like `k7f2q-9xm4p` (no ambiguous characters). */
export function generateRecoveryCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}
