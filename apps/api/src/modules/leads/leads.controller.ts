import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { paginationQuerySchema } from '../../common/dto/pagination';
import { createZodDto } from '../../common/dto/zod-dto';
import { LeadRateLimitGuard } from './lead-rate-limit.guard';
import { LeadsService } from './leads.service';
import { AdminLeadListQueryDto, CreateLeadDto, PatchLeadDto } from './leads.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class MeLeadListQueryDto extends createZodDto(paginationQuerySchema) {}

@Controller('api/v1/leads')
export class PublicLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Public()
  @Post()
  @HttpCode(200)
  @UseGuards(LeadRateLimitGuard)
  async create(@Body() body: CreateLeadDto, @CurrentUser() user?: { id: string }) {
    return { data: await this.leads.createPublic(body, user?.id) };
  }
}

@Controller('api/v1/me/leads')
export class MeLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @RequirePermissions('lead.read_own')
  @Get()
  async list(@CurrentUser() user: { id: string }, @Query() query: MeLeadListQueryDto) {
    return this.leads.listMine(user.id, query.page, query.pageSize);
  }

  @RequirePermissions('lead.read_own')
  @Get(':id')
  async get(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return { data: await this.leads.getMine(user.id, requireUuid(id)) };
  }
}

@Controller('api/v1/admin/leads')
export class AdminLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@CurrentUser() user: { id: string }, @Query() query: AdminLeadListQueryDto) {
    return this.leads.listAdmin(user.id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  async get(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return { data: await this.leads.getAdmin(user.id, requireUuid(id)) };
  }

  @Patch(':id')
  @Audit('UPDATE_LEAD', 'lead')
  async patch(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() body: PatchLeadDto,
  ) {
    return { data: await this.leads.patchAdmin(user.id, requireUuid(id), body) };
  }
}

function requireUuid(id: string): string {
  if (!UUID.test(id)) {
    throw AppError.notFound('Lead not found');
  }
  return id;
}
