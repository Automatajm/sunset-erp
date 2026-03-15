import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// Extend Express Request to include tenant
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      userId?: string;
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Extract tenantId from JWT payload (set by Passport)
    const user = req.user as any;
    
    if (user && user.tenantId) {
      // Tenant is already in JWT
      req.tenantId = user.tenantId;
      req.userId = user.id;
    }
    
    next();
  }
}
