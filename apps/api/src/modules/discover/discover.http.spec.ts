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

describe('discover HTTP', () => {
  let app: INestApplication;
  let localityId = '';
  let cookieA = '';
  let cookieB = '';
  const suffix = `${Date.now()}`.slice(-8);

  const api = () => request(app.getHttpServer());
  const register = async (tag: string, phonePrefix: string) => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({
        email: `discover.${tag}.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: `Discover ${tag}`,
        phone: `${phonePrefix}${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(res.status).toBe(201);
    return cookieHeader(res);
  };

  const customer = () => ({
    intent: 'RENT',
    locations: [localityId, 'other'],
    budgetRent: { band: 'r_15_20k' },
    propertyType: 'apartment',
    bedrooms: '2',
    timeline: '1_month',
    priorities: ['price', 'security'],
    furnishing: 'semi',
  });

  const owner = () => ({
    goal: 'rent',
    location: { localityId, address: 'Tower 3' },
    availability: 'now',
    photos: 'no',
    details: 'partial',
    price: 'guidance',
    visits: 'weekends',
    authorization: 'owner',
  });

  const agent = () => ({
    localities: [localityId],
    categories: ['rental'],
    inventory: '6_15',
    confirmation: 'owner',
    response: '1_hour',
    visits: 'regularly',
    permission: 'some',
    reconfirm: 'weekly',
  });

  const submit = (slug: string, answers: unknown, extra: Record<string, unknown> = {}, cookie = '') =>
    api()
      .post(`/api/v1/discover/assessments/${slug}/responses`)
      .set('Cookie', cookie)
      .send({ answers, ...extra });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const locality = await prisma.locality.findFirst({ where: { isActive: true, city: { isActive: true } } });
    if (!locality) throw new Error('test catalog missing localities; seed ncr_homes_test');
    localityId = locality.id;
    cookieA = await register('a', '+9181');
    cookieB = await register('b', '+9182');
  });

  afterAll(async () => {
    await prisma.discoverResponse.deleteMany({ where: { user: { email: { contains: `.${suffix}@` } } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('lists the three assessments and serves a definition publicly', async () => {
    const list = await api().get('/api/v1/discover/assessments');
    expect(list.status).toBe(200);
    expect(list.body.data.map((a: { slug: string }) => a.slug)).toEqual(['customer', 'owner', 'agent']);

    const def = await api().get('/api/v1/discover/assessments/owner');
    expect(def.status).toBe(200);
    expect(def.body.data.questions.length).toBeGreaterThan(5);

    expect((await api().get('/api/v1/discover/assessments/nope')).status).toBe(404);
  });

  it('accepts an anonymous customer submission and returns a private result', async () => {
    const res = await submit('customer', customer());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { resultToken, saved, result } = res.body.data;
    expect(resultToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(saved).toBe(false);
    expect(result.preferences.budgets.RENT).toEqual({ min: 15000, max: 20000 });
    expect(result.summary.some((l: { answer: string }) => l.answer.includes(result.localities[0].name))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/score|percent/i);

    // Only the token hash is stored, and the response is anonymous.
    const row = await prisma.discoverResponse.findFirst({ orderBy: { createdAt: 'desc' } });
    expect(row?.userId).toBeNull();
    expect(row?.tokenHash).not.toBe(resultToken);

    const got = await api().get(`/api/v1/discover/results/${resultToken}`);
    expect(got.status).toBe(200);
    expect(got.headers['referrer-policy']).toBe('no-referrer');
    expect(got.body.data.title).toBe('Find Your Home Preferences');
    expect(Object.keys(got.body.data)).not.toEqual(expect.arrayContaining(['answers', 'userId', 'tokenHash']));
  });

  it('does not reveal results to anyone without the exact token', async () => {
    const { resultToken } = (await submit('customer', customer())).body.data;
    for (const t of ['x'.repeat(32), resultToken.slice(0, -1) + (resultToken.endsWith('A') ? 'B' : 'A'), 'short', '%27%20OR%201=1']) {
      expect((await api().get(`/api/v1/discover/results/${t}`)).status).toBe(404);
    }
  });

  it('rejects invalid answers with per-question details and stores nothing', async () => {
    const before = await prisma.discoverResponse.count();
    const bad = await submit('customer', { ...customer(), timeline: 'yesterday', budgetBuy: { band: 'b_lt25l' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['budgetBuy', 'timeline']);
    expect((await submit('customer', {})).status).toBe(400);
    expect((await submit('customer', customer(), { surprise: true })).status).toBe(400);
    expect(await prisma.discoverResponse.count()).toBe(before);
  });

  it('rejects a locality that does not exist', async () => {
    const res = await submit('customer', { ...customer(), locations: ['99999999-9999-4999-8999-999999999999'] });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('locations');
  });

  it('computes the owner readiness score on the server and labels it as preparation only', async () => {
    const res = await submit('owner', { ...owner(), score: 100 });
    expect(res.status).toBe(400); // client-supplied scores are not an accepted field

    const ok = await submit('owner', owner());
    expect(ok.status).toBe(200);
    const { readiness, disclaimer } = ok.body.data.result;
    expect(readiness.score).toBe(66); // availability 20 + details 10 + photos 0 + price 8 + visits 8 + location 10 + authorization 10
    expect(readiness.band).toBe('ALMOST_READY');
    expect(readiness.nextSteps.join(' ')).toMatch(/photographs/);
    expect(disclaimer).toMatch(/not a property verification score/);
    expect(ok.body.data.result.selfReported).toBe(true);
  });

  it('keeps agent answers as a self-reported profile with no performance data', async () => {
    const res = await submit('agent', agent());
    expect(res.status).toBe(200);
    expect(res.body.data.result.disclaimer).toMatch(/self-reported/);
    expect(res.body.data.result.readiness).toBeUndefined();
    expect(JSON.stringify(res.body.data.result)).not.toMatch(/rank|rating|performance score/i);
  });

  it('records start and completion events without identifying anyone', async () => {
    const before = await prisma.analyticsEvent.count({ where: { name: 'discover_completed' } });
    expect((await api().post('/api/v1/discover/assessments/agent/start')).status).toBe(200);
    await submit('agent', agent());
    expect(await prisma.analyticsEvent.count({ where: { name: 'discover_completed' } })).toBe(before + 1);
    const event = await prisma.analyticsEvent.findFirst({ where: { name: 'discover_completed' }, orderBy: { createdAt: 'desc' } });
    expect(event?.userId).toBeNull();
    expect(JSON.stringify(event?.properties)).not.toMatch(/answers|locality/i);
  });

  describe('accounts', () => {
    it('requires sign-in to save, but never to participate', async () => {
      const res = await submit('customer', customer(), { saveToAccount: true });
      expect(res.status).toBe(401);
    });

    it('saves a signed-in submission and builds one preference profile', async () => {
      const res = await submit('customer', customer(), { saveToAccount: true }, cookieA);
      expect(res.status).toBe(200);
      expect(res.body.data.saved).toBe(true);

      const profile = await api().get('/api/v1/discover/me/profile').set('Cookie', cookieA);
      expect(profile.status).toBe(200);
      expect(profile.body.data.preferences.localityIds).toEqual([localityId]);
      expect(profile.body.data.localities[0].id).toBe(localityId);

      expect((await api().get('/api/v1/discover/me/profile')).status).toBe(401);
    });

    it('lets a signed-in user submit anonymously without attaching it', async () => {
      const res = await submit('customer', customer(), {}, cookieB);
      expect(res.body.data.saved).toBe(false);
      expect((await api().get('/api/v1/discover/me/profile').set('Cookie', cookieB)).body.data).toBeNull();
    });

    it('lets a user claim an anonymous result, and no one else can take it', async () => {
      const { resultToken } = (await submit('customer', customer())).body.data;
      const claim = (cookie: string) =>
        api().post(`/api/v1/discover/results/${resultToken}/claim`).set('Cookie', cookie);

      expect((await claim('')).status).toBe(401);
      expect((await claim(cookieB)).status).toBe(200);
      expect((await claim(cookieB)).status).toBe(200); // idempotent for the same user
      expect((await claim(cookieA)).status).toBe(404); // someone else's result looks missing
      expect((await api().get(`/api/v1/discover/results/${resultToken}`)).body.data.saved).toBe(true);
      expect((await api().get('/api/v1/discover/me/profile').set('Cookie', cookieB)).body.data).not.toBeNull();
    });

    it('does not let an owner assessment create a preference profile', async () => {
      const res = await submit('owner', owner(), { saveToAccount: true }, cookieB);
      expect(res.body.data.saved).toBe(true);
      expect(res.body.data.result.preferences).toBeUndefined();
    });

    it('deletes the profile and all saved responses on request', async () => {
      const { resultToken } = (await submit('customer', customer(), { saveToAccount: true }, cookieA)).body.data;
      expect((await api().delete('/api/v1/discover/me').set('Cookie', cookieA)).status).toBe(200);
      expect((await api().get('/api/v1/discover/me/profile').set('Cookie', cookieA)).body.data).toBeNull();
      expect((await api().get(`/api/v1/discover/results/${resultToken}`)).status).toBe(404);
      // Other users' data is untouched.
      expect((await api().get('/api/v1/discover/me/profile').set('Cookie', cookieB)).body.data).not.toBeNull();
      expect((await api().delete('/api/v1/discover/me')).status).toBe(401);
    });
  });
});
