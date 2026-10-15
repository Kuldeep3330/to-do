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

describe('admin properties HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let customerCookie = '';
  let cityId = '';
  let localityId = '';
  let otherLocalityId = '';
  let amenityId = '';

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
    const lift = await prisma.amenity.findUnique({ where: { code: 'lift' } });
    if (!dwarka || !sector62 || !lift) {
      throw new Error('test catalog missing locality/amenity; seed ncr_homes_test');
    }
    cityId = delhi.id;
    localityId = dwarka.id;
    otherLocalityId = sector62.id;
    amenityId = lift.id;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(adminLogin.status).toBe(200);
    adminCookie = cookieHeader(adminLogin);

    const suffix = `${Date.now()}`.slice(-8);
    const customerReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `cust.prop.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Prop Customer',
        phone: `+9198${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(customerReg.status).toBe(201);
    customerCookie = cookieHeader(customerReg);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const validBody = () => ({
    type: 'RESIDENTIAL',
    cityId,
    localityId,
    internalTitle: `HTTP ${Date.now()} ${Math.random().toString(16).slice(2, 8)}`,
    bedrooms: 3,
    bathrooms: 2,
    areaValue: 1450,
    amenityIds: [amenityId],
  });

  it('rejects unauthenticated requests with UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/properties');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a customer (missing property.manage) with FORBIDDEN', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/properties')
      .set('Cookie', customerCookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('creates a property and returns 201 mapped envelope', async () => {
    const body = validBody();
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.body.data.internalTitle).toBe(body.internalTitle);
    expect(res.body.data.cityId).toBe(cityId);
    expect(res.body.data.localityId).toBe(localityId);
    expect(res.body.data.areaUnit).toBe('SQFT');
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.amenityIds).toEqual([amenityId]);
    expect(res.body.data).not.toHaveProperty('listings');
  });

  it('rejects missing required fields with VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({ type: 'RESIDENTIAL' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('rejects a nonexistent city', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({
        ...validBody(),
        cityId: '00000000-0000-4000-8000-000000000000',
        localityId,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a locality that belongs to a different city', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({
        ...validBody(),
        cityId,
        localityId: otherLocalityId,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.error.details)).toMatch(/mismatch|Locality/i);
  });

  it('rejects invalid patch payloads', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send(validBody());
    const id = created.body.data.id as string;
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/properties/${id}`)
      .set('Cookie', adminCookie)
      .send({ areaValue: -1, internalTitle: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('updates a property and returns mapped data', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send(validBody());
    const id = created.body.data.id as string;
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/properties/${id}`)
      .set('Cookie', adminCookie)
      .send({ bedrooms: 4, societyName: 'Updated Society' });
    expect(res.status).toBe(200);
    expect(res.body.data.bedrooms).toBe(4);
    expect(res.body.data.societyName).toBe('Updated Society');
  });

  it('paginates with page/pageSize meta envelope', async () => {
    const prefix = `PageQ ${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({ ...validBody(), internalTitle: `${prefix} A` });
    await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({ ...validBody(), internalTitle: `${prefix} B` });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/properties')
      .query({ q: prefix, page: 1, pageSize: 1 })
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(1);
    expect(res.body.meta.total).toBe(2);
  });

  it('rejects pageSize above 24', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/properties')
      .query({ pageSize: 999 })
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('omits archived properties from admin get and list', async () => {
    const title = `ArchiveMe ${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({ ...validBody(), internalTitle: title });
    const id = created.body.data.id as string;
    const archived = await request(app.getHttpServer())
      .post(`/api/v1/admin/properties/${id}/archive`)
      .set('Cookie', adminCookie);
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe('ARCHIVED');
    expect(archived.body.data.deletedAt).toBeTruthy();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/properties/${id}`)
      .set('Cookie', adminCookie);
    expect(detail.status).toBe(404);
    expect(detail.body.error.code).toBe('NOT_FOUND');

    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/properties')
      .query({ q: title })
      .set('Cookie', adminCookie);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('returns 409 when archiving a property with a live listing', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send(validBody());
    const id = created.body.data.id as string;
    await prisma.listing.create({
      data: {
        propertyId: id,
        intent: 'RENT',
        status: 'DRAFT',
        title: 'Live draft',
        slug: `live-draft-${Date.now()}`,
        pricePeriod: 'MONTHLY',
      },
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/properties/${id}/archive`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('archives a property that only has CLOSED listings', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send(validBody());
    const id = created.body.data.id as string;
    await prisma.listing.create({
      data: {
        propertyId: id,
        intent: 'RENT',
        status: 'CLOSED',
        title: 'Closed listing',
        slug: `closed-${Date.now()}`,
        pricePeriod: 'MONTHLY',
        closedAt: new Date(),
      },
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/properties/${id}/archive`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ARCHIVED');
  });

  it('concurrent archive vs listing create never leaves a live listing on an archived property', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send(validBody());
    const id = created.body.data.id as string;
    const [archiveRes, createRes] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/admin/properties/${id}/archive`)
        .set('Cookie', adminCookie),
      request(app.getHttpServer())
        .post('/api/v1/admin/listings')
        .set('Cookie', adminCookie)
        .send({
          propertyId: id,
          intent: 'RENT',
          title: `Race create ${Date.now()}`,
          pricePeriod: 'MONTHLY',
          priceAmount: 25000,
        }),
    ]);
    expect([archiveRes.status, createRes.status].every((s) => s === 200 || s === 201 || s === 400 || s === 409)).toBe(
      true,
    );
    const property = await prisma.property.findFirst({ where: { id } });
    const live = await prisma.listing.count({
      where: { propertyId: id, deletedAt: null, status: { in: ['DRAFT', 'PUBLISHED', 'PAUSED'] } },
    });
    if (property?.status === 'ARCHIVED' || property?.deletedAt) {
      expect(live).toBe(0);
    } else {
      expect(createRes.status).toBe(201);
      expect(archiveRes.status).toBe(409);
    }
  });
});
