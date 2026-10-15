import { createLeadSchema, patchLeadSchema, adminLeadListQuerySchema } from './leads.dto';

describe('lead DTOs', () => {
  const valid = {
    listingSlug: '3-bhk-dwarka',
    name: 'Asha',
    phone: '+919876543210',
  };

  it('accepts listingSlug or listingId', () => {
    expect(createLeadSchema.parse(valid).listingSlug).toBe('3-bhk-dwarka');
    expect(
      createLeadSchema.parse({
        listingId: '11111111-1111-4111-8111-111111111111',
        name: 'Asha',
        phone: '+919876543210',
      }).listingId,
    ).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('rejects missing listing pointer, short name, and invalid phone', () => {
    expect(createLeadSchema.safeParse({ name: 'Asha', phone: '+919876543210' }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...valid, name: 'A' }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...valid, phone: '9876543210' }).success).toBe(false);
  });

  it('lowercases optional email and strips unknown keys', () => {
    const parsed = createLeadSchema.parse({
      ...valid,
      email: 'Asha@Example.COM',
      extra: 'nope',
    });
    expect(parsed.email).toBe('asha@example.com');
    expect(parsed).not.toHaveProperty('extra');
  });

  it('defaults admin pagination and rejects unknown status', () => {
    const parsed = adminLeadListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(24);
    expect(adminLeadListQuerySchema.safeParse({ status: 'OPEN' }).success).toBe(false);
  });

  it('accepts patch status and nullable assignee', () => {
    expect(patchLeadSchema.parse({ status: 'CONTACTED' }).status).toBe('CONTACTED');
    expect(patchLeadSchema.parse({ assignedToUserId: null }).assignedToUserId).toBeNull();
  });
});
