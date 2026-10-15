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

describe('public listings search HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let customerCookie = '';
  let cityId = '';
  let localityId = '';
  let noidaCityId = '';
  let noidaLocalityId = '';
  const prefix = `Srch ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const delhi = await prisma.city.findUnique({ where: { slug: 'delhi' } });
    const noida = await prisma.city.findUnique({ where: { slug: 'noida' } });
    if (!delhi || !noida) {
      throw new Error('test catalog missing cities; seed ncr_homes_test');
    }
    const dwarka = await prisma.locality.findUnique({
      where: { cityId_slug: { cityId: delhi.id, slug: 'dwarka' } },
    });
    const sector62 = await prisma.locality.findUnique({
      where: { cityId_slug: { cityId: noida.id, slug: 'sector-62' } },
    });
    if (!dwarka || !sector62) {
      throw new Error('test catalog missing localities; seed ncr_homes_test');
    }
    cityId = delhi.id;
    localityId = dwarka.id;
    noidaCityId = noida.id;
    noidaLocalityId = sector62.id;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(adminLogin.status).toBe(200);
    adminCookie = cookieHeader(adminLogin);

    const suffix = `${Date.now()}`.slice(-8);
    const customerReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `cust.search.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Search Customer',
        phone: `+9193${suffix.padStart(8, '0')}`.slice(0, 13),
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
        internalTitle: `SearchProp ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
        areaValue: 1450,
        bedrooms: 3,
        bathrooms: 2,
        furnishing: 'SEMI',
        ...overrides,
      });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function publishListing(
    propertyId: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; slug: string; title: string }> {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send({
        propertyId,
        intent: 'RENT',
        title: `${prefix} ${Math.random().toString(16).slice(2, 6)}`,
        description: 'Search listing',
        priceAmount: 25000,
        pricePeriod: 'MONTHLY',
        negotiable: false,
        ...extra,
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    await insertOriginal(id);
    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${id}/publish`)
      .set('Cookie', adminCookie);
    expect(published.status).toBe(200);
    return { id, slug: created.body.data.slug as string, title: created.body.data.title as string };
  }

  it('returns published cards anonymously with envelope and cache header', async () => {
    const propertyId = await createProperty();
    const listing = await publishListing(propertyId);
    const res = await request(app.getHttpServer()).get('/api/v1/listings').query({ q: prefix });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/max-age=30/);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(24);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    const hit = res.body.data.find((row: { id: string }) => row.id === listing.id);
    expect(hit).toMatchObject({
      id: listing.id,
      slug: listing.slug,
      status: 'PUBLISHED',
      intent: 'RENT',
      title: listing.title,
      bedrooms: 3,
      areaUnit: 'SQFT',
    });
    expect(hit.coverImageUrl).toMatch(/^https?:\/\//);
    expect(hit.city.slug).toBe('delhi');
    expect(hit.locality.slug).toBe('dwarka');
    expect(hit).not.toHaveProperty('internalTitle');
    expect(hit).not.toHaveProperty('description');
  });

  it('omits draft paused closed deleted listing and deleted property', async () => {
    const visible = await publishListing(await createProperty());
    const draftProp = await createProperty();
    const draft = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send({
        propertyId: draftProp,
        intent: 'RENT',
        title: `${prefix} draft`,
        priceAmount: 25000,
        pricePeriod: 'MONTHLY',
      });
    expect(draft.status).toBe(201);

    const paused = await publishListing(await createProperty(), { title: `${prefix} paused` });
    expect(
      (await request(app.getHttpServer()).post(`/api/v1/admin/listings/${paused.id}/pause`).set('Cookie', adminCookie))
        .status,
    ).toBe(200);

    const closed = await publishListing(await createProperty(), { title: `${prefix} closed` });
    expect(
      (await request(app.getHttpServer()).post(`/api/v1/admin/listings/${closed.id}/close`).set('Cookie', adminCookie))
        .status,
    ).toBe(200);

    const deletedListing = await publishListing(await createProperty(), { title: `${prefix} del-list` });
    await prisma.listing.update({ where: { id: deletedListing.id }, data: { deletedAt: new Date() } });

    const deletedPropertyListing = await publishListing(await createProperty(), { title: `${prefix} del-prop` });
    const parent = await prisma.listing.findFirst({ where: { id: deletedPropertyListing.id } });
    await prisma.property.update({
      where: { id: parent!.propertyId },
      data: { deletedAt: new Date() },
    });

    const res = await request(app.getHttpServer()).get('/api/v1/listings').query({ q: prefix });
    expect(res.status).toBe(200);
    const ids = res.body.data.map((row: { id: string }) => row.id);
    expect(ids).toContain(visible.id);
    expect(ids).not.toContain(draft.body.data.id);
    expect(ids).not.toContain(paused.id);
    expect(ids).not.toContain(closed.id);
    expect(ids).not.toContain(deletedListing.id);
    expect(ids).not.toContain(deletedPropertyListing.id);
  });

  it('filters by intent city locality type bedrooms price area furnishing', async () => {
    const rentDelhi = await publishListing(await createProperty({ bedrooms: 2, areaValue: 900, furnishing: 'SEMI' }), {
      title: `${prefix} rent-delhi`,
      priceAmount: 18000,
    });
    const buyNoida = await publishListing(
      await createProperty({
        cityId: noidaCityId,
        localityId: noidaLocalityId,
        bedrooms: 4,
        areaValue: 2200,
        furnishing: 'FURNISHED',
        type: 'COMMERCIAL',
      }),
      {
        title: `${prefix} buy-noida`,
        intent: 'BUY',
        pricePeriod: 'ONE_TIME',
        priceAmount: 9_000_000,
      },
    );

    const byIntent = await request(app.getHttpServer()).get('/api/v1/listings').query({ q: prefix, intent: 'BUY' });
    expect(byIntent.body.data.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining([buyNoida.id]));
    expect(byIntent.body.data.map((r: { id: string }) => r.id)).not.toContain(rentDelhi.id);

    const byCity = await request(app.getHttpServer()).get('/api/v1/listings').query({ q: prefix, city: 'noida' });
    expect(byCity.body.data.map((r: { id: string }) => r.id)).toContain(buyNoida.id);
    expect(byCity.body.data.map((r: { id: string }) => r.id)).not.toContain(rentDelhi.id);

    const byLocality = await request(app.getHttpServer())
      .get('/api/v1/listings')
      .query({ q: prefix, city: 'delhi', locality: 'dwarka' });
    expect(byLocality.body.data.map((r: { id: string }) => r.id)).toContain(rentDelhi.id);
    expect(byLocality.body.data.map((r: { id: string }) => r.id)).not.toContain(buyNoida.id);

    const byType = await request(app.getHttpServer()).get('/api/v1/listings').query({ q: prefix, type: 'COMMERCIAL' });
    expect(byType.body.data.map((r: { id: string }) => r.id)).toContain(buyNoida.id);

    const byBeds = await request(app.getHttpServer()).get('/api/v1/listings').query({ q: prefix, bedrooms: 2 });
    expect(byBeds.body.data.map((r: { id: string }) => r.id)).toContain(rentDelhi.id);
    expect(byBeds.body.data.map((r: { id: string }) => r.id)).not.toContain(buyNoida.id);

    const byBedsMin = await request(app.getHttpServer()).get('/api/v1/listings').query({ q: prefix, bedroomsMin: 4 });
    expect(byBedsMin.body.data.map((r: { id: string }) => r.id)).toContain(buyNoida.id);
    expect(byBedsMin.body.data.map((r: { id: string }) => r.id)).not.toContain(rentDelhi.id);

    const byPrice = await request(app.getHttpServer())
      .get('/api/v1/listings')
      .query({ q: prefix, minPrice: 10000, maxPrice: 20000 });
    expect(byPrice.body.data.map((r: { id: string }) => r.id)).toContain(rentDelhi.id);
    expect(byPrice.body.data.map((r: { id: string }) => r.id)).not.toContain(buyNoida.id);

    const byArea = await request(app.getHttpServer())
      .get('/api/v1/listings')
      .query({ q: prefix, minArea: 2000, maxArea: 2500 });
    expect(byArea.body.data.map((r: { id: string }) => r.id)).toContain(buyNoida.id);

    const byFurnish = await request(app.getHttpServer())
      .get('/api/v1/listings')
      .query({ q: prefix, furnishing: 'FURNISHED' });
    expect(byFurnish.body.data.map((r: { id: string }) => r.id)).toContain(buyNoida.id);
    expect(byFurnish.body.data.map((r: { id: string }) => r.id)).not.toContain(rentDelhi.id);
  });

  it('sorts price_asc then id DESC and ignores unknown params', async () => {
    const cheap = await publishListing(await createProperty(), {
      title: `${prefix} cheap`,
      priceAmount: 11000,
    });
    const mid = await publishListing(await createProperty(), {
      title: `${prefix} mid`,
      priceAmount: 33000,
    });
    const res = await request(app.getHttpServer())
      .get('/api/v1/listings')
      .query({ q: prefix, sort: 'price_asc', extra: 'nope', map: '1' });
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids.indexOf(cheap.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(cheap.id)).toBeLessThan(ids.indexOf(mid.id));
  });

  it('rejects invalid enum, short q, and offset over 1000', async () => {
    const badEnum = await request(app.getHttpServer()).get('/api/v1/listings').query({ intent: 'LEASE' });
    expect(badEnum.status).toBe(400);
    expect(badEnum.body.error.code).toBe('VALIDATION_ERROR');

    const shortQ = await request(app.getHttpServer()).get('/api/v1/listings').query({ q: 'x' });
    expect(shortQ.status).toBe(400);

    const offset = await request(app.getHttpServer()).get('/api/v1/listings').query({ page: 43, pageSize: 24 });
    expect(offset.status).toBe(400);
    expect(offset.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('works for customer and staff cookies and omits internal fields', async () => {
    const listing = await publishListing(await createProperty(), { title: `${prefix} auth-ok` });
    const asCustomer = await request(app.getHttpServer())
      .get('/api/v1/listings')
      .set('Cookie', customerCookie)
      .query({ q: prefix });
    const asStaff = await request(app.getHttpServer())
      .get('/api/v1/listings')
      .set('Cookie', adminCookie)
      .query({ q: prefix });
    expect(asCustomer.status).toBe(200);
    expect(asStaff.status).toBe(200);
    for (const res of [asCustomer, asStaff]) {
      const hit = res.body.data.find((row: { id: string }) => row.id === listing.id);
      expect(hit).toBeTruthy();
      expect(hit).not.toHaveProperty('internalTitle');
      expect(hit).not.toHaveProperty('deletedAt');
      expect(hit).not.toHaveProperty('storageKey');
      expect(typeof hit.priceAmount).toBe('number');
    }
  });

  it('returns empty pagination envelope when nothing matches', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/listings').query({ q: 'zz-no-such-listing' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 24, total: 0 });
  });

  it('rejects pageSize above 24', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/listings').query({ pageSize: 25 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('paginates search results', async () => {
    await publishListing(await createProperty(), { title: `${prefix} page-a` });
    await publishListing(await createProperty(), { title: `${prefix} page-b` });
    const res = await request(app.getHttpServer())
      .get('/api/v1/listings')
      .query({ q: prefix, page: 1, pageSize: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });
});
