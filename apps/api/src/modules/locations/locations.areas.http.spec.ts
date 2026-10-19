import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';

const prisma = new PrismaClient();

describe('area summary HTTP', () => {
  let app: INestApplication;
  const tag = `area${Date.now().toString(36)}`;
  const citySlug = `${tag}-city`;
  let cityId = '';
  let alphaId = '';
  let betaId = '';
  let emptyId = '';
  const propertyIds: string[] = [];
  const http = () => request(app.getHttpServer());
  const get = (path: string) => http().get(`/api/v1/areas/${path}`);

  async function listing(opts: {
    localityId: string;
    price: number;
    intent?: 'RENT' | 'BUY';
    status?: 'PUBLISHED' | 'DRAFT';
    verified?: boolean;
    propertyDeleted?: boolean;
    listingDeleted?: boolean;
    n: number;
  }) {
    const property = await prisma.property.create({
      data: {
        type: 'RESIDENTIAL',
        cityId,
        localityId: opts.localityId,
        internalTitle: `${tag} property ${opts.n}`,
        deletedAt: opts.propertyDeleted ? new Date() : null,
      },
    });
    propertyIds.push(property.id);
    await prisma.listing.create({
      data: {
        propertyId: property.id,
        intent: opts.intent ?? 'RENT',
        status: opts.status ?? 'PUBLISHED',
        title: `${tag} listing ${opts.n}`,
        slug: `${tag}-listing-${opts.n}`,
        priceAmount: BigInt(opts.price),
        pricePeriod: (opts.intent ?? 'RENT') === 'RENT' ? 'MONTHLY' : 'ONE_TIME',
        publishedAt: new Date(),
        verifiedAt: opts.verified ? new Date() : null,
        deletedAt: opts.listingDeleted ? new Date() : null,
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    cityId = (await prisma.city.create({ data: { name: `Area City ${tag}`, slug: citySlug } })).id;
    alphaId = (await prisma.locality.create({ data: { cityId, name: 'Alpha', slug: 'alpha' } })).id;
    betaId = (await prisma.locality.create({ data: { cityId, name: 'Beta', slug: 'beta' } })).id;
    emptyId = (await prisma.locality.create({ data: { cityId, name: 'Empty', slug: 'empty' } })).id;

    // Alpha rentals: 10k, 20k (verified), 60k  -> median 20k
    await listing({ localityId: alphaId, price: 10_000, n: 1 });
    await listing({ localityId: alphaId, price: 20_000, n: 2, verified: true });
    await listing({ localityId: alphaId, price: 60_000, n: 3 });
    // Beta rental
    await listing({ localityId: betaId, price: 15_000, n: 4 });
    // Must NOT count: a sale, a draft, a deleted listing, a deleted property
    await listing({ localityId: alphaId, price: 9_000_000, n: 5, intent: 'BUY' });
    await listing({ localityId: alphaId, price: 1, n: 6, status: 'DRAFT' });
    await listing({ localityId: alphaId, price: 2, n: 7, listingDeleted: true });
    await listing({ localityId: alphaId, price: 3, n: 8, propertyDeleted: true });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { propertyId: { in: propertyIds } } });
    await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
    await prisma.locality.deleteMany({ where: { cityId } });
    await prisma.city.delete({ where: { id: cityId } });
    await app.close();
    await prisma.$disconnect();
  });

  it('summarises a locality from published listings of the requested intent only', async () => {
    const res = await get(`${citySlug}/alpha?intent=RENT`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      city: { slug: citySlug },
      locality: { name: 'Alpha', slug: 'alpha' },
      intent: 'RENT',
      stats: { count: 3, minPrice: 10_000, maxPrice: 60_000, medianPrice: 20_000, verifiedCount: 1 },
    });
  });

  it('keeps rent and sale separate', async () => {
    const res = await get(`${citySlug}/alpha?intent=BUY`);
    expect(res.body.data.stats).toMatchObject({ count: 1, minPrice: 9_000_000, maxPrice: 9_000_000, medianPrice: 9_000_000 });
  });

  it('lists sibling areas that have homes, most first, excluding the current one and empty ones', async () => {
    const res = await get(`${citySlug}/alpha?intent=RENT`);
    expect(res.body.data.localities).toEqual([{ name: 'Beta', slug: 'beta', count: 1 }]);
  });

  it('summarises a whole city and lists every area with homes', async () => {
    const res = await get(`${citySlug}?intent=RENT`);
    expect(res.status).toBe(200);
    expect(res.body.data.locality).toBeNull();
    expect(res.body.data.stats).toMatchObject({ count: 4, minPrice: 10_000, maxPrice: 60_000 });
    expect(res.body.data.localities).toEqual([
      { name: 'Alpha', slug: 'alpha', count: 3 },
      { name: 'Beta', slug: 'beta', count: 1 },
    ]);
  });

  it('returns zeros and null prices for a real locality with no homes', async () => {
    const res = await get(`${citySlug}/empty?intent=RENT`);
    expect(res.status).toBe(200);
    expect(res.body.data.stats).toEqual({ count: 0, minPrice: null, maxPrice: null, medianPrice: null, verifiedCount: 0 });
    expect(emptyId).toBeTruthy();
  });

  it('404s for unknown or inactive cities and localities, and 400s for a bad intent', async () => {
    expect((await get(`no-such-city-${tag}?intent=RENT`)).status).toBe(404);
    expect((await get(`${citySlug}/no-such-place?intent=RENT`)).status).toBe(404);
    expect((await get(`${citySlug}/alpha`)).status).toBe(400);
    expect((await get(`${citySlug}/alpha?intent=SELL`)).status).toBe(400);

    await prisma.locality.update({ where: { id: betaId }, data: { isActive: false } });
    expect((await get(`${citySlug}/beta?intent=RENT`)).status).toBe(404);
    const city = await get(`${citySlug}?intent=RENT`);
    expect(city.body.data.localities.map((l: { slug: string }) => l.slug)).toEqual(['alpha']);
    await prisma.locality.update({ where: { id: betaId }, data: { isActive: true } });
  });

  it('is public and cacheable', async () => {
    const res = await get(`${citySlug}/alpha?intent=RENT`);
    expect(res.headers['cache-control']).toContain('public');
  });
});
