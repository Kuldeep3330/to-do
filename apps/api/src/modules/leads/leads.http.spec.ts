import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { EMAIL_PORT } from '../notifications/email.port';
import { InMemoryEmail } from '../notifications/email.memory';

const prisma = new PrismaClient();

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

async function insertOriginal(listingId: string): Promise<void> {
  await prisma.media.create({
    data: {
      listingId,
      storageKey: `test/${listingId}/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`,
      contentType: 'image/jpeg',
      byteSize: 1024,
      width: 800,
      height: 600,
      sortOrder: 0,
      variant: 'ORIGINAL',
    },
  });
}

describe('leads HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let customerCookie = '';
  let otherCustomerCookie = '';
  let agentCookie = '';
  let cityId = '';
  let localityId = '';
  let customerId = '';
  let otherCustomerId = '';
  let agentId = '';
  let email: InMemoryEmail;
  const suffix = `${Date.now()}`.slice(-8);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    email = app.get(EMAIL_PORT);

    const delhi = await prisma.city.findUnique({ where: { slug: 'delhi' } });
    if (!delhi) {
      throw new Error('test catalog missing delhi; seed ncr_homes_test');
    }
    const dwarka = await prisma.locality.findUnique({
      where: { cityId_slug: { cityId: delhi.id, slug: 'dwarka' } },
    });
    if (!dwarka) {
      throw new Error('test catalog missing dwarka; seed ncr_homes_test');
    }
    cityId = delhi.id;
    localityId = dwarka.id;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(adminLogin.status).toBe(200);
    adminCookie = cookieHeader(adminLogin);

    const customerReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `cust.lead.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Lead Customer',
        phone: `+9196${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(customerReg.status).toBe(201);
    customerCookie = cookieHeader(customerReg);
    customerId = customerReg.body.data.user.id as string;

    const otherReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `cust.leadb.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Other Customer',
        phone: `+9195${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(otherReg.status).toBe(201);
    otherCustomerCookie = cookieHeader(otherReg);
    otherCustomerId = otherReg.body.data.user.id as string;

    const agentRole = await prisma.role.findUnique({ where: { code: 'SALES_AGENT' } });
    if (!agentRole) {
      throw new Error('SALES_AGENT role missing');
    }
    const agent = await prisma.user.create({
      data: {
        email: `agent.lead.${suffix}@example.com`,
        phone: `+9194${suffix.padStart(8, '0')}`.slice(0, 13),
        name: 'Lead Agent',
        passwordHash: await argon2.hash('AgentPass1'),
        roles: { create: { roleId: agentRole.id } },
      },
    });
    agentId = agent.id;
    const agentLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: agent.email, password: 'AgentPass1' });
    expect(agentLogin.status).toBe(200);
    agentCookie = cookieHeader(agentLogin);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createProperty() {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({
        type: 'RESIDENTIAL',
        cityId,
        localityId,
        internalTitle: `LeadProp ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
        areaValue: 1100,
        bedrooms: 2,
        bathrooms: 2,
      });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function publishListing(): Promise<{ id: string; slug: string; title: string }> {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send({
        propertyId,
        intent: 'RENT',
        title: `Lead ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
        description: 'Lead listing',
        priceAmount: 22000,
        pricePeriod: 'MONTHLY',
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    await insertOriginal(id);
    expect(
      (await request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/publish`).set('Cookie', adminCookie))
        .status,
    ).toBe(200);
    return { id, slug: created.body.data.slug as string, title: created.body.data.title as string };
  }

  it('guest enquiry on published listing creates NEW lead and emails after commit', async () => {
    const listing = await publishListing();
    email.sent.length = 0;
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({
        listingSlug: listing.slug,
        name: 'Asha Kumar',
        phone: `+9188${suffix.padStart(8, '0')}`.slice(0, 13),
        email: `asha.${suffix}@example.com`,
        message: 'Please call',
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
    const row = await prisma.lead.findFirst({
      where: { listingId: listing.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.status).toBe('NEW');
    expect(row?.userId).toBeNull();
    expect(row?.source).toBe('WEB_FORM');
    expect(email.sent.length).toBeGreaterThanOrEqual(2);
    const logs = await prisma.notificationLog.findMany({
      where: { template: { in: ['lead_received_ops', 'lead_received_customer'] } },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    expect(logs.some((l) => l.status === 'SENT')).toBe(true);
  });

  it('duplicate phone+listing within 24h does not insert a second row', async () => {
    const listing = await publishListing();
    const phone = `+9187${suffix.padStart(8, '0')}`.slice(0, 13);
    const body = { listingId: listing.id, name: 'Dup User', phone };
    const first = await request(app.getHttpServer()).post('/api/v1/leads').send(body);
    const second = await request(app.getHttpServer()).post('/api/v1/leads').send(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual({ ok: true });
    const count = await prisma.lead.count({ where: { listingId: listing.id, phone } });
    expect(count).toBe(1);
  });

  it('returns 404 for draft listing and 400 for invalid phone', async () => {
    const propertyId = await createProperty();
    const draft = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send({
        propertyId,
        intent: 'RENT',
        title: `Draft lead ${Date.now()}`,
        priceAmount: 22000,
        pricePeriod: 'MONTHLY',
      });
    const unpublished = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({ listingSlug: draft.body.data.slug, name: 'Asha Kumar', phone: '+919876543210' });
    expect(unpublished.status).toBe(404);
    const badPhone = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({ listingId: draft.body.data.id, name: 'Asha Kumar', phone: '9876543210' });
    expect(badPhone.status).toBe(400);
    expect(badPhone.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('attaches userId when the customer is logged in', async () => {
    const listing = await publishListing();
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Cookie', customerCookie)
      .send({
        listingId: listing.id,
        name: 'Lead Customer',
        phone: `+9186${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(res.status).toBe(200);
    const row = await prisma.lead.findFirst({ where: { listingId: listing.id }, orderBy: { createdAt: 'desc' } });
    expect(row?.userId).toBe(customerId);
  });

  it('customer lists own leads and 404s on another customer id', async () => {
    const listing = await publishListing();
    await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Cookie', customerCookie)
      .send({
        listingId: listing.id,
        name: 'Lead Customer',
        phone: `+9185${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    const mine = await request(app.getHttpServer()).get('/api/v1/me/leads').set('Cookie', customerCookie);
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThanOrEqual(1);
    expect(mine.body.data[0]).not.toHaveProperty('assignedToUserId');
    const id = mine.body.data[0].id as string;
    const other = await request(app.getHttpServer()).get(`/api/v1/me/leads/${id}`).set('Cookie', otherCustomerCookie);
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('NOT_FOUND');
    void otherCustomerId;
  });

  it('agent cannot read unassigned leads or assign; admin can', async () => {
    const listing = await publishListing();
    await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({
        listingId: listing.id,
        name: 'Inbox Lead',
        phone: `+9184${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    const row = await prisma.lead.findFirst({ where: { listingId: listing.id }, orderBy: { createdAt: 'desc' } });
    expect(row).toBeTruthy();
    const agentGet = await request(app.getHttpServer())
      .get(`/api/v1/admin/leads/${row!.id}`)
      .set('Cookie', agentCookie);
    expect(agentGet.status).toBe(404);
    const agentAssign = await request(app.getHttpServer())
      .patch(`/api/v1/admin/leads/${row!.id}`)
      .set('Cookie', agentCookie)
      .send({ assignedToUserId: agentId });
    expect(agentAssign.status).toBe(403);
    const adminAssign = await request(app.getHttpServer())
      .patch(`/api/v1/admin/leads/${row!.id}`)
      .set('Cookie', adminCookie)
      .send({ assignedToUserId: agentId, status: 'CONTACTED' });
    expect(adminAssign.status).toBe(200);
    expect(adminAssign.body.data.assignedToUserId).toBe(agentId);
    expect(adminAssign.body.data.status).toBe('CONTACTED');
    const agentNow = await request(app.getHttpServer())
      .get(`/api/v1/admin/leads/${row!.id}`)
      .set('Cookie', agentCookie);
    expect(agentNow.status).toBe(200);
    expect(agentNow.body.data.phone).toBeTruthy();
    const agentStatus = await request(app.getHttpServer())
      .patch(`/api/v1/admin/leads/${row!.id}`)
      .set('Cookie', agentCookie)
      .send({ status: 'QUALIFIED' });
    expect(agentStatus.status).toBe(200);
    expect(agentStatus.body.data.status).toBe('QUALIFIED');
  });

  it('rejects assigning a CUSTOMER or DISABLED user', async () => {
    const listing = await publishListing();
    await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({
        listingId: listing.id,
        name: 'Assign Check',
        phone: `+9182${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    const row = await prisma.lead.findFirst({ where: { listingId: listing.id }, orderBy: { createdAt: 'desc' } });
    const customerAssign = await request(app.getHttpServer())
      .patch(`/api/v1/admin/leads/${row!.id}`)
      .set('Cookie', adminCookie)
      .send({ assignedToUserId: customerId });
    expect(customerAssign.status).toBe(400);
    expect(customerAssign.body.error.code).toBe('VALIDATION_ERROR');

    await prisma.user.update({ where: { id: agentId }, data: { status: 'DISABLED' } });
    const disabledAssign = await request(app.getHttpServer())
      .patch(`/api/v1/admin/leads/${row!.id}`)
      .set('Cookie', adminCookie)
      .send({ assignedToUserId: agentId });
    expect(disabledAssign.status).toBe(400);
    await prisma.user.update({ where: { id: agentId }, data: { status: 'ACTIVE' } });
  });

  it('404s on deleted listing and deleted property enquiry', async () => {
    const deletedListing = await publishListing();
    await prisma.listing.update({ where: { id: deletedListing.id }, data: { deletedAt: new Date() } });
    const delList = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({
        listingId: deletedListing.id,
        name: 'Gone Listing',
        phone: `+9181${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(delList.status).toBe(404);

    const deletedPropertyListing = await publishListing();
    const parent = await prisma.listing.findFirst({ where: { id: deletedPropertyListing.id } });
    await prisma.property.update({ where: { id: parent!.propertyId }, data: { deletedAt: new Date() } });
    const delProp = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({
        listingSlug: deletedPropertyListing.slug,
        name: 'Gone Property',
        phone: `+9180${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(delProp.status).toBe(404);
  });

  it('customer cannot assign a lead', async () => {
    const listing = await publishListing();
    await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('Cookie', customerCookie)
      .send({
        listingId: listing.id,
        name: 'Lead Customer',
        phone: `+9179${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    const row = await prisma.lead.findFirst({ where: { listingId: listing.id }, orderBy: { createdAt: 'desc' } });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/leads/${row!.id}`)
      .set('Cookie', customerCookie)
      .send({ assignedToUserId: agentId });
    expect(res.status).toBe(403);
  });

  it('ignores client-supplied userId and does not spoof owner', async () => {
    const listing = await publishListing();
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({
        listingId: listing.id,
        name: 'Spoof',
        phone: `+9178${suffix.padStart(8, '0')}`.slice(0, 13),
        userId: customerId,
      });
    expect(res.status).toBe(200);
    const row = await prisma.lead.findFirst({
      where: { listingId: listing.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.userId).toBeNull();
  });

  it('keeps the lead when email send fails', async () => {
    const listing = await publishListing();
    email.failNext = true;
    const phone = `+9183${suffix.padStart(8, '0')}`.slice(0, 13);
    const res = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({ listingId: listing.id, name: 'Fail Mail', phone });
    expect(res.status).toBe(200);
    const row = await prisma.lead.findFirst({ where: { listingId: listing.id, phone } });
    expect(row).toBeTruthy();
    const failed = await prisma.notificationLog.findFirst({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(failed).toBeTruthy();
  });
});
