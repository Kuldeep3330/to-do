import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { env } from '../../config/env';
import { MIN_GOOD_PHOTOS } from './system.service';

const prisma = new PrismaClient();

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

type Issue = { key: string; count: number; severity: string; entity: string; items: { id: string; label: string }[] };

describe('system health and data quality HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let agentCookie = '';
  const suffix = `${Date.now()}`.slice(-8);
  const phone = (n: number) => `+9197${`${suffix}${n}`.slice(-8).padStart(8, '0')}`;
  const http = () => request(app.getHttpServer());
  const get = (path: string, cookie = adminCookie) => http().get(`/api/v1/admin/system/${path}`).set('Cookie', cookie);
  // Fixtures are dated far in the past so they sort first among "oldest" samples even in a busy database.
  const LONG_AGO = new Date('2000-01-01T00:00:00Z');

  const ids = { leads: [] as string[], listings: [] as string[], properties: [] as string[], visits: [] as string[], users: [] as string[] };
  let freshListingId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const admin = await http().post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(admin.status).toBe(200);
    adminCookie = cookieHeader(admin);

    const agentBody = { email: `sys.agent.${suffix}@example.com`, name: 'Sys Agent', phone: phone(1), password: 'StaffPassword1', role: 'SALES_AGENT' };
    const agent = await http().post('/api/v1/admin/users').set('Cookie', adminCookie).send(agentBody);
    expect(agent.status).toBe(201);
    ids.users.push(agent.body.data.id);

    // a second agent who stays active, for the access checks (the first one is disabled below)
    const activeBody = { ...agentBody, email: `sys.active.${suffix}@example.com`, name: 'Sys Active', phone: phone(4) };
    const active = await http().post('/api/v1/admin/users').set('Cookie', adminCookie).send(activeBody);
    expect(active.status).toBe(201);
    ids.users.push(active.body.data.id);
    agentCookie = cookieHeader(await http().post('/api/v1/auth/login').send({ email: activeBody.email, password: activeBody.password }));

    const city = await prisma.city.findUniqueOrThrow({ where: { slug: 'delhi' } });
    const locality = await prisma.locality.findUniqueOrThrow({ where: { cityId_slug: { cityId: city.id, slug: 'dwarka' } } });
    const mkListing = async (n: number, extra: Record<string, unknown>) => {
      const property = await prisma.property.create({
        data: { type: 'RESIDENTIAL', cityId: city.id, localityId: locality.id, internalTitle: `sys ${suffix} ${n}`, updatedAt: LONG_AGO },
      });
      ids.properties.push(property.id);
      const listing = await prisma.listing.create({
        data: {
          propertyId: property.id,
          intent: 'RENT',
          status: 'PUBLISHED',
          title: `Sys ${suffix} ${n}`,
          slug: `sys-${suffix}-${n}`,
          priceAmount: BigInt(30000),
          pricePeriod: 'MONTHLY',
          publishedAt: LONG_AGO,
          updatedAt: LONG_AGO,
          ...extra,
        },
      });
      ids.listings.push(listing.id);
      return listing;
    };

    // old, unverified, no photos, never reconfirmed: trips three checks
    await mkListing(1, { lastConfirmedAt: LONG_AGO });
    // fresh, verified, with enough photos: trips none
    const fresh = await mkListing(2, { lastConfirmedAt: new Date(), verifiedAt: new Date(), updatedAt: new Date() });
    freshListingId = fresh.id;
    for (let i = 0; i < MIN_GOOD_PHOTOS; i++) {
      await prisma.media.create({
        data: { listingId: fresh.id, storageKey: `sys-${suffix}-${i}`, contentType: 'image/jpeg', byteSize: 10, variant: 'ORIGINAL', sortOrder: i },
      });
    }

    const unassigned = await prisma.lead.create({ data: { name: `Sys Unowned ${suffix}`, phone: phone(2), status: 'NEW', createdAt: LONG_AGO } });
    const held = await prisma.lead.create({
      data: { name: `Sys Held ${suffix}`, phone: phone(3), status: 'CONTACTED', assignedToUserId: ids.users[0], createdAt: LONG_AGO },
    });
    ids.leads.push(unassigned.id, held.id);
    const visit = await prisma.visit.create({ data: { leadId: unassigned.id, listingId: fresh.id, status: 'REQUESTED', createdAt: LONG_AGO } });
    ids.visits.push(visit.id);

    // the agent holding a lead is then disabled
    expect((await http().patch(`/api/v1/admin/users/${ids.users[0]}`).set('Cookie', adminCookie).send({ status: 'DISABLED' })).status).toBe(200);
  });

  afterAll(async () => {
    await prisma.visit.deleteMany({ where: { id: { in: ids.visits } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids.leads } } });
    await prisma.media.deleteMany({ where: { listingId: freshListingId } });
    await prisma.listing.deleteMany({ where: { id: { in: ids.listings } } });
    await prisma.property.deleteMany({ where: { id: { in: ids.properties } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids.users } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('reports the database and storage as up, and says what email is doing', async () => {
    const res = await get('health');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.status).toBe('ok');
    const byKey = Object.fromEntries((d.checks as { key: string; status: string; latencyMs: number | null }[]).map((c) => [c.key, c]));
    expect(byKey.database.status).toBe('up');
    expect(typeof byKey.database.latencyMs).toBe('number');
    expect(byKey.storage.status).toBe('up');
    expect(byKey.mail.status).toBe('info');
    expect(d.settings).toMatchObject({ listingStaleDays: env().LISTING_STALE_DAYS, leadResponseMinutes: env().LEAD_RESPONSE_SLA_MINUTES });
    expect(d.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('never leaks secrets or connection strings', async () => {
    const text = JSON.stringify((await get('health')).body);
    const cfg = env();
    for (const secret of [cfg.JWT_ACCESS_SECRET, cfg.JWT_REFRESH_SECRET, cfg.S3_SECRET_KEY, cfg.S3_ACCESS_KEY]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
  });

  it('finds the problems we planted, with the oldest first, and leaves the healthy listing alone', async () => {
    const res = await get('data-quality');
    expect(res.status).toBe(200);
    const issues = res.body.data.issues as Issue[];
    const by = (key: string) => issues.find((i) => i.key === key);
    const labels = (key: string) => (by(key)?.items ?? []).map((i) => i.label);

    expect(labels('leads-unassigned')).toContain(`Sys Unowned ${suffix}`);
    expect(labels('leads-on-inactive-staff')).toContain(`Sys Held ${suffix}`);
    expect(by('visits-waiting')?.count).toBeGreaterThanOrEqual(1);
    expect(labels('listings-unverified')).toContain(`Sys ${suffix} 1`);
    expect(labels('listings-few-photos')).toContain(`Sys ${suffix} 1`);
    if (env().LISTING_STALE_DAYS > 3) expect(labels('listings-due')).toContain(`Sys ${suffix} 1`);

    const everything = issues.flatMap((i) => i.items.map((x) => x.label));
    expect(everything).not.toContain(`Sys ${suffix} 2`);

    expect(res.body.data.totalIssues).toBe(issues.reduce((n, i) => n + i.count, 0));
    for (const i of issues) expect(i.items.length).toBeLessThanOrEqual(10);
    // most urgent first
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const ranks = issues.map((i) => rank[i.severity]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('is for admins only', async () => {
    for (const path of ['health', 'data-quality']) {
      expect((await http().get(`/api/v1/admin/system/${path}`)).status).toBe(401);
      expect((await get(path, agentCookie)).status).toBe(403);
    }
  });
});
