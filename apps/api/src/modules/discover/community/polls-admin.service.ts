import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../../../common/errors/app-error';
import { PrismaService } from '../../../prisma/prisma.service';
import { createPollSchema, patchPollSchema } from './polls-admin.dto';
import { pollPhase } from './polls.logic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CreateInput = z.infer<typeof createPollSchema>;
type PatchInput = z.infer<typeof patchPollSchema>;

/**
 * Staff management of polls. Staff see raw aggregate counts for planning, but never individual votes: the table
 * holds no identity, and no endpoint returns a vote row.
 */
@Injectable()
export class PollsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const polls = await this.prisma.communityPoll.findMany({
      include: { options: { orderBy: { position: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const counts = await this.prisma.communityPollVote.groupBy({ by: ['optionId'], _count: { _all: true } });
    const countOf = new Map(counts.map((c) => [c.optionId, c._count._all]));
    const now = new Date();
    return polls.map((p) => {
      const options = p.options.map((o) => ({ id: o.id, label: o.label, count: countOf.get(o.id) ?? 0 }));
      return {
        id: p.id,
        question: p.question,
        status: p.status,
        phase: pollPhase(p, now),
        opensAt: p.opensAt,
        closesAt: p.closesAt,
        options,
        total: options.reduce((sum, o) => sum + o.count, 0),
        createdAt: p.createdAt,
      };
    });
  }

  async create(input: CreateInput) {
    this.assertWindow(input.opensAt ?? null, input.closesAt ?? null);
    const last = await this.prisma.communityPoll.aggregate({ _max: { sortOrder: true } });
    const poll = await this.prisma.communityPoll.create({
      data: {
        question: input.question,
        opensAt: input.opensAt ?? null,
        closesAt: input.closesAt ?? null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        options: { create: input.options.map((label, position) => ({ label, position })) },
      },
    });
    return { id: poll.id };
  }

  /** The question and options are locked once anyone has voted, so earlier votes keep their meaning. */
  async update(id: string, input: PatchInput) {
    const poll = await this.find(id);
    if (poll.status === 'ARCHIVED') throw AppError.conflict('An archived poll cannot be changed.');

    const changesContent = input.question !== undefined || input.options !== undefined;
    if (changesContent && (await this.voteCount(id)) > 0) {
      throw AppError.conflict('This poll already has votes, so its question and options are locked. You can still change the dates.');
    }
    const opensAt = input.opensAt !== undefined ? input.opensAt : poll.opensAt;
    const closesAt = input.closesAt !== undefined ? input.closesAt : poll.closesAt;
    this.assertWindow(opensAt, closesAt);

    await this.prisma.$transaction(async (tx) => {
      await tx.communityPoll.update({
        where: { id },
        data: {
          ...(input.question !== undefined ? { question: input.question } : {}),
          ...(input.opensAt !== undefined ? { opensAt: input.opensAt } : {}),
          ...(input.closesAt !== undefined ? { closesAt: input.closesAt } : {}),
        },
      });
      if (input.options) {
        await tx.communityPollOption.deleteMany({ where: { pollId: id } });
        await tx.communityPollOption.createMany({
          data: input.options.map((label, position) => ({ pollId: id, label, position })),
        });
      }
    });
    return { id };
  }

  async publish(id: string) {
    const poll = await this.find(id);
    if (poll.status !== 'DRAFT') throw AppError.conflict('Only a draft poll can be published.');
    if (poll.options.length < 2) throw AppError.conflict('Add at least 2 options before publishing.');
    if (poll.closesAt && poll.closesAt <= new Date()) {
      throw AppError.conflict('The closing time has already passed. Change it before publishing.');
    }
    await this.prisma.communityPoll.update({ where: { id }, data: { status: 'PUBLISHED' } });
    return { id };
  }

  /** Close now: voting stops immediately and the results stay public. */
  async close(id: string) {
    const poll = await this.find(id);
    if (pollPhase(poll) !== 'OPEN') throw AppError.conflict('Only an open poll can be closed.');
    await this.prisma.communityPoll.update({ where: { id }, data: { closesAt: new Date() } });
    return { id };
  }

  /** Remove from public view. Votes are kept so aggregate history is not lost. */
  async archive(id: string) {
    const poll = await this.find(id);
    if (poll.status === 'ARCHIVED') throw AppError.conflict('This poll is already archived.');
    await this.prisma.communityPoll.update({ where: { id }, data: { status: 'ARCHIVED' } });
    return { id };
  }

  private async find(id: string) {
    const poll = UUID.test(id)
      ? await this.prisma.communityPoll.findUnique({ where: { id }, include: { options: true } })
      : null;
    if (!poll) throw AppError.notFound('Poll not found');
    return poll;
  }

  private voteCount(pollId: string) {
    return this.prisma.communityPollVote.count({ where: { pollId } });
  }

  private assertWindow(opensAt: Date | null, closesAt: Date | null) {
    if (opensAt && closesAt && closesAt <= opensAt) {
      throw AppError.validation('Invalid dates', [{ path: 'closesAt', message: 'Closing time must be after the opening time.' }]);
    }
  }
}
