import { Module } from '@nestjs/common';
import { DiscoverRateLimitGuard } from './discover-rate-limit.guard';
import { DiscoverController } from './discover.controller';
import { DiscoverService } from './discover.service';

@Module({
  controllers: [DiscoverController],
  providers: [DiscoverService, DiscoverRateLimitGuard],
})
export class DiscoverModule {}
