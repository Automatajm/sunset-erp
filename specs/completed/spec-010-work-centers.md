# spec-010 — Work Centers (Manufacturing Capacity)

Status: **Complete**  
Owner: Manufacturing  
Sprint: 19  
Module(s): `work-centers` (touches `frontend/lib/api/work-centers.ts`, `frontend/app/manufacturing/work-centers/page.tsx`, `frontend/app/manufacturing/bom/page.tsx`, `frontend/app/manufacturing/boms/page.tsx`, `frontend/app/settings/bulk-import/page.tsx` for the list envelope)  
Last updated: 2026-06-04  

---

## Purpose

- **Who uses this module?** Manufacturing/production engineers and plant supervisors who
  define the shop floor — the machine, labor, assembly, and quality stations where work
  actually happens.
- **What business problem does it solve?** It models manufacturing capacity as named
  stations with capacity-per-hour, efficiency, and hourly cost, giving every BOM routing
  step a real place to run and a real cost to charge.
- **What can the business NOT do without this module?** It cannot build routings, estimate
  the labor hours or cost of making a product, or schedule production — there would be no
  stations for manufacturing operations to point at.

## Business value

Work centers are where "how we make it" becomes a number the business can plan and price.
Without them there is no way to say how long an operation takes, what it costs per hour, or
how much a station can produce — so labor estimates, product costing, and capacity
planning all collapse. Routings would have no anchor, making BOMs incomplete and the whole
manufacturing-to-cost chain unworkable. The delete guard also prevents quietly removing a
station that live routings still depend on, which would otherwise orphan production steps.

---

## Problem

Work centers model manufacturing capacity (machine/labor/assembly/quality stations with
capacity, efficiency, and hourly cost) and are the anchor of `BomRouting` — every BOM
operation step points at one. The module is the last Tier-0 prerequisite of the `bom`
spec. A code audit (2026-06-04, opportunity-finder score 19) found five deviations:

1. **Unscoped write in `update()`** — `work-centers.service.ts:120-123` uses
   `update({ where: { id } })`; convention (spec-006…009):
   `updateMany({ where: { id, tenantId, deletedAt: null } })` at the write.
2. **Unscoped soft-delete write in `remove()`** — `work-centers.service.ts:131-137`.
3. **No referential guard on delete** — `remove()` soft-deletes a work center even when
   active `BomRouting` rows reference it, orphaning BOM operation steps.
4. **Phantom `notes` DTO field** — `CreateWorkCenterDto.notes` is accepted and validated,
   but the `WorkCenter` model has no such column and the service's field-map silently
   drops it in both create and update: client input is swallowed without error.
5. **Unbounded numerics / free-string type** — `workCenterType` is a free string whose own
   description declares the enum (`machine, labor, assembly, quality`; the frontend
   already types it as `WorkCenterType`) — needs `@IsIn`. The numeric fields have `@Min(0)`
   but no upper bound, while the columns are `Decimal(5,2)` (`efficiencyPercent`, max
   999.99) and `Decimal(10,2)` (`capacityPerHour`/`costPerHour`, max 99,999,999.99) — an
   oversized value crashes with a DB overflow → 500 instead of 400.

Additionally, `GET /api/work-centers` returns a **bare array** instead of the spec-001
`{ workCenters, count }` envelope. Five frontend consumers depend on the bare shape —
`lib/api/work-centers.ts` (`extractList`), the work-centers page's local `extractList`,
two BOM pages that do `Array.isArray(r.data) ? r.data : []` (the envelope would silently
empty them), and bulk-import's export — so all ship in the same change.

This spec codifies existing behavior as the contract and closes the gaps — with **no
schema changes**.

---

## Acceptance criteria

### Endpoints
- [x] `POST /api/work-centers` — creates a work center; `409` on duplicate active `code`
      for the tenant; defaults `workCenterType: 'machine'`, `capacityPerHour: 0`,
      `efficiencyPercent: 100`, `costPerHour: 0`, `isActive: true`; Decimal fields
      returned as numbers (`formatWorkCenterResponse`).
- [x] `GET /api/work-centers` — lists the tenant's active work centers ordered by `code`
      asc, Decimal fields formatted as numbers.
- [x] `GET /api/work-centers` returns the list envelope `{ workCenters: [...], count }`.
      Same change updates all five consumers: `extractList` in
      `frontend/lib/api/work-centers.ts` and in
      `frontend/app/manufacturing/work-centers/page.tsx` handle `data.workCenters`;
      `bom/page.tsx:589` and `boms/page.tsx:562` destructure `r.data.workCenters ?? []`;
      bulk-import's `handleExport` adds `res.data?.workCenters`.
- [x] `GET /api/work-centers/:id` — returns the work center; `404` when not found in the
      tenant.
- [x] `PATCH /api/work-centers/:id` — partial update; `404` when not found; `409` when
      the new `code` collides with another active row (self excluded).
- [x] `DELETE /api/work-centers/:id` — soft delete; `404` when not found; returns
      `{ message, id }`.
- [x] `DELETE` is blocked with `400` (message includes the live count) while active
      `BomRouting` rows reference the work center.

### Tenant scoping (CLAUDE.md invariant)
- [x] All reads (`create` dup check, `findAll`, `findOne`, `update` conflict check)
      scoped `where: { tenantId, deletedAt: null }`.
- [x] `update()` write is tenant-scoped at the write itself:
      `updateMany({ where: { id, tenantId, deletedAt: null } })`, then re-fetch +
      format to preserve the response shape (`work-centers.service.ts:120-123`).
- [x] `remove()` soft-delete write is tenant-scoped at the write itself
      (`work-centers.service.ts:131-137`).
- [x] `create` writes `tenantId` from the JWT; never from request body or headers.

### Business rules
- [x] Decimal columns are returned as JS numbers (`capacityPerHour`, `costPerHour`
      nullable → `null`; `efficiencyPercent` defaults 100) via
      `formatWorkCenterResponse`.
- [x] Delete guard counts **active** referencing routings via the work center's own
      relation (`_count: { select: { routings: { where: { deletedAt: null } } } }` on the
      scoped read — no direct `prisma.bomRouting.*` query) and throws `400` while > 0.

### DTO validation
- [x] `CreateWorkCenterDto`: `code` (`@IsString @MaxLength(50)`), `name`
      (`@MaxLength(255)`), numerics `@IsNumber @Min(0)`, `isActive?` (`@IsBoolean`);
      `UpdateWorkCenterDto extends PartialType(...)`.
- [x] `workCenterType` validated with `@IsIn(['machine', 'labor', 'assembly', 'quality'])`
      (currently free `@IsString @MaxLength(50)`).
- [x] Upper bounds matching column precision: `efficiencyPercent` `@Max(999.99)`,
      `capacityPerHour` / `costPerHour` `@Max(99999999.99)` — DB overflow becomes a `400`
      instead of a `500`.
- [x] The phantom `notes` field is removed from `CreateWorkCenterDto` (no `notes` column
      exists; the service silently drops it). After removal, a client-sent `notes` is
      rejected `400` by `forbidNonWhitelisted`.
- [x] Global `ValidationPipe` (`whitelist, forbidNonWhitelisted, transform`).

### RBAC
- [x] `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth('JWT-auth')`.
- [x] Permissions: create → `INVENTORY:CREATE`, list/detail → `INVENTORY:VIEW`,
      update → `INVENTORY:EDIT`, delete → `INVENTORY:DELETE`.

### Error handling
- [x] `409 ConflictException` — duplicate `code` on create and update (self excluded).
- [x] `404 NotFoundException` — `findOne`/`update`/`remove` on missing or other-tenant id.
- [x] `400 BadRequestException` — delete blocked while active routings reference the work
      center.

### Swagger
- [x] Every handler has `@ApiOperation` + `@ApiResponse` (+ `@ApiParam` on `:id`).
- [x] DELETE documents the new `400` (routings still reference it).

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations (the missing `notes` column stays
  missing; the DTO field is removed instead).
- BOM routing CRUD (bom module — next spec).
- Capacity planning / scheduling logic (MRP engine, Sprint 19 scope elsewhere).
- Auto-generated codes — work center codes are user-supplied (`WC-001` style mnemonics).
- Pagination/filtering on the list endpoint.
- Frontend changes beyond the five list-envelope consumer updates.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `WorkCenter` | `mfg_work_centers` | `tenantId`, `code`, `name`, `workCenterType`, `capacityPerHour?` `Decimal(10,2)`, `efficiencyPercent` `Decimal(5,2)` default 100, `costPerHour?` `Decimal(10,2)`, `isActive`, audit + soft-delete; `@@unique([tenantId, code])`, `@@index([tenantId])`, `@@index([tenantId, code])` |
| `BomRouting` *(relation count only)* | — | `workCenterId` FK, has `deletedAt` |

Key invariants:
- `code` unique per tenant (DB constraint spans soft-deleted rows); service enforces
  among active rows.
- `workCenterType` ∈ `machine | labor | assembly | quality` (DTO-enforced, this spec).
- A work center with active BOM routings cannot be deleted (service guard, this spec).
- Soft delete only.

---

## API contracts

All routes prefixed `/api`, JWT-guarded, permission-gated as listed above.

### POST /api/work-centers
```json
// Request
{ "code": "WC-GRILL-01", "name": "Grill Station 1", "workCenterType": "machine",
  "capacityPerHour": 120, "efficiencyPercent": 95, "costPerHour": 350.5, "isActive": true }

// Response 201 (Decimals formatted as numbers)
{ "id": "<uuid>", "tenantId": "<uuid>", "code": "WC-GRILL-01", "name": "Grill Station 1",
  "workCenterType": "machine", "capacityPerHour": 120, "efficiencyPercent": 95,
  "costPerHour": 350.5, "isActive": true, "...": "audit columns" }

// Errors: 409 code exists | 400 validation (bad type enum, out-of-range numeric, notes field)
//         401 | 403 missing INVENTORY:CREATE
```

### GET /api/work-centers
```json
// Response 200 (target envelope — see unchecked criterion)
{ "workCenters": [ { "id": "...", "code": "WC-GRILL-01", "workCenterType": "machine",
    "capacityPerHour": 120, "efficiencyPercent": 95, "costPerHour": 350.5 } ],
  "count": 1 }

// Errors: 401 | 403
```

### GET /api/work-centers/:id
```json
// Response 200 — the formatted entity
// Errors: 404 not found (or other tenant) | 401 | 403
```

### PATCH /api/work-centers/:id
```json
// Request (any subset of create fields; notes no longer accepted)
{ "efficiencyPercent": 92.5 }

// Response 200 — updated formatted entity
// Errors: 404 | 409 code exists | 400 validation | 401 | 403 missing INVENTORY:EDIT
```

### DELETE /api/work-centers/:id
```json
// Response 200
{ "message": "Work center deleted successfully", "id": "<uuid>" }

// Errors: 400 in use ("Cannot delete: N BOM routings still reference this work center")
//         404 | 401 | 403 missing INVENTORY:DELETE
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/work-centers/work-centers.service.ts` | Scope `update()`/`remove()` writes via `updateMany` + re-fetch/format; add active-routings delete guard (own-relation filtered `_count`); wrap `findAll` in `{ workCenters, count }` |
| `src/modules/work-centers/dto/create-work-center.dto.ts` | `workCenterType` → `@IsIn([...4 types])`; add `@Max` bounds; remove phantom `notes` |
| `src/modules/work-centers/work-centers.controller.ts` | DELETE: document the new 400 |
| `src/modules/work-centers/work-centers.module.ts` | No changes |
| `frontend/lib/api/work-centers.ts` | `extractList` handles `data.workCenters` |
| `frontend/app/manufacturing/work-centers/page.tsx` | local `extractList` handles `data.workCenters` |
| `frontend/app/manufacturing/bom/page.tsx` | `r.data.workCenters ?? []` |
| `frontend/app/manufacturing/boms/page.tsx` | `r.data.workCenters ?? []` |
| `frontend/app/settings/bulk-import/page.tsx` | `handleExport` adds `res.data?.workCenters` |

### Cross-module dependencies
- None added. The delete guard reads the work center's own `routings` relation count —
  no `bom` module dependency (that module is unspecced; its spec adds the reverse
  guards).

### Behavioral notes
- `updateMany` + re-fetch + `formatWorkCenterResponse` keeps the response shape.
- The update field-map's truthiness checks (`if (dto.name)`) predate this spec and stay —
  clearing a field to `''` is not a supported operation.
- `BomRouting` has `deletedAt` (schema), so the relation count filters
  `{ deletedAt: null }`.

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe`; Swagger at `/api/docs`.

---

## Verification checklist

```bash
# 0. Tenant-scoped token for admin@demo.com / DEMO (login → select-tenant)
TOKEN=<token>

# 1. Create → 201, Decimals as numbers
curl -s -X POST http://localhost:3000/api/work-centers -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"WC-S10","name":"Spec-010","workCenterType":"machine","capacityPerHour":120}' \
  | grep -o '"capacityPerHour":120'
# Expected: number 120, not a Decimal string

# 2. Bad type → 400 (@IsIn)
curl -s -X POST http://localhost:3000/api/work-centers -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"code":"WC-S10B","name":"X","workCenterType":"banana"}' \
  | grep -o '"statusCode":400
# Expected: 400

# 3. Overflow numeric → 400 (currently 500)
curl -s -X POST http://localhost:3000/api/work-centers -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"code":"WC-S10C","name":"X","efficiencyPercent":100000}' \
  | grep -o '"statusCode":400'
# Expected: 400

# 4. notes → 400 (forbidNonWhitelisted after DTO removal)
curl -s -X POST http://localhost:3000/api/work-centers -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"code":"WC-S10D","name":"X","notes":"hi"}' \
  | grep -o '"statusCode":400'
# Expected: 400

# 5. List → envelope
curl -s http://localhost:3000/api/work-centers -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('workCenters' in d and 'count' in d)"
# Expected: True

# 6. Cross-tenant PATCH/DELETE with TENANT2 token → 404 (scoped writes)
# 7. Delete with routings → 400 (needs a BOM routing fixture — unit-tested; e2e TODO until bom spec)

# 8. Build + tests
cd backend && pnpm build && pnpm test work-centers.service
# Expected: green
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-04 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 19) | Draft — 5 invariant gaps (2 unscoped writes, missing routing delete guard, phantom notes field, free-string type + unbounded numerics) + list-envelope gap captured as unchecked criteria |
| 2026-06-04 | Shipped to origin (fd54433); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) — unit 14/14, e2e 15/15 (full suite 136/136), build + lint green. Side fix: warehouses numeric-max codegen (390a4e2) |
