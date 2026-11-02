import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { ASSESSMENTS, assessmentBySlug } from './discover.definitions';
import {
  buildCustomerPreferences,
  scoreOwnerReadiness,
  summarize,
  type CustomerPreferences,
  type OwnerReadiness,
} from './discover.scoring';
import type { AssessmentDefinition, DiscoverKind, SummaryLine } from './discover.types';
import { localityIdsIn, validateAnswers } from './discover.validation';

export type ResultLocality = { id: string; name: string; slug: string; cityName: string; citySlug: string };

export type DiscoverResult = {
  kind: DiscoverKind;
  slug: AssessmentDefinition['slug'];
  version: number;
  title: string;
  disclaimer: string;
  /** Owner and agent answers are claims. They are never proof of ownership, authority or performance. */
  selfReported: true;
  summary: SummaryLine[];
  localities: ResultLocality[];
  preferences?: CustomerPreferences;
  readiness?: OwnerReadiness;
};

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32}$/;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

type LocalityRow = { id: string; name: string; slug: string; city: { name: string; slug: string } };

const toResultLocality = (l: LocalityRow): ResultLocality => ({
  id: l.id,
  name: l.name,
  slug: l.slug,
  cityName: l.city.name,
  citySlug: l.city.slug,
});

@Injectable()
export class DiscoverService {
  private readonly logger = new Logger(DiscoverService.name);

  constructor(private readonly prisma: PrismaService) {}

  catalog() {
    return ASSESSMENTS.map((a) => ({
      slug: a.slug,
      kind: a.kind,
      version: a.version,
      title: a.title,
      description: a.description,
      minutes: a.minutes,
      requiredQuestions: a.questions.filter((q) => q.required).length,
    }));
  }

  definition(slug: string): AssessmentDefinition {
    const def = assessmentBySlug(slug);
    if (!def) throw AppError.notFound('Assessment not found');
    return def;
  }

  async recordStart(slug: string): Promise<void> {
    const def = this.definition(slug);
    await this.track('discover_started', { kind: def.kind, version: def.version });
  }

  async submit(slug: string, input: { answers: unknown; saveToAccount?: boolean }, userId?: string) {
    const def = this.definition(slug);
    if (input.saveToAccount && !userId) throw AppError.unauthenticated('Sign in to save your result');

    const checked = validateAnswers(def, input.answers);
    if (!checked.ok) {
      throw AppError.validation(
        'Some answers are not valid',
        checked.issues.map((i) => ({ path: i.question, message: i.message })),
      );
    }
    const answers = checked.answers;

    const localities = await this.resolveLocalities(def, answers);
    const names = new Map(localities.map((l) => [l.id, l.name]));

    const result: DiscoverResult = {
      kind: def.kind,
      slug: def.slug,
      version: def.version,
      title: def.title,
      disclaimer: def.disclaimer,
      selfReported: true,
      summary: summarize(def, answers, names),
      localities,
    };
    if (def.kind === 'CUSTOMER') result.preferences = buildCustomerPreferences(def, answers);
    if (def.kind === 'OWNER') result.readiness = scoreOwnerReadiness(answers);

    const token = randomBytes(24).toString('base64url');
    const attach = input.saveToAccount ? userId : undefined;
    await this.prisma.discoverResponse.create({
      data: {
        kind: def.kind,
        version: def.version,
        tokenHash: hashToken(token),
        userId: attach ?? null,
        answers: answers as object,
        result: result as unknown as object,
      },
    });
    if (attach && result.preferences) await this.saveProfile(attach, def.version, result.preferences);

    // Analytics never carry the participant's identity or answers.
    await this.track('discover_completed', {
      kind: def.kind,
      version: def.version,
      ...(result.readiness ? { score: result.readiness.score, band: result.readiness.band } : {}),
    });

    return { resultToken: token, saved: Boolean(attach), result };
  }

  async getByToken(token: string): Promise<DiscoverResult & { saved: boolean; createdAt: Date }> {
    const row = await this.findByToken(token);
    if (!row) throw AppError.notFound('Result not found');
    return { ...(row.result as unknown as DiscoverResult), saved: row.userId !== null, createdAt: row.createdAt };
  }

  /** Attach an anonymous result to the signed-in user. Another user's result looks like a missing one. */
  async claim(token: string, userId: string): Promise<{ saved: true }> {
    const row = await this.findByToken(token);
    if (!row || (row.userId && row.userId !== userId)) throw AppError.notFound('Result not found');
    if (row.userId !== userId) {
      await this.prisma.discoverResponse.update({ where: { id: row.id }, data: { userId } });
    }
    const result = row.result as unknown as DiscoverResult;
    if (row.kind === 'CUSTOMER' && result.preferences) await this.saveProfile(userId, row.version, result.preferences);
    return { saved: true };
  }

  async myProfile(userId: string) {
    const profile = await this.prisma.discoverPreferenceProfile.findUnique({ where: { userId } });
    if (!profile) return null;
    const prefs = profile.preferences as unknown as CustomerPreferences;
    const rows = await this.prisma.locality.findMany({
      where: { id: { in: prefs.localityIds }, isActive: true },
      include: { city: true },
    });
    return {
      version: profile.version,
      updatedAt: profile.updatedAt,
      preferences: prefs,
      localities: rows.map(toResultLocality),
    };
  }

  /** Remove the profile and every assessment the user saved to their account. */
  async deleteMine(userId: string): Promise<{ ok: true }> {
    await this.prisma.$transaction([
      this.prisma.discoverPreferenceProfile.deleteMany({ where: { userId } }),
      this.prisma.discoverResponse.deleteMany({ where: { userId } }),
    ]);
    return { ok: true };
  }

  private async findByToken(token: string) {
    if (!TOKEN_FORMAT.test(token)) return null;
    return this.prisma.discoverResponse.findUnique({ where: { tokenHash: hashToken(token) } });
  }

  private async saveProfile(userId: string, version: number, preferences: CustomerPreferences): Promise<void> {
    await this.prisma.discoverPreferenceProfile.upsert({
      where: { userId },
      create: { userId, version, preferences: preferences as unknown as object },
      update: { version, preferences: preferences as unknown as object },
    });
  }

  /** Every referenced locality must exist and be active. Returns them so names are never stored separately. */
  private async resolveLocalities(def: AssessmentDefinition, answers: Record<string, unknown>) {
    const ids = localityIdsIn(def, answers);
    if (ids.length === 0) return [];
    const rows = await this.prisma.locality.findMany({
      where: { id: { in: ids }, isActive: true, city: { isActive: true } },
      include: { city: true },
    });
    const found = new Set(rows.map((r) => r.id));
    const missing = new Set(ids.filter((id) => !found.has(id)));
    if (missing.size > 0) {
      const details = def.questions
        .filter((q) => localityIdsIn({ ...def, questions: [q] }, answers).some((id) => missing.has(id)))
        .map((q) => ({ path: q.id, message: 'That location is not available.' }));
      throw AppError.validation('Some answers are not valid', details);
    }
    return rows.map(toResultLocality);
  }

  private async track(name: string, properties: Record<string, unknown>): Promise<void> {
    try {
      await this.prisma.analyticsEvent.create({ data: { name, properties: properties as object } });
    } catch (err) {
      this.logger.warn(`analytics ${name} failed: ${(err as Error).message}`);
    }
  }
}
