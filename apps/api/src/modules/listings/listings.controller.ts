import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { ListingsService } from './listings.service';
import {
  AdminListingListQueryDto,
  CreateListingDto,
  PatchListingDto,
  SearchListingsQueryDto,
} from './listings.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('api/v1/admin/listings')
export class AdminListingsController {
  constructor(private readonly listings: ListingsService) {}

  @RequirePermissions('listing.manage')
  @Get()
  async list(@Query() query: AdminListingListQueryDto) {
    return this.listings.listAdmin(query);
  }

  @RequirePermissions('listing.manage')
  @Post()
  @HttpCode(201)
  @Audit('CREATE_LISTING', 'listing')
  async create(@Body() body: CreateListingDto) {
    return { data: await this.listings.create(body) };
  }

  @RequirePermissions('listing.manage')
  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.listings.getAdmin(requireUuid(id)) };
  }

  @RequirePermissions('listing.manage')
  @Patch(':id')
  @Audit('UPDATE_LISTING', 'listing')
  async patch(@Param('id') id: string, @Body() body: PatchListingDto) {
    return { data: await this.listings.patch(requireUuid(id), body) };
  }

  @RequirePermissions('listing.manage')
  @Post(':id/publish')
  @HttpCode(200)
  @Audit('PUBLISH_LISTING', 'listing')
  async publish(@Param('id') id: string) {
    return { data: await this.listings.publish(requireUuid(id)) };
  }

  @RequirePermissions('listing.manage')
  @Post(':id/pause')
  @HttpCode(200)
  @Audit('PAUSE_LISTING', 'listing')
  async pause(@Param('id') id: string) {
    return { data: await this.listings.pause(requireUuid(id)) };
  }

  @RequirePermissions('listing.manage')
  @Post(':id/close')
  @HttpCode(200)
  @Audit('CLOSE_LISTING', 'listing')
  async close(@Param('id') id: string) {
    return { data: await this.listings.close(requireUuid(id)) };
  }
}

@Controller('api/v1/listings')
export class PublicListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  async search(@Query() query: SearchListingsQueryDto) {
    return this.listings.searchPublic(query);
  }

  @Public()
  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return { data: await this.listings.getPublicBySlug(slug) };
  }
}

function requireUuid(id: string): string {
  if (!UUID.test(id)) {
    throw AppError.notFound('Listing not found');
  }
  return id;
}
