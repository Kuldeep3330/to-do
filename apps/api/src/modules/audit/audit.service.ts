import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { offsetOf } from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditListQueryDto } from './audit.dto';

/** Start of a calendar day (YYYY-MM-DD) in India time, optionally some days later. */
function istDayStart(day: string, plusDays = 0): Date {
  return new Date(new Date(`${day}T00:00:00+05:30`).getTime() + plusDays * 86_400_000);
}

export type AuditRecord = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditListQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorUserId: query.actorId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: istDayStart(query.from) } : {}),
              // the whole of the last day: everything before the next day starts
              ...(query.to ? { lt: istDayStart(query.to, 1) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offsetOf(query.page, query.pageSize),
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata,
        actor: r.actor,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /** Values for the filter dropdowns: what has actually been logged, and by whom. */
  async filters() {
    const [actions, entityTypes, actorRows] = await Promise.all([
      this.prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } }),
      this.prisma.auditLog.groupBy({ by: ['entityType'], orderBy: { entityType: 'asc' } }),
      this.prisma.auditLog.groupBy({ by: ['actorUserId'], where: { actorUserId: { not: null } }, orderBy: { actorUserId: 'asc' }, take: 200 }),
    ]);
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorRows.map((a) => a.actorUserId!) } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    return {
      actions: actions.map((a) => a.action),
      entityTypes: entityTypes.map((e) => e.entityType),
      actors,
    };
  }

  async record(entry: AuditRecord): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: entry.actorUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(`audit write failed: ${(err as Error).message}`);
    }
  }
}
