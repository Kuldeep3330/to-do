import { Module } from '@nestjs/common';
import { AdminListingsController, PublicListingsController } from './listings.controller';
import { ListingFreshnessJob } from './listings.freshness';
import { ListingsService } from './listings.service';

@Module({
  controllers: [AdminListingsController, PublicListingsController],
  providers: [ListingsService, ListingFreshnessJob],
  exports: [ListingsService],
})
export class ListingsModule {}
