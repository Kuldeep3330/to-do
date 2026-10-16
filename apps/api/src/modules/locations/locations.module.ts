import { Module } from '@nestjs/common';
import { LocationsAdminController, LocationsPublicController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  controllers: [LocationsPublicController, LocationsAdminController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
