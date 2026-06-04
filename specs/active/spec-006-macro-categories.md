# spec-006 — Macro Categories (Inventory Classification)

Status: **Draft**  
Owner: Inventory  
Sprint: 19  
Module(s): `macro-categories` (touches `categories` for the cross-module count, `frontend/lib/api/macro-categories.ts` for the list envelope)  
Last updated: 2026-06-04  

---

## Problem

Macro categories are the top level of the two-tier inventory classification
(`MacroCategory → Category → Item`). Every item rolls up to a macro category through its
category, and the items page, BOM formulator, and procurement filters all pivot on this
hierarchy. The module is small (5 endpoints, 86-line service) and mature in validation and
error handling — but a code audit (2026-06-04) found four concrete deviations from the
project's most critical invariants:

1. **Unscoped write in `update()`** — `macro-categories.service.ts:65` uses
   `macroCategory.update({ where: { id } })`. The tenant check lives only in the prior
   `findOne`; the write itself is not scoped. The codebase convention (gold standard:
   `suppliers.service.ts:119`, `items.service.ts:337`) is
   `updateMany({ where: { id, tenantId, deletedAt: null } })` so the scope is enforced
   **at the write**, not one query earlier.
2. **Unscoped soft-delete write in `remove()`** — `macro-categories.service.ts:81`, same
   pattern: `update({ where: { id } })` with no `tenantId` / `deletedAt: null` in the where.
3. **Unscoped cross-tenant count** — `macro-categories.service.ts:73` runs
   `category.count({ where: { macroCategoryId: id, deletedAt: null } })` without `tenantId`
   on a tenant-owned model. Mitigated today by the prior scoped `findOne`, but it violates
   the "every query scoped" invariant.
4. **Cross-module Prisma access** — that same `category.count` queries the `Category`
   model directly, which is owned by the `categories` module. Project rule: import the
   module and inject its service; never query another module's tables with Prisma.

Additionally, `GET /api/macro-categories` returns a **bare array** instead of the
`{ <resource>: [...], count }` list envelope codified in spec-001 and adopted by
spec-002 (suppliers) and spec-003 (items). The frontend `macroCategoriesApi.getAll`
currently depends on the bare array, so the envelope change and the consumer update
ship together.

This spec codifies the module's existing (correct) behavior as the contract and closes
the five gaps above — with **no schema changes**.

---

## Acceptance criteria

### Endpoints
- [x] `POST /api/macro-categories` — creates a macro category; `409` when `code` already
      exists for the tenant (active rows only); returns the entity with
      `_count.categories`; defaults `isActive: true` when omitted.
- [x] `GET /api/macro-categories` — lists the tenant's active macro categories ordered by
      `code` asc, each with `_count.categories`.
- [ ] `GET /api/macro-categories` returns the list envelope
      `{ macroCategories: [...], count: <n> }` (spec-001 convention; currently a bare
      array), and `frontend/lib/api/macro-categories.ts` `getAll` destructures
      `res.data.macroCategories ?? []` in the same change.
- [x] `GET /api/macro-categories/:id` — returns the macro category with its active child
      categories (ordered by `code` asc, each with `_count.items`); `404` when not found
      in the tenant.
- [x] `PATCH /api/macro-categories/:id` — partial update; `404` when not found; `409` when
      the new `code` collides with another active row in the tenant (self excluded).
- [x] `DELETE /api/macro-categories/:id` — soft delete; `400` with the live category count
      when active child categories exist; `404` when not found; returns
      `{ message, id }`.

### Tenant scoping (CLAUDE.md invariant — the core of this spec)
- [x] All reads (`create` duplicate check, `findAll`, `findOne`, `update` conflict check)
      scoped `where: { tenantId, deletedAt: null }` with `tenantId` from `req.user.tenantId`.
- [ ] `update()` write is tenant-scoped at the write itself:
      `updateMany({ where: { id, tenantId, deletedAt: null } })` per the
      suppliers/items convention (`macro-categories.service.ts:65`).
- [ ] `remove()` soft-delete write is tenant-scoped at the write itself:
      `updateMany({ where: { id, tenantId, deletedAt: null } })`
      (`macro-categories.service.ts:81`).
- [ ] The child-category count used by `remove()` is scoped with `tenantId`
      (`macro-categories.service.ts:73`).
- [x] `create` writes `tenantId` from the JWT; never from request body or headers.

### Module interconnection
- [ ] `MacroCategoriesService` no longer queries the `Category` model with Prisma
      directly. `MacroCategoriesModule` imports `CategoriesModule` and injects
      `CategoriesService`, which gains a public
      `countByMacroCategory(tenantId, macroCategoryId): Promise<number>` (tenant-scoped,
      `deletedAt: null`) used by `remove()`.
      *(`CategoriesModule` already exports `CategoriesService`; the `findOne` include of
      child `categories` is a relation include on the module's own model and stays.)*

### DTO validation
- [x] `CreateMacroCategoryDto`: `code` (`@IsString @MaxLength(50)`), `name`
      (`@IsString @MaxLength(255)`), `description?` (`@IsOptional @IsString`),
      `isActive?` (`@IsOptional @IsBoolean`) — all with Swagger `@ApiProperty`.
- [x] `UpdateMacroCategoryDto extends PartialType(CreateMacroCategoryDto)`.
- [x] Global `ValidationPipe` (`whitelist, forbidNonWhitelisted, transform`) rejects
      unknown fields with `400`.

### RBAC
- [x] Controller guarded by `@UseGuards(JwtAuthGuard, PermissionsGuard)` +
      `@ApiBearerAuth('JWT-auth')`.
- [x] Permissions: create → `INVENTORY:CREATE`, list/detail → `INVENTORY:VIEW`,
      update → `INVENTORY:EDIT`, delete → `INVENTORY:DELETE`.

### Error handling
- [x] `409 ConflictException` — duplicate `code` on create and on update (self excluded).
- [x] `404 NotFoundException` — `findOne`/`update`/`remove` on missing or other-tenant id.
- [x] `400 BadRequestException` — delete blocked while active child categories exist;
      message includes the live count.

### Swagger
- [x] Every handler has `@ApiOperation` + `@ApiResponse` (success and error codes) and
      `@ApiParam` on `:id` routes.

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations.
- CRUD of child categories (`categories` module — separate spec).
- Account mapping (`inventoryAccountId` / `cogsAccountId` live on `Category`, not here).
- Auto-generated codes (`generateCode` pattern) — macro category codes are user-supplied
  business mnemonics (`WOOD`, `CHEM`), unique per tenant by design.
- Pagination/filtering on the list endpoint (tenant macro-category sets are small).
- Frontend changes beyond the one-line `getAll` envelope destructure.
- Bulk import of classification trees (covered by `bulk-import` module).

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `MacroCategory` | `in_macro_categories` | `tenantId`, `code`, `name`, `description?`, `isActive`, audit + soft-delete columns; `@@unique([tenantId, code])`, `@@index([tenantId])` |
| `Category` *(read-only here)* | `in_categories` | `tenantId`, `macroCategoryId`, `code`, `name`; `@@unique([tenantId, code])`, `@@index([tenantId, macroCategoryId])` |

Key invariants:
- `code` unique **per tenant** among rows where the DB constraint applies; service enforces
  uniqueness among active (`deletedAt: null`) rows.
- Soft delete only (`deletedAt` + `deletedBy`); hard deletes never issued.
- A macro category with active child categories cannot be deleted (referential guard in
  service, not DB).

---

## API contracts

All routes prefixed `/api`, JWT-guarded, permission-gated as listed above.

### POST /api/macro-categories
```json
// Request
{ "code": "WOOD", "name": "Wood & Panels", "description": "Wood-based raw materials", "isActive": true }

// Response 201
{ "id": "<uuid>", "tenantId": "<uuid>", "code": "WOOD", "name": "Wood & Panels",
  "description": "Wood-based raw materials", "isActive": true,
  "createdAt": "...", "updatedAt": "...", "deletedAt": null,
  "createdBy": "<uuid>", "updatedBy": "<uuid>", "deletedBy": null,
  "_count": { "categories": 0 } }

// Errors: 409 code exists | 400 validation | 401 no token | 403 missing INVENTORY:CREATE
```

### GET /api/macro-categories
```json
// Response 200 (target envelope — see unchecked criterion)
{ "macroCategories": [ { "id": "...", "code": "WOOD", "name": "Wood & Panels",
    "isActive": true, "_count": { "categories": 3 } } ],
  "count": 1 }

// Errors: 401 | 403 missing INVENTORY:VIEW
```

### GET /api/macro-categories/:id
```json
// Response 200
{ "id": "...", "code": "WOOD", "name": "Wood & Panels",
  "categories": [ { "id": "...", "code": "PLY", "name": "Plywood",
      "_count": { "items": 12 } } ] }

// Errors: 404 not found (or other tenant) | 401 | 403
```

### PATCH /api/macro-categories/:id
```json
// Request (any subset of create fields)
{ "name": "Wood, Panels & Veneers" }

// Response 200 — updated entity with _count.categories

// Errors: 404 not found | 409 code exists | 400 validation | 401 | 403 missing INVENTORY:EDIT
```

### DELETE /api/macro-categories/:id
```json
// Response 200
{ "message": "Macro category deleted successfully", "id": "<uuid>" }

// Errors: 400 has child categories ("Cannot delete: N categories still assigned...")
//         404 not found | 401 | 403 missing INVENTORY:DELETE
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/macro-categories/macro-categories.service.ts` | Scope `update()` and `remove()` writes via `updateMany({ where: { id, tenantId, deletedAt: null } })`; replace direct `category.count` with injected `CategoriesService.countByMacroCategory`; wrap `findAll` in `{ macroCategories, count }` |
| `src/modules/macro-categories/macro-categories.module.ts` | Import `CategoriesModule` |
| `src/modules/categories/categories.service.ts` | Add public `countByMacroCategory(tenantId, macroCategoryId)` — tenant-scoped, `deletedAt: null` |
| `src/modules/macro-categories/macro-categories.controller.ts` | No changes (already compliant) |
| `src/modules/macro-categories/dto/*` | No changes (already compliant) |
| `frontend/lib/api/macro-categories.ts` | `getAll` destructures `res.data.macroCategories ?? []` |

### Cross-module dependencies
- `macro-categories` → `categories` (new, this spec): `CategoriesService.countByMacroCategory`
  for the delete guard. `CategoriesModule` already exports the service; no circular risk
  (`categories` does not import `macro-categories` — it reads the `MacroCategory` relation
  via its own scoped query at `categories.service.ts:29`, pre-existing and out of scope).

### Behavioral notes
- `updateMany` returns a count, not the entity — after a scoped `updateMany`, re-fetch via
  the existing scoped `findOne`/`findFirst` to keep the response shape identical
  (suppliers/items already follow this pattern).
- The `update()` 404 path stays: `findOne` runs first and throws before any write.
- `update({ where: { id } })` cannot carry `tenantId` because Prisma `update` requires a
  unique where — hence the `updateMany` convention.

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe` (`whitelist, forbidNonWhitelisted, transform`);
  Swagger at `/api/docs` (`JWT-auth` bearer).

---

## Verification checklist

```bash
# 0. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}' | jq -r .access_token)

# 1. Create → 201 with _count
curl -s -X POST http://localhost:3000/api/macro-categories \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"code":"SPEC6","name":"Spec-006 Test"}' | jq '{code, _count}'
# Expected: { "code": "SPEC6", "_count": { "categories": 0 } }

# 2. Duplicate code → 409
curl -s -X POST http://localhost:3000/api/macro-categories \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"code":"SPEC6","name":"Dup"}' | jq .statusCode
# Expected: 409

# 3. List → envelope
curl -s http://localhost:3000/api/macro-categories \
  -H "Authorization: Bearer $TOKEN" | jq 'has("macroCategories") and has("count")'
# Expected: true

# 4. Unknown body field → 400 (forbidNonWhitelisted)
curl -s -X POST http://localhost:3000/api/macro-categories \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"code":"X1","name":"X","bogus":true}' | jq .statusCode
# Expected: 400

# 5. Update from another tenant's token → 404 (scoped write — tenant isolation)
# (create a second tenant/user, then PATCH the SPEC6 id with that token)
# Expected: 404, and the row is unchanged for tenant DEMO

# 6. Delete with children → 400
MC_ID=<id of a macro category that has categories, e.g. seeded WOOD>
curl -s -X DELETE http://localhost:3000/api/macro-categories/$MC_ID \
  -H "Authorization: Bearer $TOKEN" | jq .statusCode
# Expected: 400 with "Cannot delete: N categories..."

# 7. Delete leaf → 200, then GET → 404 (soft-deleted)
SPEC6_ID=<id from step 1>
curl -s -X DELETE http://localhost:3000/api/macro-categories/$SPEC6_ID \
  -H "Authorization: Bearer $TOKEN" | jq .message
curl -s http://localhost:3000/api/macro-categories/$SPEC6_ID \
  -H "Authorization: Bearer $TOKEN" | jq .statusCode
# Expected: "Macro category deleted successfully", then 404

# 8. No token → 401; viewer-only token on POST → 403
curl -s http://localhost:3000/api/macro-categories | jq .statusCode
# Expected: 401

# 9. Build + tests
cd backend && pnpm build && pnpm test macro-categories
# Expected: build passes, unit tests green
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-04 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 18) | Draft — 4 invariant gaps (3 tenant-scoping writes/count, 1 cross-module Prisma access) + list-envelope gap captured as unchecked criteria |
