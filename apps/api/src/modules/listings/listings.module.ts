import { Module } from '@nestjs/common';
import { AdminListingsController, PublicListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  controllers: [AdminListingsController, PublicListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
