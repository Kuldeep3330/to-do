import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../../app.module';
import { STORAGE_PORT } from './storage.port';
import { InMemoryStorage } from './storage.memory';

const prisma = new PrismaClient();

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

async function jpegFile(width = 48, height = 36): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 90, g: 40, b: 20 } },
  })
    .jpeg()
    .toBuffer();
}

describe('admin media HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let customerCookie = '';
  let cityId = '';
  let localityId = '';
  let jpeg: Buffer;
  let storage: InMemoryStorage;

  beforeAll(async () => {
    jpeg = await jpegFile();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    storage = app.get(STORAGE_PORT);

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
        email: `cust.media.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Media Customer',
        phone: `+9198${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(customerReg.status).toBe(201);
    customerCookie = cookieHeader(customerReg);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createListing(): Promise<string> {
    const property = await request(app.getHttpServer())
      .post('/api/v1/admin/properties')
      .set('Cookie', adminCookie)
      .send({
        type: 'RESIDENTIAL',
        cityId,
        localityId,
        internalTitle: `MediaProp ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
        areaValue: 1100,
        bedrooms: 2,
        bathrooms: 2,
      });
    expect(property.status).toBe(201);
    const listing = await request(app.getHttpServer())
      .post('/api/v1/admin/listings')
      .set('Cookie', adminCookie)
      .send({
        propertyId: property.body.data.id,
        intent: 'RENT',
        title: `Media ${Date.now()} ${Math.random().toString(16).slice(2, 6)}`,
        description: 'Has photos',
        priceAmount: 18000,
        pricePeriod: 'MONTHLY',
        negotiable: false,
      });
    expect(listing.status).toBe(201);
    return listing.body.data.id as string;
  }

  it('rejects unauthenticated upload', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/listings/00000000-0000-4000-8000-000000000001/media')
      .attach('file', jpeg, 'a.jpg');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a customer without media.manage', async () => {
    const listingId = await createListing();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', customerCookie)
      .attach('file', jpeg, 'a.jpg');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('uploads ORIGINAL plus CARD and DETAIL and returns public URLs', async () => {
    const listingId = await createListing();
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', jpeg, 'cover.jpg');
    expect(res.status).toBe(201);
    expect(res.body.data.variant).toBe('ORIGINAL');
    expect(res.body.data.url).toMatch(/^https?:\/\//);
    expect(res.body.data).not.toHaveProperty('storageKey');
    expect(res.body.data.variants).toHaveLength(2);
    const db = await prisma.media.findMany({ where: { listingId } });
    expect(db.filter((m) => m.variant === 'ORIGINAL')).toHaveLength(1);
    expect(db.filter((m) => m.variant === 'CARD')).toHaveLength(1);
    expect(db.filter((m) => m.variant === 'DETAIL')).toHaveLength(1);
    expect(storage.objects.size).toBeGreaterThanOrEqual(3);
  });

  it('rejects gif by magic bytes', async () => {
    const listingId = await createListing();
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', gif, 'x.gif');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA');
  });

  it('rejects a file larger than 8 MB', async () => {
    const listingId = await createListing();
    const big = Buffer.alloc(8 * 1024 * 1024 + 1, 0xff);
    big[0] = 0xff;
    big[1] = 0xd8;
    big[2] = 0xff;
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', big, 'big.jpg');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects images with a side over 8000px', async () => {
    const listingId = await createListing();
    const wide = await jpegFile(8001, 1);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', wide, 'wide.jpg');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects upload against a soft-deleted listing', async () => {
    const listingId = await createListing();
    await prisma.listing.update({
      where: { id: listingId },
      data: { deletedAt: new Date() },
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', jpeg, 'a.jpg');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('does not count CARD/DETAIL toward the 20 ORIGINAL cap', async () => {
    const listingId = await createListing();
    for (let i = 0; i < 19; i++) {
      await prisma.media.create({
        data: {
          listingId,
          storageKey: `test/${listingId}/orig-${i}.jpg`,
          contentType: 'image/jpeg',
          byteSize: 100,
          width: 10,
          height: 10,
          sortOrder: i,
          variant: 'ORIGINAL',
        },
      });
      await prisma.media.create({
        data: {
          listingId,
          storageKey: `test/${listingId}/card-${i}.webp`,
          contentType: 'image/webp',
          byteSize: 50,
          width: 10,
          height: 10,
          sortOrder: i,
          variant: 'CARD',
        },
      });
    }
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', jpeg, 'last.jpg');
    expect(res.status).toBe(201);
    const originals = await prisma.media.count({ where: { listingId, variant: 'ORIGINAL' } });
    expect(originals).toBe(20);
  });

  it('rejects the 21st ORIGINAL', async () => {
    const listingId = await createListing();
    for (let i = 0; i < 20; i++) {
      await prisma.media.create({
        data: {
          listingId,
          storageKey: `test/${listingId}/cap-${i}.jpg`,
          contentType: 'image/jpeg',
          byteSize: 100,
          width: 10,
          height: 10,
          sortOrder: i,
          variant: 'ORIGINAL',
        },
      });
    }
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', jpeg, 'overflow.jpg');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('serializes concurrent 21st ORIGINAL to one success and one conflict', async () => {
    const listingId = await createListing();
    for (let i = 0; i < 19; i++) {
      await prisma.media.create({
        data: {
          listingId,
          storageKey: `test/${listingId}/race-${i}.jpg`,
          contentType: 'image/jpeg',
          byteSize: 100,
          width: 10,
          height: 10,
          sortOrder: i,
          variant: 'ORIGINAL',
        },
      });
    }
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/admin/listings/${listingId}/media`)
        .set('Cookie', adminCookie)
        .attach('file', jpeg, 'race-a.jpg'),
      request(app.getHttpServer())
        .post(`/api/v1/admin/listings/${listingId}/media`)
        .set('Cookie', adminCookie)
        .attach('file', jpeg, 'race-b.jpg'),
    ]);
    const ok = [a.status, b.status].filter((s) => s === 201).length;
    const conflict = [a.status, b.status].filter((s) => s === 409).length;
    expect(ok).toBe(1);
    expect(conflict).toBe(1);
    const originals = await prisma.media.count({ where: { listingId, variant: 'ORIGINAL' } });
    expect(originals).toBe(20);
  });

  it('publishes after an ORIGINAL upload and exposes cover URL', async () => {
    const listingId = await createListing();
    const listing = await prisma.listing.findFirst({ where: { id: listingId } });
    const uploaded = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', jpeg, 'cover.jpg');
    expect(uploaded.status).toBe(201);
    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/publish`)
      .set('Cookie', adminCookie);
    expect(published.status).toBe(200);
    const publicGet = await request(app.getHttpServer()).get(`/api/v1/listings/${listing?.slug}`);
    expect(publicGet.status).toBe(200);
    expect(publicGet.body.data.coverImageUrl).toMatch(/^https?:\/\//);
    expect(publicGet.body.data.gallery).toHaveLength(1);
  });

  it('rejects deleting the last ORIGINAL of a PUBLISHED listing', async () => {
    const listingId = await createListing();
    const uploaded = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', jpeg, 'only.jpg');
    expect(uploaded.status).toBe(201);
    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/publish`)
      .set('Cookie', adminCookie);
    expect(published.status).toBe(200);
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/admin/media/${uploaded.body.data.id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('deletes only one ORIGINAL group when two share sortOrder', async () => {
    const listingId = await createListing();
    const a = await prisma.media.create({
      data: {
        listingId,
        storageKey: `listings/${listingId}/group-a.jpg`,
        contentType: 'image/jpeg',
        byteSize: 100,
        width: 10,
        height: 10,
        sortOrder: 1,
        variant: 'ORIGINAL',
      },
    });
    await prisma.media.create({
      data: {
        listingId,
        storageKey: `listings/${listingId}/group-a_card.webp`,
        contentType: 'image/webp',
        byteSize: 50,
        width: 10,
        height: 10,
        sortOrder: 1,
        variant: 'CARD',
      },
    });
    await prisma.media.create({
      data: {
        listingId,
        storageKey: `listings/${listingId}/group-a_detail.webp`,
        contentType: 'image/webp',
        byteSize: 50,
        width: 10,
        height: 10,
        sortOrder: 1,
        variant: 'DETAIL',
      },
    });
    const b = await prisma.media.create({
      data: {
        listingId,
        storageKey: `listings/${listingId}/group-b.jpg`,
        contentType: 'image/jpeg',
        byteSize: 100,
        width: 10,
        height: 10,
        sortOrder: 1,
        variant: 'ORIGINAL',
      },
    });
    await prisma.media.create({
      data: {
        listingId,
        storageKey: `listings/${listingId}/group-b_card.webp`,
        contentType: 'image/webp',
        byteSize: 50,
        width: 10,
        height: 10,
        sortOrder: 1,
        variant: 'CARD',
      },
    });
    await prisma.media.create({
      data: {
        listingId,
        storageKey: `listings/${listingId}/group-b_detail.webp`,
        contentType: 'image/webp',
        byteSize: 50,
        width: 10,
        height: 10,
        sortOrder: 1,
        variant: 'DETAIL',
      },
    });
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/admin/media/${a.id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const remaining = await prisma.media.findMany({ where: { listingId } });
    expect(remaining.filter((m) => m.variant === 'ORIGINAL')).toHaveLength(1);
    expect(remaining.find((m) => m.id === b.id)).toBeTruthy();
    expect(remaining).toHaveLength(3);
    expect(remaining.every((m) => m.storageKey.includes('group-b'))).toBe(true);
  });

  it('deletes one of two same-sort ORIGINALS on a PUBLISHED listing and keeps the other', async () => {
    const listingId = await createListing();
    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', jpeg, 'one.jpg');
    const second = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', jpeg, 'two.jpg');
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    await prisma.media.updateMany({
      where: { listingId },
      data: { sortOrder: 7 },
    });
    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/publish`)
      .set('Cookie', adminCookie);
    expect(published.status).toBe(200);
    const del = await request(app.getHttpServer())
      .delete(`/api/v1/admin/media/${first.body.data.id}`)
      .set('Cookie', adminCookie);
    expect(del.status).toBe(200);
    const originals = await prisma.media.findMany({
      where: { listingId, variant: 'ORIGINAL' },
    });
    expect(originals).toHaveLength(1);
    expect(originals[0].id).toBe(second.body.data.id);
  });

  it('patches sortOrder and writes audit rows', async () => {
    const listingId = await createListing();
    const uploaded = await request(app.getHttpServer())
      .post(`/api/v1/admin/listings/${listingId}/media`)
      .set('Cookie', adminCookie)
      .attach('file', jpeg, 'cover.jpg');
    const id = uploaded.body.data.id as string;
    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/admin/media/${id}`)
      .set('Cookie', adminCookie)
      .send({ sortOrder: 4 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.sortOrder).toBe(4);
    await new Promise((r) => setTimeout(r, 50));
    const rows = await prisma.auditLog.findMany({
      where: { entityId: id, entityType: 'media' },
    });
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['CREATE_MEDIA', 'REORDER_MEDIA']));
  });
});
