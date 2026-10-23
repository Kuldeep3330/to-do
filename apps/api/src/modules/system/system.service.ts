import { Inject, Injectable } from '@nestjs/common';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, StoragePort } from '../media/storage.port';
import { slaMinutes } from '../leads/leads.sla';

export type HealthCheck = {
  key: string;
  label: string;
  /** up: working. down: failing. info: not a pass/fail check, just how things are set up. */
  status: 'up' | 'down' | 'info';
  latencyMs: number | null;
  message: string;
};

export type SystemHealth = {
  status: 'ok' | 'degraded';
  checkedAt: string;
  uptimeSeconds: number;
  environment: string;
  nodeVersion: string;
  checks: HealthCheck[];
  settings: { listingStaleDays: number; leadResponseMinutes: number; rateLimitEnabled: boolean };
};

export type QualityItem = {
  id: string;
  label: string;
  detail: string | null;
  /** A moment worth showing next to the item (see the issue's atLabel), as an ISO timestamp. */
  at: string | null;
};
export type QualityIssue = {
  key: string;
  title: string;
  /** Why it matters and what to do. */
  advice: string;
  /** Where the items live in the admin area. */
  entity: 'listing' | 'lead' | 'visit';
  /** What `at` means for these items, e.g. "received". */
  atLabel: string | null;
  severity: 'high' | 'medium' | 'low';
  count: number;
  /** The oldest few, so the list stays short. */
  items: QualityItem[];
};
export type DataQuality = { checkedAt: string; totalIssues: number; issues: QualityIssue[] };

const SAMPLE = 10;
/** A listing with fewer photos than this is flagged. Publishing needs one; buyers expect more. */
export const MIN_GOOD_PHOTOS = 3;
const PING_TIMEOUT_MS = 3000;

function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = Date.now();
  return fn().then((value) => ({ ms: Date.now() - start, value }));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`no answer within ${ms / 1000}s`)), ms).unref()),
  ]);
}

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private async check(key: string, label: string, probe: () => Promise<unknown>, okMessage: string): Promise<HealthCheck> {
    try {
      const { ms } = await timed(() => withTimeout(probe(), PING_TIMEOUT_MS));
      return { key, label, status: 'up', latencyMs: ms, message: okMessage };
    } catch (e) {
      return { key, label, status: 'down', latencyMs: null, message: (e as Error).message || 'Check failed' };
    }
  }

  async health(): Promise<SystemHealth> {
    const cfg = env();
    const [database, storage] = await Promise.all([
      this.check('database', 'Database', () => this.prisma.$queryRaw`SELECT 1`, 'Answering queries'),
      this.check('storage', 'Photo storage', () => this.storage.ping(), 'Bucket reachable'),
    ]);
    const mail: HealthCheck = {
      key: 'mail',
      label: 'Email',
      status: 'info',
      latencyMs: null,
      message: cfg.SMTP_HOST
        ? 'Sending through SMTP'
        : 'No SMTP server set: emails are only written to the log, so password reset emails will not arrive',
    };
    const checks = [database, storage, mail];
    return {
      status: checks.some((c) => c.status === 'down') ? 'degraded' : 'ok',
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      environment: cfg.NODE_ENV,
      nodeVersion: process.version,
      checks,
      settings: {
        listingStaleDays: cfg.LISTING_STALE_DAYS,
        leadResponseMinutes: slaMinutes(),
        rateLimitEnabled: cfg.RATE_LIMIT_ENABLED,
      },
    };
  }

  async dataQuality(now = new Date()): Promise<DataQuality> {
    const staleDays = env().LISTING_STALE_DAYS;
    const day = 86_400_000;
    const published = { status: 'PUBLISHED' as const, deletedAt: null };
    const issues: QualityIssue[] = [];
    const add = (issue: Omit<QualityIssue, 'count' | 'items'>, count: number, items: QualityItem[]) => {
      if (count > 0) issues.push({ ...issue, count, items: items.slice(0, SAMPLE) });
    };

    const [fewPhotos, unverified, dueSoon, unassigned, onInactive, waitingVisits] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; title: string; photos: bigint }[]>`
        SELECT l.id, l.title, COUNT(m.id) AS photos
        FROM listings l
        LEFT JOIN media m ON m.listing_id = l.id AND m.variant = 'ORIGINAL'
        WHERE l.status = 'PUBLISHED' AND l.deleted_at IS NULL
        GROUP BY l.id, l.title, l.updated_at
        HAVING COUNT(m.id) < ${MIN_GOOD_PHOTOS}
        ORDER BY l.updated_at ASC`,
      this.prisma.listing.findMany({
        where: { ...published, verifiedAt: null },
        select: { id: true, title: true, publishedAt: true },
        orderBy: { publishedAt: 'asc' },
      }),
      staleDays > 3
        ? this.prisma.listing.findMany({
            where: {
              ...published,
              OR: [
                { lastConfirmedAt: { lt: new Date(now.getTime() - (staleDays - 3) * day) } },
                { lastConfirmedAt: null, publishedAt: { lt: new Date(now.getTime() - (staleDays - 3) * day) } },
              ],
            },
            select: { id: true, title: true, lastConfirmedAt: true, publishedAt: true },
            orderBy: { lastConfirmedAt: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.lead.findMany({
        where: { assignedToUserId: null, status: 'NEW' },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.lead.findMany({
        where: {
          status: { in: ['NEW', 'CONTACTED', 'QUALIFIED', 'VISIT_SCHEDULED'] },
          assignee: { OR: [{ status: { not: 'ACTIVE' } }, { deletedAt: { not: null } }] },
        },
        select: { id: true, name: true, assignee: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.visit.findMany({
        where: { status: 'REQUESTED', createdAt: { lt: new Date(now.getTime() - day) } },
        select: { id: true, createdAt: true, lead: { select: { name: true } }, listing: { select: { title: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    add(
      {
        key: 'leads-unassigned',
        title: 'New leads nobody owns',
        advice: 'Nobody is responsible for these enquiries, so nobody will call. Assign each one to an agent.',
        entity: 'lead',
        atLabel: 'received',
        severity: 'high',
      },
      unassigned.length,
      unassigned.map((l) => ({ id: l.id, label: l.name, detail: null, at: l.createdAt.toISOString() })),
    );
    add(
      {
        key: 'leads-on-inactive-staff',
        title: 'Open leads held by someone who cannot sign in',
        advice: 'The assignee is disabled, locked or removed. Reassign these so they get answered.',
        entity: 'lead',
        atLabel: null,
        severity: 'high',
      },
      onInactive.length,
      onInactive.map((l) => ({ id: l.id, label: l.name, detail: l.assignee ? `Assigned to ${l.assignee.name}` : null, at: null })),
    );
    add(
      {
        key: 'visits-waiting',
        title: 'Visit requests waiting over a day',
        advice: 'The customer is waiting for a confirmation. Confirm or cancel each request.',
        entity: 'visit',
        atLabel: 'requested',
        severity: 'medium',
      },
      waitingVisits.length,
      waitingVisits.map((v) => ({ id: v.id, label: v.lead.name, detail: v.listing.title, at: v.createdAt.toISOString() })),
    );
    add(
      {
        key: 'listings-due',
        title: 'Listings about to be paused automatically',
        advice: `Not confirmed for ${staleDays - 3}+ days; at ${staleDays} days they leave the site. Call the owner and confirm they are still available.`,
        entity: 'listing',
        atLabel: 'last confirmed',
        severity: 'medium',
      },
      dueSoon.length,
      dueSoon.map((l) => ({ id: l.id, label: l.title, detail: null, at: (l.lastConfirmedAt ?? l.publishedAt)?.toISOString() ?? null })),
    );
    add(
      {
        key: 'listings-unverified',
        title: 'Published listings without a verified badge',
        advice: 'Your promise is that every home was visited. Visit and verify these, or pause them.',
        entity: 'listing',
        atLabel: 'published',
        severity: 'medium',
      },
      unverified.length,
      unverified.map((l) => ({ id: l.id, label: l.title, detail: null, at: l.publishedAt?.toISOString() ?? null })),
    );
    add(
      {
        key: 'listings-few-photos',
        title: `Published listings with fewer than ${MIN_GOOD_PHOTOS} photos`,
        advice: 'Listings with few photos get fewer enquiries. Add more from the listing page.',
        entity: 'listing',
        atLabel: null,
        severity: 'low',
      },
      fewPhotos.length,
      fewPhotos.map((l) => ({
        id: l.id,
        label: l.title,
        detail: `${Number(l.photos)} photo${Number(l.photos) === 1 ? '' : 's'}`,
        at: null,
      })),
    );

    const order = { high: 0, medium: 1, low: 2 } as const;
    issues.sort((a, b) => order[a.severity] - order[b.severity]);
    return {
      checkedAt: now.toISOString(),
      totalIssues: issues.reduce((n, i) => n + i.count, 0),
      issues,
    };
  }
}
