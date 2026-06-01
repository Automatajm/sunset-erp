# spec-001 — Foundation & Auth/RBAC Layer

Status: **Complete**  
Owner: Platform  
Sprint: Foundation  
Module(s): `auth`, `database`, `common`, `prisma/seeds`  
Last updated: 2026-05-31  

---

## Problem

Sunset ERP is a multi-tenant SaaS ERP. Every one of the 40+ business modules
depends on a single, predictable foundation:

- a shared **PrismaService** that every service injects (and only it touches the DB),
- an **auth layer** that issues JWTs and resolves the active tenant,
- an **RBAC layer** (`@RequirePermissions` + `PermissionsGuard`) that gates every handler,
- a **seed** that produces a working `admin@demo.com` login with full permissions,
- **error handling** and **response format** conventions that every module reuses.

These pieces existed but were grown ad-hoc across sprints. The key problems found
and addressed in this spec:

1. **Permission resolution was duplicated** between `JwtStrategy.validate` and
   `PermissionsGuard.getUserPermissions` — two separate DB queries per request,
   and they disagreed: the strategy used `findFirst` (only the first role's permissions),
   the guard used `findMany` (union of all roles). For multi-role users, `profile` and
   the guard were inconsistent.
2. **No documented contract** for the foundation — conventions were implicit and
   drifted across modules.

This spec **codifies the foundation as the authoritative convention** and refactors
the code to match it, **without changing the database schema** and without breaking
existing tokens or the existing frontend login flow.

Every subsequent spec builds on this one. It must be boring, explicit, and stable.

---

## Acceptance criteria

### Project structure
- [x] Every module lives in `backend/src/modules/<module>/` and contains, at minimum,
      `<module>.module.ts`, `<module>.controller.ts`, `<module>.service.ts`, and a `dto/` folder.
- [x] `PrismaService` lives at `backend/src/database/prisma.service.ts` and is the **only**
      class that extends `PrismaClient`. It is exported by a global `PrismaModule`.
- [x] Cross-cutting auth primitives live under `backend/src/common/`
      (`decorators/`, `guards/`, `middleware/`).
- [x] New modules are registered in `src/app.module.ts` `imports` array.
- [x] Controllers contain only HTTP concerns (routing, guards, Swagger). All logic is in services.

### PrismaService base pattern
- [x] `PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy`,
      connecting on init and disconnecting on destroy.
- [x] Provided by a `@Global()` module — any service can inject it without re-importing.
- [x] Services depend on `PrismaService` only for data access. No service calls
      `new PrismaClient()`. No service queries tables owned by another module's service
      (it injects that module's service instead).
- [x] **Tenant-scoping rule** (documented contract): every tenant-owned query includes
      `where: { tenantId, deletedAt: null }`, where `tenantId` comes from `req.user.tenantId`.

### Auth module — endpoints
- [x] `POST /api/auth/register` — creates a user (hashed password, bcrypt cost 12),
      returns `409` if the email already exists, never returns the password hash.
- [x] `POST /api/auth/login` — validates credentials; rejects deactivated accounts
      and users with no tenant access. Single tenant → token carries `tenantId`,
      `requiresTenantSelection: false`. Multiple tenants → token has no tenant,
      returns list, `requiresTenantSelection: true`.
- [x] `POST /api/auth/select-tenant` (JWT-guarded) — issues a tenant-scoped token;
      `404` if the user has no access to that tenant.
- [x] `GET /api/auth/tenants` (JWT-guarded) — lists tenants the user can access.
- [x] `GET /api/auth/users` (JWT-guarded) — lists active users in the current tenant.
- [x] `GET /api/auth/profile` and `GET /api/auth/check` (JWT-guarded) — return decoded
      user/tenant context.
- [x] Every endpoint has `@ApiOperation` + `@ApiResponse` Swagger annotations.

### JWT strategy
- [x] `JwtStrategy` extracts the bearer token, validates the user is still `active`,
      and resolves `tenantId`, `role`, and `permissions[]` via `AuthService.resolveTenantContext`.
- [x] `req.user` shape is exactly `{ id, email, firstName, lastName, tenantId, role, permissions }`.
- [x] A token with no `tenantId` yields `tenantId: null`, `role: 'user'`, `permissions: []`.
- [x] `JWT_SECRET` is read from config/env; `ignoreExpiration: false`.

### RBAC
- [x] `@RequirePermissions('MODULE:ACTION', ...)` decorator sets metadata read by the guard.
- [x] `PermissionsGuard`:
  - returns `true` when no permissions are required on the handler/class,
  - throws `403` when the user is unauthenticated or has no tenant selected,
  - throws `403` listing the **missing** permissions when the user lacks any required permission
    (AND semantics — all required permissions must be present),
  - reads `req.user.permissions` resolved by `JwtStrategy` — no second DB query.
- [x] Protected controllers use `@UseGuards(JwtAuthGuard, PermissionsGuard)` (in that order).

### Permission resolution — single source of truth
- [x] `AuthService.resolveTenantContext(userId, tenantId)` is the **only** place that
      queries roles → permissions. Both `JwtStrategy` and `PermissionsGuard` use it
      (strategy calls it directly; guard reads `req.user.permissions` already resolved).
- [x] Returns the **union** of all assigned roles' permissions (not just the first role).
- [x] `role` = earliest-assigned role's code; `permissions` = union of all roles.

### Permission caching (Redis)
- [x] Cache ops live in a leaf `CacheService` (`src/common/services/cache.service.ts`)
      that injects `REDIS_CLIENT` and owns the key convention `permissions:${userId}:${tenantId}`
      and TTL **900s** (15 min, matches JWT expiry). Provided by a `@Global() CommonModule`.
- [x] `resolveTenantContext` delegates to `CacheService`: cache miss → query DB →
      `setPermissionContext` → return; cache hit → return cached value without touching the DB.
- [x] **Fail-open**: every `CacheService` op swallows Redis errors (down, parse, write) so the
      caller falls back to the DB. Auth never breaks because the cache is unavailable.
- [x] `CacheService.clearPermissionCache(userId, tenantId)` is the invalidation primitive.
      Both `AuthService` (writer) and the Roles/Users services (invalidators) inject `CacheService` —
      no `AuthService` ↔ Roles/Users dependency, so no circular-dependency risk.
- [x] **Invalidation wired**:
  - `UsersService.assignRoles(tenantId, userId, roleIds)` → clears that user's key.
  - `RolesService.setPermissions(roleId, …)` → fans out, clearing every user holding the role
    (queries `userRole` by `roleId`, clears each `(userId, tenantId)`).
  - `roles.remove` blocks while holders exist (no cache to clear); `users.setActive` toggles
    membership, not role→permission mapping (out of scope for a permission-content cache).

### Seed
- [x] `pnpm seed` produces: tenant `DEMO` (Demo Company), user `admin@demo.com`
      with password `Admin123!` (bcrypt cost 12), an `ADMIN` system role, and
      `RolePermission` rows linking that role to **every** seeded permission.
- [x] Admin user linked to `DEMO` via `UserTenant` (`isDefault: true, isActive: true`)
      and to the `ADMIN` role via `UserRole`.
- [x] Permissions are seeded idempotently (re-running does not duplicate permission codes).
- [ ] Verify: login as `admin@demo.com` returns `requiresTenantSelection: false` and
      `GET /api/auth/profile` shows the full permission set. *(pending live verification)*

### Error handling
- [x] `409 ConflictException` (duplicate email), `401 UnauthorizedException`
      (bad/deactivated credentials), `403 ForbiddenException` (missing tenant/permission),
      `404 NotFoundException` (no tenant access).
- [x] Credential errors never reveal whether email or password was wrong
      (always `"Invalid credentials"`).
- [x] Global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true, transform: true`) → `400`.

### Response format
- [x] Auth token responses use the envelope
      `{ access_token, token_type: 'Bearer', user, tenant | tenants, requiresTenantSelection }`.
- [x] List endpoints return `{ <resource>: [...], count: <n> }`.
- [x] No endpoint returns `passwordHash` or other secret field.

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations in this spec.
- Refresh tokens, token rotation, token revocation/blacklist.
- Two-factor auth (`twoFactorEnabled`/`twoFactorSecret` columns exist but stay dormant).
- Password reset / email verification flows.
- OAuth / SSO / external identity providers.
- Role and permission management UI/endpoints (CRUD of roles, assigning roles to users).
- Rate limiting, account lockout, audit-log persistence of auth events.
- Frontend changes beyond keeping the existing login → select-tenant flow working.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `Tenant` | `auth_tenants` | `code` (unique), `name`, `status` |
| `User` | `auth_users` | `email` (unique), `passwordHash`, `firstName`, `lastName`, `status`, `deletedAt` |
| `UserTenant` | `auth_user_tenants` | `userId`, `tenantId`, `isDefault`, `isActive`; `@@unique([userId, tenantId])` |
| `Role` | `auth_roles` | `tenantId`, `code`, `name`, `isSystem`; `@@unique([tenantId, code])` |
| `Permission` | `auth_permissions` | `code` (unique), `name`, `module` |
| `RolePermission` | `auth_role_permissions` | `roleId`, `permissionId`; `@@unique([roleId, permissionId])` |
| `UserRole` | `auth_user_roles` | `userId`, `roleId`, `tenantId`; `@@unique([userId, roleId, tenantId])` |

Key invariants:
- `User.passwordHash` → bcrypt cost 12.
- `User.status` gate: only `'active'` users may authenticate.
- Permissions are global (`Permission.code` is tenant-independent); they become
  tenant-scoped via `Role → RolePermission → UserRole(tenantId)`.

---

## API contracts

All routes prefixed `/api`. Token requests use `Authorization: Bearer <jwt>`.

### POST /api/auth/register
```json
// Request
{ "email": "user@x.com", "password": "Min8Chars1", "firstName": "Ada", "lastName": "Lovelace" }

// Response 201
{ "message": "User registered successfully", "user": { "id": "...", "email": "...", "firstName": "...", "lastName": "...", "status": "active" } }

// Errors: 409 email exists | 400 validation
```

### POST /api/auth/login
```json
// Response 200 — single tenant
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "user": { "id": "...", "email": "...", "firstName": "...", "lastName": "..." },
  "tenant": { "id": "...", "code": "DEMO", "name": "Demo Company", "isDefault": true },
  "requiresTenantSelection": false
}

// Response 200 — multiple tenants
{
  "access_token": "<jwt-no-tenant>",
  "token_type": "Bearer",
  "user": { "...": "..." },
  "tenants": [{ "id": "...", "code": "...", "name": "...", "isDefault": false }],
  "requiresTenantSelection": true
}

// Errors: 401 invalid credentials / deactivated / no tenant access | 400 validation
```

### POST /api/auth/select-tenant *(JWT)*
```json
// Request
{ "tenantId": "<uuid>" }

// Response 200
{ "access_token": "<jwt-scoped>", "token_type": "Bearer", "user": { "..." : "..." }, "tenant": { "..." : "..." } }

// Errors: 404 no access | 401 missing token
```

### GET /api/auth/tenants *(JWT)*
```json
{ "tenants": [{ "id": "...", "code": "...", "name": "...", "isDefault": true }], "count": 1 }
```

### GET /api/auth/users *(JWT)*
```json
{ "users": [{ "id": "...", "email": "...", "firstName": "...", "lastName": "...", "fullName": "...", "avatarUrl": null, "roles": [{ "id": "...", "code": "ADMIN", "name": "Administrator" }] }], "count": 1 }
```

### GET /api/auth/profile *(JWT)*
```json
{ "message": "Authenticated user profile", "user": { "id": "...", "email": "...", "firstName": "...", "lastName": "...", "tenantId": "...", "role": "ADMIN", "permissions": ["PROCUREMENT:VIEW", "..."] }, "tenantId": "..." }
```

### GET /api/auth/check *(JWT)*
```json
{ "message": "Authentication valid", "authenticated": true, "hasTenant": true }
```

### JWT payload contract
```ts
// Signed payload
{ sub: userId, email: string, tenantId?: string }

// req.user (resolved by JwtStrategy on every request — token NOT trusted for authz)
{ id, email, firstName, lastName, tenantId, role, permissions }
```

### Protected handler pattern
```ts
@UseGuards(JwtAuthGuard, PermissionsGuard)   // order is mandatory
@RequirePermissions('INVENTORY:VIEW')
@ApiBearerAuth('JWT-auth')
@ApiOperation({ summary: 'List inventory items' })
@Get()
findAll(@Request() req) {
  return this.service.findAll(req.user.tenantId);
}
```

---

## Implementation notes

### Files changed in this spec
| File | Change |
|---|---|
| `src/modules/auth/auth.service.ts` | Added `resolveTenantContext(userId, tenantId)` — single source of truth for role + permissions; delegates caching to `CacheService` (injected) |
| `src/modules/auth/strategies/jwt.strategy.ts` | Replaced inline DB query with call to `resolveTenantContext`; dropped `PrismaService` dependency |
| `src/common/guards/permissions.guard.ts` | Reads `req.user.permissions` instead of re-querying; dropped `PrismaService` dependency; ~35 lines removed |
| `src/database/redis.module.ts` | **New** — `@Global() RedisModule` providing the ioredis client (`REDIS_CLIENT`), fail-fast config, graceful shutdown |
| `src/common/services/cache.service.ts` | **New** — leaf `CacheService` owning the permission-cache key + TTL; `get/set/clearPermissionContext`, all fail-open |
| `src/common/common.module.ts` | **New** — `@Global() CommonModule` providing/exporting `CacheService` |
| `src/modules/users/users.service.ts` | Inject `CacheService`; `assignRoles` clears the user's cache after the write |
| `src/modules/roles/roles.service.ts` | Inject `CacheService`; `setPermissions` fans out invalidation to every holder of the role |
| `src/app.module.ts` | Registered `RedisModule` + `CommonModule` |
| `.env` | Added `REDIS_URL=redis://localhost:6379` |
| `package.json` | Added `ioredis` dependency |

### Permission resolution — performance contract
`JwtStrategy.validate` resolves the full permission union **once per request** and
stores it in `req.user.permissions`. `PermissionsGuard` reads from `req.user` —
it never issues a second DB query. This is the binding contract:

- `JwtAuthGuard` MUST always precede `PermissionsGuard` in `@UseGuards()`.
- If `PermissionsGuard` is ever needed standalone, it must call
  `AuthService.resolveTenantContext` directly — never re-implement the query.
- **Caching (implemented)**: `resolveTenantContext` checks a Redis cache
  (`permissions:${userId}:${tenantId}`, TTL 900s) before the DB and writes back on
  miss, via `CacheService`. Redis is best-effort — every cache op is wrapped so a
  failure falls back to the DB. Invalidation (`CacheService.clearPermissionCache`) is
  wired into `UsersService.assignRoles` (per-user) and `RolesService.setPermissions`
  (fan-out to all holders). `CacheService` is a leaf provider — both the writer and the
  invalidators inject it, avoiding any `AuthService` ↔ Roles/Users circular dependency.

### Global infrastructure (already in `src/main.ts`)
- Global prefix: `api`
- `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true, transform: true`
- Swagger at `/api/docs` with `JWT-auth` bearer scheme
- CORS enabled for `localhost:3001`

### Environment
- `REDIS_URL` (default `redis://localhost:6379`) — ioredis connection for the
  permission cache. Requires a running Redis (`redis-server`).

---

## Verification checklist

```bash
# 1. Seed
cd backend && pnpm seed:reset
# Expected: no errors, prints seed summary

# 2. Login
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}' | jq .
# Expected: requiresTenantSelection: false, access_token present

# 3. Profile — full permissions
TOKEN=<access_token from step 2>
curl -s http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer $TOKEN" | jq '.user.permissions | length'
# Expected: > 0

# 4. RBAC — permission held → 200
curl -s http://localhost:3000/api/suppliers \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: 200 with { suppliers: [...], count: N }

# 5. Duplicate email → 409
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Test1234","firstName":"A","lastName":"B"}' | jq .status
# Expected: 409

# 6. Short password → 400
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"new@demo.com","password":"abc","firstName":"A","lastName":"B"}' | jq .statusCode
# Expected: 400

# 7. Build + lint
pnpm build && pnpm lint
# Expected: build passes, lint errors only in pre-existing files
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-05-31 | Spec created, codebase audited | Foundation ~90% compliant |
| 2026-05-31 | `resolveTenantContext` added, strategy + guard refactored | Build ✅, lint (changed files) ✅ |
| 2026-05-31 | Live verification (seed + login + RBAC) | ✅ login `requiresTenantSelection:false`, profile 42 perms, suppliers 200 / no-token 401 |
| 2026-05-31 | Redis permission caching added (ioredis, `RedisModule`, cache + `clearPermissionCache`, fail-open) | Build ✅, lint (changed files) ✅ |
| 2026-05-31 | Cache verified live | Key TTL 900s, MONITOR shows GET-only on hit, no DB query |
| 2026-05-31 | Extracted `CacheService` (leaf, `CommonModule`); wired invalidation into `assignRoles` + `setPermissions` | Boot ✅ (no DI cycle), build ✅, lint (changed files) ✅ |
| 2026-05-31 | Invalidation verified live | `assignRoles` clears user key (1→0); `setPermissions` fan-out clears holder (1→0); state restored |
| 2026-05-31 | Fail-open verified with Redis stopped | login, profile (42 perms from DB), guarded routes (200), and 409/401 error paths all work; auth unaffected |
| 2026-05-31 | Shipped to `origin/main` (`751b69c`, `8b474f7`, `05f58ae`); spec marked **Complete** and moved to `specs/completed/` | All acceptance criteria met and verified live |