import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';
import { paginationQuerySchema } from '../../common/dto/pagination';
import { emailSchema, passwordSchema, phoneSchema } from '../auth/auth.dto';

export const STAFF_ROLE_CODES = ['SALES_AGENT', 'ADMIN'] as const;

export const createStaffSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(80),
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum(STAFF_ROLE_CODES),
});

export const adminUserListQuerySchema = paginationQuerySchema.extend({
  role: z.enum(['CUSTOMER', 'SALES_AGENT', 'ADMIN', 'SUPER_ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'LOCKED', 'DISABLED']).optional(),
  q: z.string().min(2).max(80).optional(),
});

export const patchUserSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED']),
});

export class CreateStaffDto extends createZodDto(createStaffSchema) {}
export class AdminUserListQueryDto extends createZodDto(adminUserListQuerySchema) {}
export class PatchUserDto extends createZodDto(patchUserSchema) {}

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  status: 'ACTIVE' | 'LOCKED' | 'DISABLED';
  roles: string[];
  createdAt: string;
};

export type StaffMember = { id: string; name: string; email: string; roles: string[] };

export type AdminUserDetail = AdminUser & {
  emailVerified: boolean;
  /** Set only while the account is temporarily locked after failed sign-ins. */
  lockedUntil: string | null;
  failedLoginCount: number;
  /** When their newest session started or was refreshed; null if they have no session on record. */
  lastActiveAt: string | null;
  activeSessions: number;
  /** Leads assigned to this person (nothing for customers). */
  leads: {
    total: number;
    byStatus: Record<string, number>;
    overdue: number;
    won: number;
    medianResponseMinutes: number | null;
    responseTargetMinutes: number;
  };
  recentLeads: { id: string; name: string; status: string; createdAt: string; listingTitle: string | null }[];
  recentActivity: { id: string; createdAt: string; action: string; entityType: string; entityId: string | null }[];
};
