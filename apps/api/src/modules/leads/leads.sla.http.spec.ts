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

const HOUR = 3_600_000;

describe('lead response timer HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let agentCookie = '';
  let agentId = '';
  const suffix = `${Date.now()}`.slice(-8);
  const phone = (n: number) => `+9197${`${suffix}${n}`.slice(-8).padStart(8, '0')}`;
  const http = () => request(app.getHttpServer());

  /** Lead assigned to the test agent, so the agent's scoped views are isolated from other test data. */
  async function lead(n: number, ageHours: number, extra: Record<string, unknown> = {}) {
    return prisma.lead.create({
      data: {
        name: `SLA Lead ${n}`,
        phone: phone(30 + n),
        assignedToUserId: agentId,
        status: 'NEW',
        createdAt: new Date(Date.now() - ageHours * HOUR),
        ...extra,
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

    const body = {
      email: `sla.agent.${suffix}@example.com`,
      name: 'SLA Agent',
      phone: phone(9),
      password: 'StaffPassword1',
      role: 'SALES_AGENT',
    };
    const made = await http().post('/api/v1/admin/users').set('Cookie', adminCookie).send(body);
    expect(made.status).toBe(201);
    agentId = made.body.data.id;
    agentCookie = cookieHeader(await http().post('/api/v1/auth/login').send({ email: body.email, password: body.password }));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const list = async (query = '') => (await http().get(`/api/v1/admin/leads${query}`).set('Cookie', agentCookie)).body.data as {
    id: string;
    overdue: boolean;
    respondBy: string;
    firstResponseAt: string | null;
    responseMinutes: number | null;
  }[];

  it('marks a waiting lead overdue only after the target, and exposes its deadline', async () => {
    const fresh = await lead(1, 0.5);
    const late = await lead(2, 3);
    const rows = await list();
    const f = rows.find((r) => r.id === fresh.id)!;
    const l = rows.find((r) => r.id === late.id)!;
    expect(f.overdue).toBe(false);
    expect(l.overdue).toBe(true);
    expect(f.firstResponseAt).toBeNull();
    expect(new Date(l.respondBy).getTime()).toBe(late.createdAt.getTime() + 120 * 60_000);
  });

  it('filters the list to overdue leads only', async () => {
    const late = await lead(3, 5);
    const ok = await lead(4, 0.1);
    const overdue = await list('?overdue=true&pageSize=24');
    expect(overdue.every((r) => r.overdue)).toBe(true);
    expect(overdue.some((r) => r.id === late.id)).toBe(true);
    expect(overdue.some((r) => r.id === ok.id)).toBe(false);
    expect((await http().get('/api/v1/admin/leads?overdue=banana').set('Cookie', agentCookie)).status).toBe(400);
  });

  it('records the first response when the lead leaves NEW, and stops being overdue', async () => {
    const waiting = await lead(5, 4);
    const res = await http().patch(`/api/v1/admin/leads/${waiting.id}`).set('Cookie', agentCookie).send({ status: 'CONTACTED' });
    expect(res.status).toBe(200);
    expect(res.body.data.overdue).toBe(false);
    expect(res.body.data.firstResponseAt).toBeTruthy();
    expect(res.body.data.responseMinutes).toBeGreaterThanOrEqual(239);

    // later status changes do not rewrite the first response
    const first = res.body.data.firstResponseAt;
    const again = await http().patch(`/api/v1/admin/leads/${waiting.id}`).set('Cookie', agentCookie).send({ status: 'QUALIFIED' });
    expect(again.body.data.firstResponseAt).toBe(first);
    expect((await list('?overdue=true&pageSize=24')).some((r) => r.id === waiting.id)).toBe(false);
  });

  it('does not count assignment alone as a response', async () => {
    const waiting = await lead(6, 4);
    const res = await http().patch(`/api/v1/admin/leads/${waiting.id}`).set('Cookie', adminCookie).send({ assignedToUserId: agentId });
    expect(res.status).toBe(200);
    expect(res.body.data.firstResponseAt).toBeNull();
    expect(res.body.data.overdue).toBe(true);
  });

  it('counts confirming a visit as the first response', async () => {
    const waiting = await lead(7, 4);
    const listing = await prisma.listing.findFirstOrThrow({ where: { status: 'PUBLISHED', deletedAt: null } });
    const visit = await prisma.visit.create({ data: { leadId: waiting.id, listingId: listing.id } });
    const res = await http().post(`/api/v1/admin/visits/${visit.id}/confirm`).set('Cookie', agentCookie).send({});
    expect(res.status).toBe(200);
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: waiting.id } });
    expect(row.firstResponseAt).not.toBeNull();
    expect(row.status).toBe('VISIT_SCHEDULED');
  });

  it('reports overdue count and median response time on the dashboard, scoped to the agent', async () => {
    const before = (await http().get('/api/v1/admin/dashboard').set('Cookie', agentCookie)).body.data;
    await lead(8, 6);
    const after = (await http().get('/api/v1/admin/dashboard').set('Cookie', agentCookie)).body.data;
    expect(after.leadsOverdue).toBe(before.leadsOverdue + 1);
    expect(after.responseTargetMinutes).toBe(120);
    expect(after.medianResponseMinutes === null || typeof after.medianResponseMinutes === 'number').toBe(true);
    expect(after.scopedToAssigned).toBe(true);
  });
});
