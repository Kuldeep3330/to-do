import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { toPublicUser } from './users.mapper';
import { RbacService } from '../rbac/rbac.service';

const phoneSchema = /^\+91[6-9]\d{9}$/;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      throw AppError.unauthenticated();
    }
    const roles = await this.rbac.getRoleCodes(userId);
    return toPublicUser(user, roles);
  }

  async patchMe(userId: string, body: { name?: string; phone?: string }) {
    if (body.phone && !phoneSchema.test(body.phone)) {
      throw AppError.validation('Invalid phone', [{ path: 'phone', message: 'Must be +91 and 10 digits' }]);
    }
    if (body.name && (body.name.length < 1 || body.name.length > 80)) {
      throw AppError.validation('Invalid name', [{ path: 'name', message: 'Required, max 80' }]);
    }
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.phone ? { phone: body.phone } : {}),
        },
        include: { roles: { include: { role: true } } },
      });
      const roles = await this.rbac.getRoleCodes(userId);
      return toPublicUser(user, roles);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === 'P2002') {
        throw AppError.conflict('Phone already in use');
      }
      throw e;
    }
  }
}
