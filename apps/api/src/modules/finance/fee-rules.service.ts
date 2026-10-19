import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FeeRuleLike } from './fees.compute';
import { FeeRuleView, feeRuleSchema } from './fee-rules.dto';

type Intent = 'RENT' | 'BUY';
type RuleInput = z.infer<typeof feeRuleSchema>;

type Row = {
  intent: Intent;
  method: 'FIXED' | 'PERCENT';
  value: { toString(): string };
  minFee: bigint | null;
  maxFee: bigint | null;
  updatedAt: Date;
};

const toView = (r: Row): FeeRuleView => ({
  intent: r.intent,
  method: r.method,
  value: Number(r.value.toString()),
  minFee: r.minFee == null ? null : Number(r.minFee),
  maxFee: r.maxFee == null ? null : Number(r.maxFee),
  updatedAt: r.updatedAt.toISOString(),
});

@Injectable()
export class FeeRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Both intents, in a fixed order. An intent with no rule is simply absent. */
  async list(): Promise<FeeRuleView[]> {
    const rows = await this.prisma.feeRule.findMany({ orderBy: { intent: 'desc' } });
    return rows.map(toView);
  }

  /** The rule used to price a deal, or null when none is configured. */
  async forIntent(intent: Intent): Promise<FeeRuleLike | null> {
    const row = await this.prisma.feeRule.findUnique({ where: { intent } });
    if (!row) return null;
    const v = toView(row);
    return { method: v.method, value: v.value, minFee: v.minFee, maxFee: v.maxFee };
  }

  async set(intent: Intent, input: RuleInput, actorId: string): Promise<FeeRuleView> {
    const previous = await this.prisma.feeRule.findUnique({ where: { intent } });
    const data = {
      method: input.method,
      value: input.value,
      minFee: input.minFee == null ? null : BigInt(input.minFee),
      maxFee: input.maxFee == null ? null : BigInt(input.maxFee),
      updatedByUserId: actorId,
    };
    const row = await this.prisma.feeRule.upsert({
      where: { intent },
      update: data,
      create: { intent, ...data },
    });
    const view = toView(row);
    // Money settings get a richer audit entry than the generic one: what the rule was and what it became.
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE_FEE_RULE',
      entityType: 'fee_rule',
      entityId: row.id,
      metadata: {
        intent,
        from: previous ? toView(previous) : null,
        to: view,
      },
    });
    return view;
  }
}
