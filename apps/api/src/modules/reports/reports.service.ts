import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { buildFeeReport, buildReport, istDay, type FeeReport, type Report } from './reports.compute';

export const MAX_RANGE_DAYS = 366;
/** A safety cap on rows read for one report; the pilot is far below it. */
const ROW_CAP = 50_000;

export type ReportsResponse = {
  from: string;
  to: string;
  days: number;
  report: Report;
  /** Only present for people who may see money (finance.read). */
  fees: FeeReport | null;
};

function startOfIstDay(day: string): Date {
  return new Date(`${day}T00:00:00+05:30`);
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  /** Resolves the window: defaults to the last 30 days in India time, and refuses anything backwards or longer than a year. */
  resolveRange(from: string | undefined, to: string | undefined, now = new Date()): { from: string; to: string; days: number } {
    const end = to ?? istDay(now);
    const start = from ?? istDay(new Date(Date.parse(`${end}T00:00:00Z`) - 29 * 86_400_000));
    for (const [path, v] of [['from', start], ['to', end]] as const) {
      if (Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
        throw AppError.validation('Invalid date', [{ path, message: 'Not a real calendar date' }]);
      }
    }
    if (start > end) {
      throw AppError.validation('Invalid range', [{ path: 'from', message: 'The start date must not be after the end date' }]);
    }
    const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
    if (days > MAX_RANGE_DAYS) {
      throw AppError.validation('Range too long', [{ path: 'from', message: `Choose at most ${MAX_RANGE_DAYS} days` }]);
    }
    return { from: start, to: end, days };
  }

  async get(actorId: string, fromIn?: string, toIn?: string): Promise<ReportsResponse> {
    const { from, to, days } = this.resolveRange(fromIn, toIn);
    const codes = await this.rbac.getPermissionCodes(actorId);

    const rows = await this.prisma.lead.findMany({
      where: { createdAt: { gte: startOfIstDay(from), lt: new Date(startOfIstDay(to).getTime() + 86_400_000) } },
      select: {
        createdAt: true,
        status: true,
        source: true,
        firstResponseAt: true,
        assignee: { select: { id: true, name: true } },
        visits: { select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
      take: ROW_CAP,
    });
    const report = buildReport(
      rows.map((r) => ({
        createdAt: r.createdAt,
        status: r.status,
        source: r.source,
        firstResponseAt: r.firstResponseAt,
        assigneeId: r.assignee?.id ?? null,
        assigneeName: r.assignee?.name ?? null,
        hasVisit: r.visits.length > 0,
      })),
      from,
      to,
    );

    let fees: FeeReport | null = null;
    if (codes.includes('finance.read')) {
      const deals = await this.prisma.lead.findMany({
        where: {
          status: 'WON',
          closedAmount: { not: null },
          closedOn: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
        },
        select: { closedOn: true, closedAmount: true, feeAmount: true, listing: { select: { intent: true } } },
        take: ROW_CAP,
      });
      fees = buildFeeReport(
        deals.map((d) => ({
          closedOn: (d.closedOn as Date).toISOString().slice(0, 10),
          intent: d.listing?.intent ?? null,
          closedAmount: Number(d.closedAmount),
          feeAmount: d.feeAmount == null ? null : Number(d.feeAmount),
        })),
      );
    }
    return { from, to, days, report, fees };
  }
}
