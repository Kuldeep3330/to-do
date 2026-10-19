import { describe, expect, it } from 'vitest';
import { createVisitSchema, istDate } from './visit';

const NOW = new Date('2026-10-18T10:00:00.000Z');

describe('istDate', () => {
  it('uses the India calendar day', () => {
    expect(istDate(0, NOW)).toBe('2026-10-18');
    expect(istDate(0, new Date('2026-10-18T20:00:00.000Z'))).toBe('2026-10-19');
    expect(istDate(30, NOW)).toBe('2026-11-17');
  });
});

describe('visit schema', () => {
  const schema = createVisitSchema(NOW);
  const ok = { preferredDate: '2026-10-20', preferredSlot: 'MORNING', notes: '' };

  it('accepts a date in range and drops empty notes', () => {
    const out = schema.parse(ok);
    expect(out.preferredDate).toBe('2026-10-20');
    expect(out.notes).toBeUndefined();
  });

  it('treats an empty date as "any day"', () => {
    expect(schema.parse({ ...ok, preferredDate: '' }).preferredDate).toBeUndefined();
  });

  it('rejects the past and dates more than 30 days ahead', () => {
    expect(schema.safeParse({ ...ok, preferredDate: '2026-10-17' }).success).toBe(false);
    expect(schema.safeParse({ ...ok, preferredDate: '2026-11-18' }).success).toBe(false);
    expect(schema.safeParse({ ...ok, preferredDate: '2026-11-17' }).success).toBe(true);
  });

  it('rejects unknown slots and over-long notes', () => {
    expect(schema.safeParse({ ...ok, preferredSlot: 'NIGHT' }).success).toBe(false);
    expect(schema.safeParse({ ...ok, notes: 'x'.repeat(1001) }).success).toBe(false);
  });
});
