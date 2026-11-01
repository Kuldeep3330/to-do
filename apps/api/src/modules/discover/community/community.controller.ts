import { Body, Controller, Get, Header, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { z } from 'zod';
import { createZodDto } from '../../../common/dto/zod-dto';
import { baseCookie } from '../../auth/auth.cookies';
import { DiscoverRateLimitGuard } from '../discover-rate-limit.guard';
import { PollsService, VOTER_KEY_FORMAT } from './polls.service';

/** Random, httpOnly browser key used only to reduce repeat voting. It carries no identity. */
export const VOTER_COOKIE = 'ncr_voter';
const VOTER_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const voteSchema = z
  .object({ optionId: z.string().uuid(), localityId: z.string().uuid().optional() })
  .strict();

export class VoteDto extends createZodDto(voteSchema) {}

@Controller('api/v1/community/polls')
export class CommunityController {
  constructor(private readonly polls: PollsService) {}

  @Public()
  @Get()
  @UseGuards(DiscoverRateLimitGuard)
  @Header('Cache-Control', 'private, no-store')
  async list(@Req() req: Request) {
    return { data: await this.polls.listPublic(voterKey(req)) };
  }

  @Public()
  @Post(':id/vote')
  @HttpCode(200)
  @UseGuards(DiscoverRateLimitGuard)
  @Header('Cache-Control', 'private, no-store')
  async vote(
    @Param('id') id: string,
    @Body() body: VoteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let key = voterKey(req);
    if (!key) {
      key = randomBytes(24).toString('base64url');
      res.cookie(VOTER_COOKIE, key, { ...baseCookie(), maxAge: VOTER_TTL_MS });
    }
    return { data: await this.polls.vote(id, body, key) };
  }

  /** Registered users only (no @Public): the per-area breakdown. */
  @Get(':id/insights')
  @Header('Cache-Control', 'private, no-store')
  async insights(@Param('id') id: string) {
    return { data: await this.polls.insights(id) };
  }
}

function voterKey(req: Request): string | undefined {
  const raw = (req.cookies as Record<string, string> | undefined)?.[VOTER_COOKIE];
  return raw && VOTER_KEY_FORMAT.test(raw) ? raw : undefined;
}
