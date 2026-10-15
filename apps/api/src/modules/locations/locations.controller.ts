import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { LocationsService } from './locations.service';
import { CreateCityDto, CreateLocalityDto, PatchCityDto, PatchLocalityDto } from './locations.dto';

@Controller('api/v1')
export class LocationsPublicController {
  constructor(private readonly locations: LocationsService) {}

  @Public()
  @Get('cities')
  @Header('Cache-Control', 'public, max-age=60')
  async cities() {
    return { data: await this.locations.listPublicCities() };
  }

  @Public()
  @Get('cities/:citySlug/localities')
  @Header('Cache-Control', 'public, max-age=60')
  async localities(@Param('citySlug') citySlug: string) {
    return { data: await this.locations.listPublicLocalities(citySlug) };
  }
}

@Controller('api/v1/admin')
export class LocationsAdminController {
  constructor(private readonly locations: LocationsService) {}

  @RequirePermissions('location.manage')
  @Get('cities')
  async cities() {
    return { data: await this.locations.listAdminCities() };
  }

  @RequirePermissions('location.manage')
  @Post('cities')
  @Audit('CREATE_CITY', 'city')
  async createCity(@Body() body: CreateCityDto) {
    const data = await this.locations.createCity(body);
    return { data };
  }

  @RequirePermissions('location.manage')
  @Patch('cities/:id')
  @Audit('UPDATE_CITY', 'city')
  async patchCity(@Param('id') id: string, @Body() body: PatchCityDto) {
    if (!isUuid(id)) {
      throw AppError.notFound('City not found');
    }
    const data = await this.locations.patchCity(id, body);
    return { data };
  }

  @RequirePermissions('location.manage')
  @Get('localities')
  async localities(@Query('cityId') cityId?: string) {
    if (cityId && !isUuid(cityId)) {
      throw AppError.validation('Invalid cityId');
    }
    return { data: await this.locations.listAdminLocalities(cityId) };
  }

  @RequirePermissions('location.manage')
  @Post('localities')
  @Audit('CREATE_LOCALITY', 'locality')
  async createLocality(@Body() body: CreateLocalityDto) {
    const data = await this.locations.createLocality(body);
    return { data };
  }

  @RequirePermissions('location.manage')
  @Patch('localities/:id')
  @Audit('UPDATE_LOCALITY', 'locality')
  async patchLocality(@Param('id') id: string, @Body() body: PatchLocalityDto) {
    if (!isUuid(id)) {
      throw AppError.notFound('Locality not found');
    }
    const data = await this.locations.patchLocality(id, body);
    return { data };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
