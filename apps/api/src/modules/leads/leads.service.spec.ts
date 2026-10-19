import { LeadsService } from './leads.service';

const listingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const leadId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const actorId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function listing() {
  return { id: listingId, slug: '3-bhk-dwarka', title: '3 BHK Dwarka' };
}

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: leadId,
    listingId,
    userId: null,
    assignedToUserId: null,
    name: 'Asha',
    phone: '+919876543210',
    email: 'asha@example.com',
    message: null,
    status: 'NEW',
    source: 'WEB_FORM',
    createdAt: new Date('2026-10-08T00:00:00.000Z'),
    updatedAt: new Date('2026-10-08T00:00:00.000Z'),
    listing: { ...listing(), intent: 'RENT', status: 'PUBLISHED' },
    assignee: null,
    ...overrides,
  };
}

describe('LeadsService', () => {
  let prisma: {
    listing: { findFirst: jest.Mock };
    lead: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    analyticsEvent: { create: jest.Mock };
    user: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let rbac: { getPermissionCodes: jest.Mock; isStaff: jest.Mock };
  let notifications: { notifyLeadCreated: jest.Mock };
  let service: LeadsService;

  beforeEach(() => {
    prisma = {
      listing: { findFirst: jest.fn() },
      lead: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      analyticsEvent: { create: jest.fn() },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    rbac = { getPermissionCodes: jest.fn(), isStaff: jest.fn() };
    notifications = { notifyLeadCreated: jest.fn().mockResolvedValue(undefined) };
    const feeRules = { forIntent: jest.fn().mockResolvedValue(null) };
    service = new LeadsService(prisma as never, rbac as never, notifications as never, feeRules as never);
  });

  it('creates a NEW lead and notifies after commit', async () => {
    prisma.listing.findFirst.mockResolvedValue(listing());
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn({
        lead: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(leadRow()),
        },
      } as never),
    );
    prisma.analyticsEvent.create.mockResolvedValue({});
    const result = await service.createPublic(
      { listingSlug: '3-bhk-dwarka', name: 'Asha', phone: '+919876543210', email: 'asha@example.com' },
      undefined,
    );
    expect(result).toEqual({ ok: true });
    expect(prisma.analyticsEvent.create).toHaveBeenCalled();
    expect(notifications.notifyLeadCreated).toHaveBeenCalled();
  });

  it('returns ok without a second insert or email on 24h duplicate', async () => {
    prisma.listing.findFirst.mockResolvedValue(listing());
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn({
        lead: {
          findFirst: jest.fn().mockResolvedValue(leadRow()),
          create: jest.fn(),
        },
      } as never),
    );
    const result = await service.createPublic(
      { listingId, name: 'Asha', phone: '+919876543210' },
      undefined,
    );
    expect(result).toEqual({ ok: true });
    expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
    expect(notifications.notifyLeadCreated).not.toHaveBeenCalled();
  });

  it('404s when the listing is not publicly visible', async () => {
    prisma.listing.findFirst.mockResolvedValue(null);
    await expect(
      service.createPublic({ listingSlug: 'draft', name: 'Asha', phone: '+919876543210' }, undefined),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('scopes customer get to userId', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    await expect(service.getMine(actorId, leadId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: leadId, userId: actorId } }),
    );
  });

  it('scopes agent admin list to assignedToUserId', async () => {
    rbac.getPermissionCodes.mockResolvedValue(['lead.read_assigned']);
    prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);
    await service.listAdmin(actorId, { page: 1, pageSize: 24, overdue: false });
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assignedToUserId: actorId },
      }),
    );
  });

  it('forbids assign without lead.assign', async () => {
    rbac.getPermissionCodes.mockResolvedValue(['lead.update_assigned', 'lead.read_assigned']);
    await expect(
      service.patchAdmin(actorId, leadId, { assignedToUserId: actorId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
