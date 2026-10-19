import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { offsetOf } from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FeeRulesService } from '../finance/fee-rules.service';
import { computeFee } from '../finance/fees.compute';
import { toAdminLead, toCustomerLead } from './leads.mapper';
import { overdueCutoff } from './leads.sla';
import { todayIst } from './visits.service';
import {
  AdminLeadListQueryDto,
  createLeadSchema,
  patchLeadSchema,
} from './leads.dto';

type CreateLeadInput = z.infer<typeof createLeadSchema>;
type PatchLeadInput = z.infer<typeof patchLeadSchema>;

const DUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const DUP_EXCLUDED: Array<'SPAM' | 'LOST' | 'WON'> = ['SPAM', 'LOST', 'WON'];

const LISTING_SELECT = {
  id: true,
  slug: true,
  title: true,
  intent: true,
  status: true,
} as const;

const ASSIGNEE_SELECT = { id: true, name: true, email: true } as const;

const ADMIN_INCLUDE = {
  listing: { select: LISTING_SELECT },
  assignee: { select: ASSIGNEE_SELECT },
} as const;

const CUSTOMER_INCLUDE = {
  listing: { select: LISTING_SELECT },
} as const;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly notifications: NotificationsService,
    private readonly feeRules: FeeRulesService,
  ) {}

  async createPublic(input: CreateLeadInput, userId: string | undefined) {
    const listing = await this.resolvePublishedListing(input);
    const since = new Date(Date.now() - DUP_WINDOW_MS);
    const result = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.lead.findFirst({
          where: {
            phone: input.phone,
            listingId: listing.id,
            createdAt: { gte: since },
            status: { notIn: DUP_EXCLUDED },
          },
          include: { listing: { select: LISTING_SELECT } },
        });
        if (existing) {
          return { duplicate: true as const, lead: existing };
        }
        const lead = await tx.lead.create({
          data: {
            listingId: listing.id,
            userId: userId ?? null,
            name: input.name,
            phone: input.phone,
            email: input.email ?? null,
            message: input.message ?? null,
            status: 'NEW',
            source: 'WEB_FORM',
          },
          include: { listing: { select: LISTING_SELECT } },
        });
        return { duplicate: false as const, lead };
      },
      { timeout: 5000 },
    );

    if (!result.duplicate) {
      try {
        await this.prisma.analyticsEvent.create({
          data: {
            name: 'lead_created',
            listingId: listing.id,
            userId: userId ?? null,
            properties: { source: 'WEB_FORM' },
          },
        });
      } catch (err) {
        this.logger.warn(`lead_created analytics failed: ${(err as Error).message}`);
      }
      try {
        await this.notifications.notifyLeadCreated({
          name: result.lead.name,
          phone: result.lead.phone,
          email: result.lead.email,
          listingTitle: listing.title,
          listingSlug: listing.slug,
        });
      } catch (err) {
        this.logger.warn(`lead email failed: ${(err as Error).message}`);
      }
    }

    return { ok: true as const };
  }

  async listMine(userId: string, page: number, pageSize: number) {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: CUSTOMER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: offsetOf(page, pageSize),
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return {
      data: rows.map(toCustomerLead),
      meta: { page, pageSize, total },
    };
  }

  async getMine(userId: string, id: string) {
    const row = await this.prisma.lead.findFirst({
      where: { id, userId },
      include: CUSTOMER_INCLUDE,
    });
    if (!row) {
      throw AppError.notFound('Lead not found');
    }
    return toCustomerLead(row);
  }

  async listAdmin(actorId: string, query: AdminLeadListQueryDto) {
    const codes = await this.rbac.getPermissionCodes(actorId);
    const where: Prisma.LeadWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedTo ? { assignedToUserId: query.assignedTo } : {}),
      ...(query.overdue
        ? { status: 'NEW' as const, firstResponseAt: null, createdAt: { lt: overdueCutoff() } }
        : {}),
    };
    if (!codes.includes('lead.read_all')) {
      if (!codes.includes('lead.read_assigned')) {
        throw AppError.forbidden();
      }
      where.assignedToUserId = actorId;
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: ADMIN_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: offsetOf(query.page, query.pageSize),
        take: query.pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);
    return {
      data: rows.map((r) => toAdminLead(r, new Date(), codes.includes('finance.read'))),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getAdmin(actorId: string, id: string) {
    const codes = await this.rbac.getPermissionCodes(actorId);
    const where: Prisma.LeadWhereInput = { id };
    if (!codes.includes('lead.read_all')) {
      if (!codes.includes('lead.read_assigned')) {
        throw AppError.forbidden();
      }
      where.assignedToUserId = actorId;
    }
    const row = await this.prisma.lead.findFirst({
      where,
      include: ADMIN_INCLUDE,
    });
    if (!row) {
      throw AppError.notFound('Lead not found');
    }
    return toAdminLead(row, new Date(), codes.includes('finance.read'));
  }

  async patchAdmin(actorId: string, id: string, input: PatchLeadInput) {
    const dealFields =
      input.closedAmount !== undefined || input.closedOn !== undefined || input.feeAmount !== undefined;
    if (input.status === undefined && input.assignedToUserId === undefined && !dealFields) {
      throw AppError.validation('Nothing to update');
    }
    const codes = await this.rbac.getPermissionCodes(actorId);
    if (input.assignedToUserId !== undefined && !codes.includes('lead.assign')) {
      throw AppError.forbidden();
    }
    const canUpdateAll = codes.includes('lead.update_all');
    const canUpdateAssigned = codes.includes('lead.update_assigned');
    if ((input.status !== undefined || dealFields) && !canUpdateAll && !canUpdateAssigned) {
      throw AppError.forbidden();
    }
    const current = await this.prisma.lead.findFirst({
      where: canUpdateAll || codes.includes('lead.read_all') ? { id } : { id, assignedToUserId: actorId },
      include: ADMIN_INCLUDE,
    });
    if (!current) {
      throw AppError.notFound('Lead not found');
    }
    if (input.status !== undefined && !canUpdateAll && current.assignedToUserId !== actorId) {
      throw AppError.notFound('Lead not found');
    }
    if (input.assignedToUserId) {
      await this.assertAssignable(input.assignedToUserId);
    }
    // Only people who manage finance may set the fee by hand; everyone else gets the rule's amount.
    if (input.feeAmount !== undefined && !codes.includes('finance.manage')) {
      throw AppError.forbidden();
    }
    const deal = await this.resolveDeal(current, input);
    const row = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        // First move out of NEW is the response the customer was promised.
        ...(input.status !== undefined && input.status !== 'NEW' && !current.firstResponseAt
          ? { firstResponseAt: new Date() }
          : {}),
        ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
        ...deal,
      },
      include: ADMIN_INCLUDE,
    });
    return toAdminLead(row, new Date(), codes.includes('finance.read'));
  }

  /**
   * Deal tracking rules: a lead cannot be marked won without its closing value, deal details only
   * exist on won leads, and moving a lead away from won clears them.
   *
   * The fee NCR Homes earns is worked out here too: from the fee rule when the deal is recorded or
   * its amount changes, or the exact figure an admin typed. A past deal's fee is never recomputed
   * just because the rule changed later.
   */
  private async resolveDeal(
    current: {
      status: string;
      createdAt: Date;
      closedAmount?: bigint | null;
      closedOn?: Date | null;
      feeAmount?: bigint | null;
      listing?: { intent: string } | null;
    },
    input: PatchLeadInput,
  ): Promise<{ closedAmount?: bigint | null; closedOn?: Date | null; feeAmount?: bigint | null }> {
    const next = input.status ?? current.status;
    const hasDeal =
      input.closedAmount !== undefined || input.closedOn !== undefined || input.feeAmount !== undefined;

    if (next !== 'WON') {
      if (hasDeal) {
        throw AppError.validation('Deal details can only be set on a won lead', [
          { path: 'closedAmount', message: 'Mark the lead as won first' },
        ]);
      }
      return current.status === 'WON' ? { closedAmount: null, closedOn: null, feeAmount: null } : {};
    }

    const amount = input.closedAmount ?? (current.closedAmount != null ? Number(current.closedAmount) : undefined);
    if (amount === undefined) {
      throw AppError.validation('Closing value is required to mark a lead as won', [
        { path: 'closedAmount', message: 'Enter the rent or sale price agreed' },
      ]);
    }

    const today = todayIst();
    const existingDay = current.closedOn ? current.closedOn.toISOString().slice(0, 10) : undefined;
    const day = input.closedOn ?? existingDay ?? today;
    const parsed = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
      throw AppError.validation('Invalid date', [{ path: 'closedOn', message: 'Not a real calendar date' }]);
    }
    if (day > today) {
      throw AppError.validation('Closing date is in the future', [
        { path: 'closedOn', message: 'A deal cannot close in the future' },
      ]);
    }
    const createdDay = todayIst(current.createdAt);
    if (day < createdDay) {
      throw AppError.validation('Closing date is before the enquiry', [
        { path: 'closedOn', message: `Choose ${createdDay} or later` },
      ]);
    }
    const result: { closedAmount: bigint; closedOn: Date; feeAmount?: bigint | null } = {
      closedAmount: BigInt(amount),
      closedOn: parsed,
    };

    if (input.feeAmount !== undefined) {
      result.feeAmount = BigInt(input.feeAmount);
    } else {
      const amountChanged = current.status !== 'WON' || BigInt(amount) !== (current.closedAmount ?? null);
      if (amountChanged || current.feeAmount == null) {
        const intent = current.listing?.intent === 'RENT' || current.listing?.intent === 'BUY' ? current.listing.intent : null;
        const fee = intent ? computeFee(await this.feeRules.forIntent(intent), amount) : null;
        result.feeAmount = fee === null ? null : BigInt(fee);
      }
    }
    return result;
  }

  private async assertAssignable(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: 'ACTIVE' },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      throw AppError.validation('Assignee not found', [
        { path: 'assignedToUserId', message: 'User does not exist' },
      ]);
    }
    const roleCodes = user.roles.map((r) => r.role.code);
    if (!this.rbac.isStaff(roleCodes)) {
      throw AppError.validation('Assignee must be staff', [
        { path: 'assignedToUserId', message: 'Assignee must be staff' },
      ]);
    }
  }

  private async resolvePublishedListing(input: CreateLeadInput) {
    const where = input.listingId
      ? { id: input.listingId }
      : { slug: input.listingSlug as string };
    const listing = await this.prisma.listing.findFirst({
      where: {
        ...where,
        status: 'PUBLISHED',
        deletedAt: null,
        property: { deletedAt: null },
      },
      select: { id: true, slug: true, title: true },
    });
    if (!listing) {
      throw AppError.notFound('Listing not found');
    }
    return listing;
  }
}
