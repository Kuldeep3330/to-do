import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

export type DashboardCounts = {
  /** null when the viewer cannot see listings (sales agents). */
  publishedListings: number | null;
  draftListings: number | null;
  leadsNew: number;
  leadsToday: number;
  leadsTotal: number;
  /** True when lead counts are limited to leads assigned to the viewer. */
  scopedToAssigned: boolean;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async counts(actorId: string): Promise<DashboardCounts> {
    const codes = await this.rbac.getPermissionCodes(actorId);
    const seeAllLeads = codes.includes('lead.read_all');
    const seeListings = codes.includes('listing.manage');
    const leadScope: Prisma.LeadWhereInput = seeAllLeads ? {} : { assignedToUserId: actorId };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [leadsNew, leadsToday, leadsTotal, published, drafts] = await Promise.all([
      this.prisma.lead.count({ where: { ...leadScope, status: 'NEW' } }),
      this.prisma.lead.count({ where: { ...leadScope, createdAt: { gte: startOfDay } } }),
      this.prisma.lead.count({ where: leadScope }),
      seeListings ? this.prisma.listing.count({ where: { status: 'PUBLISHED', deletedAt: null } }) : null,
      seeListings ? this.prisma.listing.count({ where: { status: 'DRAFT', deletedAt: null } }) : null,
    ]);

    return {
      publishedListings: published,
      draftListings: drafts,
      leadsNew,
      leadsToday,
      leadsTotal,
      scopedToAssigned: !seeAllLeads,
    };
  }
}
