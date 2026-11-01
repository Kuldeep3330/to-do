import { createOwnerEnquirySchema } from './owner-enquiries.dto';

const valid = {
  intent: 'RENT' as const,
  city: 'Noida',
  name: 'Asha Sharma',
  phone: '+919876543210',
};

describe('createOwnerEnquirySchema', () => {
  it('parses a rent enquiry', () => {
    const parsed = createOwnerEnquirySchema.parse(valid);
    expect(parsed.intent).toBe('RENT');
    expect(parsed.city).toBe('Noida');
    expect(parsed.locality).toBeUndefined();
  });

  it('trims empty locality and message', () => {
    const parsed = createOwnerEnquirySchema.parse({ ...valid, locality: '  ', message: '' });
    expect(parsed.locality).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });

  it('rejects missing city, short name, and unprefixed phone', () => {
    expect(createOwnerEnquirySchema.safeParse({ ...valid, city: 'N' }).success).toBe(false);
    expect(createOwnerEnquirySchema.safeParse({ ...valid, name: 'A' }).success).toBe(false);
    expect(createOwnerEnquirySchema.safeParse({ ...valid, phone: '9876543210' }).success).toBe(false);
  });

  it('accepts BUY with optional email', () => {
    const parsed = createOwnerEnquirySchema.parse({
      ...valid,
      intent: 'BUY',
      email: 'asha@example.com',
      locality: 'Sector 62',
      message: '3 BHK, 1200 sq ft',
    });
    expect(parsed.intent).toBe('BUY');
    expect(parsed.email).toBe('asha@example.com');
    expect(parsed.locality).toBe('Sector 62');
  });
});
