import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AppError } from '../errors/app-error';
import { RbacService } from '../../modules/rbac/rbac.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const req = context.switchToHttp().getRequest<{ user?: { id: string } }>();
    if (!req.user?.id) {
      throw AppError.unauthenticated();
    }
    const codes = await this.rbac.getPermissionCodes(req.user.id);
    const ok = required.every((c) => codes.includes(c));
    if (!ok) {
      throw AppError.forbidden();
    }
    return true;
  }
}
