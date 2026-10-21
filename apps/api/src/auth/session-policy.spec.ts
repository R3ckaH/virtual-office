import { parseRefreshToken, sessionState } from './session-policy';

describe('sessionState', () => {
  const now = new Date('2026-09-29T08:00:00Z');
  const base = { revokedAt: null, expiresAt: new Date('2026-10-10T00:00:00Z'), lastActivityAt: new Date('2026-09-29T07:45:00Z') };

  it('is active within the inactivity window', () => {
    expect(sessionState(base, 30, now)).toBe('active');
  });
  it('times out after the configured minutes of inactivity', () => {
    expect(sessionState({ ...base, lastActivityAt: new Date('2026-09-29T07:29:59Z') }, 30, now)).toBe('idle_timeout');
  });
  it('treats revoked before expired before idle', () => {
    expect(sessionState({ ...base, revokedAt: now, expiresAt: now }, 30, now)).toBe('revoked');
    expect(sessionState({ ...base, expiresAt: now }, 30, now)).toBe('expired');
  });
});

describe('parseRefreshToken', () => {
  it('parses <uuid>.<secret>', () => {
    const t = '3f1c2b4a-1111-4222-8333-944455556666.' + 'a'.repeat(43);
    expect(parseRefreshToken(t)).toEqual({ sessionId: '3f1c2b4a-1111-4222-8333-944455556666', secret: 'a'.repeat(43) });
  });
  it.each([undefined, '', 'nope', 'abc.def', 42])('rejects %p', (v) => {
    expect(parseRefreshToken(v)).toBeNull();
  });
});
