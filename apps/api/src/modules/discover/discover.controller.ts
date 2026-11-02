import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { DiscoverRateLimitGuard } from './discover-rate-limit.guard';
import { SubmitAssessmentDto } from './discover.dto';
import { DiscoverService } from './discover.service';

// Results are private to whoever holds the token: never cache them or leak the URL in a Referer header.
const PRIVATE = 'no-store';

@Controller('api/v1/discover')
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  @Public()
  @Get('assessments')
  @Header('Cache-Control', 'public, max-age=60')
  catalog() {
    return { data: this.discover.catalog() };
  }

  @Public()
  @Get('assessments/:slug')
  @Header('Cache-Control', 'public, max-age=60')
  definition(@Param('slug') slug: string) {
    return { data: this.discover.definition(slug) };
  }

  @Public()
  @Post('assessments/:slug/start')
  @HttpCode(200)
  @UseGuards(DiscoverRateLimitGuard)
  async start(@Param('slug') slug: string) {
    await this.discover.recordStart(slug);
    return { data: { ok: true } };
  }

  /** Anonymous by default. A signed-in user may opt in to saving the result with `saveToAccount`. */
  @Public()
  @Post('assessments/:slug/responses')
  @HttpCode(200)
  @UseGuards(DiscoverRateLimitGuard)
  @Header('Cache-Control', PRIVATE)
  async submit(
    @Param('slug') slug: string,
    @Body() body: SubmitAssessmentDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return { data: await this.discover.submit(slug, body, req.user?.id) };
  }

  @Public()
  @Get('results/:token')
  @UseGuards(DiscoverRateLimitGuard)
  @Header('Cache-Control', PRIVATE)
  @Header('Referrer-Policy', 'no-referrer')
  async result(@Param('token') token: string) {
    return { data: await this.discover.getByToken(token) };
  }

  @Post('results/:token/claim')
  @HttpCode(200)
  @Header('Cache-Control', PRIVATE)
  async claim(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return { data: await this.discover.claim(token, user.id) };
  }

  @Get('me/profile')
  @Header('Cache-Control', PRIVATE)
  async profile(@CurrentUser() user: AuthUser) {
    return { data: await this.discover.myProfile(user.id) };
  }

  @Delete('me')
  @HttpCode(200)
  async deleteMine(@CurrentUser() user: AuthUser) {
    return { data: await this.discover.deleteMine(user.id) };
  }
}
