import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const CACHE_TTL_MS = 30_000;

@Injectable()
export class RbacService {
  private cache = new Map<string, { codes: string[]; roleCodes: string[]; active: boolean; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async getPermissionCodes(userId: string): Promise<string[]> {
    return (await this.load(userId)).codes;
  }

  async getRoleCodes(userId: string): Promise<string[]> {
    return (await this.load(userId)).roleCodes;
  }

  /** False for disabled or deleted users, so a still-valid access token stops working promptly. */
  async isActive(userId: string): Promise<boolean> {
    return (await this.load(userId)).active;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  isStaff(roleCodes: string[]): boolean {
    return roleCodes.some((c) => c === 'SUPER_ADMIN' || c === 'ADMIN' || c === 'SALES_AGENT');
  }

  private async load(userId: string): Promise<{ codes: string[]; roleCodes: string[]; active: boolean }> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit;
    }
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletedAt: true },
    });
    const active = !!account && account.status !== 'DISABLED' && account.deletedAt === null;
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });
    const roleCodes = rows.map((r) => r.role.code);
    const codes = [
      ...new Set(rows.flatMap((r) => r.role.permissions.map((rp) => rp.permission.code))),
    ];
    const entry = { codes: active ? codes : [], roleCodes: active ? roleCodes : [], active, at: Date.now() };
    this.cache.set(userId, entry);
    return entry;
  }
}
