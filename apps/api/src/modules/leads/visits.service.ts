import { Injectable, Logger } from '@nestjs/common';
import { Prisma, VisitStatus } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { offsetOf } from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RbacService } from '../rbac/rbac.service';
import { AdminVisitListQueryDto, confirmVisitSchema, createVisitSchema } from './visits.dto';
import { toAdminVisit, toCustomerVisit } from './visits.mapper';

type CreateVisitInput = z.infer<typeof createVisitSchema>;
type ConfirmVisitInput = z.infer<typeof confirmVisitSchema>;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MAX_DAYS_AHEAD = 30;
/** Lead statuses that are over: a visit request must open a fresh lead rather than reuse these. */
const CLOSED_LEAD: Array<'SPAM' | 'LOST' | 'WON' | 'UNQUALIFIED'> = ['SPAM', 'LOST', 'WON', 'UNQUALIFIED'];
const OPEN_VISIT: VisitStatus[] = ['REQUESTED', 'CONFIRMED'];

/** Allowed staff transitions (doc 05 section 7.3). */
const TRANSITIONS: Record<'confirm' | 'complete' | 'no-show' | 'cancel', { from: VisitStatus[]; to: VisitStatus }> = {
  confirm: { from: ['REQUESTED'], to: 'CONFIRMED' },
  complete: { from: ['CONFIRMED'], to: 'COMPLETED' },
  'no-show': { from: ['CONFIRMED'], to: 'NO_SHOW' },
  cancel: { from: ['REQUESTED', 'CONFIRMED'], to: 'CANCELLED' },
};
export type VisitCommand = keyof typeof TRANSITIONS;

const INCLUDE_CUSTOMER = {
  listing: { select: { id: true, slug: true, title: true, intent: true } },
} as const;

const INCLUDE_ADMIN = {
  ...INCLUDE_CUSTOMER,
  lead: {
    select: {
      id: true,
      name: true,
      phone: true,
      assignee: { select: { id: true, name: true } },
    },
  },
} as const;

/** Today's calendar date in India, as YYYY-MM-DD. */
export function todayIst(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function assertDateWindow(date: string | undefined, now = new Date()): void {
  if (!date) return;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw AppError.validation('Invalid date', [{ path: 'preferredDate', message: 'Not a real calendar date' }]);
  }
  const today = todayIst(now);
  const last = todayIst(new Date(now.getTime() + MAX_DAYS_AHEAD * 86_400_000));
  if (date < today || date > last) {
    throw AppError.validation('Date out of range', [
      { path: 'preferredDate', message: `Choose a date between today and ${last}` },
    ]);
  }
}

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, input: CreateVisitInput) {
    assertDateWindow(input.preferredDate);

    const [user, listing] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.listing.findFirst({
        where: { id: input.listingId, status: 'PUBLISHED', deletedAt: null, property: { deletedAt: null } },
        select: { id: true, slug: true, title: true },
      }),
    ]);
    if (!user) {
      throw AppError.forbidden();
    }
    if (!listing) {
      throw AppError.notFound('Listing not found');
    }

    const visit = await this.prisma.$transaction(
      async (tx) => {
        const already = await tx.visit.findFirst({
          where: { listingId: listing.id, status: { in: OPEN_VISIT }, lead: { userId } },
          select: { id: true },
        });
        if (already) {
          throw AppError.conflict('You already have a visit request for this home');
        }
        // Reuse the customer's open enquiry for this listing so the inbox stays the single source of truth.
        let lead = await tx.lead.findFirst({
          where: { userId, listingId: listing.id, status: { notIn: CLOSED_LEAD } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (!lead) {
          lead = await tx.lead.create({
            data: {
              listingId: listing.id,
              userId,
              name: user.name,
              phone: user.phone,
              email: user.email,
              message: 'Visit request',
              status: 'NEW',
              source: 'WEB_FORM',
            },
            select: { id: true },
          });
        }
        return tx.visit.create({
          data: {
            leadId: lead.id,
            listingId: listing.id,
            preferredDate: input.preferredDate ? new Date(`${input.preferredDate}T00:00:00.000Z`) : null,
            preferredSlot: input.preferredSlot,
            notes: input.notes || null,
          },
          include: INCLUDE_CUSTOMER,
        });
      },
      { timeout: 5000 },
    );

    try {
      await this.prisma.analyticsEvent.create({
        data: { name: 'visit_requested', listingId: listing.id, userId, properties: { slot: input.preferredSlot } },
      });
    } catch (err) {
      this.logger.warn(`visit_requested analytics failed: ${(err as Error).message}`);
    }
    try {
      await this.notifications.notifyVisitRequested({
        name: user.name,
        phone: user.phone,
        listingTitle: listing.title,
        listingSlug: listing.slug,
        preferredDate: input.preferredDate ?? null,
        preferredSlot: input.preferredSlot,
      });
    } catch (err) {
      this.logger.warn(`visit email failed: ${(err as Error).message}`);
    }
    return toCustomerVisit(visit);
  }

  async listMine(userId: string, page: number, pageSize: number) {
    const where: Prisma.VisitWhereInput = { lead: { userId } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
        where,
        include: INCLUDE_CUSTOMER,
        orderBy: { createdAt: 'desc' },
        skip: offsetOf(page, pageSize),
        take: pageSize,
      }),
      this.prisma.visit.count({ where }),
    ]);
    return { data: rows.map(toCustomerVisit), meta: { page, pageSize, total } };
  }

  /** Customers may cancel their own request only while it is still REQUESTED. */
  async cancelMine(userId: string, id: string) {
    const visit = await this.prisma.visit.findFirst({ where: { id, lead: { userId } }, select: { id: true } });
    if (!visit) {
      throw AppError.notFound('Visit not found');
    }
    const res = await this.prisma.visit.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { status: 'CANCELLED' },
    });
    if (res.count === 0) {
      throw AppError.conflict('Only requested visits can be cancelled');
    }
    return toCustomerVisit(await this.prisma.visit.findUniqueOrThrow({ where: { id }, include: INCLUDE_CUSTOMER }));
  }

  async listAdmin(actorId: string, query: AdminVisitListQueryDto) {
    const where = await this.scope(actorId);
    if (query.status) {
      where.status = query.status;
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
        where,
        include: INCLUDE_ADMIN,
        orderBy: [{ preferredDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: offsetOf(query.page, query.pageSize),
        take: query.pageSize,
      }),
      this.prisma.visit.count({ where }),
    ]);
    return { data: rows.map(toAdminVisit), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async transition(actorId: string, id: string, command: VisitCommand, input: ConfirmVisitInput = {}) {
    const rule = TRANSITIONS[command];
    if (command === 'confirm') {
      assertDateWindow(input.preferredDate);
    }
    const scope = await this.scope(actorId);
    const current = await this.prisma.visit.findFirst({ where: { ...scope, id }, select: { id: true, leadId: true } });
    if (!current) {
      throw AppError.notFound('Visit not found');
    }

    const row = await this.prisma.$transaction(
      async (tx) => {
        const res = await tx.visit.updateMany({
          where: { id, status: { in: rule.from } },
          data: {
            status: rule.to,
            ...(command === 'confirm' && input.preferredDate
              ? { preferredDate: new Date(`${input.preferredDate}T00:00:00.000Z`) }
              : {}),
            ...(command === 'confirm' && input.preferredSlot ? { preferredSlot: input.preferredSlot } : {}),
          },
        });
        if (res.count === 0) {
          throw AppError.conflict(`Cannot ${command} a visit in its current status`);
        }
        if (rule.to === 'CONFIRMED') {
          await tx.lead.updateMany({
            where: { id: current.leadId, firstResponseAt: null },
            data: { firstResponseAt: new Date() },
          });
          // Only move the lead forward; never resurrect a finished one.
          await tx.lead.updateMany({
            where: { id: current.leadId, status: { notIn: [...CLOSED_LEAD, 'VISIT_SCHEDULED'] } },
            data: { status: 'VISIT_SCHEDULED' },
          });
        }
        return tx.visit.findUniqueOrThrow({ where: { id }, include: INCLUDE_ADMIN });
      },
      { timeout: 5000 },
    );
    return toAdminVisit(row);
  }

  /** Admins (lead.read_all) see every visit; agents only those on leads assigned to them. */
  private async scope(actorId: string): Promise<Prisma.VisitWhereInput> {
    const codes = await this.rbac.getPermissionCodes(actorId);
    if (codes.includes('lead.read_all')) {
      return {};
    }
    if (codes.includes('lead.read_assigned')) {
      return { lead: { assignedToUserId: actorId } };
    }
    throw AppError.forbidden();
  }
}
