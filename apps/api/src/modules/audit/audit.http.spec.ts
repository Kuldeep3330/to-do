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

describe('audit log HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let agentCookie = '';
  let adminId = '';
  const suffix = `${Date.now()}`.slice(-8);
  const action = `TEST_AUDIT_${suffix}`;
  const entityId = '00000000-0000-4000-8000-0000000000aa';
  const http = () => request(app.getHttpServer());
  const get = (path: string, cookie = adminCookie) => http().get(`/api/v1/admin/audit-logs${path}`).set('Cookie', cookie);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const admin = await http().post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(admin.status).toBe(200);
    adminCookie = cookieHeader(admin);
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } })).id;

    const agentBody = {
      email: `audit.agent.${suffix}@example.com`,
      name: 'Audit Agent',
      phone: `+9197${suffix.padStart(8, '0')}`,
      password: 'StaffPassword1',
      role: 'SALES_AGENT',
    };
    expect((await http().post('/api/v1/admin/users').set('Cookie', adminCookie).send(agentBody)).status).toBe(201);
    agentCookie = cookieHeader(await http().post('/api/v1/auth/login').send({ email: agentBody.email, password: agentBody.password }));

    await prisma.auditLog.createMany({
      data: [
        { actorUserId: adminId, action, entityType: 'test_thing', entityId, metadata: { note: 'first' } },
        { actorUserId: adminId, action, entityType: 'test_thing', entityId: null, metadata: {} },
        { actorUserId: null, action, entityType: 'test_other', entityId: null, metadata: {} },
      ],
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { action } });
    await app.close();
    await prisma.$disconnect();
  });

  it('lists entries newest first with the actor, and filters by action', async () => {
    const res = await get(`?action=${action}&pageSize=24`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(3);
    const rows = res.body.data as { createdAt: string; actor: { email: string } | null; metadata: unknown }[];
    expect(rows).toHaveLength(3);
    const times = rows.map((r) => new Date(r.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(rows.filter((r) => r.actor?.email === 'admin@example.com')).toHaveLength(2);
    expect(rows.filter((r) => r.actor === null)).toHaveLength(1);
  });

  it('filters by entity type, entity id and actor', async () => {
    expect((await get(`?action=${action}&entityType=test_other`)).body.meta.total).toBe(1);
    expect((await get(`?action=${action}&entityId=${entityId}`)).body.meta.total).toBe(1);
    expect((await get(`?action=${action}&actorId=${adminId}`)).body.meta.total).toBe(2);
  });

  it('filters by day, treating the last day as inclusive (India time)', async () => {
    const day = (offset: number) => new Date(Date.now() + 5.5 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
    expect((await get(`?action=${action}&from=${day(0)}&to=${day(0)}`)).body.meta.total).toBe(3);
    expect((await get(`?action=${action}&from=${day(1)}`)).body.meta.total).toBe(0);
    expect((await get(`?action=${action}&to=${day(-2)}`)).body.meta.total).toBe(0);
  });

  it('pages the results', async () => {
    const res = await get(`?action=${action}&pageSize=2&page=2`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3 });
  });

  it('offers the filter values that have actually been logged', async () => {
    const res = await get('/filters');
    expect(res.status).toBe(200);
    expect(res.body.data.actions).toContain(action);
    expect(res.body.data.entityTypes).toEqual(expect.arrayContaining(['test_thing', 'test_other']));
    expect(res.body.data.actors.map((a: { id: string }) => a.id)).toContain(adminId);
  });

  it('rejects bad input', async () => {
    expect((await get('?from=yesterday')).status).toBe(400);
    expect((await get('?actorId=not-a-uuid')).status).toBe(400);
  });

  it('is for admins only', async () => {
    expect((await get('', agentCookie)).status).toBe(403);
    expect((await get('/filters', agentCookie)).status).toBe(403);
    expect((await http().get('/api/v1/admin/audit-logs')).status).toBe(401);
  });

  it('has no write routes', async () => {
    expect((await http().post('/api/v1/admin/audit-logs').set('Cookie', adminCookie).send({ action: 'X' })).status).toBe(404);
    expect((await http().delete('/api/v1/admin/audit-logs').set('Cookie', adminCookie)).status).toBe(404);
  });
});
