import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildLocalityBreakdown,
  buildResults,
  isPubliclyListed,
  pollPhase,
  type PollPhase,
  type PollResults,
} from './polls.logic';

export const VOTER_KEY_FORMAT = /^[A-Za-z0-9_-]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-poll hash of the browser's random key. Different polls give unrelated hashes, so votes cannot be linked. */
export const voterHash = (key: string, pollId: string) =>
  createHash('sha256').update(`${key}:${pollId}`).digest('hex');

export type PublicPoll = {
  id: string;
  question: string;
  phase: Extract<PollPhase, 'OPEN' | 'CLOSED'>;
  opensAt: Date | null;
  closesAt: Date | null;
  options: Array<{ id: string; label: string }>;
  results: PollResults;
  /** The option this browser voted for, if any. Never reveals anyone else's vote. */
  votedOptionId: string | null;
};

type PollRow = Prisma.CommunityPollGetPayload<{ include: { options: true } }>;

@Injectable()
export class PollsService {
  private readonly logger = new Logger(PollsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listPublic(key: string | undefined, now: Date = new Date()): Promise<PublicPoll[]> {
    const polls = await this.prisma.communityPoll.findMany({
      where: { status: 'PUBLISHED' },
      include: { options: { orderBy: { position: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const listed = polls.filter((p) => isPubliclyListed(p, now));
    return this.present(listed, key, now);
  }

  async vote(
    pollId: string,
    input: { optionId: string; localityId?: string },
    key: string,
    now: Date = new Date(),
  ): Promise<PublicPoll> {
    const poll = UUID.test(pollId)
      ? await this.prisma.communityPoll.findUnique({
          where: { id: pollId },
          include: { options: { orderBy: { position: 'asc' } } },
        })
      : null;
    const phase = poll ? pollPhase(poll, now) : null;
    // Drafts, archived and not-yet-open polls do not exist as far as the public is concerned.
    if (!poll || (phase !== 'OPEN' && phase !== 'CLOSED')) throw AppError.notFound('Poll not found');
    if (phase === 'CLOSED') throw AppError.conflict('This poll is closed.');
    if (!poll.options.some((o) => o.id === input.optionId)) {
      throw AppError.validation('Invalid option', [{ path: 'optionId', message: 'Choose one of the options.' }]);
    }
    if (input.localityId) {
      const ok = await this.prisma.locality.findFirst({ where: { id: input.localityId, isActive: true } });
      if (!ok) throw AppError.validation('Invalid area', [{ path: 'localityId', message: 'Choose a listed area.' }]);
    }

    try {
      await this.prisma.communityPollVote.create({
        data: {
          pollId,
          optionId: input.optionId,
          voterHash: voterHash(key, pollId),
          localityId: input.localityId ?? null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw AppError.conflict('You have already voted in this poll.');
      }
      throw err;
    }
    await this.track('poll_vote', { pollId });

    const [view] = await this.present([poll], key, now);
    return view;
  }

  /** Signed-in view: the overall result plus a per-area breakdown that hides small groups. */
  async insights(pollId: string, now: Date = new Date()) {
    const poll = UUID.test(pollId)
      ? await this.prisma.communityPoll.findUnique({
          where: { id: pollId },
          include: { options: { orderBy: { position: 'asc' } } },
        })
      : null;
    if (!poll || !isPubliclyListed(poll, now)) throw AppError.notFound('Poll not found');

    const rows = await this.prisma.communityPollVote.groupBy({
      by: ['localityId', 'optionId'],
      where: { pollId, localityId: { not: null } },
      _count: { _all: true },
    });
    const ids = [...new Set(rows.map((r) => r.localityId as string))];
    const named = ids.length
      ? await this.prisma.locality.findMany({ where: { id: { in: ids } }, include: { city: true } })
      : [];
    const nameOf = new Map(named.map((l) => [l.id, `${l.name}, ${l.city.name}`]));

    const byLocality = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const counts = byLocality.get(r.localityId as string) ?? {};
      counts[r.optionId] = r._count._all;
      byLocality.set(r.localityId as string, counts);
    }
    const breakdown = buildLocalityBreakdown(
      poll.options,
      [...byLocality].map(([localityId, counts]) => ({ localityId, name: nameOf.get(localityId) ?? 'Unknown area', counts })),
    );

    const [view] = await this.present([poll], undefined, now);
    return {
      id: poll.id,
      question: poll.question,
      phase: view.phase,
      results: view.results,
      byArea: breakdown.shown,
      areasHeldBack: breakdown.hiddenLocalities,
    };
  }

  /** Attach aggregate results and this browser's own vote. Individual votes are never returned. */
  private async present(polls: PollRow[], key: string | undefined, now: Date): Promise<PublicPoll[]> {
    if (polls.length === 0) return [];
    const ids = polls.map((p) => p.id);
    const counts = await this.prisma.communityPollVote.groupBy({
      by: ['optionId'],
      where: { pollId: { in: ids } },
      _count: { _all: true },
    });
    const countOf = new Map(counts.map((c) => [c.optionId, c._count._all]));

    const mine = new Map<string, string>();
    if (key && VOTER_KEY_FORMAT.test(key)) {
      const votes = await this.prisma.communityPollVote.findMany({
        where: { pollId: { in: ids }, voterHash: { in: ids.map((id) => voterHash(key, id)) } },
        select: { pollId: true, optionId: true, voterHash: true },
      });
      for (const v of votes) if (v.voterHash === voterHash(key, v.pollId)) mine.set(v.pollId, v.optionId);
    }

    return polls.map((p) => ({
      id: p.id,
      question: p.question,
      phase: pollPhase(p, now) as 'OPEN' | 'CLOSED',
      opensAt: p.opensAt,
      closesAt: p.closesAt,
      options: p.options.map((o) => ({ id: o.id, label: o.label })),
      results: buildResults(p.options.map((o) => ({ optionId: o.id, label: o.label, count: countOf.get(o.id) ?? 0 }))),
      votedOptionId: mine.get(p.id) ?? null,
    }));
  }

  private async track(name: string, properties: Record<string, unknown>): Promise<void> {
    try {
      await this.prisma.analyticsEvent.create({ data: { name, properties: properties as object } });
    } catch (err) {
      this.logger.warn(`analytics ${name} failed: ${(err as Error).message}`);
    }
  }
}
