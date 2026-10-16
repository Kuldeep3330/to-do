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

describe('locations and amenities HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let customerCookie = '';
  const suffix = `${Date.now()}`.slice(-8);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const admin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(admin.status).toBe(200);
    adminCookie = cookieHeader(admin);

    const customer = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `cust.loc.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Loc Customer',
        phone: `+9198${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(customer.status).toBe(201);
    customerCookie = cookieHeader(customer);
  });

  afterAll(async () => {
    await prisma.locality.deleteMany({ where: { slug: { startsWith: 'e2e-loc-' } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('lists active cities publicly without auth', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/cities');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((c: { slug: string }) => c.slug);
    expect(slugs).toEqual(expect.arrayContaining(['delhi', 'noida']));
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      slug: expect.any(String),
    });
  });

  it('lists localities of a city and 404s for unknown city', async () => {
    const ok = await request(app.getHttpServer()).get('/api/v1/cities/delhi/localities');
    expect(ok.status).toBe(200);
    expect(ok.body.data.map((l: { slug: string }) => l.slug)).toContain('dwarka');

    const missing = await request(app.getHttpServer()).get('/api/v1/cities/atlantis/localities');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('forbids customers from creating localities and requires auth', async () => {
    const anon = await request(app.getHttpServer()).post('/api/v1/admin/localities').send({});
    expect(anon.status).toBe(401);

    const city = await prisma.city.findUniqueOrThrow({ where: { slug: 'delhi' } });
    const customer = await request(app.getHttpServer())
      .post('/api/v1/admin/localities')
      .set('Cookie', customerCookie)
      .send({ cityId: city.id, name: 'Nope', slug: 'e2e-loc-nope' });
    expect(customer.status).toBe(403);
  });

  it('lets an admin create a locality, rejects duplicates, and exposes it publicly', async () => {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: 'delhi' } });
    const slug = `e2e-loc-${suffix}`;

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/localities')
      .set('Cookie', adminCookie)
      .send({ cityId: city.id, name: 'E2E Locality', slug });
    expect(created.status).toBe(201);
    expect(created.body.data.slug).toBe(slug);

    const dup = await request(app.getHttpServer())
      .post('/api/v1/admin/localities')
      .set('Cookie', adminCookie)
      .send({ cityId: city.id, name: 'E2E Locality', slug });
    expect(dup.status).toBe(409);

    const bad = await request(app.getHttpServer())
      .post('/api/v1/admin/localities')
      .set('Cookie', adminCookie)
      .send({ cityId: city.id, name: 'Bad Slug', slug: 'Not Valid!' });
    expect(bad.status).toBe(400);

    const pub = await request(app.getHttpServer()).get('/api/v1/cities/delhi/localities');
    expect(pub.body.data.map((l: { slug: string }) => l.slug)).toContain(slug);
  });

  it('lists amenities for property managers only', async () => {
    const anon = await request(app.getHttpServer()).get('/api/v1/admin/amenities');
    expect(anon.status).toBe(401);

    const customer = await request(app.getHttpServer())
      .get('/api/v1/admin/amenities')
      .set('Cookie', customerCookie);
    expect(customer.status).toBe(403);

    const admin = await request(app.getHttpServer())
      .get('/api/v1/admin/amenities')
      .set('Cookie', adminCookie);
    expect(admin.status).toBe(200);
    expect(admin.body.data.map((a: { code: string }) => a.code)).toContain('lift');
  });
});
