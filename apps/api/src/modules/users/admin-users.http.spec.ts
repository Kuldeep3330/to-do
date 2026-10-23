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

describe('admin users HTTP', () => {
  let app: INestApplication;
  let superCookie = '';
  let customerCookie = '';
  const suffix = `${Date.now()}`.slice(-8);
  const phone = (n: number) => `+9197${`${suffix}${n}`.slice(-8).padStart(8, '0')}`;
  const created: string[] = [];

  const http = () => request(app.getHttpServer());
  const login = (email: string, password: string) => http().post('/api/v1/auth/login').send({ email, password });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const admin = await login('admin@example.com', 'ChangeMeAdmin1');
    expect(admin.status).toBe(200);
    superCookie = cookieHeader(admin);

    const customer = await http()
      .post('/api/v1/auth/register')
      .send({ email: `cust.users.${suffix}@example.com`, password: 'CustomerPass1', name: 'Cust', phone: phone(0) });
    expect(customer.status).toBe(201);
    customerCookie = cookieHeader(customer);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: created } } });
    await app.close();
    await prisma.$disconnect();
  });

  const newStaff = (n: number, role: 'SALES_AGENT' | 'ADMIN') => ({
    email: `staff.${suffix}.${n}@example.com`,
    name: `Staff ${n}`,
    phone: phone(n),
    password: 'StaffPassword1',
    role,
  });

  it('requires authentication and the right permission', async () => {
    expect((await http().get('/api/v1/admin/users')).status).toBe(401);
    expect((await http().get('/api/v1/admin/users').set('Cookie', customerCookie)).status).toBe(403);
    expect((await http().get('/api/v1/admin/staff').set('Cookie', customerCookie)).status).toBe(403);
    expect((await http().post('/api/v1/admin/users').set('Cookie', customerCookie).send(newStaff(1, 'SALES_AGENT'))).status).toBe(403);
  });

  it('lets a super admin create a sales agent who can log in and is assignable', async () => {
    const body = newStaff(2, 'SALES_AGENT');
    const res = await http().post('/api/v1/admin/users').set('Cookie', superCookie).send(body);
    expect(res.status).toBe(201);
    created.push(body.email);
    expect(res.body.data).toMatchObject({ email: body.email, roles: ['SALES_AGENT'], status: 'ACTIVE' });
    expect(res.body.data).not.toHaveProperty('passwordHash');

    expect((await login(body.email, body.password)).status).toBe(200);

    const staff = await http().get('/api/v1/admin/staff').set('Cookie', superCookie);
    expect(staff.status).toBe(200);
    const row = staff.body.data.find((s: { email: string }) => s.email === body.email);
    expect(row).toEqual({ id: res.body.data.id, name: body.name, email: body.email, roles: ['SALES_AGENT'] });
    // customers are never offered for assignment
    expect(staff.body.data.some((s: { email: string }) => s.email.startsWith('cust.users'))).toBe(false);
  });

  it('rejects duplicates, weak input and unknown roles', async () => {
    const body = newStaff(3, 'SALES_AGENT');
    expect((await http().post('/api/v1/admin/users').set('Cookie', superCookie).send(body)).status).toBe(201);
    created.push(body.email);
    const dupEmail = await http().post('/api/v1/admin/users').set('Cookie', superCookie).send({ ...body, phone: phone(4) });
    expect(dupEmail.status).toBe(409);
    const dupPhone = await http()
      .post('/api/v1/admin/users')
      .set('Cookie', superCookie)
      .send({ ...body, email: `other.${suffix}@example.com` });
    expect(dupPhone.status).toBe(409);
    expect((await http().post('/api/v1/admin/users').set('Cookie', superCookie).send({ ...body, password: 'short' })).status).toBe(400);
    expect((await http().post('/api/v1/admin/users').set('Cookie', superCookie).send({ ...body, role: 'SUPER_ADMIN' })).status).toBe(400);
  });

  it('stops an admin from creating or disabling admins, but not a super admin', async () => {
    const adminBody = newStaff(5, 'ADMIN');
    const made = await http().post('/api/v1/admin/users').set('Cookie', superCookie).send(adminBody);
    expect(made.status).toBe(201);
    created.push(adminBody.email);
    const adminLogin = await login(adminBody.email, adminBody.password);
    const adminCookie = cookieHeader(adminLogin);

    // an admin can create agents…
    const agentBody = newStaff(6, 'SALES_AGENT');
    const agent = await http().post('/api/v1/admin/users').set('Cookie', adminCookie).send(agentBody);
    expect(agent.status).toBe(201);
    created.push(agentBody.email);
    // …but not other admins
    const escalate = await http().post('/api/v1/admin/users').set('Cookie', adminCookie).send(newStaff(7, 'ADMIN'));
    expect(escalate.status).toBe(403);

    // an admin cannot disable the super admin, or itself
    const superUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    expect((await http().patch(`/api/v1/admin/users/${superUser.id}`).set('Cookie', adminCookie).send({ status: 'DISABLED' })).status).toBe(403);
    expect((await http().patch(`/api/v1/admin/users/${made.body.data.id}`).set('Cookie', adminCookie).send({ status: 'DISABLED' })).status).toBe(409);

    // an admin can disable an agent; their sessions are revoked and login stops working
    const agentCookie = cookieHeader(await login(agentBody.email, agentBody.password));
    expect((await http().get('/api/v1/me').set('Cookie', agentCookie)).status).toBe(200);
    const off = await http().patch(`/api/v1/admin/users/${agent.body.data.id}`).set('Cookie', adminCookie).send({ status: 'DISABLED' });
    expect(off.status).toBe(200);
    expect(off.body.data.status).toBe('DISABLED');
    // The agent's still-unexpired access token must stop working immediately, not after it expires.
    expect((await http().get('/api/v1/me').set('Cookie', agentCookie)).status).toBe(401);
    expect((await login(agentBody.email, agentBody.password)).status).not.toBe(200);
    expect((await http().get('/api/v1/admin/staff').set('Cookie', superCookie)).body.data.some((s: { email: string }) => s.email === agentBody.email)).toBe(false);

    // and can re-enable them
    const on = await http().patch(`/api/v1/admin/users/${agent.body.data.id}`).set('Cookie', adminCookie).send({ status: 'ACTIVE' });
    expect(on.body.data.status).toBe('ACTIVE');
    expect((await login(agentBody.email, agentBody.password)).status).toBe(200);
  });

  it('lists users with filters and paging, and 404s for bad ids', async () => {
    const byRole = await http().get('/api/v1/admin/users').query({ role: 'SALES_AGENT', q: suffix }).set('Cookie', superCookie);
    expect(byRole.status).toBe(200);
    expect(byRole.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(byRole.body.data.every((u: { roles: string[] }) => u.roles.includes('SALES_AGENT'))).toBe(true);
    expect(byRole.body.data.every((u: object) => !('passwordHash' in u))).toBe(true);

    expect((await http().patch('/api/v1/admin/users/not-a-uuid').set('Cookie', superCookie).send({ status: 'ACTIVE' })).status).toBe(404);
    expect((await http().patch('/api/v1/admin/users/00000000-0000-4000-8000-000000000000').set('Cookie', superCookie).send({ status: 'ACTIVE' })).status).toBe(404);
  });

  it('shows a profile for one person: sessions, lead performance and recent activity', async () => {
    const body = newStaff(20, 'SALES_AGENT');
    const made = await http().post('/api/v1/admin/users').set('Cookie', superCookie).send(body);
    expect(made.status).toBe(201);
    created.push(body.email);
    const id = made.body.data.id as string;

    // never signed in yet
    const fresh = await http().get(`/api/v1/admin/users/${id}`).set('Cookie', superCookie);
    expect(fresh.status).toBe(200);
    expect(fresh.body.data).toMatchObject({ id, email: body.email, status: 'ACTIVE', lastActiveAt: null, activeSessions: 0 });
    expect(fresh.body.data.leads).toMatchObject({ total: 0, overdue: 0, won: 0, medianResponseMinutes: null });
    expect(fresh.body.data).not.toHaveProperty('passwordHash');

    expect((await login(body.email, body.password)).status).toBe(200);
    const hour = 3_600_000;
    const leads = await prisma.$transaction([
      prisma.lead.create({
        data: { name: `Late ${suffix}`, phone: phone(21), assignedToUserId: id, status: 'NEW', createdAt: new Date(Date.now() - 6 * hour) },
      }),
      prisma.lead.create({
        data: {
          name: `Won ${suffix}`,
          phone: phone(22),
          assignedToUserId: id,
          status: 'WON',
          createdAt: new Date(Date.now() - 5 * hour),
          firstResponseAt: new Date(Date.now() - 5 * hour + 30 * 60_000),
        },
      }),
    ]);
    await prisma.auditLog.create({ data: { actorUserId: id, action: 'UPDATE_LEAD', entityType: 'lead', entityId: leads[1].id } });

    const res = await http().get(`/api/v1/admin/users/${id}`).set('Cookie', superCookie);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.lastActiveAt).toBeTruthy();
    expect(d.activeSessions).toBe(1);
    expect(d.leads).toMatchObject({ total: 2, overdue: 1, won: 1, medianResponseMinutes: 30 });
    expect(d.leads.byStatus).toMatchObject({ NEW: 1, WON: 1 });
    expect(d.recentLeads.map((l: { name: string }) => l.name)).toEqual([`Won ${suffix}`, `Late ${suffix}`]);
    expect(d.recentActivity[0]).toMatchObject({ action: 'UPDATE_LEAD', entityType: 'lead', entityId: leads[1].id });
    // money is not part of a person's profile
    expect(JSON.stringify(d)).not.toMatch(/fee|closedAmount/i);

    // disabling signs them out everywhere, and the profile says so
    expect((await http().patch(`/api/v1/admin/users/${id}`).set('Cookie', superCookie).send({ status: 'DISABLED' })).status).toBe(200);
    const after = await http().get(`/api/v1/admin/users/${id}`).set('Cookie', superCookie);
    expect(after.body.data).toMatchObject({ status: 'DISABLED', activeSessions: 0 });

    await prisma.auditLog.deleteMany({ where: { actorUserId: id } });
    await prisma.lead.deleteMany({ where: { id: { in: leads.map((l) => l.id) } } });
  });

  it('refuses the profile to people without user management, and 404s unknown or malformed ids', async () => {
    const someone = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    expect((await http().get(`/api/v1/admin/users/${someone.id}`)).status).toBe(401);
    expect((await http().get(`/api/v1/admin/users/${someone.id}`).set('Cookie', customerCookie)).status).toBe(403);
    expect((await http().get('/api/v1/admin/users/not-a-uuid').set('Cookie', superCookie)).status).toBe(404);
    expect((await http().get('/api/v1/admin/users/00000000-0000-4000-8000-000000000000').set('Cookie', superCookie)).status).toBe(404);
  });
});
