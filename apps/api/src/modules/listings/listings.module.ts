import { Module } from '@nestjs/common';
import { AdminListingsController, MeListingsController, PublicListingsController } from './listings.controller';
import { ListingFreshnessJob } from './listings.freshness';
import { ListingsService } from './listings.service';

@Module({
  controllers: [AdminListingsController, MeListingsController, PublicListingsController],
  providers: [ListingsService, ListingFreshnessJob],
  exports: [ListingsService],
})
export class ListingsModule {}
