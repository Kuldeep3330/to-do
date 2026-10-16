import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppError } from '../../common/errors/app-error';
import { offsetOf } from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import type { AdminUser, StaffMember } from './admin-users.dto';
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
