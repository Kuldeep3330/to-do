import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const CACHE_TTL_MS = 30_000;

@Injectable()
export class RbacService {
  private cache = new Map<string, { codes: string[]; roleCodes: string[]; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async getPermissionCodes(userId: string): Promise<string[]> {
    return (await this.load(userId)).codes;
  }

  async getRoleCodes(userId: string): Promise<string[]> {
    return (await this.load(userId)).roleCodes;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  isStaff(roleCodes: string[]): boolean {
    return roleCodes.some((c) => c === 'SUPER_ADMIN' || c === 'ADMIN' || c === 'SALES_AGENT');
  }

  private async load(userId: string): Promise<{ codes: string[]; roleCodes: string[] }> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit;
    }
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
    const entry = { codes, roleCodes, at: Date.now() };
    this.cache.set(userId, entry);
    return entry;
  }
}
