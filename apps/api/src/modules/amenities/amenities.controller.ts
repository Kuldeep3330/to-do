import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { AmenitiesService } from './amenities.service';
import { CreateAmenityDto, PatchAmenityDto } from './amenities.dto';

@Controller('api/v1/admin/amenities')
export class AmenitiesController {
  constructor(private readonly amenities: AmenitiesService) {}

  @RequirePermissions('property.manage')
  @Get()
  async list() {
    return { data: await this.amenities.list() };
  }

  @RequirePermissions('property.manage')
  @Post()
  @Audit('CREATE_AMENITY', 'amenity')
  async create(@Body() body: CreateAmenityDto) {
    return { data: await this.amenities.create(body) };
  }

  @RequirePermissions('property.manage')
  @Patch(':id')
  @Audit('UPDATE_AMENITY', 'amenity')
  async patch(@Param('id') id: string, @Body() body: PatchAmenityDto) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw AppError.notFound('Amenity not found');
    }
    return { data: await this.amenities.patch(id, body) };
  }
}
