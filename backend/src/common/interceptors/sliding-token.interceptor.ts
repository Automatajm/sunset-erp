import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

// spec-034 — sliding session: on every authenticated 2xx response, mint a fresh
// 15m access token and return it in the X-Access-Token header. The frontend
// apiClient swaps it into its in-memory token, so an actively-used session never
// hits the 15m wall. Unauthenticated routes (no req.user) are untouched.
@Injectable()
export class SlidingTokenInterceptor implements NestInterceptor {
  constructor(private readonly jwtService: JwtService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    return next.handle().pipe(
      tap(() => {
        const user = req.user;
        if (!user?.id) return; // unauthenticated route — nothing to slide
        // Do not slide the refresh/logout responses (they manage tokens directly).
        const url: string = req.originalUrl ?? req.url ?? '';
        if (url.includes('/auth/refresh') || url.includes('/auth/logout')) return;

        const payload: Record<string, unknown> = { sub: user.id, email: user.email };
        if (user.tenantId) payload.tenantId = user.tenantId;
        try {
          res.setHeader('X-Access-Token', this.jwtService.sign(payload));
          res.setHeader('Access-Control-Expose-Headers', 'X-Access-Token');
        } catch {
          // Never let token rotation break a successful response.
        }
      }),
    );
  }
}
