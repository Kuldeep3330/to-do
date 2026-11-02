import { Module } from '@nestjs/common';
import { DiscoverRateLimitGuard } from '../discover-rate-limit.guard';
import { CommunityController } from './community.controller';
import { PollsAdminController } from './polls-admin.controller';
import { PollsAdminService } from './polls-admin.service';
import { PollsService } from './polls.service';

@Module({
  controllers: [CommunityController, PollsAdminController],
  providers: [PollsService, PollsAdminService, DiscoverRateLimitGuard],
  exports: [PollsService],
})
export class CommunityModule {}
