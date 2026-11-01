import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { AppModule } from '../../../app.module';
import { PUBLIC_MIN_RESPONSES } from './polls.logic';
import { voterHash } from './polls.service';

const prisma = new PrismaClient();
const tag = `poll${Date.now().toString(36)}`;
const HOUR = 60 * 60 * 1000;

function cookieHeader(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

type Seeded = { id: string; options: string[] };

type PollView = {
  question: string;
  phase: string;
  votedOptionId: string | null;
  results: { visible: boolean; total: number; needed?: number; options: Array<{ count: number; percent: number }> };
};

async function makePoll(
  name: string,
  over: { status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; opensAt?: Date | null; closesAt?: Date | null } = {},
): Promise<Seeded> {
  const poll = await prisma.communityPoll.create({
    data: {
      question: `${tag} ${name}?`,
      status: over.status ?? 'PUBLISHED',
      opensAt: over.opensAt ?? null,
      closesAt: over.closesAt ?? null,
      options: { create: ['Alpha', 'Beta', 'Gamma'].map((label, position) => ({ label, position })) },
    },
    include: { options: { orderBy: { position: 'asc' } } },
  });
  return { id: poll.id, options: poll.options.map((o) => o.id) };
}

/** Anonymous votes straight into the table, as if cast by distinct browsers. */
async function addVotes(poll: Seeded, optionIndex: number, count: number, localityId: string | null = null) {
  await prisma.communityPollVote.createMany({
    data: Array.from({ length: count }, () => ({
      pollId: poll.id,
      optionId: poll.options[optionIndex],
      voterHash: voterHash(randomBytes(24).toString('base64url'), poll.id),
      localityId,
    })),
  });
}

describe('community polls HTTP', () => {
  let app: INestApplication;
  let localityA = '';
  let localityB = '';
  let customerCookie = '';
  const api = () => request(app.getHttpServer());
  const mine = (list: request.Response) => (list.body.data as PollView[]).filter((p) => p.question.startsWith(tag));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    const [a, b] = await prisma.locality.findMany({ where: { isActive: true }, take: 2, orderBy: { name: 'asc' } });
    localityA = a.id;
    localityB = b.id;

    const suffix = `${Date.now()}`.slice(-8);
    const reg = await api()
      .post('/api/v1/auth/register')
      .send({
        email: `poll.${suffix}@example.com`,
        password: 'CustomerPass1',
        name: 'Poll Reader',
        phone: `+9184${suffix.padStart(8, '0')}`.slice(0, 13),
      });
    expect(reg.status).toBe(201);
    customerCookie = cookieHeader(reg);
  });

  afterAll(async () => {
    await prisma.communityPoll.deleteMany({ where: { question: { startsWith: tag } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('lists only polls that are open or closed, never drafts, scheduled or archived ones', async () => {
    await makePoll('open');
    await makePoll('closed', { opensAt: new Date(Date.now() - 2 * HOUR), closesAt: new Date(Date.now() - HOUR) });
    await makePoll('draft', { status: 'DRAFT' });
    await makePoll('archived', { status: 'ARCHIVED' });
    await makePoll('scheduled', { opensAt: new Date(Date.now() + HOUR) });

    const res = await api().get('/api/v1/community/polls');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    const polls = mine(res);
    expect(polls.map((p) => p.question.replace(`${tag} `, '')).sort()).toEqual(['closed?', 'open?']);
    expect(polls.find((p) => p.question.includes('open'))).toMatchObject({ phase: 'OPEN', votedOptionId: null });
    expect(polls.find((p) => p.question.includes('closed'))).toMatchObject({ phase: 'CLOSED' });
  });

  it('records one anonymous vote per browser per poll and remembers it', async () => {
    const poll = await makePoll('single vote');
    const first = await api().post(`/api/v1/community/polls/${poll.id}/vote`).send({ optionId: poll.options[1] });
    expect(first.status).toBe(200);
    expect(first.body.data.votedOptionId).toBe(poll.options[1]);
    const setCookie = String(first.headers['set-cookie']);
    expect(setCookie).toMatch(/ncr_voter=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    const cookie = cookieHeader(first);

    const again = await api().post(`/api/v1/community/polls/${poll.id}/vote`).set('Cookie', cookie).send({ optionId: poll.options[0] });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already voted/i);

    const list = await api().get('/api/v1/community/polls').set('Cookie', cookie);
    expect(mine(list).find((p) => p.question.includes('single vote'))).toMatchObject({
      votedOptionId: poll.options[1],
    });
    // Another browser sees no vote of its own.
    const other = await api().get('/api/v1/community/polls');
    expect(mine(other).find((p) => p.question.includes('single vote'))).toMatchObject({ votedOptionId: null });

    // The same browser can still vote in a different poll: the key is hashed per poll.
    const poll2 = await makePoll('second poll');
    const second = await api().post(`/api/v1/community/polls/${poll2.id}/vote`).set('Cookie', cookie).send({ optionId: poll2.options[0] });
    expect(second.status).toBe(200);
    const rows = await prisma.communityPollVote.findMany({ where: { pollId: { in: [poll.id, poll2.id] } } });
    expect(new Set(rows.map((r) => r.voterHash)).size).toBe(2); // not linkable across polls
  });

  it('enforces the window on the server', async () => {
    const closed = await makePoll('closed vote', { opensAt: new Date(Date.now() - 2 * HOUR), closesAt: new Date(Date.now() - HOUR) });
    const closedRes = await api().post(`/api/v1/community/polls/${closed.id}/vote`).send({ optionId: closed.options[0] });
    expect(closedRes.status).toBe(409);
    expect(closedRes.body.error.message).toMatch(/closed/i);

    for (const [name, over] of [
      ['draft vote', { status: 'DRAFT' as const }],
      ['archived vote', { status: 'ARCHIVED' as const }],
      ['scheduled vote', { opensAt: new Date(Date.now() + HOUR) }],
    ] as const) {
      const p = await makePoll(name, over);
      const res = await api().post(`/api/v1/community/polls/${p.id}/vote`).send({ optionId: p.options[0] });
      expect(res.status).toBe(404);
    }
    expect(await prisma.communityPollVote.count({ where: { pollId: closed.id } })).toBe(0);
  });

  it('rejects options from another poll, unknown areas and malformed input', async () => {
    const a = await makePoll('bad input a');
    const b = await makePoll('bad input b');
    const vote = (id: string, body: unknown) => api().post(`/api/v1/community/polls/${id}/vote`).send(body as object);

    expect((await vote(a.id, { optionId: b.options[0] })).status).toBe(400);
    expect((await vote(a.id, { optionId: a.options[0], localityId: '99999999-9999-4999-8999-999999999999' })).status).toBe(400);
    expect((await vote(a.id, { optionId: 'nope' })).status).toBe(400);
    expect((await vote(a.id, { optionId: a.options[0], extra: 1 })).status).toBe(400);
    expect((await vote('not-a-uuid', { optionId: a.options[0] })).status).toBe(404);
    expect(await prisma.communityPollVote.count({ where: { pollId: { in: [a.id, b.id] } } })).toBe(0);
  });

  it('hides percentages until enough people have voted, then shows counts that add up', async () => {
    const poll = await makePoll('threshold');
    await addVotes(poll, 0, PUBLIC_MIN_RESPONSES - 2);
    const find = async () =>
      mine(await api().get('/api/v1/community/polls')).find((p) => p.question.includes('threshold')) as PollView;

    const hidden = await find();
    expect(hidden.results).toEqual({ visible: false, total: PUBLIC_MIN_RESPONSES - 2, needed: PUBLIC_MIN_RESPONSES });
    expect(JSON.stringify(hidden.results)).not.toMatch(/percent|count/);

    await addVotes(poll, 1, 2);
    const shown = await find();
    expect(shown.results.visible).toBe(true);
    expect(shown.results.total).toBe(PUBLIC_MIN_RESPONSES);
    const pct = shown.results.options.map((o) => o.percent);
    expect(pct.reduce((x, y) => x + y, 0)).toBe(100);
    expect(shown.results.options.map((o) => o.count)).toEqual([8, 2, 0]);
  });

  it('never exposes individual votes, voter keys or hashes', async () => {
    const poll = await makePoll('privacy');
    await addVotes(poll, 0, PUBLIC_MIN_RESPONSES);
    const res = await api().get('/api/v1/community/polls');
    const text = JSON.stringify(mine(res));
    expect(text).not.toMatch(/voterHash|voter_hash|localityId|userId/);
    const hashes = (await prisma.communityPollVote.findMany({ where: { pollId: poll.id }, select: { voterHash: true } })).map((v) => v.voterHash);
    for (const h of hashes) expect(text).not.toContain(h);
  });

  describe('insights for registered users', () => {
    it('needs a signed-in user', async () => {
      const poll = await makePoll('insights anon');
      expect((await api().get(`/api/v1/community/polls/${poll.id}/insights`)).status).toBe(401);
    });

    it('shows areas with enough votes and holds back small ones without naming them', async () => {
      const poll = await makePoll('insights areas');
      await addVotes(poll, 0, 15, localityA);
      await addVotes(poll, 1, 10, localityA);
      await addVotes(poll, 2, 3, localityB);

      const res = await api().get(`/api/v1/community/polls/${poll.id}/insights`).set('Cookie', customerCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.results.total).toBe(28);
      expect(res.body.data.byArea).toHaveLength(1);
      expect(res.body.data.byArea[0].results.total).toBe(25);
      expect(res.body.data.areasHeldBack).toBe(1);
      const small = await prisma.locality.findUniqueOrThrow({ where: { id: localityB } });
      expect(JSON.stringify(res.body.data)).not.toContain(small.name);
    });

    it('does not offer insights for polls that are not public', async () => {
      const draft = await makePoll('insights draft', { status: 'DRAFT' });
      expect((await api().get(`/api/v1/community/polls/${draft.id}/insights`).set('Cookie', customerCookie)).status).toBe(404);
    });
  });

  it('records a vote area only when the voter chose one', async () => {
    const poll = await makePoll('area choice');
    await api().post(`/api/v1/community/polls/${poll.id}/vote`).send({ optionId: poll.options[0], localityId: localityA });
    const row = await prisma.communityPollVote.findFirstOrThrow({ where: { pollId: poll.id } });
    expect(row.localityId).toBe(localityA);

    const poll2 = await makePoll('no area');
    await api().post(`/api/v1/community/polls/${poll2.id}/vote`).send({ optionId: poll2.options[0] });
    expect((await prisma.communityPollVote.findFirstOrThrow({ where: { pollId: poll2.id } })).localityId).toBeNull();
  });
});
