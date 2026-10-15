import { Module } from '@nestjs/common';
import { AdminLeadsController, MeLeadsController, PublicLeadsController } from './leads.controller';
import { LeadRateLimitGuard } from './lead-rate-limit.guard';
import { LeadsService } from './leads.service';

@Module({
  controllers: [PublicLeadsController, MeLeadsController, AdminLeadsController],
  providers: [LeadsService, LeadRateLimitGuard],
  exports: [LeadsService],
})
export class LeadsModule {}
