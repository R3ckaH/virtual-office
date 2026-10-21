import { describe, expect, it } from 'vitest';
import { brandInk } from './config';
import { cityOf, initials, zonedDayStartIso } from './format';

describe('time zone helpers', () => {
  it('converts a calendar day in Manila to the right UTC instant', () => {
    expect(zonedDayStartIso('2026-09-29', 'Asia/Manila')).toBe('2026-09-28T16:00:00.000Z');
    expect(zonedDayStartIso('2026-09-29', 'Asia/Manila', 1)).toBe('2026-09-29T16:00:00.000Z');
  });
  it('handles US daylight saving time', () => {
    expect(zonedDayStartIso('2026-07-01', 'America/New_York')).toBe('2026-07-01T04:00:00.000Z'); // EDT
    expect(zonedDayStartIso('2026-12-01', 'America/New_York')).toBe('2026-12-01T05:00:00.000Z'); // EST
  });
  it('labels zones and people', () => {
    expect(cityOf('America/New_York')).toBe('New York');
    expect(initials('Maria  Santos')).toBe('MS');
    expect(initials('Cher')).toBe('C');
  });
});

describe('brand color text', () => {
  it('uses white text on dark brand colors and dark text on light ones', () => {
    expect(brandInk([37, 99, 235])).toBe('255 255 255');
    expect(brandInk([250, 204, 21])).toBe('17 24 39');
  });
});
