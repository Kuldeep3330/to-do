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

describe('reports HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let agentCookie = '';
  let agentId = '';
  const suffix = `${Date.now()}`.slice(-8);
  const phone = (n: number) => `+9197${`${suffix}${n}`.slice(-8).padStart(8, '0')}`;
  const http = () => request(app.getHttpServer());
  const get = (query: string, cookie = adminCookie) => http().get(`/api/v1/admin/reports${query}`).set('Cookie', cookie);
  // A window in 2001 holds only the leads planted here, so the numbers can be exact.
  const WINDOW = '?from=2001-03-01&to=2001-03-10';
  const ids = { leads: [] as string[], listings: [] as string[], properties: [] as string[], visits: [] as string[], users: [] as string[] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    adminCookie = cookieHeader(await http().post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' }));
    const body = { email: `rep.agent.${suffix}@example.com`, name: 'Rep Agent', phone: phone(1), password: 'StaffPassword1', role: 'SALES_AGENT' };
    const made = await http().post('/api/v1/admin/users').set('Cookie', adminCookie).send(body);
    expect(made.status).toBe(201);
    agentId = made.body.data.id;
    ids.users.push(agentId);
    agentCookie = cookieHeader(await http().post('/api/v1/auth/login').send({ email: body.email, password: body.password }));

    const city = await prisma.city.findUniqueOrThrow({ where: { slug: 'delhi' } });
    const locality = await prisma.locality.findUniqueOrThrow({ where: { cityId_slug: { cityId: city.id, slug: 'dwarka' } } });
    const property = await prisma.property.create({
      data: { type: 'RESIDENTIAL', cityId: city.id, localityId: locality.id, internalTitle: `rep ${suffix}` },
    });
    ids.properties.push(property.id);
    const listing = await prisma.listing.create({
      data: {
        propertyId: property.id,
        intent: 'RENT',
        status: 'PAUSED',
        title: `Rep ${suffix}`,
        slug: `rep-${suffix}`,
        priceAmount: BigInt(30000),
        pricePeriod: 'MONTHLY',
      },
    });
    ids.listings.push(listing.id);

    const mk = async (n: number, day: string, extra: Record<string, unknown> = {}) => {
      const l = await prisma.lead.create({
        data: { name: `Rep Lead ${n}`, phone: phone(10 + n), createdAt: new Date(`${day}T06:00:00Z`), ...extra },
      });
      ids.leads.push(l.id);
      return l;
    };
    // 4 leads on 5 March, 1 on 7 March (IST days; 06:00Z is 11:30 IST)
    const won = await mk(1, '2001-03-05', {
      assignedToUserId: agentId,
      status: 'WON',
      listingId: listing.id,
      firstResponseAt: new Date('2001-03-05T06:30:00Z'),
      closedOn: new Date('2001-03-08T00:00:00Z'),
      closedAmount: BigInt(30000),
      feeAmount: BigInt(15000),
    });
    await mk(2, '2001-03-05', { assignedToUserId: agentId, status: 'QUALIFIED', firstResponseAt: new Date('2001-03-05T07:30:00Z') });
    await mk(3, '2001-03-05', { assignedToUserId: agentId, status: 'NEW' });
    await mk(4, '2001-03-05', { status: 'SPAM', source: 'CONTACT_FORM' });
    await mk(5, '2001-03-07', { assignedToUserId: agentId, status: 'LOST' });
    const visit = await prisma.visit.create({ data: { leadId: won.id, listingId: listing.id, status: 'COMPLETED' } });
    ids.visits.push(visit.id);
  });

  afterAll(async () => {
    await prisma.visit.deleteMany({ where: { id: { in: ids.visits } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids.leads } } });
    await prisma.listing.deleteMany({ where: { id: { in: ids.listings } } });
    await prisma.property.deleteMany({ where: { id: { in: ids.properties } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids.users } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('builds the funnel, daily series, sources and per-agent table for a window', async () => {
    const res = await get(WINDOW);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ from: '2001-03-01', to: '2001-03-10', days: 10 });
    expect(d.report.funnel.map((s: { key: string; count: number }) => [s.key, s.count])).toEqual([
      ['received', 5],
      ['responded', 2],
      ['visit', 1],
      ['won', 1],
    ]);
    expect(d.report.lost).toBe(1);
    expect(d.report.spam).toBe(1);
    expect(d.report.medianResponseMinutes).toBe(60);

    const daily = d.report.daily as { date: string; leads: number; won: number }[];
    expect(daily).toHaveLength(10);
    expect(daily.find((x) => x.date === '2001-03-05')).toEqual({ date: '2001-03-05', leads: 4, won: 1 });
    expect(daily.find((x) => x.date === '2001-03-07')).toEqual({ date: '2001-03-07', leads: 1, won: 0 });
    expect(d.report.sources).toEqual([
      { source: 'WEB_FORM', count: 4 },
      { source: 'CONTACT_FORM', count: 1 },
    ]);

    const agents = d.report.agents as { userId: string | null; name: string; received: number; responded: number; waiting: number; won: number; winRatePercent: number | null }[];
    const rep = agents.find((a) => a.userId === agentId)!;
    expect(rep).toMatchObject({ name: 'Rep Agent', received: 4, responded: 2, waiting: 1, won: 1, winRatePercent: 25 });
    expect(agents.find((a) => a.userId === null)).toMatchObject({ name: 'Unassigned', received: 1 });
  });

  it('adds money by closing month for people who may see it, and nothing a sales agent could see', async () => {
    const d = (await get(WINDOW)).body.data;
    expect(d.fees.months).toEqual([{ month: '2001-03', deals: 1, rentMonthly: 30000, saleValue: 0, fees: 15000, dealsWithoutFee: 0 }]);
    expect(d.fees.totals).toMatchObject({ deals: 1, fees: 15000 });
    // an agent is refused the whole report, so money can never reach them through it
    expect((await get(WINDOW, agentCookie)).status).toBe(403);
  });

  it('is an empty but well-formed report for a quiet window', async () => {
    const d = (await get('?from=2001-04-01&to=2001-04-03')).body.data;
    expect(d.report.funnel.every((s: { count: number }) => s.count === 0)).toBe(true);
    expect(d.report.daily).toHaveLength(3);
    expect(d.report.agents).toEqual([]);
    expect(d.fees.totals.deals).toBe(0);
  });

  it('defaults to the last 30 days', async () => {
    const d = (await get('')).body.data;
    expect(d.days).toBe(30);
    expect(d.report.daily).toHaveLength(30);
    expect(d.to >= d.from).toBe(true);
  });

  it('rejects bad windows', async () => {
    expect((await get('?from=2001-03-10&to=2001-03-01')).status).toBe(400);
    expect((await get('?from=2001-01-01&to=2003-01-01')).status).toBe(400);
    expect((await get('?from=yesterday')).status).toBe(400);
    expect((await get('?from=2001-02-30&to=2001-03-01')).status).toBe(400);
    expect((await get('?from=2001-03-01&to=2002-03-01')).status).toBe(200); // 366 days is the limit
  });

  it('needs a signed-in admin', async () => {
    expect((await http().get('/api/v1/admin/reports')).status).toBe(401);
    expect((await get('', agentCookie)).status).toBe(403);
  });
});
