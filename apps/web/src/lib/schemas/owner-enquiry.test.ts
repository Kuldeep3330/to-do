import { describe, expect, it } from 'vitest';
import { ownerEnquirySchema } from './owner-enquiry';

const base = {
  intent: 'RENT' as const,
  city: 'Noida',
  locality: '',
  name: 'Asha Sharma',
  phone: '9876543210',
  email: '',
  message: '',
};

describe('ownerEnquirySchema', () => {
  it('normalises phone and drops empty optional fields', () => {
    const out = ownerEnquirySchema.parse(base);
    expect(out.phone).toBe('+919876543210');
    expect(out.locality).toBeUndefined();
    expect(out.email).toBeUndefined();
    expect(out.message).toBeUndefined();
  });

  it('rejects a short city and a bad phone', () => {
    expect(ownerEnquirySchema.safeParse({ ...base, city: 'N' }).success).toBe(false);
    expect(ownerEnquirySchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
  });

  it('keeps locality and message when provided', () => {
    const out = ownerEnquirySchema.parse({
      ...base,
      intent: 'BUY',
      locality: 'Sector 62',
      email: 'asha@example.com',
      message: '3 BHK ready',
    });
    expect(out.intent).toBe('BUY');
    expect(out.locality).toBe('Sector 62');
    expect(out.email).toBe('asha@example.com');
    expect(out.message).toBe('3 BHK ready');
  });
});
