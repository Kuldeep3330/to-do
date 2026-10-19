import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { todayIst } from './visits.service';

const prisma = new PrismaClient();

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

describe('deal tracking HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let agentCookie = '';
  let otherAgentCookie = '';
  let agentId = '';
  let listingId = '';
  let listingIntent: 'RENT' | 'BUY' = 'RENT';
  const suffix = `${Date.now()}`.slice(-8);
  const phone = (n: number) => `+9197${`${suffix}${n}`.slice(-8).padStart(8, '0')}`;
  const http = () => request(app.getHttpServer());
  const today = todayIst();

  async function agent(n: number) {
    const body = {
      email: `deal.agent.${suffix}.${n}@example.com`,
      name: `Deal Agent ${n}`,
      phone: phone(50 + n),
      password: 'StaffPassword1',
      role: 'SALES_AGENT',
    };
    const made = await http().post('/api/v1/admin/users').set('Cookie', adminCookie).send(body);
    expect(made.status).toBe(201);
    const session = await http().post('/api/v1/auth/login').send({ email: body.email, password: body.password });
    return { id: made.body.data.id as string, cookie: cookieHeader(session) };
  }

  let seq = 0;
  async function lead(extra: Record<string, unknown> = {}) {
    seq += 1;
    return prisma.lead.create({
      data: {
        name: `Deal Lead ${seq}`,
        phone: phone(70 + seq),
        assignedToUserId: agentId,
        listingId,
        status: 'QUALIFIED',
        ...extra,
      },
    });
  }

  const patch = (id: string, body: Record<string, unknown>, cookie = agentCookie) =>
    http().patch(`/api/v1/admin/leads/${id}`).set('Cookie', cookie).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const admin = await http().post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(admin.status).toBe(200);
    adminCookie = cookieHeader(admin);
    const a = await agent(1);
    agentId = a.id;
    agentCookie = a.cookie;
    otherAgentCookie = (await agent(2)).cookie;

    const listing = await prisma.listing.findFirstOrThrow({ where: { status: 'PUBLISHED', deletedAt: null } });
    listingId = listing.id;
    listingIntent = listing.intent === 'RENT' ? 'RENT' : 'BUY';
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('refuses to mark a lead won without a closing value', async () => {
    const l = await lead();
    const res = await patch(l.id, { status: 'WON' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('closedAmount');
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe('QUALIFIED');
  });

  it('records the value and defaults the closing day to today', async () => {
    const l = await lead();
    const res = await patch(l.id, { status: 'WON', closedAmount: 32000 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'WON', closedAmount: 32000, closedOn: today });
    expect(res.body.data.firstResponseAt).toBeTruthy();
  });

  it('accepts an explicit closing day but rejects future, pre-enquiry and impossible days', async () => {
    const l = await lead();
    expect((await patch(l.id, { status: 'WON', closedAmount: 5000, closedOn: '2999-01-01' })).status).toBe(400);
    expect((await patch(l.id, { status: 'WON', closedAmount: 5000, closedOn: '2001-01-01' })).status).toBe(400);
    expect((await patch(l.id, { status: 'WON', closedAmount: 5000, closedOn: '2026-02-31' })).status).toBe(400);
    const ok = await patch(l.id, { status: 'WON', closedAmount: 5000, closedOn: today });
    expect(ok.status).toBe(200);
  });

  it('rejects zero, negative, fractional and absurd amounts', async () => {
    const l = await lead();
    for (const closedAmount of [0, -5, 10.5, 1e12]) {
      expect((await patch(l.id, { status: 'WON', closedAmount })).status).toBe(400);
    }
  });

  it('only allows deal details on won leads', async () => {
    const l = await lead();
    const res = await patch(l.id, { closedAmount: 20000 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/won/i);
    const mixed = await patch(l.id, { status: 'CONTACTED', closedAmount: 20000 });
    expect(mixed.status).toBe(400);
  });

  it('lets staff correct the amount on an already won lead', async () => {
    const l = await lead();
    await patch(l.id, { status: 'WON', closedAmount: 20000 });
    const fixed = await patch(l.id, { closedAmount: 22000 });
    expect(fixed.status).toBe(200);
    expect(fixed.body.data).toMatchObject({ status: 'WON', closedAmount: 22000, closedOn: today });
  });

  it('clears the deal when a lead is moved away from won', async () => {
    const l = await lead();
    await patch(l.id, { status: 'WON', closedAmount: 20000 });
    const back = await patch(l.id, { status: 'QUALIFIED' });
    expect(back.status).toBe(200);
    expect(back.body.data).toMatchObject({ closedAmount: null, closedOn: null });
  });

  it('keeps agents to their own leads', async () => {
    const l = await lead();
    expect((await patch(l.id, { status: 'WON', closedAmount: 20000 }, otherAgentCookie)).status).toBe(404);
  });

  it('counts won deals on the dashboard by listing intent, scoped to the agent', async () => {
    const dash = async () => (await http().get('/api/v1/admin/dashboard').set('Cookie', agentCookie)).body.data;
    const before = await dash();
    const l = await lead();
    await patch(l.id, { status: 'WON', closedAmount: 40000 });
    const after = await dash();
    expect(after.dealsWon).toBe(before.dealsWon + 1);
    const field = listingIntent === 'RENT' ? 'wonRentMonthly' : 'wonSaleValue';
    const other = listingIntent === 'RENT' ? 'wonSaleValue' : 'wonRentMonthly';
    expect(after[field]).toBe(before[field] + 40000);
    expect(after[other]).toBe(before[other]);
    expect(after.winRatePercent === null || typeof after.winRatePercent === 'number').toBe(true);
  });

  it('exposes the deal to admins in the list', async () => {
    const l = await lead();
    await patch(l.id, { status: 'WON', closedAmount: 18000 });
    const res = await http().get(`/api/v1/admin/leads/${l.id}`).set('Cookie', adminCookie);
    expect(res.body.data).toMatchObject({ closedAmount: 18000, closedOn: today });
  });
});
