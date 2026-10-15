import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; requestId?: string }>();
    const res = context.switchToHttp().getResponse<{ setHeader: (k: string, v: string) => void }>();
    const incoming = req.headers['x-request-id'];
    const id = incoming && incoming.length <= 64 ? incoming : randomUUID();
    req.requestId = id;
    res.setHeader('x-request-id', id);
    return next.handle();
  }
}
