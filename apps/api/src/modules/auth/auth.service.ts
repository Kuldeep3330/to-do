import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import {
  ACCESS_TTL_SECONDS,
  env,
  REFRESH_TTL_CUSTOMER_SECONDS,
  REFRESH_TTL_STAFF_SECONDS,
  RESET_TTL_MS,
} from '../../config/env';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RbacService } from '../rbac/rbac.service';
import { toPublicUser } from '../users/users.mapper';
import { applyLockEvent, isCurrentlyLocked, LockState } from './lock-machine';
import { ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from './auth.dto';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function opaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
    private readonly notifications: NotificationsService,
  ) {}

  async register(input: RegisterInput) {
    const passwordHash = await argon2.hash(input.password);
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const customer = await tx.role.findUnique({ where: { code: 'CUSTOMER' } });
          if (!customer) {
            throw new Error('CUSTOMER role missing');
          }
          const user = await tx.user.create({
            data: {
              email: input.email,
              phone: input.phone,
              name: input.name,
              passwordHash,
              roles: { create: { roleId: customer.id } },
            },
            include: { roles: { include: { role: true } } },
          });
          const tokens = await this.issueSession(tx, user.id, false);
          return { user, tokens };
        },
        { timeout: 5000 },
      );
      return {
        user: toPublicUser(result.user, ['CUSTOMER']),
        ...result.tokens,
        refreshTtlSeconds: REFRESH_TTL_CUSTOMER_SECONDS,
      };
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === 'P2002') {
        throw AppError.conflict('Email or phone already in use');
      }
      throw e;
    }
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.deletedAt) {
      throw AppError.invalidCredentials();
    }
    if (user.status === 'DISABLED') {
      throw AppError.invalidCredentials();
    }

    const now = new Date();
    let state: LockState = {
      status: user.status,
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
    };

    const afterPre = applyLockEvent(state, { type: 'PRE_CHECK', now });
    if (afterPre.status !== state.status || afterPre.failedLoginCount !== state.failedLoginCount) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: afterPre.status,
          failedLoginCount: afterPre.failedLoginCount,
          lockedUntil: afterPre.lockedUntil,
        },
      });
      state = afterPre;
    }

    if (isCurrentlyLocked(state, now)) {
      throw AppError.invalidCredentials();
    }

    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      const failed = applyLockEvent(state, { type: 'FAIL', now });
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: failed.status,
          failedLoginCount: failed.failedLoginCount,
          lockedUntil: failed.lockedUntil,
        },
      });
      throw AppError.invalidCredentials();
    }

    const success = applyLockEvent(state, { type: 'SUCCESS' });
    const roleCodes = user.roles.map((r) => r.role.code);
    const staff = this.rbac.isStaff(roleCodes);
    const ttl = staff ? REFRESH_TTL_STAFF_SECONDS : REFRESH_TTL_CUSTOMER_SECONDS;

    const tokens = await this.prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            status: success.status,
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });
        return this.issueSession(tx, user.id, staff);
      },
      { timeout: 5000 },
    );

    return {
      user: toPublicUser(user, roleCodes),
      ...tokens,
      refreshTtlSeconds: ttl,
    };
  }

  async refresh(rawRefresh: string | undefined) {
    if (!rawRefresh) {
      throw AppError.unauthenticated();
    }
    const tokenHash = sha256(rawRefresh);
    const result = await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          {
            id: string;
            user_id: string;
            token_hash: string;
            expires_at: Date;
            revoked_at: Date | null;
          }[]
        >`
          SELECT id, user_id, token_hash, expires_at, revoked_at
          FROM refresh_tokens
          WHERE token_hash = ${tokenHash}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row) {
          return { kind: 'unauthenticated' as const };
        }
        if (row.revoked_at) {
          await tx.refreshToken.updateMany({
            where: { userId: row.user_id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return { kind: 'unauthenticated' as const };
        }
        const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
        if (expiresAt.getTime() <= Date.now()) {
          return { kind: 'unauthenticated' as const };
        }
        const user = await tx.user.findFirst({
          where: { id: row.user_id, deletedAt: null },
          include: { roles: { include: { role: true } } },
        });
        if (!user || user.status === 'DISABLED') {
          return { kind: 'unauthenticated' as const };
        }
        const roleCodes = user.roles.map((r) => r.role.code);
        const staff = this.rbac.isStaff(roleCodes);
        await tx.refreshToken.update({
          where: { id: row.id },
          data: { revokedAt: new Date() },
        });
        const issued = await this.issueSession(tx, user.id, staff);
        return {
          kind: 'ok' as const,
          user: toPublicUser(user, roleCodes),
          ...issued,
          refreshTtlSeconds: staff ? REFRESH_TTL_STAFF_SECONDS : REFRESH_TTL_CUSTOMER_SECONDS,
        };
      },
      { timeout: 5000 },
    );
    if (result.kind !== 'ok') {
      throw AppError.unauthenticated();
    }
    return result;
  }

  async logout(rawRefresh: string | undefined): Promise<void> {
    if (!rawRefresh) {
      return;
    }
    const tokenHash = sha256(rawRefresh);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.deletedAt) {
      return;
    }
    const raw = opaqueToken();
    const tokenHash = sha256(raw);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + RESET_TTL_MS),
          },
        });
      },
      { timeout: 5000 },
    );
    const resetUrl = `${env().PUBLIC_APP_URL}/reset-password/${raw}`;
    try {
      await this.notifications.notifyPasswordReset({
        to: user.email,
        name: user.name,
        resetUrl,
      });
    } catch {
      return;
    }
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = sha256(input.token);
    const passwordHash = await argon2.hash(input.password);
    await this.prisma.$transaction(
      async (tx) => {
        const token = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
        if (!token || token.usedAt || token.expiresAt.getTime() <= Date.now()) {
          throw AppError.unauthenticated();
        }
        const user = await tx.user.findUnique({ where: { id: token.userId } });
        if (!user || user.deletedAt) {
          throw AppError.unauthenticated();
        }
        const next = applyLockEvent(
          {
            status: user.status,
            failedLoginCount: user.failedLoginCount,
            lockedUntil: user.lockedUntil,
          },
          { type: 'RESET' },
        );
        await tx.passwordResetToken.update({
          where: { id: token.id },
          data: { usedAt: new Date() },
        });
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            status: next.status,
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      { timeout: 5000 },
    );
  }

  private async issueSession(tx: Prisma.TransactionClient, userId: string, staff: boolean) {
    const refreshRaw = opaqueToken();
    const ttl = staff ? REFRESH_TTL_STAFF_SECONDS : REFRESH_TTL_CUSTOMER_SECONDS;
    await tx.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshRaw),
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: env().JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL_SECONDS },
    );
    return { accessToken, refreshToken: refreshRaw };
  }
}
