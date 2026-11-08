import { createHash, createHmac } from 'node:crypto';
import { env } from '../config/env';

/** Recording storage (any S3-compatible bucket). */
export function storageConfigured(): boolean {
  const e = env();
  return !!(e.RECORDINGS_S3_BUCKET && e.RECORDINGS_S3_ACCESS_KEY && e.RECORDINGS_S3_SECRET_KEY);
}

const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();
const sha256hex = (data: string) => createHash('sha256').update(data).digest('hex');
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * A time-limited download link for a recording (AWS Signature V4 query signing, path-style).
 * Works with AWS S3, Cloudflare R2, Railway buckets and other S3-compatible stores.
 */
export function presignGet(key: string, expiresSeconds = 900, now = new Date()): string {
  const e = env();
  const endpoint = (e.RECORDINGS_S3_ENDPOINT || `https://s3.${e.RECORDINGS_S3_REGION}.amazonaws.com`).replace(/\/$/, '');
  const url = new URL(`${endpoint}/${e.RECORDINGS_S3_BUCKET}/${key.split('/').map(enc).join('/')}`);
  const region = e.RECORDINGS_S3_REGION || 'auto';
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const params: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${e.RECORDINGS_S3_ACCESS_KEY}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const query = params
    .map(([k, v]) => [enc(k), enc(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonical = ['GET', url.pathname, query, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n');
  const kDate = hmac(`AWS4${e.RECORDINGS_S3_SECRET_KEY}`, day);
  const kSigning = hmac(hmac(hmac(kDate, region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
  return `${url.origin}${url.pathname}?${query}&X-Amz-Signature=${signature}`;
}
