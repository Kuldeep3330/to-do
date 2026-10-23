import { describe, expect, it } from 'vitest';
import { formatUptime, qualityItemHref } from './system';

describe('formatUptime', () => {
  it('shows at most two units', () => {
    expect(formatUptime(0)).toBe('0 seconds');
    expect(formatUptime(1)).toBe('1 second');
    expect(formatUptime(125)).toBe('2 minutes 5 seconds');
    expect(formatUptime(3 * 86_400 + 4 * 3_600 + 59 * 60)).toBe('3 days 4 hours');
    expect(formatUptime(3_600)).toBe('1 hour');
  });
  it('ignores negatives', () => {
    expect(formatUptime(-5)).toBe('0 seconds');
  });
});

describe('qualityItemHref', () => {
  it('links to the thing, or to the queue when there is no single page', () => {
    expect(qualityItemHref('listing', 'a')).toBe('/admin/listings/a');
    expect(qualityItemHref('lead', 'b')).toBe('/admin/leads/b');
    expect(qualityItemHref('visit', 'c')).toBe('/admin/visits?status=REQUESTED');
  });
});
