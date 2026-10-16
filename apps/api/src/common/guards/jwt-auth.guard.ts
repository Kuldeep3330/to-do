import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ACCESS_COOKIE, env } from '../../config/env';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppError } from '../errors/app-error';
import { RbacService } from '../../modules/rbac/rbac.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;

    if (!token) {
      if (isPublic) {
        return true;
      }
      throw AppError.unauthenticated();
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: env().JWT_ACCESS_SECRET,
      });
      if (!payload.sub) {
        throw AppError.unauthenticated();
      }
      // A valid signature is not enough: the account may have been disabled since the token was issued.
      if (!(await this.rbac.isActive(payload.sub))) {
        throw AppError.unauthenticated();
      }
      req.user = { id: payload.sub };
      return true;
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      if (isPublic) {
        return true;
      }
      throw AppError.unauthenticated();
    }
  }
}
