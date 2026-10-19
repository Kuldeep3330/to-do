import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { median, overdueCutoff, slaMinutes } from '../leads/leads.sla';
import { todayIst } from '../leads/visits.service';
import { RbacService } from '../rbac/rbac.service';

export type DashboardCounts = {
  /** null when the viewer cannot see listings (sales agents). */
  publishedListings: number | null;
  draftListings: number | null;
  leadsNew: number;
  leadsToday: number;
  leadsTotal: number;
  /** New leads still waiting past the response target. */
  leadsOverdue: number;
  /** Leads won with a closing date in the last 30 days. */
  dealsWon: number;
  /** Deals won as a share of leads created in the same 30 days; null when there were none. Approximate: they are not the same people. */
  winRatePercent: number | null;
  /** Sum of agreed monthly rents on won rentals (INR per month). */
  wonRentMonthly: number;
  /** Sum of agreed prices on won sales (INR). */
  wonSaleValue: number;
  /** What NCR Homes earned on deals closed in the last 30 days (INR). Null for viewers without finance access. */
  feesEarned: number | null;
  /** Won deals in that period that have no fee yet because no fee rule applied. Null without finance access. */
  dealsWithoutFee: number | null;
  /** The response target in minutes. */
  responseTargetMinutes: number;
  /** Median minutes to first response over the last 30 days; null when nothing has been answered yet. */
  medianResponseMinutes: number | null;
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

    const since = new Date(Date.now() - 30 * 86_400_000);
    const sinceDay = new Date(`${todayIst(since)}T00:00:00.000Z`);

    const [leadsNew, leadsToday, leadsTotal, published, drafts, overdue, answered, won, recentLeads] = await Promise.all([
      this.prisma.lead.count({ where: { ...leadScope, status: 'NEW' } }),
      this.prisma.lead.count({ where: { ...leadScope, createdAt: { gte: startOfDay } } }),
      this.prisma.lead.count({ where: leadScope }),
      seeListings ? this.prisma.listing.count({ where: { status: 'PUBLISHED', deletedAt: null } }) : null,
      seeListings ? this.prisma.listing.count({ where: { status: 'DRAFT', deletedAt: null } }) : null,
      this.prisma.lead.count({
        where: { ...leadScope, status: 'NEW', firstResponseAt: null, createdAt: { lt: overdueCutoff() } },
      }),
      this.prisma.lead.findMany({
        where: { ...leadScope, firstResponseAt: { not: null }, createdAt: { gte: since } },
        select: { createdAt: true, firstResponseAt: true },
        take: 1000,
      }),
      this.prisma.lead.findMany({
        where: { ...leadScope, status: 'WON', closedAmount: { not: null }, closedOn: { gte: sinceDay } },
        select: { closedAmount: true, feeAmount: true, listing: { select: { intent: true } } },
        take: 5000,
      }),
      this.prisma.lead.count({ where: { ...leadScope, createdAt: { gte: since } } }),
    ]);

    let wonRentMonthly = 0;
    let wonSaleValue = 0;
    let feesEarned = 0;
    let dealsWithoutFee = 0;
    for (const w of won) {
      if (w.feeAmount == null) dealsWithoutFee += 1;
      else feesEarned += Number(w.feeAmount);
      const amount = Number(w.closedAmount);
      if (w.listing?.intent === 'RENT') wonRentMonthly += amount;
      else wonSaleValue += amount;
    }

    const minutes = answered.map((l) =>
      Math.max(0, Math.round(((l.firstResponseAt as Date).getTime() - l.createdAt.getTime()) / 60_000)),
    );

    return {
      publishedListings: published,
      draftListings: drafts,
      leadsNew,
      leadsToday,
      leadsTotal,
      leadsOverdue: overdue,
      dealsWon: won.length,
      winRatePercent: recentLeads === 0 ? null : Math.round((won.length / recentLeads) * 100),
      wonRentMonthly,
      wonSaleValue,
      feesEarned: codes.includes('finance.read') ? feesEarned : null,
      dealsWithoutFee: codes.includes('finance.read') ? dealsWithoutFee : null,
      responseTargetMinutes: slaMinutes(),
      medianResponseMinutes: median(minutes),
      scopedToAssigned: !seeAllLeads,
    };
  }
}
