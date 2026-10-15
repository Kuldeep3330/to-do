import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
