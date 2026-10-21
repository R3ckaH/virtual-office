import { diff } from './audit.service';

describe('audit diff', () => {
  it('keeps only changed fields', () => {
    const d = diff({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', c: null });
    expect(d).toEqual({ before: { b: 'x' }, after: { b: 'y' }, changed: true });
  });
  it('ignores undefined (not provided) fields', () => {
    expect(diff({ a: 1 }, { a: undefined }).changed).toBe(false);
  });
});
