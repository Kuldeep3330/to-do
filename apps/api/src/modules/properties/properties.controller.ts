import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, PatchPropertyDto, PropertyListQueryDto } from './properties.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('api/v1/admin/properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @RequirePermissions('property.manage')
  @Get()
  async list(@Query() query: PropertyListQueryDto) {
    return this.properties.list(query);
  }

  @RequirePermissions('property.manage')
  @Post()
  @HttpCode(201)
  @Audit('CREATE_PROPERTY', 'property')
  async create(@Body() body: CreatePropertyDto, @CurrentUser() user: AuthUser) {
    return { data: await this.properties.create(body, user.id) };
  }

  @RequirePermissions('property.manage')
  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.properties.get(requireUuid(id)) };
  }

  @RequirePermissions('property.manage')
  @Patch(':id')
  @Audit('UPDATE_PROPERTY', 'property')
  async patch(@Param('id') id: string, @Body() body: PatchPropertyDto) {
    return { data: await this.properties.patch(requireUuid(id), body) };
  }

  @RequirePermissions('property.manage')
  @Post(':id/archive')
  @HttpCode(200)
  @Audit('ARCHIVE_PROPERTY', 'property')
  async archive(@Param('id') id: string) {
    return { data: await this.properties.archive(requireUuid(id)) };
  }
}

@Controller('api/v1/me/properties')
export class MePropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @RequirePermissions('listing.own')
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() query: PropertyListQueryDto) {
    return this.properties.listMine(user.id, query);
  }

  @RequirePermissions('listing.own')
  @Post()
  @HttpCode(201)
  @Audit('CREATE_PROPERTY', 'property')
  async create(@CurrentUser() user: AuthUser, @Body() body: CreatePropertyDto) {
    return { data: await this.properties.create(body, user.id) };
  }

  @RequirePermissions('listing.own')
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.properties.getOwned(requireUuid(id), user.id) };
  }

  @RequirePermissions('listing.own')
  @Patch(':id')
  @Audit('UPDATE_PROPERTY', 'property')
  async patch(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: PatchPropertyDto) {
    return { data: await this.properties.patchOwned(requireUuid(id), user.id, body) };
  }
}

function requireUuid(id: string): string {
  if (!UUID.test(id)) {
    throw AppError.notFound('Property not found');
  }
  return id;
}
