// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The inline theme script in index.html is allowed by hash in the production CSP.
// If you edit that script, update the hash in vercel.ts.
describe('Content-Security-Policy', () => {
  it('allows the inline theme script by its current hash', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
    const hash = createHash('sha256').update(script).digest('base64');
    const config = readFileSync(resolve(__dirname, '../vercel.ts'), 'utf8');
    expect(config).toContain(`sha256-${hash}`);
  });
});
