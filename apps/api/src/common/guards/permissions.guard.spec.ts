import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../../modules/rbac/rbac.service';
import { AppError } from '../errors/app-error';
import { PermissionsGuard } from './permissions.guard';

function mockContext(user?: { id: string }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let rbac: { getPermissionCodes: jest.Mock };
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    rbac = { getPermissionCodes: jest.fn() };
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      rbac as unknown as RbacService,
    );
  });

  it('allows when no permissions metadata is set', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(mockContext())).resolves.toBe(true);
    expect(rbac.getPermissionCodes).not.toHaveBeenCalled();
  });

  it('throws UNAUTHENTICATED when permissions are required and the request has no user', async () => {
    reflector.getAllAndOverride.mockReturnValue(['property.manage']);
    try {
      await guard.canActivate(mockContext());
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('UNAUTHENTICATED');
      expect(err.status).toBe(401);
    }
    expect(rbac.getPermissionCodes).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when the user is missing a required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['property.manage']);
    rbac.getPermissionCodes.mockResolvedValue(['lead.create']);
    try {
      await guard.canActivate(mockContext({ id: 'user-1' }));
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('FORBIDDEN');
      expect(err.status).toBe(403);
    }
  });

  it('allows when the user has every required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['property.manage', 'listing.manage']);
    rbac.getPermissionCodes.mockResolvedValue(['property.manage', 'listing.manage', 'media.manage']);
    await expect(guard.canActivate(mockContext({ id: 'user-1' }))).resolves.toBe(true);
  });
});
