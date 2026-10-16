import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../../app.module';

const prisma = new PrismaClient();

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

describe('saved listings and dashboard HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let aliceCookie = '';
  let bobCookie = '';
  let cityId = '';
  let localityId = '';
  let jpeg: Buffer;
  const suffix = `${Date.now()}`.slice(-8);
  const staffEmails: string[] = [];

  const http = () => request(app.getHttpServer());

  async function register(tag: string, n: number) {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({
        email: `${tag}.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: tag,
        phone: `+9196${`${suffix}${n}`.slice(-8).padStart(8, '0')}`,
      });
    expect(res.status).toBe(201);
    return cookieHeader(res);
  }

  async function createListing(opts: { publish: boolean }): Promise<string> {
    const property = await http()
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({
        type: 'RESIDENTIAL',
        cityId,
        localityId,
        internalTitle: `Saved ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
        areaValue: 900,
        bedrooms: 2,
      });
    const listing = await http()
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send({
        propertyId: property.body.data.id,
        intent: 'RENT',
        pricePeriod: 'MONTHLY',
        title: `Saved listing ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
        priceAmount: 21000,
      });
    const id = listing.body.data.id as string;
    if (opts.publish) {
      const up = await http()
        .post(`/api/v1/admin/listings/${id}/media`)
        .set('Cookie', adminCookie)
        .attach('file', jpeg, 'a.jpg');
      expect(up.status).toBe(201);
      const pub = await http().post(`/api/v1/admin/listings/${id}/publish`).set('Cookie', adminCookie);
      expect(pub.status).toBe(200);
    }
    return id;
  }

  beforeAll(async () => {
    jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 80, b: 30 } } })
      .jpeg()
      .toBuffer();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const delhi = await prisma.city.findUniqueOrThrow({ where: { slug: 'delhi' } });
    const dwarka = await prisma.locality.findUniqueOrThrow({
      where: { cityId_slug: { cityId: delhi.id, slug: 'dwarka' } },
    });
    cityId = delhi.id;
    localityId = dwarka.id;

    const admin = await http().post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(admin.status).toBe(200);
    adminCookie = cookieHeader(admin);
    aliceCookie = await register('alice.saved', 1);
    bobCookie = await register('bob.saved', 2);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: staffEmails } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    expect((await http().get('/api/v1/me/saved-listings')).status).toBe(401);
    expect((await http().post('/api/v1/me/saved-listings').send({})).status).toBe(401);
  });

  it('saves, lists, de-duplicates and removes a published listing', async () => {
    const id = await createListing({ publish: true });

    const saved = await http().post('/api/v1/me/saved-listings').set('Cookie', aliceCookie).send({ listingId: id });
    expect(saved.status).toBe(200);
    const again = await http().post('/api/v1/me/saved-listings').set('Cookie', aliceCookie).send({ listingId: id });
    expect(again.status).toBe(200); // idempotent

    const list = await http().get('/api/v1/me/saved-listings').set('Cookie', aliceCookie);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id, intent: 'RENT', priceAmount: 21000 });
    expect(list.body.data[0].coverImageUrl).toMatch(/^https?:\/\//);

    const ids = await http().get('/api/v1/me/saved-listings/ids').set('Cookie', aliceCookie);
    expect(ids.body.data).toEqual([id]);

    // saved lists are private to each user
    const bob = await http().get('/api/v1/me/saved-listings').set('Cookie', bobCookie);
    expect(bob.body.data).toEqual([]);

    expect((await http().delete(`/api/v1/me/saved-listings/${id}`).set('Cookie', aliceCookie)).status).toBe(204);
    expect((await http().delete(`/api/v1/me/saved-listings/${id}`).set('Cookie', aliceCookie)).status).toBe(204);
    expect((await http().get('/api/v1/me/saved-listings').set('Cookie', aliceCookie)).body.data).toEqual([]);
  });

  it('refuses drafts, unknown ids and malformed input', async () => {
    const draft = await createListing({ publish: false });
    expect((await http().post('/api/v1/me/saved-listings').set('Cookie', aliceCookie).send({ listingId: draft })).status).toBe(404);
    expect(
      (await http().post('/api/v1/me/saved-listings').set('Cookie', aliceCookie).send({ listingId: '00000000-0000-4000-8000-000000000000' })).status,
    ).toBe(404);
    expect((await http().post('/api/v1/me/saved-listings').set('Cookie', aliceCookie).send({ listingId: 'nope' })).status).toBe(400);
    expect((await http().delete('/api/v1/me/saved-listings/nope').set('Cookie', aliceCookie)).status).toBe(404);
  });

  it('drops a listing from saved lists once it is paused', async () => {
    const id = await createListing({ publish: true });
    await http().post('/api/v1/me/saved-listings').set('Cookie', aliceCookie).send({ listingId: id });
    expect((await http().get('/api/v1/me/saved-listings/ids').set('Cookie', aliceCookie)).body.data).toContain(id);

    await http().post(`/api/v1/admin/listings/${id}/pause`).set('Cookie', adminCookie);
    expect((await http().get('/api/v1/me/saved-listings/ids').set('Cookie', aliceCookie)).body.data).not.toContain(id);
    expect((await http().get('/api/v1/me/saved-listings').set('Cookie', aliceCookie)).body.data.some((l: { id: string }) => l.id === id)).toBe(false);
  });

  describe('dashboard', () => {
    it('is forbidden to customers and anonymous users', async () => {
      expect((await http().get('/api/v1/admin/dashboard')).status).toBe(401);
      expect((await http().get('/api/v1/admin/dashboard').set('Cookie', aliceCookie)).status).toBe(403);
    });

    it('gives admins global counts', async () => {
      const published = await createListing({ publish: true });
      const res = await http().get('/api/v1/admin/dashboard').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.scopedToAssigned).toBe(false);
      expect(res.body.data.publishedListings).toBeGreaterThanOrEqual(1);
      expect(res.body.data.draftListings).toBeGreaterThanOrEqual(0);
      const dbPublished = await prisma.listing.count({ where: { status: 'PUBLISHED', deletedAt: null } });
      expect(res.body.data.publishedListings).toBe(dbPublished);
      expect(typeof res.body.data.leadsNew).toBe('number');
      expect(published).toBeTruthy();
    });

    it('scopes a sales agent to assigned leads and hides listing counts', async () => {
      const email = `agent.dash.${suffix}@example.com`;
      staffEmails.push(email);
      const made = await http()
        .post('/api/v1/admin/users')
        .set('Cookie', adminCookie)
        .send({ email, name: 'Dash Agent', phone: `+9195${suffix.padStart(8, '0')}`, password: 'AgentPassword1', role: 'SALES_AGENT' });
      expect(made.status).toBe(201);
      const agent = cookieHeader(await http().post('/api/v1/auth/login').send({ email, password: 'AgentPassword1' }));

      const listingId = await createListing({ publish: true });
      const lead = async (n: number) =>
        http()
          .post('/api/v1/leads')
          .send({ listingId, name: `Lead ${n}`, phone: `+9194${`${suffix}${n}`.slice(-8).padStart(8, '0')}` });
      expect((await lead(1)).status).toBe(200);
      expect((await lead(2)).status).toBe(200);

      const before = await http().get('/api/v1/admin/dashboard').set('Cookie', agent);
      expect(before.status).toBe(200);
      expect(before.body.data).toMatchObject({
        publishedListings: null,
        draftListings: null,
        leadsNew: 0,
        leadsTotal: 0,
        scopedToAssigned: true,
      });

      // assign one lead to the agent
      const row = await prisma.lead.findFirstOrThrow({ where: { listingId }, orderBy: { createdAt: 'asc' } });
      const assigned = await http()
        .patch(`/api/v1/admin/leads/${row.id}`)
        .set('Cookie', adminCookie)
        .send({ assignedToUserId: made.body.data.id });
      expect(assigned.status).toBe(200);

      const after = await http().get('/api/v1/admin/dashboard').set('Cookie', agent);
      expect(after.body.data).toMatchObject({ leadsNew: 1, leadsToday: 1, leadsTotal: 1 });
    });
  });
});
