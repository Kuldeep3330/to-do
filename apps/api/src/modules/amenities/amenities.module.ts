import { Module } from '@nestjs/common';
import { AmenitiesController, PublicAmenitiesController } from './amenities.controller';
import { AmenitiesService } from './amenities.service';

@Module({
  controllers: [AmenitiesController, PublicAmenitiesController],
  providers: [AmenitiesService],
  exports: [AmenitiesService],
})
export class AmenitiesModule {}
