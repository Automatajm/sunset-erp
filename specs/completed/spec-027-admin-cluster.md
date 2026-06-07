# spec-027 — Admin Cluster (Users / Roles / Tenants / Tenant Settings)

Status: **Complete**  
Owner: Platform  
Sprint: Admin Tier 0 (cluster spec, per `specs/MODULE-CASCADE.md` — the four admin
modules are one tightly-coupled unit: users↔roles↔tenants↔tenant-settings)  
Module(s): `users`, `roles`, `tenants`, `tenant-settings` (touches
`frontend/lib/api/tenant-settings.ts` + `app/settings/{users,roles,tenants,general}/page.tsx`)  
Last updated: 2026-06-06  

---

## Problem

The admin Tier 0 modules govern who can do what: `users` (per-tenant membership +
role assignment), `roles` (RBAC role + permission management, cache invalidation
already wired in spec-001), `tenants` (the global tenant registry), and
`tenant-settings` (UOM base + the spec-021 `baseCurrency`). They sit beneath every
other module — a defect here is an authorization or data-integrity defect
everywhere. They were grown in the Foundation sprint and never specced.

The audit (opportunity-finder, 2026-06-06) found:

1. **`tenant-settings` has NO authorization** — the controller is
   `@UseGuards(JwtAuthGuard)` only (`tenant-settings.controller.ts:10`), with no
   `PermissionsGuard` and no `@RequirePermissions`. **Any authenticated user can
   read and overwrite the tenant's base currency and system UOMs** — a settings
   tamper that silently corrupts the frozen-rate base (spec-021) and UOM
   resolution. `SETTINGS:VIEW`/`SETTINGS:EDIT` now exist (spec-021) and must gate it.
2. **Two admin pages are broken TODAY** — the frontend reads
   `usersRes.data?.users` (`app/settings/users/page.tsx:184`) and
   `rolesRes.data?.roles` (`app/settings/roles/page.tsx:190`), but the services
   return **bare arrays** (`users.service.ts:47`, `roles.service.ts:34`). Both
   settings pages render permanently empty. The `{ <resource>, count }` envelope
   is both the convention and the fix.
3. **Pattern-violating writes** — `roles.update` (`:150`), `roles.setPermissions`
   (`:165`), `roles.remove` (`:210`) and `users.setActive` write by bare `id`
   after a tenant-scoped read (TOCTOU window); migrate to scoped `updateMany`.
4. **Fragile generators / missing P2002** — `tenants.generateCode` (`:114-122`)
   uses `findFirst + orderBy desc` (string sort) and both `roles.create` (unique
   `[tenantId, code]`) and `tenants.create` (unique `code`) rely on a pre-check
   with no `P2002 → 409` fallback (concurrent create → 500).
5. **`baseCurrency` unreachable from the API** — spec-021 added
   `TenantSettings.baseCurrency` but `UpdateTenantSettingsDto` has no field for it
   and the service does not catalog-validate it; the monetary base can never be
   changed from DOP through the API.
6. **Self-/last-admin foot-guns** — `users.setActive(false)` lets an admin
   deactivate themselves or the last active admin of a tenant, locking everyone
   out; `tenants` has no self-deactivation guard either.
7. **Missing Swagger `@ApiResponse`** — most handlers across the four controllers
   have `@ApiOperation` only (35+ handlers, ~30 missing a response annotation).
8. **Weak DTOs** — `tenants.create`/`update` accept free-string `country`,
   `defaultCurrency`, `status`, `subscriptionPlan`, `companySize` with no `@IsIn`
   / `@Length`; `users.update.status` is a free string.

No schema migration is required — `baseCurrency` already exists (spec-021).

---

## Acceptance criteria

### Authorization (the critical gap)
- [x] `TenantSettingsController` adds `PermissionsGuard` to `@UseGuards` and
      `@RequirePermissions('SETTINGS:VIEW')` on the two GETs (`get`,
      `getSystemUoms`) and `@RequirePermissions('SETTINGS:EDIT')` on `update`.
- [x] `users` (all handlers `ADMIN:USERS`), `roles` (all `ADMIN:ROLES`),
      `tenants` (all `ADMIN:SETTINGS`) are already guarded
      `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions`.

### Response format (fixes two broken pages)
- [x] `GET /api/users` returns `{ users: [...], count: n }` (frontend already
      reads `.users`).
- [x] `GET /api/roles` returns `{ roles: [...], count: n }` (frontend already
      reads `.roles`).
- [x] `GET /api/tenants` returns `{ tenants: [...], count: n }` +
      `frontend-sync`: `app/settings/tenants/page.tsx:301` (`setTenants(res.data)`)
      unwraps `.tenants` (today it reads the bare array).
- [x] `GET /api/roles/permissions` already returns `{ permissions, grouped, count }`.

### Tenant scoping & write pattern
- [x] `roles.update` (`:150`), `roles.setPermissions` (`:165` — the role-scoped
      delete/create stays, but the role existence guard already runs scoped) and
      `roles.remove` (`:210`) migrate id-only writes to
      `updateMany({ where: { id, tenantId, deletedAt: null } })` + refetch.
- [x] `users.setActive` and `users.update` keep their `UserTenant` membership gate
      and write the global `User`/`UserTenant` row only after it passes (documented:
      `User` is a global table joined to the tenant via `UserTenant`; the membership
      `findFirst` IS the tenant scope).
- [x] `users`/`roles` reads are tenant-scoped (`userTenant`/`role` by `tenantId`;
      `userRoles` filtered by `tenantId`; `deletedAt: null` on roles).
- [x] `tenants` is the global registry (no `tenantId` scope by design — admin-only
      via `ADMIN:SETTINGS`); reads filter `deletedAt: null`.

### Document number generation
- [x] `tenants.generateCode` migrates to the numeric-max pattern
      (`findMany` startsWith → parse trailing int → `reduce Math.max`), format
      `<BASE>-NNNN`.
- [x] `roles.create` maps `P2002` on `@@unique([tenantId, code])` →
      `409 ConflictException`; `tenants.create` maps `P2002` on `code` unique → `409`
      (both keep the friendly pre-check, add the race-safe fallback).

### Tenant settings — baseCurrency reachable
- [x] `UpdateTenantSettingsDto` gains `baseCurrency?` (`@IsOptional @IsString
      @Length(3,3)`); `TenantSettingsService.update` validates it against the
      `mc_currencies` catalog (`404` unknown code) before persisting.
- [x] `getOrCreate` lazily creates settings with `defaultUomSystem: 'metric'`
      (and the `baseCurrency` DB default `'DOP'` from spec-021).

### Safety guards
- [x] `users.setActive(tenantId, userId, false)` rejects with `400` when
      `userId === actingUserId` (no self-deactivation) and when the user is the
      **last active member** of the tenant holding an `ADMIN:USERS`-bearing role
      (no lock-out). *(Policy: block; confirm at review.)*
- [x] `roles.remove` already blocks deleting a role with assigned users and
      system roles; `roles.update`/`updatePermissions` block system roles.

### DTO validation
- [x] `tenants` DTOs: `country` `@Length(2,2)` (ISO 3166-1 alpha-2),
      `defaultCurrency` `@Length(3,3)`, `status` `@IsIn(['active','suspended','cancelled'])`,
      `subscriptionPlan` `@IsIn(['free','starter','pro','enterprise'])`,
      `companySize` `@IsIn(['1-10','11-50','51-200','201-1000','1000+'])` (nullable/optional).
- [x] `users.update.status` gets `@IsIn(['active','inactive','suspended'])`.
- [x] Existing validation preserved: `@IsEmail`/`@MinLength(8)` on user create,
      `@IsUUID('4', { each: true })` on roleIds/permissionIds, role `code`/`name`
      strings, settings UOM `@IsUUID`s.

### Swagger
- [x] `@ApiResponse` added to every handler missing it across the four controllers
      (~30 handlers): list/detail/create/update/activate/deactivate/assign-roles/
      reset-password (users); list/permissions/detail/create/update/permissions/
      delete (roles); list/create/detail/update/add-user/remove-user/set-default
      (tenants); get/update/system-uoms (tenant-settings).
- [x] All four controllers carry `@ApiTags` + `@ApiBearerAuth('JWT-auth')`.

### Error handling (existing, pinned)
- [x] `404` user/role/tenant/membership not found; `409` duplicate user-in-tenant,
      duplicate role code, duplicate tenant code; `400` roles/permissions not in
      tenant, system-role edit/delete, role-in-use delete.
- [x] `409` added on the concurrent-create P2002 paths (above).

---

## Out of scope

- `automation`, `fiscal-periods`, `budgets`, `cash-flow`, `financial-reports`
  (the other unspecced modules — their own specs).
- Self-service auth flows (register/login/select-tenant live in spec-001 `auth`).
- Hard-deleting users or tenants (soft delete / membership deactivation only).
- Cross-tenant user transfer, SSO, invitations, email verification.
- A `baseCurrency`-change retro-conversion of existing transactions (frozen-rate
  rows stay as posted; changing the base only affects NEW transactions).
- Subscription/billing enforcement (`subscriptionPlan` is a label here; the
  `saas_*` billing models are out of scope).
- Frontend rebuild of the admin pages beyond the envelope unwrap sync.

---

## Data model

**No schema changes** (`baseCurrency` already added by spec-021). Reference:

| Model | Table | Key fields |
|---|---|---|
| `User` | `auth_users` | `email` (global unique), `passwordHash`, `firstName`, `lastName`, `phone?`, `status`, `deletedAt` |
| `UserTenant` | `auth_user_tenants` | `userId`, `tenantId`, `isActive`, `isDefault`; `@@unique([userId, tenantId])` (membership join) |
| `Role` | `auth_roles` | `tenantId`, `code`, `name`, `isSystem`, `deletedAt`; `@@unique([tenantId, code])` |
| `RolePermission` | `auth_role_permissions` | `roleId`, `permissionId`; `@@unique([roleId, permissionId])` |
| `UserRole` | `auth_user_roles` | `userId`, `roleId`, `tenantId`; `@@unique([userId, roleId, tenantId])` |
| `Permission` | `auth_permissions` | `code` (global unique), `name`, `module` |
| `Tenant` | `saas_tenants` | `code` (global unique), `name`, `country`, `status`, `defaultCurrency` (legacy), `deletedAt` |
| `TenantSettings` | `cfg_tenant_settings` | `tenantId` (unique), `baseCurrency` (spec-021), 6× UOM base FKs |

Key invariants:
- `User` is global; tenant scope is the `UserTenant` membership row. RBAC is
  per-tenant via `UserRole(tenantId)`. Permission-cache invalidation on role
  changes is already wired (spec-001 `CacheService`) — preserve it.
- `Tenant.defaultCurrency` is legacy/subscription-level; the monetary base is
  `TenantSettings.baseCurrency` (spec-021) — never conflate them.
- Role/tenant codes are uppercase; uniqueness backstopped by DB constraints.

---

## API contracts

All routes `/api`, JWT-guarded.

### Users *(ADMIN:USERS)*
```json
// GET /api/users → { "users": [ { "id","email","fullName","status","isActive","roles":[...] } ], "count": n }  (NEW envelope)
// GET /api/users/:id → user detail (+ phone)
// POST /api/users { email, password(min8), firstName, lastName, phone?, roleIds?[] }
//   → 201 user; 409 user already in tenant
// PATCH /api/users/:id { firstName?, lastName?, phone?, status? (active|inactive|suspended) }
// PATCH /api/users/:id/activate | /deactivate → 400 self-deactivate / last-admin (NEW guard)
// PATCH /api/users/:id/roles { roleIds:[uuid] } → replaces roles, clears perm cache
// PATCH /api/users/:id/reset-password { newPassword(min8) }
// Errors: 404 not in tenant | 400 roles not in tenant | 409 dup
```

### Roles *(ADMIN:ROLES)*
```json
// GET /api/roles → { "roles": [ { "id","code","name","isSystem","userCount","permissions":[...] } ], "count": n }  (NEW envelope)
// GET /api/roles/permissions → { permissions:[...], grouped:{...}, count }  (unchanged)
// POST /api/roles { code, name, description?, permissionIds?[] } → 201; 409 dup code (pre-check + P2002)
// PATCH /api/roles/:id { name?, description? } → 400 system role
// PATCH /api/roles/:id/permissions { permissionIds:[uuid] } → replaces, clears holders' cache; 400 system role
// DELETE /api/roles/:id → 400 system role / role in use
```

### Tenants *(ADMIN:SETTINGS)*
```json
// GET /api/tenants → { "tenants": [ { "id","code","name","status","userCount", ... } ], "count": n }  (NEW envelope — frontend sync)
// GET /api/tenants/:id → tenant detail + users[]
// POST /api/tenants { name, country(ISO-2), code?, defaultCurrency?(ISO-3), status?, subscriptionPlan?, ... }
//   → 201 (code auto-generated numeric-max if omitted); 409 dup code (pre-check + P2002)
// PATCH /api/tenants/:id { ...validated fields }
// POST /api/tenants/:id/users { userId } ; DELETE /api/tenants/:id/users/:userId
// PATCH /api/tenants/:id/users/:userId/set-default { unset? }
```

### Tenant Settings *(SETTINGS:VIEW / SETTINGS:EDIT — NEW guard)*
```json
// GET /api/tenant-settings → settings (+ resolved UOM relations)        [SETTINGS:VIEW]
// GET /api/tenant-settings/system-uoms → { volume,mass,...,list[] }      [SETTINGS:VIEW]
// PATCH /api/tenant-settings { defaultUomSystem?, baseCurrency?(ISO-3, catalog-validated), <uom>BaseUomId? }
//   → updated settings                                                   [SETTINGS:EDIT]
//   Errors: 404 currency not in catalog (NEW)
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/tenant-settings/tenant-settings.controller.ts` | Add `PermissionsGuard` + `@RequirePermissions('SETTINGS:VIEW'/'EDIT')`; `@ApiResponse` |
| `src/modules/tenant-settings/tenant-settings.service.ts` | Catalog-validate `baseCurrency` on update |
| `src/modules/tenant-settings/dto/update-tenant-settings.dto.ts` | Add `baseCurrency?` (`@Length(3,3)`) |
| `src/modules/users/users.service.ts` | `{ users, count }` envelope; self-/last-admin deactivation guard; scoped `updateMany` on setActive |
| `src/modules/users/users.controller.ts` | `@ApiResponse` across handlers; `@IsIn` status (DTO) |
| `src/modules/roles/roles.service.ts` | `{ roles, count }` envelope; scoped `updateMany` (update/remove); `P2002 → 409` on create |
| `src/modules/roles/roles.controller.ts` | `@ApiResponse` across handlers |
| `src/modules/tenants/tenants.service.ts` | `{ tenants, count }` envelope; numeric-max `generateCode`; `P2002 → 409` on create |
| `src/modules/tenants/tenants.controller.ts` | `@ApiResponse`; DTO `@IsIn`/`@Length` |
| `src/modules/tenants/dto/*`, `users/dto/update-user.dto.ts` | `@IsIn`/`@Length` whitelists |
| `frontend/app/settings/tenants/page.tsx` | `setTenants(res.data.tenants ?? res.data)` (envelope unwrap) |

### Cross-module dependencies
- **`CacheService`** (spec-001) — `users.assignRoles` and `roles.setPermissions`
  already clear the permission cache; this spec must not regress that wiring.
- **`mc_currencies`** — `tenant-settings.update` validates `baseCurrency` against
  the catalog (same check `currency` uses in spec-025/026).
- The users + roles envelope change is a **bug fix**: the frontend already reads
  `.users`/`.roles`, so the pages go from permanently-empty to working.

### Behavioral notes
- The last-admin guard counts active `UserTenant` members of the tenant whose
  `UserRole` maps to a role holding `ADMIN:USERS`; deactivating the last one (or
  oneself) is a `400`.
- Changing `baseCurrency` affects only NEW frozen-rate transactions; posted rows
  keep their frozen base (no retro-conversion — out of scope).

---

## Verification checklist

```bash
# 0. Login (admin@demo.com is multi-tenant — select-tenant)
TOKEN=... # after select-tenant

# 1. tenant-settings now guarded — a token WITHOUT SETTINGS:VIEW → 403
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/tenant-settings \
  -H "Authorization: Bearer $LIMITED_TOKEN"   # Expected: 403

# 2. Envelopes (and the two broken pages fixed)
curl -s http://localhost:3000/api/users   -H "Authorization: Bearer $TOKEN" | jq 'has("users") and has("count")'   # true
curl -s http://localhost:3000/api/roles   -H "Authorization: Bearer $TOKEN" | jq 'has("roles") and has("count")'   # true
curl -s http://localhost:3000/api/tenants -H "Authorization: Bearer $TOKEN" | jq 'has("tenants") and has("count")' # true

# 3. baseCurrency reachable + catalog-validated
curl -s -X PATCH http://localhost:3000/api/tenant-settings -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"baseCurrency":"DOP"}' | jq .baseCurrency   # "DOP"
curl -s -X PATCH http://localhost:3000/api/tenant-settings -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"baseCurrency":"XXX"}' | jq .statusCode     # 404

# 4. Self-deactivation blocked
curl -s -o /dev/null -w '%{http_code}' -X PATCH \
  http://localhost:3000/api/users/<ownId>/deactivate -H "Authorization: Bearer $TOKEN"  # 400

# 5. Bad tenant enum / role dup
curl -s -X POST http://localhost:3000/api/tenants -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"X","country":"Dominican Republic"}' | jq .statusCode  # 400 (country not ISO-2)

# 6. Tests + builds
cd backend && pnpm test users.service roles.service tenants.service tenant-settings.service
pnpm test:e2e admin-cluster && pnpm build && cd ../frontend && pnpm build
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (cluster: users/roles/tenants/tenant-settings; headline — tenant-settings unauthorized + two broken admin pages from missing envelopes) | Draft — pending review |
| 2026-06-06 | Test scaffolds written (36 unit across 4 services / 17 cluster e2e, [GAP]-tagged) | Red as designed |
| 2026-06-06 | All 22 gaps implemented: tenant-settings now PermissionsGuard + SETTINGS:VIEW/EDIT (auth gap closed, e2e proves 403 for a no-perm role); { users/roles/tenants, count } envelopes (fixed the two empty admin pages — controllers no longer double-wrap; frontend tenants page unwraps); baseCurrency reachable + catalog-validated (404); self-/last-admin deactivation guard (400, counts other ADMIN:USERS holders); roles update/remove + tenants create scoped/P2002→409; numeric-max tenant code; DTO @IsIn companySize + user status suspended; ~30 @ApiResponse; spec-001 cache fan-out preserved (unit-asserted) | Unit 36/36, e2e 17/17, build OK, lint clean |
| 2026-06-06 | Shipped to origin (be2fa80); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
