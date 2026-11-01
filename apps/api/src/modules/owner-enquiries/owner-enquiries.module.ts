import { Module } from '@nestjs/common';
import { LeadRateLimitGuard } from '../leads/lead-rate-limit.guard';
import { OwnerEnquiriesController } from './owner-enquiries.controller';
import { OwnerEnquiriesService } from './owner-enquiries.service';

@Module({
  controllers: [OwnerEnquiriesController],
  providers: [OwnerEnquiriesService, LeadRateLimitGuard],
})
export class OwnerEnquiriesModule {}
