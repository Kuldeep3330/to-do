import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';

const prisma = new PrismaClient();

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

describe('fee rules and earnings per deal HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let agentCookie = '';
  let customerCookie = '';
  let agentId = '';
  let rentListingId = '';
  let buyListingId = '';
  const suffix = `${Date.now()}`.slice(-8);
  const phone = (n: number) => `+9197${`${suffix}${n}`.slice(-8).padStart(8, '0')}`;
  const http = () => request(app.getHttpServer());
  let seq = 0;

  const putRule = (intent: string, body: Record<string, unknown>, cookie = adminCookie) =>
    http().put(`/api/v1/admin/fee-rules/${intent}`).set('Cookie', cookie).send(body);
  const patchLead = (id: string, body: Record<string, unknown>, cookie = adminCookie) =>
    http().patch(`/api/v1/admin/leads/${id}`).set('Cookie', cookie).send(body);

  async function publishedListing(intent: 'RENT' | 'BUY') {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: 'delhi' } });
    const locality = await prisma.locality.findUniqueOrThrow({
      where: { cityId_slug: { cityId: city.id, slug: 'dwarka' } },
    });
    const property = await prisma.property.create({
      data: { type: 'RESIDENTIAL', cityId: city.id, localityId: locality.id, internalTitle: `fin ${suffix} ${intent}` },
    });
    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        intent,
        status: 'PUBLISHED',
        title: `fin ${suffix} ${intent}`,
        slug: `fin-${suffix}-${intent.toLowerCase()}`,
        priceAmount: BigInt(intent === 'RENT' ? 30000 : 8_000_000),
        pricePeriod: intent === 'RENT' ? 'MONTHLY' : 'ONE_TIME',
        publishedAt: new Date(),
      },
    });
    return listing.id;
  }

  async function lead(listingId: string | null, assigned = true) {
    seq += 1;
    return prisma.lead.create({
      data: {
        name: `Fee Lead ${seq}`,
        phone: phone(40 + seq),
        listingId,
        assignedToUserId: assigned ? agentId : null,
        status: 'QUALIFIED',
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const admin = await http().post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(admin.status).toBe(200);
    adminCookie = cookieHeader(admin);

    const staff = {
      email: `fee.agent.${suffix}@example.com`,
      name: 'Fee Agent',
      phone: phone(9),
      password: 'StaffPassword1',
      role: 'SALES_AGENT',
    };
    const made = await http().post('/api/v1/admin/users').set('Cookie', adminCookie).send(staff);
    expect(made.status).toBe(201);
    agentId = made.body.data.id;
    agentCookie = cookieHeader(await http().post('/api/v1/auth/login').send({ email: staff.email, password: staff.password }));

    const cust = await http()
      .post('/api/v1/auth/register')
      .send({ email: `fee.cust.${suffix}@example.com`, password: 'CustomerPass1', name: 'Fee Customer', phone: phone(8) });
    expect(cust.status).toBe(201);
    customerCookie = cookieHeader(cust);

    rentListingId = await publishedListing('RENT');
    buyListingId = await publishedListing('BUY');

    // Known starting rules: half a month's rent, and 1 percent of the sale price.
    expect((await putRule('RENT', { method: 'PERCENT', value: 50 })).status).toBe(200);
    expect((await putRule('BUY', { method: 'PERCENT', value: 1 })).status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('managing fee rules', () => {
    it('is closed to customers and sales agents', async () => {
      expect((await http().get('/api/v1/admin/fee-rules')).status).toBe(401);
      expect((await http().get('/api/v1/admin/fee-rules').set('Cookie', customerCookie)).status).toBe(403);
      expect((await http().get('/api/v1/admin/fee-rules').set('Cookie', agentCookie)).status).toBe(403);
      expect((await putRule('RENT', { method: 'PERCENT', value: 5 }, agentCookie)).status).toBe(403);
      expect((await putRule('RENT', { method: 'PERCENT', value: 5 }, customerCookie)).status).toBe(403);
    });

    it('lists the saved rules for admins, with no caching', async () => {
      const res = await http().get('/api/v1/admin/fee-rules').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toContain('no-store');
      const rent = res.body.data.find((r: { intent: string }) => r.intent === 'RENT');
      expect(rent).toMatchObject({ intent: 'RENT', method: 'PERCENT', value: 50, minFee: null, maxFee: null });
    });

    it('rejects nonsense rules', async () => {
      expect((await putRule('RENT', { method: 'PERCENT', value: 150 })).status).toBe(400);
      expect((await putRule('RENT', { method: 'PERCENT', value: 0 })).status).toBe(400);
      expect((await putRule('RENT', { method: 'PERCENT', value: -5 })).status).toBe(400);
      expect((await putRule('RENT', { method: 'PERCENT', value: 1.234 })).status).toBe(400);
      expect((await putRule('RENT', { method: 'FIXED', value: 0 })).status).toBe(400);
      expect((await putRule('RENT', { method: 'BARTER', value: 5 })).status).toBe(400);
      expect((await putRule('RENT', { method: 'PERCENT', value: 5, minFee: 9000, maxFee: 1000 })).status).toBe(400);
      expect((await putRule('RENT', { method: 'PERCENT', value: 5, minFee: -1 })).status).toBe(400);
      expect((await putRule('SELL', { method: 'PERCENT', value: 5 })).status).toBe(404);
    });

    it('records who changed a rule, and what it changed from and to, in the audit log', async () => {
      expect((await putRule('BUY', { method: 'PERCENT', value: 1 })).status).toBe(200);
      const res = await putRule('BUY', { method: 'PERCENT', value: 2, maxFee: 70000 });
      expect(res.status).toBe(200);

      const rule = await prisma.feeRule.findUniqueOrThrow({ where: { intent: 'BUY' } });
      expect(rule.updatedByUserId).toBeTruthy();
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'UPDATE_FEE_RULE', entityId: rule.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(entry.actorUserId).toBe(rule.updatedByUserId);
      expect(entry.metadata).toMatchObject({
        intent: 'BUY',
        from: { value: 1, maxFee: null },
        to: { value: 2, maxFee: 70000 },
      });
      await putRule('BUY', { method: 'PERCENT', value: 1 });
    });
  });

  describe('fee on a won deal', () => {
    it('applies the rent rule when a rental is won', async () => {
      const l = await lead(rentListingId);
      const res = await patchLead(l.id, { status: 'WON', closedAmount: 28000 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ closedAmount: 28000, feeAmount: 14000 });
    });

    it('applies the sale rule when a purchase is won', async () => {
      const l = await lead(buyListingId);
      const res = await patchLead(l.id, { status: 'WON', closedAmount: 7_500_000 });
      expect(res.body.data.feeAmount).toBe(75_000);
    });

    it('never shows fees to sales agents, but still records them', async () => {
      const l = await lead(rentListingId);
      const res = await patchLead(l.id, { status: 'WON', closedAmount: 20000 }, agentCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('feeAmount');
      expect(JSON.stringify(res.body)).not.toContain('feeAmount');
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).feeAmount).toBe(BigInt(10000));

      const list = await http().get('/api/v1/admin/leads?pageSize=24').set('Cookie', agentCookie);
      expect(JSON.stringify(list.body)).not.toContain('feeAmount');
      const one = await http().get(`/api/v1/admin/leads/${l.id}`).set('Cookie', agentCookie);
      expect(one.body.data).not.toHaveProperty('feeAmount');

      const asAdmin = await http().get(`/api/v1/admin/leads/${l.id}`).set('Cookie', adminCookie);
      expect(asAdmin.body.data.feeAmount).toBe(10000);
    });

    it('lets only finance managers type a fee by hand', async () => {
      const l = await lead(rentListingId);
      expect((await patchLead(l.id, { status: 'WON', closedAmount: 28000, feeAmount: 1 }, agentCookie)).status).toBe(403);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe('QUALIFIED');

      const waived = await patchLead(l.id, { status: 'WON', closedAmount: 28000, feeAmount: 9000 });
      expect(waived.status).toBe(200);
      expect(waived.body.data.feeAmount).toBe(9000);

      const zero = await patchLead(l.id, { feeAmount: 0 });
      expect(zero.body.data.feeAmount).toBe(0);
    });

    it('recalculates when the amount changes, but not when only the date does', async () => {
      const l = await lead(rentListingId);
      await patchLead(l.id, { status: 'WON', closedAmount: 20000 });
      const manual = await patchLead(l.id, { feeAmount: 4321 });
      expect(manual.body.data.feeAmount).toBe(4321);

      const dateOnly = await patchLead(l.id, { closedOn: new Date().toISOString().slice(0, 10) });
      expect(dateOnly.body.data.feeAmount).toBe(4321);

      const changed = await patchLead(l.id, { closedAmount: 40000 });
      expect(changed.body.data.feeAmount).toBe(20000);
    });

    it('does not rewrite a past deal when the rule changes later', async () => {
      const l = await lead(rentListingId);
      await patchLead(l.id, { status: 'WON', closedAmount: 30000 });
      try {
        expect((await putRule('RENT', { method: 'PERCENT', value: 100 })).status).toBe(200);
        const after = await http().get(`/api/v1/admin/leads/${l.id}`).set('Cookie', adminCookie);
        expect(after.body.data.feeAmount).toBe(15000);
        const next = await lead(rentListingId);
        expect((await patchLead(next.id, { status: 'WON', closedAmount: 30000 })).body.data.feeAmount).toBe(30000);
      } finally {
        await putRule('RENT', { method: 'PERCENT', value: 50 });
      }
    });

    it('honours the floor, the cap and flat fees', async () => {
      try {
        await putRule('BUY', { method: 'PERCENT', value: 1, minFee: 20000, maxFee: 60000 });
        const big = await lead(buyListingId);
        expect((await patchLead(big.id, { status: 'WON', closedAmount: 9_000_000 })).body.data.feeAmount).toBe(60000);
        const small = await lead(buyListingId);
        expect((await patchLead(small.id, { status: 'WON', closedAmount: 500_000 })).body.data.feeAmount).toBe(20000);

        await putRule('BUY', { method: 'FIXED', value: 12500 });
        const flat = await lead(buyListingId);
        expect((await patchLead(flat.id, { status: 'WON', closedAmount: 1_000_000 })).body.data.feeAmount).toBe(12500);
      } finally {
        await putRule('BUY', { method: 'PERCENT', value: 1 });
      }
    });

    it('leaves the fee empty (not zero) when the lead has no listing to price', async () => {
      const l = await lead(null);
      const res = await patchLead(l.id, { status: 'WON', closedAmount: 25000 });
      expect(res.status).toBe(200);
      expect(res.body.data.feeAmount).toBeNull();
    });

    it('clears the fee when a lead is moved away from won, and refuses fees on other leads', async () => {
      const l = await lead(rentListingId);
      await patchLead(l.id, { status: 'WON', closedAmount: 20000 });
      const back = await patchLead(l.id, { status: 'QUALIFIED' });
      expect(back.body.data).toMatchObject({ closedAmount: null, feeAmount: null });

      expect((await patchLead(l.id, { feeAmount: 500 })).status).toBe(400);
    });

    it('rejects negative, fractional and absurd fees', async () => {
      const l = await lead(rentListingId);
      await patchLead(l.id, { status: 'WON', closedAmount: 20000 });
      for (const feeAmount of [-1, 12.5, 1e12]) {
        expect((await patchLead(l.id, { feeAmount })).status).toBe(400);
      }
    });
  });

  describe('fees on the dashboard', () => {
    it('shows admins what was earned and how many deals have no fee, and hides it from agents', async () => {
      const before = (await http().get('/api/v1/admin/dashboard').set('Cookie', adminCookie)).body.data;
      const earned = await lead(rentListingId, false);
      await patchLead(earned.id, { status: 'WON', closedAmount: 24000 });
      const noFee = await lead(null, false);
      await patchLead(noFee.id, { status: 'WON', closedAmount: 24000 });

      const after = (await http().get('/api/v1/admin/dashboard').set('Cookie', adminCookie)).body.data;
      expect(after.feesEarned).toBe(before.feesEarned + 12000);
      expect(after.dealsWithoutFee).toBe(before.dealsWithoutFee + 1);

      const agent = (await http().get('/api/v1/admin/dashboard').set('Cookie', agentCookie)).body.data;
      expect(agent.feesEarned).toBeNull();
      expect(agent.dealsWithoutFee).toBeNull();
    });
  });
});
