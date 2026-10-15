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

describe('admin listings HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let customerCookie = '';
  let cityId = '';
  let localityId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

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

    const suffix = `${Date.now()}`.slice(-8);
    const customerReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `cust.list.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'List Customer',
        phone: `+9197${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(customerReg.status).toBe(201);
    customerCookie = cookieHeader(customerReg);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createProperty(overrides: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({
        type: 'RESIDENTIAL',
        cityId,
        localityId,
        internalTitle: `ListProp ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
        areaValue: 1450,
        bedrooms: 3,
        bathrooms: 2,
        ...overrides,
      });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  function listingBody(propertyId: string, extra: Record<string, unknown> = {}) {
    return {
      propertyId,
      intent: 'RENT',
      title: `3 BHK ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
      description: 'Plain text description',
      priceAmount: 25000,
      pricePeriod: 'MONTHLY',
      negotiable: false,
      ...extra,
    };
  }

  it('rejects unauthenticated admin listing requests', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/listings');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a customer without listing.manage', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/listings')
      .set('Cookie', customerCookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('creates a DRAFT listing for an existing property', async () => {
    const propertyId = await createProperty();
    const body = listingBody(propertyId);
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.propertyId).toBe(propertyId);
    expect(res.body.data.slug).toMatch(/^[a-z0-9-]+$/);
    expect(res.body.data.priceAmount).toBe(25000);
    expect(res.body.data).not.toHaveProperty('internalTitle');
    expect(res.body.data.property.internalTitle).toBeTruthy();
  });

  it('rejects missing required fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a nonexistent property', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody('00000000-0000-4000-8000-000000000000'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects create against an archived property', async () => {
    const propertyId = await createProperty();
    const archived = await request(app.getHttpServer())
      .post(`/api/v1/admin/properties/${propertyId}/archive`)
      .set('Cookie', adminCookie);
    expect(archived.status).toBe(200);
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects PATCH status as a publish bypass', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const id = created.body.data.id as string;
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/listings/${id}`)
      .set('Cookie', adminCookie)
      .send({ status: 'PUBLISHED', title: 'Still draft' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.title).toBe('Still draft');
  });

  it('rejects invalid patch money', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const id = created.body.data.id as string;
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/listings/${id}`)
      .set('Cookie', adminCookie)
      .send({ priceAmount: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects publish without required fields and media', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId, { priceAmount: null }));
    const id = created.body.data.id as string;
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${id}/publish`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('publishes when requirements are met', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const id = created.body.data.id as string;
    const slug = created.body.data.slug as string;
    await insertOriginal(id);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${id}/publish`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(res.body.data.publishedAt).toBeTruthy();

    const publicGet = await request(app.getHttpServer()).get(`/api/v1/listings/${slug}`);
    expect(publicGet.status).toBe(200);
    expect(publicGet.body.data.status).toBe('PUBLISHED');
    expect(publicGet.body.data).not.toHaveProperty('internalTitle');
    expect(publicGet.body.data).not.toHaveProperty('property');
  });

  it('rejects a second PUBLISHED listing for the same property and intent', async () => {
    const propertyId = await createProperty();
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId, { title: 'First rent' }));
    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId, { title: 'Second rent' }));
    await insertOriginal(first.body.data.id);
    await insertOriginal(second.body.data.id);
    const pub1 = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${first.body.data.id}/publish`)
      .set('Cookie', adminCookie);
    expect(pub1.status).toBe(200);
    const pub2 = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${second.body.data.id}/publish`)
      .set('Cookie', adminCookie);
    expect(pub2.status).toBe(409);
    expect(pub2.body.error.code).toBe('CONFLICT');
  });

  it('concurrent publish of two RENT drafts yields one PUBLISHED and one CONFLICT', async () => {
    const propertyId = await createProperty();
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId, { title: 'Concurrent A' }));
    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId, { title: 'Concurrent B' }));
    await insertOriginal(first.body.data.id);
    await insertOriginal(second.body.data.id);
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/admin/listings/${first.body.data.id}/publish`)
        .set('Cookie', adminCookie),
      request(app.getHttpServer())
        .post(`/api/v1/admin/listings/${second.body.data.id}/publish`)
        .set('Cookie', adminCookie),
    ]);
    const codes = [a.body?.error?.code, b.body?.error?.code].filter(Boolean);
    const ok = [a.status, b.status].filter((s) => s === 200).length;
    const conflict = [a.status, b.status].filter((s) => s === 409).length;
    expect(ok).toBe(1);
    expect(conflict).toBe(1);
    expect(codes).toContain('CONFLICT');
    const published = await prisma.listing.count({
      where: { propertyId, intent: 'RENT', status: 'PUBLISHED', deletedAt: null },
    });
    expect(published).toBe(1);
  });

  it('allows BUY and RENT published on the same property', async () => {
    const propertyId = await createProperty();
    const rent = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const buy = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId, { intent: 'BUY', pricePeriod: 'ONE_TIME', priceAmount: 7500000 }));
    await insertOriginal(rent.body.data.id);
    await insertOriginal(buy.body.data.id);
    const pubRent = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${rent.body.data.id}/publish`)
      .set('Cookie', adminCookie);
    const pubBuy = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${buy.body.data.id}/publish`)
      .set('Cookie', adminCookie);
    expect(pubRent.status).toBe(200);
    expect(pubBuy.status).toBe(200);
  });

  it('pauses then resumes via publish, and close is terminal', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const id = created.body.data.id as string;
    const slug = created.body.data.slug as string;
    await insertOriginal(id);
    expect(
      (await request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/publish`).set('Cookie', adminCookie))
        .status,
    ).toBe(200);
    const paused = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${id}/pause`)
      .set('Cookie', adminCookie);
    expect(paused.status).toBe(200);
    expect(paused.body.data.status).toBe('PAUSED');
    const publicPaused = await request(app.getHttpServer()).get(`/api/v1/listings/${slug}`);
    expect(publicPaused.status).toBe(404);

    const resumed = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${id}/publish`)
      .set('Cookie', adminCookie);
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.status).toBe('PUBLISHED');

    const closed = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${id}/close`)
      .set('Cookie', adminCookie);
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('CLOSED');
    expect(closed.body.data.closedAt).toBeTruthy();

    const reopen = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${id}/publish`)
      .set('Cookie', adminCookie);
    expect(reopen.status).toBe(409);
  });

  it('rejects pause from DRAFT', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${created.body.data.id}/pause`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects publish against a soft-deleted property', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const id = created.body.data.id as string;
    await insertOriginal(id);
    await prisma.property.update({
      where: { id: propertyId },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${id}/publish`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('allocates a unique slug on collision', async () => {
    const propertyId = await createProperty();
    const title = `Same Title ${Date.now()}`;
    const a = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId, { title }));
    const b = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId, { title, intent: 'BUY', pricePeriod: 'ONE_TIME' }));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data.slug).not.toBe(b.body.data.slug);
  });

  it('paginates admin listings with meta envelope', async () => {
    const propertyId = await createProperty();
    const prefix = `PageL ${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId, { title: `${prefix} A` }));
    await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId, { title: `${prefix} B`, intent: 'BUY', pricePeriod: 'ONE_TIME' }));
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/listings')
      .query({ q: prefix, page: 1, pageSize: 1 })
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(1);
    expect(res.body.meta.total).toBe(2);
  });

  it('writes audit rows on create and publish', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const id = created.body.data.id as string;
    await insertOriginal(id);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${id}/publish`)
      .set('Cookie', adminCookie);
    await new Promise((r) => setTimeout(r, 50));
    const rows = await prisma.auditLog.findMany({
      where: { entityId: id, entityType: 'listing' },
      orderBy: { createdAt: 'asc' },
    });
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['CREATE_LISTING', 'PUBLISH_LISTING']));
  });

  it('concurrent pause and close never resurrects CLOSED as PAUSED', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const id = created.body.data.id as string;
    await insertOriginal(id);
    expect(
      (await request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/publish`).set('Cookie', adminCookie))
        .status,
    ).toBe(200);
    const [pauseRes, closeRes] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/pause`).set('Cookie', adminCookie),
      request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/close`).set('Cookie', adminCookie),
    ]);
    const statuses = [pauseRes.status, closeRes.status].sort();
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect(statuses.filter((s) => s === 200 || s === 409).length).toBe(2);
    const row = await prisma.listing.findFirst({ where: { id } });
    expect(row?.status === 'PAUSED' || row?.status === 'CLOSED').toBe(true);
    if (row?.status === 'PAUSED') {
      expect(row.closedAt).toBeNull();
    }
    if (row?.closedAt) {
      expect(row.status).toBe('CLOSED');
    }
  });

  it('concurrent close+close leaves CLOSED once', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const id = created.body.data.id as string;
    await insertOriginal(id);
    expect(
      (await request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/publish`).set('Cookie', adminCookie))
        .status,
    ).toBe(200);
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/close`).set('Cookie', adminCookie),
      request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/close`).set('Cookie', adminCookie),
    ]);
    const ok = [a.status, b.status].filter((s) => s === 200).length;
    const conflict = [a.status, b.status].filter((s) => s === 409).length;
    expect(ok).toBe(1);
    expect(conflict).toBe(1);
    const row = await prisma.listing.findFirst({ where: { id } });
    expect(row?.status).toBe('CLOSED');
  });

  it('concurrent close and publish from PAUSED keeps CLOSED terminal or stays PUBLISHED', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const id = created.body.data.id as string;
    await insertOriginal(id);
    expect(
      (await request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/publish`).set('Cookie', adminCookie))
        .status,
    ).toBe(200);
    expect(
      (await request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/pause`).set('Cookie', adminCookie)).status,
    ).toBe(200);
    const [closeRes, publishRes] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/close`).set('Cookie', adminCookie),
      request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/publish`).set('Cookie', adminCookie),
    ]);
    expect([closeRes.status, publishRes.status].every((s) => s === 200 || s === 409)).toBe(true);
    const row = await prisma.listing.findFirst({ where: { id } });
    expect(row?.status === 'CLOSED' || row?.status === 'PUBLISHED').toBe(true);
    if (row?.status === 'CLOSED') {
      const reopen = await request(app.getHttpServer())
        .post(`/api/v1/admin/listings/${id}/publish`)
        .set('Cookie', adminCookie);
      expect(reopen.status).toBe(409);
    }
  });

  it('returns 404 for a draft on the public slug route', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const res = await request(app.getHttpServer()).get(`/api/v1/listings/${created.body.data.slug}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('concurrent archive vs publish never publishes against an archived property', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const listingId = created.body.data.id as string;
    await insertOriginal(listingId);
    const [archiveRes, publishRes] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/admin/properties/${propertyId}/archive`)
        .set('Cookie', adminCookie),
      request(app.getHttpServer())
        .post(`/api/v1/admin/listings/${listingId}/publish`)
        .set('Cookie', adminCookie),
    ]);
    expect([archiveRes.status, publishRes.status].every((s) => s === 200 || s === 409)).toBe(true);
    const property = await prisma.property.findFirst({ where: { id: propertyId } });
    const listing = await prisma.listing.findFirst({ where: { id: listingId } });
    if (property?.status === 'ARCHIVED' || property?.deletedAt) {
      expect(listing?.status).not.toBe('PUBLISHED');
    } else {
      expect(publishRes.status).toBe(200);
      expect(listing?.status).toBe('PUBLISHED');
      expect(archiveRes.status).toBe(409);
    }
  });

  it('returns 404 on public slug when the property is soft-deleted', async () => {
    const propertyId = await createProperty();
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send(listingBody(propertyId));
    const id = created.body.data.id as string;
    const slug = created.body.data.slug as string;
    await insertOriginal(id);
    expect(
      (await request(app.getHttpServer()).post(`/api/v1/admin/listings/${id}/publish`).set('Cookie', adminCookie))
        .status,
    ).toBe(200);
    await prisma.property.update({
      where: { id: propertyId },
      data: { deletedAt: new Date() },
    });
    const res = await request(app.getHttpServer()).get(`/api/v1/listings/${slug}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
