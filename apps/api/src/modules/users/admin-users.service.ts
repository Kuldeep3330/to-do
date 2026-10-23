import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppError } from '../../common/errors/app-error';
import { offsetOf } from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { median, overdueCutoff, slaMinutes } from '../leads/leads.sla';
import type { AdminUser, AdminUserDetail, StaffMember } from './admin-users.dto';
import { AdminUserListQueryDto, CreateStaffDto, PatchUserDto } from './admin-users.dto';
import { z } from 'zod';

type CreateStaffInput = z.infer<typeof CreateStaffDto.schema>;

const STAFF_CODES = ['SALES_AGENT', 'ADMIN', 'SUPER_ADMIN'];
const WITH_ROLES = { roles: { include: { role: true } } } as const;

type UserRow = Prisma.UserGetPayload<{ include: typeof WITH_ROLES }>;

function toAdminUser(u: UserRow): AdminUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    status: u.status,
    roles: u.roles.map((r) => r.role.code),
    createdAt: u.createdAt.toISOString(),
  };
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  /** Active staff who can be assigned leads. Intentionally minimal: no phone, no status. */
  async listAssignableStaff(): Promise<StaffMember[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        roles: { some: { role: { code: { in: STAFF_CODES } } } },
      },
      include: WITH_ROLES,
      orderBy: { name: 'asc' },
    });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: u.roles.map((r) => r.role.code),
    }));
  }

  async list(query: AdminUserListQueryDto) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.role ? { roles: { some: { role: { code: query.role } } } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: WITH_ROLES,
        orderBy: { createdAt: 'desc' },
        skip: offsetOf(query.page, query.pageSize),
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: rows.map(toAdminUser), meta: { page: query.page, pageSize: query.pageSize, total } };
  }


  /** One person's profile: account state, how they are doing on assigned leads, and what they have changed lately. */
  async detail(id: string): Promise<AdminUserDetail> {
    const row = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, include: WITH_ROLES });
    if (!row) {
      throw AppError.notFound('User not found');
    }
    const since = new Date(Date.now() - 30 * 86_400_000);
    const now = new Date();
    const [lastSession, activeSessions, byStatus, overdue, answered, recentLeads, recentActivity] = await Promise.all([
      this.prisma.refreshToken.findFirst({ where: { userId: id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      this.prisma.refreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.lead.groupBy({ by: ['status'], where: { assignedToUserId: id }, _count: { _all: true } }),
      this.prisma.lead.count({
        where: { assignedToUserId: id, status: 'NEW', firstResponseAt: null, createdAt: { lt: overdueCutoff() } },
      }),
      this.prisma.lead.findMany({
        where: { assignedToUserId: id, firstResponseAt: { not: null }, createdAt: { gte: since } },
        select: { createdAt: true, firstResponseAt: true },
        take: 1000,
      }),
      this.prisma.lead.findMany({
        where: { assignedToUserId: id },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, name: true, status: true, createdAt: true, listing: { select: { title: true } } },
      }),
      this.prisma.auditLog.findMany({
        where: { actorUserId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: { id: true, createdAt: true, action: true, entityType: true, entityId: true },
      }),
    ]);
    const counts: Record<string, number> = {};
    for (const g of byStatus) counts[g.status] = g._count._all;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const minutes = answered.map((l) =>
      Math.max(0, Math.round(((l.firstResponseAt as Date).getTime() - l.createdAt.getTime()) / 60_000)),
    );
    return {
      ...toAdminUser(row),
      emailVerified: row.emailVerifiedAt !== null,
      lockedUntil: row.lockedUntil && row.lockedUntil > now ? row.lockedUntil.toISOString() : null,
      failedLoginCount: row.failedLoginCount,
      lastActiveAt: lastSession ? lastSession.createdAt.toISOString() : null,
      activeSessions,
      leads: {
        total,
        byStatus: counts,
        overdue,
        won: counts.WON ?? 0,
        medianResponseMinutes: median(minutes),
        responseTargetMinutes: slaMinutes(),
      },
      recentLeads: recentLeads.map((l) => ({
        id: l.id,
        name: l.name,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        listingTitle: l.listing?.title ?? null,
      })),
      recentActivity: recentActivity.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    };
  }

  async createStaff(actorId: string, input: CreateStaffInput): Promise<AdminUser> {
    // Only a super admin may mint another admin; admins can create sales agents.
    if (input.role === 'ADMIN') {
      const actorRoles = await this.rbac.getRoleCodes(actorId);
      if (!actorRoles.includes('SUPER_ADMIN')) {
        throw AppError.forbidden('Only a super admin can create admins');
      }
    }
    const role = await this.prisma.role.findUnique({ where: { code: input.role } });
    if (!role) {
      throw AppError.validation('Unknown role', [{ path: 'role', message: 'Role does not exist' }]);
    }
    const passwordHash = await argon2.hash(input.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          phone: input.phone,
          passwordHash,
          roles: { create: { roleId: role.id } },
        },
        include: WITH_ROLES,
      });
      return toAdminUser(user);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? '');
        const field = target.includes('phone') ? 'phone' : 'email';
        throw AppError.conflict(`A user with this ${field} already exists`);
      }
      throw e;
    }
  }

  async setStatus(actorId: string, id: string, input: PatchUserDto): Promise<AdminUser> {
    if (id === actorId) {
      throw AppError.conflict('You cannot change your own status');
    }
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, include: WITH_ROLES });
    if (!target) {
      throw AppError.notFound('User not found');
    }
    const targetRoles = target.roles.map((r) => r.role.code);
    const actorRoles = await this.rbac.getRoleCodes(actorId);
    // Admins manage agents and customers; touching another admin or a super admin needs a super admin.
    if (
      (targetRoles.includes('ADMIN') || targetRoles.includes('SUPER_ADMIN')) &&
      !actorRoles.includes('SUPER_ADMIN')
    ) {
      throw AppError.forbidden('Only a super admin can change an admin');
    }
    if (targetRoles.includes('SUPER_ADMIN')) {
      throw AppError.forbidden('A super admin cannot be disabled here');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id },
        data: { status: input.status, ...(input.status === 'ACTIVE' ? { failedLoginCount: 0, lockedUntil: null } : {}) },
        include: WITH_ROLES,
      });
      if (input.status === 'DISABLED') {
        // Kill live sessions so a disabled user is signed out everywhere.
        await tx.refreshToken.deleteMany({ where: { userId: id } });
      }
      return row;
    });
    // Drop the cached permission/active flags so the change applies on the very next request.
    this.rbac.invalidate(id);
    return toAdminUser(updated);
  }
}
