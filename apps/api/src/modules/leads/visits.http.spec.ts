import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { assertDateWindow, todayIst } from './visits.service';

const prisma = new PrismaClient();

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

const dayFromToday = (n: number) => todayIst(new Date(Date.now() + n * 86_400_000));

describe('visit date window', () => {
  const now = new Date('2026-10-18T10:00:00.000Z');

  it('accepts today and up to 30 days ahead', () => {
    expect(() => assertDateWindow('2026-10-18', now)).not.toThrow();
    expect(() => assertDateWindow('2026-11-17', now)).not.toThrow();
    expect(() => assertDateWindow(undefined, now)).not.toThrow();
  });

  it('rejects the past, far future and impossible dates', () => {
    expect(() => assertDateWindow('2026-10-17', now)).toThrow();
    expect(() => assertDateWindow('2026-11-18', now)).toThrow();
    expect(() => assertDateWindow('2026-02-31', now)).toThrow();
  });

  it('uses the India calendar day, which starts before UTC midnight', () => {
    // 20:00 UTC on the 18th is already 01:30 on the 19th in India.
    expect(todayIst(new Date('2026-10-18T20:00:00.000Z'))).toBe('2026-10-19');
  });
});

describe('visits HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let agentCookie = '';
  let otherAgentCookie = '';
  let customerCookie = '';
  let otherCustomerCookie = '';
  let agentId = '';
  let listingId = '';
  const suffix = `${Date.now()}`.slice(-8);
  const phone = (n: number) => `+9197${`${suffix}${n}`.slice(-8).padStart(8, '0')}`;
  const createdUsers: string[] = [];

  const http = () => request(app.getHttpServer());
  const login = (email: string, password: string) => http().post('/api/v1/auth/login').send({ email, password });

  async function newAgent(n: number) {
    const body = {
      email: `visit.agent.${suffix}.${n}@example.com`,
      name: `Visit Agent ${n}`,
      phone: phone(10 + n),
      password: 'StaffPassword1',
      role: 'SALES_AGENT',
    };
    const res = await http().post('/api/v1/admin/users').set('Cookie', adminCookie).send(body);
    expect(res.status).toBe(201);
    createdUsers.push(body.email);
    const session = await login(body.email, body.password);
    return { id: res.body.data.id as string, cookie: cookieHeader(session) };
  }

  async function newCustomer(n: number) {
    const email = `visit.cust.${suffix}.${n}@example.com`;
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, password: 'CustomerPass1', name: `Visit Customer ${n}`, phone: phone(20 + n) });
    expect(res.status).toBe(201);
    createdUsers.push(email);
    return cookieHeader(res);
  }

  async function publishedListing(): Promise<string> {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: 'delhi' } });
    const locality = await prisma.locality.findUniqueOrThrow({
      where: { cityId_slug: { cityId: city.id, slug: 'dwarka' } },
    });
    const property = await http()
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({
        type: 'RESIDENTIAL',
        cityId: city.id,
        localityId: locality.id,
        internalTitle: `VisitProp ${suffix} ${Math.random().toString(16).slice(2, 6)}`,
        areaValue: 900,
        bedrooms: 2,
        bathrooms: 2,
      });
    expect(property.status).toBe(201);
    const listing = await http()
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send({
        propertyId: property.body.data.id,
        intent: 'RENT',
        title: `Visit test home ${suffix}`,
        description: 'Plain text',
        priceAmount: 20000,
        pricePeriod: 'MONTHLY',
        negotiable: false,
      });
    expect(listing.status).toBe(201);
    const id = listing.body.data.id as string;
    await prisma.media.create({
      data: {
        listingId: id,
        storageKey: `test/${id}/${Date.now()}.jpg`,
        contentType: 'image/jpeg',
        byteSize: 1024,
        width: 800,
        height: 600,
        sortOrder: 0,
        variant: 'ORIGINAL',
      },
    });
    const published = await http().post(`/api/v1/admin/listings/${id}/publish`).set('Cookie', adminCookie);
    expect(published.status).toBe(200);
    return id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const admin = await login('admin@example.com', 'ChangeMeAdmin1');
    expect(admin.status).toBe(200);
    adminCookie = cookieHeader(admin);
    const agent = await newAgent(1);
    agentCookie = agent.cookie;
    agentId = agent.id;
    otherAgentCookie = (await newAgent(2)).cookie;
    customerCookie = await newCustomer(1);
    otherCustomerCookie = await newCustomer(2);
    listingId = await publishedListing();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function request1(cookie = customerCookie, extra: Record<string, unknown> = {}, id = listingId) {
    return http()
      .post('/api/v1/me/visits')
      .set('Cookie', cookie)
      .send({ listingId: id, preferredDate: dayFromToday(3), preferredSlot: 'MORNING', ...extra });
  }

  it('requires a signed-in customer', async () => {
    expect((await http().post('/api/v1/me/visits').send({ listingId })).status).toBe(401);
    expect((await http().get('/api/v1/me/visits')).status).toBe(401);
    expect((await http().get('/api/v1/admin/visits').set('Cookie', customerCookie)).status).toBe(403);
  });

  it('creates a visit and a linked NEW lead, then blocks a second open request', async () => {
    const res = await request1();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'REQUESTED', preferredSlot: 'MORNING' });
    expect(res.body.data.listing.id).toBe(listingId);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: res.body.data.leadId } });
    expect(lead.status).toBe('NEW');
    expect(lead.listingId).toBe(listingId);

    const again = await request1();
    expect(again.status).toBe(409);
  });

  it('reuses the customer\'s open enquiry instead of creating a second lead', async () => {
    const before = await prisma.lead.count({ where: { listingId } });
    const enquiry = await http()
      .post('/api/v1/leads')
      .set('Cookie', otherCustomerCookie)
      .send({ listingId, name: 'Visit Customer 2', phone: '+919876500002', message: 'hello' });
    expect(enquiry.status).toBe(200);
    const mid = await prisma.lead.count({ where: { listingId } });
    expect(mid).toBe(before + 1);

    const res = await request1(otherCustomerCookie);
    expect(res.status).toBe(201);
    expect(await prisma.lead.count({ where: { listingId } })).toBe(mid);
  });

  it('rejects past dates, far-future dates, unknown and unpublished listings', async () => {
    expect((await request1(customerCookie, { preferredDate: dayFromToday(-1) })).status).toBe(400);
    expect((await request1(customerCookie, { preferredDate: dayFromToday(45) })).status).toBe(400);
    expect((await request1(customerCookie, {}, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    await prisma.listing.update({ where: { id: listingId }, data: { status: 'PAUSED' } });
    expect((await request1(customerCookie)).status).toBe(404);
    await prisma.listing.update({ where: { id: listingId }, data: { status: 'PUBLISHED' } });
  });

  it('lists only the caller\'s own visits and lets them cancel while REQUESTED', async () => {
    const mine = await http().get('/api/v1/me/visits').set('Cookie', customerCookie);
    expect(mine.status).toBe(200);
    expect(mine.body.data.length).toBeGreaterThanOrEqual(1);
    const visit = mine.body.data[0];

    const stranger = await http().post(`/api/v1/me/visits/${visit.id}/cancel`).set('Cookie', otherCustomerCookie);
    expect(stranger.status).toBe(404);

    const cancelled = await http().post(`/api/v1/me/visits/${visit.id}/cancel`).set('Cookie', customerCookie);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const again = await http().post(`/api/v1/me/visits/${visit.id}/cancel`).set('Cookie', customerCookie);
    expect(again.status).toBe(409);
  });

  it('runs the staff workflow, moves the lead to VISIT_SCHEDULED, and enforces transitions', async () => {
    const created = await request1(customerCookie);
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    const leadId = created.body.data.leadId as string;

    const completeEarly = await http().post(`/api/v1/admin/visits/${id}/complete`).set('Cookie', adminCookie);
    expect(completeEarly.status).toBe(409);

    const confirmed = await http()
      .post(`/api/v1/admin/visits/${id}/confirm`)
      .set('Cookie', adminCookie)
      .send({ preferredDate: dayFromToday(4), preferredSlot: 'EVENING' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data).toMatchObject({ status: 'CONFIRMED', preferredSlot: 'EVENING' });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe('VISIT_SCHEDULED');

    // customers can no longer cancel a confirmed visit themselves
    expect((await http().post(`/api/v1/me/visits/${id}/cancel`).set('Cookie', customerCookie)).status).toBe(409);

    expect((await http().post(`/api/v1/admin/visits/${id}/confirm`).set('Cookie', adminCookie).send({})).status).toBe(409);

    const done = await http().post(`/api/v1/admin/visits/${id}/complete`).set('Cookie', adminCookie);
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('COMPLETED');
    expect((await http().post(`/api/v1/admin/visits/${id}/cancel`).set('Cookie', adminCookie)).status).toBe(409);
  });

  it('does not move a finished lead back to VISIT_SCHEDULED', async () => {
    const customer = await newCustomer(3);
    const created = await request1(customer);
    expect(created.status).toBe(201);
    await prisma.lead.update({ where: { id: created.body.data.leadId }, data: { status: 'LOST' } });
    const confirmed = await http().post(`/api/v1/admin/visits/${created.body.data.id}/confirm`).set('Cookie', adminCookie).send({});
    expect(confirmed.status).toBe(200);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: created.body.data.leadId } })).status).toBe('LOST');
  });

  it('limits agents to visits on leads assigned to them', async () => {
    const customer = await newCustomer(4);
    const created = await request1(customer);
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const before = await http().get('/api/v1/admin/visits').set('Cookie', agentCookie);
    expect(before.status).toBe(200);
    expect(before.body.data.find((v: { id: string }) => v.id === id)).toBeUndefined();
    expect((await http().post(`/api/v1/admin/visits/${id}/confirm`).set('Cookie', agentCookie).send({})).status).toBe(404);

    await prisma.lead.update({ where: { id: created.body.data.leadId }, data: { assignedToUserId: agentId } });

    const after = await http().get('/api/v1/admin/visits').set('Cookie', agentCookie);
    expect(after.body.data.find((v: { id: string }) => v.id === id)).toBeDefined();
    expect((await http().get('/api/v1/admin/visits').set('Cookie', otherAgentCookie)).body.data.find((v: { id: string }) => v.id === id)).toBeUndefined();
    expect((await http().post(`/api/v1/admin/visits/${id}/confirm`).set('Cookie', agentCookie).send({})).status).toBe(200);
  });

  it('filters the admin list by status and paginates', async () => {
    const res = await http().get('/api/v1/admin/visits?status=CANCELLED&page=1&pageSize=5').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 5 });
    for (const v of res.body.data) {
      expect(v.status).toBe('CANCELLED');
    }
    expect((await http().get('/api/v1/admin/visits?status=BOGUS').set('Cookie', adminCookie)).status).toBe(400);
  });

  it('writes an audit row for staff actions', async () => {
    const customer = await newCustomer(5);
    const created = await request1(customer);
    await http().post(`/api/v1/admin/visits/${created.body.data.id}/cancel`).set('Cookie', adminCookie);
    const rows = await prisma.auditLog.count({ where: { action: 'UPDATE_VISIT' } });
    expect(rows).toBeGreaterThan(0);
  });
});
