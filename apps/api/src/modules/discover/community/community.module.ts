import { Module } from '@nestjs/common';
import { DiscoverRateLimitGuard } from '../discover-rate-limit.guard';
import { CommunityController } from './community.controller';
import { PollsService } from './polls.service';

@Module({
  controllers: [CommunityController],
  providers: [PollsService, DiscoverRateLimitGuard],
  exports: [PollsService],
})
export class CommunityModule {}
