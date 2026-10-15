import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';
import { AuditService } from '../../modules/audit/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<{
      user?: { id: string };
      params?: Record<string, string>;
      requestId?: string;
    }>();
    const res = context.switchToHttp().getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      tap((body) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return;
        }
        const entityId =
          (body as { data?: { id?: string } })?.data?.id ?? req.params?.id ?? null;
        void this.audit.record({
          actorUserId: req.user?.id ?? null,
          action: meta.action,
          entityType: meta.entityType,
          entityId,
          metadata: req.requestId ? { requestId: req.requestId } : {},
        });
      }),
    );
  }
}
