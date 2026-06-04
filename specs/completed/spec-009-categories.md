# spec-009 — Categories (Inventory Classification, Level 2)

Status: **Complete**  
Owner: Inventory  
Sprint: 19  
Module(s): `categories` (touches `chart-of-accounts` for GL-account validation; `frontend/lib/api/categories.ts` + `frontend/app/inventory/stock-reconciliation/[id]/AssignmentModal.tsx` for the list envelope)  
Last updated: 2026-06-04  

---

## Problem

Categories are the second level of the inventory classification
(`MacroCategory → Category → Item`) and carry the GL account mapping
(`inventoryAccountId` for receipts, `cogsAccountId` for shipments) that automated journal
entries depend on. The module is mature (5 endpoints, full Swagger, thin controller,
strong DTOs) — but a code audit (2026-06-04, opportunity-finder score 28, the highest in
the cascade so far) found five deviations, two of which are **cross-tenant reference
vectors**:

1. **Unscoped write in `update()`** — `categories.service.ts:84-88` uses
   `category.update({ where: { id } })`; convention (spec-006/007/008):
   `updateMany({ where: { id, tenantId, deletedAt: null } })` at the write.
2. **Unscoped soft-delete write in `remove()`** — `categories.service.ts:98-101`.
3. **Untenanted cross-module count** — `categories.service.ts:93` runs
   `item.count({ where: { categoryId: id, deletedAt: null } })` with no `tenantId`, and it
   queries the `Item` model owned by the items module directly.
4. **Unvalidated re-parenting** — `update()` accepts `macroCategoryId` (via `PartialType`)
   without validation: a nonexistent id crashes with FK P2003 → 500, and a macro category
   belonging to **another tenant** links silently (the FK is not tenant-composite) —
   a cross-tenant pointer.
5. **Unvalidated GL accounts** — `create()` and `update()` write `inventoryAccountId` /
   `cogsAccountId` unchecked: nonexistent → 500; another tenant's account → silent
   cross-tenant accounting mapping.

Additionally, `GET /api/categories` returns a **bare array** instead of the spec-001
`{ categories, count }` envelope. Two frontend consumers depend on it
(`frontend/lib/api/categories.ts:8` and `AssignmentModal.tsx:119`), so the envelope and
both consumer updates ship together.

**Documented exception (not a gap):** `create()`'s `MacroCategory` lookup
(`categories.service.ts:28-31`) queries the model directly but fully tenant-scoped. It
cannot delegate to `MacroCategoriesService` because `MacroCategoriesModule` already
imports `CategoriesModule` (spec-006) — injecting the other way would create a module
cycle. spec-006 recorded this as accepted; this spec extends the same scoped lookup to
`update()`'s re-parenting validation.

This spec codifies existing behavior as the contract and closes the gaps — with **no
schema changes**.

---

## Acceptance criteria

### Endpoints
- [x] `POST /api/categories` — creates a category under a macro category; `409` on
      duplicate active `code` for the tenant; `404` when `macroCategoryId` does not
      resolve in the tenant; defaults `isActive: true`; returns the entity with
      `macroCategory`, GL account summaries, and `_count.items`.
- [x] `GET /api/categories` — lists the tenant's active categories ordered by macro
      category code then code; optional `?macroCategoryId=` filter.
- [x] `GET /api/categories` returns the list envelope `{ categories: [...], count: <n> }`.
      In the same change: `categoriesApi.getAll` destructures `res.data.categories ?? []`
      (`frontend/lib/api/categories.ts:8`) and `AssignmentModal` does the same
      (`frontend/app/inventory/stock-reconciliation/[id]/AssignmentModal.tsx:119`).
- [x] `GET /api/categories/:id` — returns the category with full `macroCategory`, GL
      accounts, and `_count.items`; `404` when not found in the tenant.
- [x] `PATCH /api/categories/:id` — partial update; `404` when not found; `409` when the
      new `code` collides with another active row (self excluded).
- [x] `DELETE /api/categories/:id` — soft delete; `400` with the live count while active
      items are assigned; `404` when not found; returns `{ message, id }`.

### Tenant scoping (CLAUDE.md invariant)
- [x] All reads (`create` dup + macro checks, `findAll`, `findOne`, `update` conflict
      check, `countByMacroCategory`) scoped `where: { tenantId, deletedAt: null }`.
- [x] `update()` write is tenant-scoped at the write itself:
      `updateMany({ where: { id, tenantId, deletedAt: null } })`, then re-fetch with the
      standard include to preserve the response shape (`categories.service.ts:84-88`).
- [x] `remove()` soft-delete write is tenant-scoped at the write itself
      (`categories.service.ts:98-101`).
- [x] The delete guard's item count is tenant-safe: replace the direct
      `prisma.item.count` (`categories.service.ts:93`, missing `tenantId`) with the
      category's **own filtered relation count**
      (`_count: { select: { items: { where: { deletedAt: null } } } }` on the scoped
      category read) — tenant safety follows from the scoped parent row, and the
      cross-module query disappears.
- [x] `create` writes `tenantId` from the JWT; never from request body or headers.

### Referential integrity (cross-tenant vectors — the core of this spec)
- [x] `update()` validates `macroCategoryId` when provided: scoped lookup
      (`{ id, tenantId, deletedAt: null }`) → `404` when it does not resolve in the
      tenant. Same documented-exception direct query as `create()` (module cycle with
      macro-categories).
- [x] `create()` and `update()` validate `inventoryAccountId` and `cogsAccountId` when
      provided via the injected `ChartOfAccountsService.findOne(tenantId, id)` → `404`
      when the account does not resolve **in the tenant** (closes both the FK-500 and the
      cross-tenant mapping).
- [x] `create()` validates `macroCategoryId` with a scoped lookup → `404`
      (`categories.service.ts:28-31`).

### Module interconnection
- [x] `CategoriesModule` imports `ChartOfAccountsModule` and injects
      `ChartOfAccountsService` for GL-account validation (`ChartOfAccountsModule` already
      exports the service; no cycle — chart-of-accounts imports no business module).
- [x] No direct `prisma.item.*` access remains in this module (the delete guard uses the
      own-relation count).
- [x] The scoped direct `MacroCategory` lookups are the documented exception (cycle with
      `MacroCategoriesModule`, accepted since spec-006).

### DTO validation
- [x] `CreateCategoryDto`: `macroCategoryId` (`@IsUUID`), `code` (`@IsString
      @MaxLength(50)`), `name` (`@MaxLength(255)`), `description?`,
      `inventoryAccountId?` / `cogsAccountId?` (`@IsOptional @IsUUID`), `isActive?`.
- [x] `UpdateCategoryDto extends PartialType(CreateCategoryDto)`.
- [x] Global `ValidationPipe` (`whitelist, forbidNonWhitelisted, transform`) → `400` on
      unknown fields.

### RBAC
- [x] `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth('JWT-auth')`.
- [x] Permissions: create → `INVENTORY:CREATE`, list/detail → `INVENTORY:VIEW`,
      update → `INVENTORY:EDIT`, delete → `INVENTORY:DELETE`.

### Error handling
- [x] `409 ConflictException` — duplicate `code` on create and update (self excluded).
- [x] `404 NotFoundException` — `findOne`/`update`/`remove` on missing or other-tenant
      id; `create` with unresolvable `macroCategoryId`.
- [x] `404 NotFoundException` — `update` with unresolvable `macroCategoryId`;
      `create`/`update` with unresolvable or other-tenant GL account ids (currently 500
      or silent cross-tenant link).
- [x] `400 BadRequestException` — delete blocked while active items exist; message
      includes the live count.

### Swagger
- [x] Every handler has `@ApiOperation` + `@ApiResponse` (+ `@ApiParam`/`@ApiQuery`).
- [x] PATCH documents the new `404` causes (macro category / GL account not found).

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations.
- Composite tenant-aware FKs at the DB level (service-layer validation is the project
  convention).
- `countByMacroCategory` (shipped in spec-006; unchanged).
- CRUD of items or macro categories.
- Auto-generated codes — category codes are user-supplied business mnemonics.
- Pagination/filtering beyond `?macroCategoryId=`.
- Frontend changes beyond the two list-envelope destructures.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `Category` | `in_categories` | `tenantId`, `macroCategoryId` (FK), `code`, `name`, `description?`, `inventoryAccountId?` / `cogsAccountId?` (FK → `Account`), `isActive`, audit + soft-delete; `@@unique([tenantId, code])`, `@@index([tenantId, macroCategoryId])` |
| `MacroCategory` *(read-only)* | `in_macro_categories` | spec-006 |
| `Account` *(read-only)* | `ac_accounts` | spec-007 |
| `Item` *(relation count only)* | `in_items` | spec-003 |

Key invariants:
- `code` unique per tenant among active rows (service) — DB constraint spans soft-deleted.
- All three FKs (`macroCategoryId`, `inventoryAccountId`, `cogsAccountId`) must resolve
  **within the tenant** (service guard, this spec — Prisma FKs are not tenant-composite).
- A category with active items cannot be deleted (service guard).
- Soft delete only.

---

## API contracts

All routes prefixed `/api`, JWT-guarded, permission-gated as listed above.

### POST /api/categories
```json
// Request
{ "macroCategoryId": "<uuid>", "code": "FG-BURGERS", "name": "Finished Burgers",
  "description": "Finished goods", "inventoryAccountId": "<uuid|omit>",
  "cogsAccountId": "<uuid|omit>", "isActive": true }

// Response 201
{ "id": "<uuid>", "tenantId": "<uuid>", "macroCategoryId": "<uuid>", "code": "FG-BURGERS",
  "name": "Finished Burgers", "isActive": true, "...": "audit columns",
  "macroCategory": { "id": "...", "code": "FG", "name": "Finished Goods" },
  "inventoryAccount": { "accountNumber": "1.3.01", "name": "Inventory FG" },
  "cogsAccount": { "accountNumber": "5.1.01", "name": "COGS" },
  "_count": { "items": 0 } }

// Errors: 409 code exists | 404 macro category / GL account not found (in tenant)
//         400 validation | 401 | 403 missing INVENTORY:CREATE
```

### GET /api/categories?macroCategoryId=<uuid>
```json
// Response 200 (target envelope — see unchecked criterion)
{ "categories": [ { "id": "...", "code": "FG-BURGERS", "macroCategory": { "...": "..." },
    "_count": { "items": 3 } } ],
  "count": 1 }

// Errors: 401 | 403
```

### GET /api/categories/:id
```json
// Response 200 — category with full macroCategory, inventoryAccount, cogsAccount, _count.items

// Errors: 404 not found (or other tenant) | 401 | 403
```

### PATCH /api/categories/:id
```json
// Request (any subset; macroCategoryId re-parents WITHIN the tenant only)
{ "name": "Finished Burgers & Combos", "cogsAccountId": "<uuid>" }

// Response 200 — updated entity with the standard includes

// Errors: 404 not found / macro category / GL account not found | 409 code exists
//         400 validation | 401 | 403 missing INVENTORY:EDIT
```

### DELETE /api/categories/:id
```json
// Response 200
{ "message": "Category deleted successfully", "id": "<uuid>" }

// Errors: 400 has items ("Cannot delete: N items still assigned...")
//         404 not found | 401 | 403 missing INVENTORY:DELETE
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/categories/categories.service.ts` | Scope `update()`/`remove()` writes via `updateMany` + re-fetch; validate `macroCategoryId` in `update()` (scoped lookup); validate both GL accounts in `create()`/`update()` via injected `ChartOfAccountsService.findOne`; replace `prisma.item.count` with the own-relation filtered `_count`; wrap `findAll` in `{ categories, count }` |
| `src/modules/categories/categories.module.ts` | Import `ChartOfAccountsModule` |
| `src/modules/categories/categories.controller.ts` | PATCH: document the new 404 causes (otherwise compliant) |
| `src/modules/categories/dto/*` | No changes |
| `frontend/lib/api/categories.ts` | `getAll` destructures `res.data.categories ?? []` |
| `frontend/app/inventory/stock-reconciliation/[id]/AssignmentModal.tsx` | `setCategories(catsRes.data.categories ?? [])` |

### Cross-module dependencies
- `categories` → `chart-of-accounts` (new, this spec): `ChartOfAccountsService.findOne`
  enforces in-tenant GL accounts. No cycle (chart-of-accounts imports no business module).
- `categories` → `macro-categories`: scoped direct queries, documented exception
  (`MacroCategoriesModule` imports `CategoriesModule` since spec-006 — the reverse import
  would cycle).
- `categories` ↛ `items`: the delete guard now reads the category's own relation count;
  the direct `prisma.item.count` is removed.

### Behavioral notes
- `updateMany` + re-fetch with `INCLUDE` keeps the response shape (house convention).
- `update()` validates in order: existence (`findOne`, 404) → code conflict (409) →
  macro category (404) → GL accounts (404) → write.
- `ChartOfAccountsService.findOne(tenantId, id)` throws the 404 itself — reuse, don't
  re-wrap.
- The own-relation item count uses Prisma's filtered `_count`
  (`{ items: { where: { deletedAt: null } } }`) so soft-deleted items don't block deletes.

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe`; Swagger at `/api/docs`.

---

## Verification checklist

```bash
# 0. Tenant-scoped token for admin@demo.com / DEMO (login → select-tenant)
TOKEN=<token>

# 1. Create macro category + category → 201
MC_ID=$(curl -s -X POST http://localhost:3000/api/macro-categories -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"code":"SPEC9","name":"Spec-009"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST http://localhost:3000/api/categories -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d "{\"macroCategoryId\":\"$MC_ID\",\"code\":\"SPEC9-CAT\",\"name\":\"Cat\"}" \
  | grep -o '"code":"SPEC9-CAT"'
# Expected: created with _count.items 0

# 2. Bad GL account on create → 404 (currently 500 — the gap)
curl -s -X POST http://localhost:3000/api/categories -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"macroCategoryId\":\"$MC_ID\",\"code\":\"SPEC9-BAD\",\"name\":\"X\",\"inventoryAccountId\":\"00000000-0000-0000-0000-000000000000\"}" \
  | grep -o '"statusCode":404'
# Expected: 404

# 3. Re-parent to a nonexistent macro category → 404 (currently 500)
CAT_ID=<id from step 1>
curl -s -X PATCH http://localhost:3000/api/categories/$CAT_ID -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"macroCategoryId":"00000000-0000-0000-0000-000000000000"}' \
  | grep -o '"statusCode":404'
# Expected: 404

# 4. List → envelope
curl -s http://localhost:3000/api/categories -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('categories' in d and 'count' in d)"
# Expected: True

# 5. Cross-tenant: PATCH the category with TENANT2's token → 404; TENANT2 macro/account ids → 404
# Expected: 404 in all cases (scoped writes + in-tenant FK validation)

# 6. Delete with items → 400; delete empty → 200 → GET 404
# Expected: per contract

# 7. Build + tests
cd backend && pnpm build && pnpm test categories.service
# Expected: green
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-04 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 28) | Draft — 5 invariant gaps (2 unscoped writes, untenanted item count, 2 cross-tenant FK vectors) + list-envelope gap captured as unchecked criteria |
| 2026-06-04 | Shipped to origin (7f1acab); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) — unit 18/18, e2e 20/20 (full suite 121/121), build + lint green |
