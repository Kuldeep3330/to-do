import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = { id: string };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  return req.user as AuthUser;
});
