import { describe, expect, it } from 'vitest';
import { createDealSchema, istToday } from './deal';

const NOW = new Date('2026-10-19T10:00:00.000Z');

describe('deal schema', () => {
  const schema = createDealSchema('2026-10-10', NOW);

  it('uses the India calendar day for today', () => {
    expect(istToday(NOW)).toBe('2026-10-19');
    expect(istToday(new Date('2026-10-19T20:00:00.000Z'))).toBe('2026-10-20');
  });

  it('parses a typed amount into whole rupees', () => {
    const out = schema.parse({ amount: '₹ 32,000', closedOn: '2026-10-19' });
    expect(out.amount).toBe(32000);
    expect(out.closedOn).toBe('2026-10-19');
  });

  it('rejects empty, zero and absurd amounts', () => {
    expect(schema.safeParse({ amount: '', closedOn: '2026-10-19' }).success).toBe(false);
    expect(schema.safeParse({ amount: 'abc', closedOn: '2026-10-19' }).success).toBe(false);
    expect(schema.safeParse({ amount: '0', closedOn: '2026-10-19' }).success).toBe(false);
    expect(schema.safeParse({ amount: '999999999999', closedOn: '2026-10-19' }).success).toBe(false);
  });

  it('keeps the closing day between the enquiry and today', () => {
    expect(schema.safeParse({ amount: '1000', closedOn: '2026-10-20' }).success).toBe(false);
    expect(schema.safeParse({ amount: '1000', closedOn: '2026-10-09' }).success).toBe(false);
    expect(schema.safeParse({ amount: '1000', closedOn: '2026-10-10' }).success).toBe(true);
    expect(schema.safeParse({ amount: '1000', closedOn: '' }).success).toBe(false);
  });
});
