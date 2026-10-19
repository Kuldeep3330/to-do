import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { LeadRateLimitGuard } from './lead-rate-limit.guard';
import { AdminVisitListQueryDto, ConfirmVisitDto, CreateVisitDto, MeVisitListQueryDto } from './visits.dto';
import { VisitsService } from './visits.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('api/v1/me/visits')
export class MeVisitsController {
  constructor(private readonly visits: VisitsService) {}

  @RequirePermissions('lead.create')
  @Post()
  @HttpCode(201)
  @UseGuards(LeadRateLimitGuard)
  async create(@CurrentUser() user: { id: string }, @Body() body: CreateVisitDto) {
    return { data: await this.visits.create(user.id, body) };
  }

  @RequirePermissions('visit.read_own')
  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@CurrentUser() user: { id: string }, @Query() query: MeVisitListQueryDto) {
    return this.visits.listMine(user.id, query.page, query.pageSize);
  }

  @RequirePermissions('visit.read_own')
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return { data: await this.visits.cancelMine(user.id, requireUuid(id)) };
  }
}

@Controller('api/v1/admin/visits')
export class AdminVisitsController {
  constructor(private readonly visits: VisitsService) {}

  @RequirePermissions('visit.manage_staff')
  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@CurrentUser() user: { id: string }, @Query() query: AdminVisitListQueryDto) {
    return this.visits.listAdmin(user.id, query);
  }

  @RequirePermissions('visit.manage_staff')
  @Post(':id/confirm')
  @HttpCode(200)
  @Audit('UPDATE_VISIT', 'visit')
  async confirm(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() body: ConfirmVisitDto) {
    return { data: await this.visits.transition(user.id, requireUuid(id), 'confirm', body) };
  }

  @RequirePermissions('visit.manage_staff')
  @Post(':id/complete')
  @HttpCode(200)
  @Audit('UPDATE_VISIT', 'visit')
  async complete(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return { data: await this.visits.transition(user.id, requireUuid(id), 'complete') };
  }

  @RequirePermissions('visit.manage_staff')
  @Post(':id/no-show')
  @HttpCode(200)
  @Audit('UPDATE_VISIT', 'visit')
  async noShow(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return { data: await this.visits.transition(user.id, requireUuid(id), 'no-show') };
  }

  @RequirePermissions('visit.manage_staff')
  @Post(':id/cancel')
  @HttpCode(200)
  @Audit('UPDATE_VISIT', 'visit')
  async cancel(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return { data: await this.visits.transition(user.id, requireUuid(id), 'cancel') };
  }
}

function requireUuid(id: string): string {
  if (!UUID.test(id)) {
    throw AppError.notFound('Visit not found');
  }
  return id;
}
