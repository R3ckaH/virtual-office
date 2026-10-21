process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5432/z';
process.env.JWT_SECRET ??= 'x'.repeat(40);
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import { decrypt, encrypt, generateRecoveryCode, safeEqual, sha256 } from './crypto';

describe('crypto helpers', () => {
  it('round-trips AES-GCM encryption with a random IV', () => {
    const a = encrypt('JBSWY3DPEHPK3PXP');
    const b = encrypt('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
  });
  it('detects tampering', () => {
    const parts = encrypt('secret').split('.');
    parts[2] = Buffer.from('tampered').toString('base64url');
    expect(() => decrypt(parts.join('.'))).toThrow();
  });
  it('makes readable recovery codes', () => {
    for (let i = 0; i < 50; i++) expect(generateRecoveryCode()).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
  });
  it('compares safely', () => {
    expect(safeEqual(sha256('a'), sha256('a'))).toBe(true);
    expect(safeEqual(sha256('a'), sha256('b'))).toBe(false);
    expect(safeEqual('short', 'longer')).toBe(false);
  });
});
