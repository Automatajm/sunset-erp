import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.module';

export interface TenantPermissionContext {
  role: string;
  permissions: string[];
}

// TTL for a cached permission context — matches the 15-min JWT expiry.
const PERMISSION_CACHE_TTL_SECONDS = 900;

// Leaf provider wrapping Redis. Owns the permission-cache key convention so the
// writer (AuthService) and the invalidators (Roles/Users services) share a single
// source of truth. Depends only on REDIS_CLIENT — never on a domain module — so it
// can be injected anywhere without risk of a circular dependency.
@Injectable()
export class CacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private permissionKey(userId: string, tenantId: string): string {
    return `permissions:${userId}:${tenantId}`;
  }

  // All operations are fail-open: a Redis error is swallowed so the cache can
  // never break the request that called it (callers fall back to the DB).
  async getPermissionContext(
    userId: string,
    tenantId: string,
  ): Promise<TenantPermissionContext | null> {
    try {
      const cached = await this.redis.get(this.permissionKey(userId, tenantId));
      return cached ? (JSON.parse(cached) as TenantPermissionContext) : null;
    } catch {
      return null;
    }
  }

  async setPermissionContext(
    userId: string,
    tenantId: string,
    context: TenantPermissionContext,
  ): Promise<void> {
    try {
      await this.redis.set(
        this.permissionKey(userId, tenantId),
        JSON.stringify(context),
        'EX',
        PERMISSION_CACHE_TTL_SECONDS,
      );
    } catch {
      // Cache write failed — not fatal, the value was still resolved.
    }
  }

  // Invalidate a user's cached permission context for a tenant. Call this whenever
  // the user's roles or a role's permissions change so the next request re-resolves
  // from the DB instead of serving stale (up to 15-min-old) data.
  async clearPermissionCache(userId: string, tenantId: string): Promise<void> {
    try {
      await this.redis.del(this.permissionKey(userId, tenantId));
    } catch {
      // Cache delete failed — the entry will expire on its own via TTL.
    }
  }
}
