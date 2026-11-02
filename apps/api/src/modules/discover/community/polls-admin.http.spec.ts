import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../../app.module';

const prisma = new PrismaClient();
const tag = `padm${Date.now().toString(36)}`;
const HOUR = 60 * 60 * 1000;
const BASE = '/api/v1/admin/community/polls';

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

describe('community polls admin HTTP', () => {
  let app: INestApplication;
  let adminCookie = '';
  let customerCookie = '';
  const api = () => request(app.getHttpServer());
  const admin = (method: 'get' | 'post' | 'patch', path: string) => api()[method](path).set('Cookie', adminCookie);
  const question = (name: string) => `${tag} ${name} question?`;
  const create = (name: string, over: Record<string, unknown> = {}) =>
    admin('post', BASE).send({ question: question(name), options: ['One', 'Two', 'Three'], ...over });
  /** Public polls for one test's own question, so tests do not see each other's live polls. */
  const publicList = async (name: string) =>
    ((await api().get('/api/v1/community/polls')).body.data as Array<{ question: string; phase: string; options: Array<{ id: string }> }>).filter(
      (p) => p.question === question(name),
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const login = await api().post('/api/v1/auth/login').send({ email: 'admin@example.com', password: 'ChangeMeAdmin1' });
    expect(login.status).toBe(200);
    adminCookie = cookieHeader(login);

    const suffix = `${Date.now()}`.slice(-8);
    const reg = await api()
      .post('/api/v1/auth/register')
      .send({
        email: `padm.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Plain Customer',
        phone: `+9185${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(reg.status).toBe(201);
    customerCookie = cookieHeader(reg);
  });

  afterAll(async () => {
    await prisma.communityPoll.deleteMany({ where: { question: { startsWith: tag } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('is limited to staff with poll.manage', async () => {
    expect((await api().get(BASE)).status).toBe(401);
    expect((await api().get(BASE).set('Cookie', customerCookie)).status).toBe(403);
    expect((await api().post(BASE).set('Cookie', customerCookie).send({ question: question('x'), options: ['a', 'b'] })).status).toBe(403);
    const list = await admin('get', BASE);
    expect(list.status).toBe(200);
    // The starter questions from the product spec are present as drafts, not live.
    const starter = list.body.data.filter((p: { question: string }) => p.question.startsWith('What is your biggest problem'));
    expect(starter).toHaveLength(1);
    expect(starter[0]).toMatchObject({ status: 'DRAFT', phase: 'DRAFT' });
    expect(starter[0].options).toHaveLength(4);
  });

  it('validates new polls', async () => {
    const bad = (body: Record<string, unknown>) => admin('post', BASE).send(body);
    expect((await bad({ question: question('a'), options: ['Only one'] })).status).toBe(400);
    expect((await bad({ question: question('b'), options: ['A', 'a'] })).status).toBe(400);
    expect((await bad({ question: question('c'), options: ['1', '2', '3', '4', '5', '6', '7'] })).status).toBe(400);
    expect((await bad({ question: 'short', options: ['A', 'B'] })).status).toBe(400);
    expect((await bad({ question: question('d'), options: ['A', 'B'], status: 'PUBLISHED' })).status).toBe(400);
    const reversed = await bad({
      question: question('e'),
      options: ['A', 'B'],
      opensAt: new Date(Date.now() + 2 * HOUR).toISOString(),
      closesAt: new Date(Date.now() + HOUR).toISOString(),
    });
    expect(reversed.status).toBe(400);
    expect(await prisma.communityPoll.count({ where: { question: { startsWith: tag } } })).toBe(0);
  });

  it('creates a draft that stays private until published, then goes live', async () => {
    const created = await create('lifecycle');
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(await publicList('lifecycle')).toEqual([]);

    expect((await admin('post', `${BASE}/${id}/publish`).send()).status).toBe(200);
    const live = await publicList('lifecycle');
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ phase: 'OPEN' });

    expect((await admin('post', `${BASE}/${id}/publish`).send()).status).toBe(409); // already published

    const audits = await prisma.auditLog.findMany({ where: { entityId: id }, select: { action: true } });
    expect(audits.map((a) => a.action).sort()).toEqual(['CREATE_POLL', 'PUBLISH_POLL']);
  });

  it('keeps a scheduled poll hidden until its opening time', async () => {
    const created = await create('scheduled', { opensAt: new Date(Date.now() + HOUR).toISOString() });
    const id = created.body.data.id as string;
    await admin('post', `${BASE}/${id}/publish`).send();
    expect(await publicList('scheduled')).toEqual([]);
    const row = (await admin('get', BASE)).body.data.find((p: { id: string }) => p.id === id);
    expect(row).toMatchObject({ status: 'PUBLISHED', phase: 'SCHEDULED' });
  });

  it('will not publish a poll whose closing time has passed', async () => {
    const created = await create('past close', { closesAt: new Date(Date.now() - HOUR).toISOString() });
    const res = await admin('post', `${BASE}/${created.body.data.id}/publish`).send();
    expect(res.status).toBe(409);
  });

  it('lets the question and options change only until the first vote', async () => {
    const id = (await create('lock')).body.data.id as string;
    const edited = await admin('patch', `${BASE}/${id}`).send({ question: question('lock edited'), options: ['X', 'Y'] });
    expect({ status: edited.status, body: edited.body }).toMatchObject({ status: 200 });
    await admin('post', `${BASE}/${id}/publish`).send();

    const [live] = await publicList('lock edited');
    const vote = await api().post(`/api/v1/community/polls/${id}/vote`).send({ optionId: live.options[0].id });
    expect(vote.status).toBe(200);

    expect((await admin('patch', `${BASE}/${id}`).send({ question: question('too late') })).status).toBe(409);
    expect((await admin('patch', `${BASE}/${id}`).send({ options: ['P', 'Q'] })).status).toBe(409);
    // Dates can still move, and the existing vote is intact.
    const later = new Date(Date.now() + 5 * HOUR).toISOString();
    expect((await admin('patch', `${BASE}/${id}`).send({ closesAt: later })).status).toBe(200);
    expect(await prisma.communityPollVote.count({ where: { pollId: id } })).toBe(1);
    expect((await admin('patch', `${BASE}/${id}`).send({})).status).toBe(400);
  });

  it('closes an open poll immediately: voting stops and results stay public', async () => {
    const id = (await create('closing')).body.data.id as string;
    expect((await admin('post', `${BASE}/${id}/close`).send()).status).toBe(409); // a draft cannot be closed
    await admin('post', `${BASE}/${id}/publish`).send();
    const [live] = await publicList('closing');

    expect((await admin('post', `${BASE}/${id}/close`).send()).status).toBe(200);
    const vote = await api().post(`/api/v1/community/polls/${id}/vote`).send({ optionId: live.options[0].id });
    expect(vote.status).toBe(409);
    expect((await publicList('closing'))[0]).toMatchObject({ phase: 'CLOSED' });
    expect((await admin('post', `${BASE}/${id}/close`).send()).status).toBe(409);
  });

  it('archives a poll out of public view while keeping its votes', async () => {
    const id = (await create('archive')).body.data.id as string;
    await admin('post', `${BASE}/${id}/publish`).send();
    const [live] = await publicList('archive');
    await api().post(`/api/v1/community/polls/${id}/vote`).send({ optionId: live.options[0].id });

    expect((await admin('post', `${BASE}/${id}/archive`).send()).status).toBe(200);
    expect(await publicList('archive')).toEqual([]);
    expect(await prisma.communityPollVote.count({ where: { pollId: id } })).toBe(1);
    expect((await admin('post', `${BASE}/${id}/archive`).send()).status).toBe(409);
    expect((await admin('patch', `${BASE}/${id}`).send({ closesAt: null })).status).toBe(409);
    const row = (await admin('get', BASE)).body.data.find((p: { id: string }) => p.id === id);
    expect(row).toMatchObject({ status: 'ARCHIVED', total: 1 });
  });

  it('shows staff aggregate counts but nothing that identifies a voter', async () => {
    const id = (await create('staff view')).body.data.id as string;
    await admin('post', `${BASE}/${id}/publish`).send();
    const [live] = await publicList('staff view');
    await api().post(`/api/v1/community/polls/${id}/vote`).send({ optionId: live.options[1].id });

    const res = await admin('get', BASE);
    const row = res.body.data.find((p: { id: string }) => p.id === id);
    expect(row.options.map((o: { count: number }) => o.count)).toEqual([0, 1, 0]);
    expect(JSON.stringify(row)).not.toMatch(/voterHash|voter_hash|localityId|ncr_voter/);
  });

  it('answers 404 for unknown polls', async () => {
    expect((await admin('post', `${BASE}/99999999-9999-4999-8999-999999999999/publish`).send()).status).toBe(404);
    expect((await admin('patch', `${BASE}/not-a-uuid`).send({ question: question('zz') })).status).toBe(404);
  });
});
