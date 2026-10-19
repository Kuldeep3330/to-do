import { Module } from '@nestjs/common';
import { AdminLeadsController, MeLeadsController, PublicLeadsController } from './leads.controller';
import { LeadRateLimitGuard } from './lead-rate-limit.guard';
import { LeadsService } from './leads.service';
import { AdminVisitsController, MeVisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  controllers: [
    PublicLeadsController,
    MeLeadsController,
    AdminLeadsController,
    MeVisitsController,
    AdminVisitsController,
  ],
  providers: [LeadsService, VisitsService, LeadRateLimitGuard],
  exports: [LeadsService],
})
export class LeadsModule {}
