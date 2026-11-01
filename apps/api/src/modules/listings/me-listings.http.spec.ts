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

describe('me listings HTTP', () => {
  let app: INestApplication;
  let ownerCookie = '';
  let otherCookie = '';
  let adminCookie = '';
  let cityId = '';
  let localityId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const delhi = await prisma.city.findUnique({ where: { slug: 'delhi' } });
    if (!delhi) throw new Error('test catalog missing delhi; seed ncr_homes_test');
    const dwarka = await prisma.locality.findUnique({
      where: { cityId_slug: { cityId: delhi.id, slug: 'dwarka' } },
    });
    if (!dwarka) throw new Error('test catalog missing dwarka; seed ncr_homes_test');
    cityId = delhi.id;
    localityId = dwarka.id;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(adminLogin.status).toBe(200);
    adminCookie = cookieHeader(adminLogin);

    const suffix = `${Date.now()}`.slice(-8);
    const owner = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `owner.self.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Self Owner',
        phone: `+9191${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(owner.status).toBe(201);
    ownerCookie = cookieHeader(owner);

    const other = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `other.self.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Other Owner',
        phone: `+9192${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(other.status).toBe(201);
    otherCookie = cookieHeader(other);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createOwnedProperty(cookie: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/me/properties')
      .set('Cookie', cookie)
      .send({
        type: 'RESIDENTIAL',
        cityId,
        localityId,
        internalTitle: `Mine ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
        areaValue: 1100,
        bedrooms: 2,
        bathrooms: 2,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.createdByUserId).toBeTruthy();
    return res.body.data.id as string;
  }

  it('rejects unauthenticated me listing requests', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/me/listings');
    expect(res.status).toBe(401);
  });

  it('lets an owner create a property and listing, and hides them from another customer', async () => {
    const propertyId = await createOwnedProperty(ownerCookie);
    const created = await request(app.getHttpServer())
      .post('/api/v1/me/listings')
      .set('Cookie', ownerCookie)
      .send({
        propertyId,
        intent: 'RENT',
        title: `Owner 2 BHK ${Date.now()}`,
        description: 'Self listed',
        priceAmount: 18000,
        pricePeriod: 'MONTHLY',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('DRAFT');
    expect(created.body.data.createdByUserId).toBeTruthy();
    const id = created.body.data.id as string;

    const mine = await request(app.getHttpServer()).get('/api/v1/me/listings').set('Cookie', ownerCookie);
    expect(mine.status).toBe(200);
    expect(mine.body.data.some((l: { id: string }) => l.id === id)).toBe(true);

    const otherList = await request(app.getHttpServer()).get('/api/v1/me/listings').set('Cookie', otherCookie);
    expect(otherList.status).toBe(200);
    expect(otherList.body.data.some((l: { id: string }) => l.id === id)).toBe(false);

    const otherGet = await request(app.getHttpServer()).get(`/api/v1/me/listings/${id}`).set('Cookie', otherCookie);
    expect(otherGet.status).toBe(404);

    const otherPublish = await request(app.getHttpServer())
      .post(`/api/v1/me/listings/${id}/publish`)
      .set('Cookie', otherCookie);
    expect(otherPublish.status).toBe(404);
  });

  it('rejects listing another owner property', async () => {
    const propertyId = await createOwnedProperty(ownerCookie);
    const res = await request(app.getHttpServer())
      .post('/api/v1/me/listings')
      .set('Cookie', otherCookie)
      .send({
        propertyId,
        intent: 'RENT',
        title: 'Should fail',
        pricePeriod: 'MONTHLY',
        priceAmount: 10000,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('filters admin listings by unverified', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/listings')
      .query({ unverified: 'true', pageSize: 24 })
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    for (const row of res.body.data) {
      expect(row.verifiedAt).toBeNull();
    }
  });
});
