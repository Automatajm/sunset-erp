# spec-008 — Consumption Groups (MRP Aggregation)

Status: **Complete**  
Owner: Inventory  
Sprint: 19  
Module(s): `consumption-groups` (touches `uom` for the cross-module UOM lookup; no frontend consumers yet)  
Last updated: 2026-06-04  

---

## Problem

Consumption groups aggregate interchangeable items for MRP: a group (e.g. "Ground Beef
80/20") carries a consumption UOM, and `Item`, `BomComponent`, and `GeneralNeedLine` all
point at it — BOMs consume *groups*, procurement nets *group* demand against the summed
stock of member items. The module is small (5 endpoints, 109-line service) and is the
last Tier-1 prerequisite for the `bom` spec and the themed demo seed. A code audit
(2026-06-04, opportunity-finder score 17) found four deviations:

1. **Unscoped write in `update()`** — `consumption-groups.service.ts:92-93` uses
   `consumptionGroup.update({ where: { id } })`; the tenant check lives only in the prior
   `findOne`. Convention (spec-006/spec-007, `suppliers.service.ts:119`):
   `updateMany({ where: { id, tenantId, deletedAt: null } })` so the scope is enforced
   **at the write**.
2. **Unscoped soft-delete write in `remove()`** — `consumption-groups.service.ts:103-104`,
   same pattern.
3. **Unvalidated `consumptionUomId`** — `create()` (`consumption-groups.service.ts:32-47`)
   writes the FK without checking it resolves; a bad UUID crashes with Prisma P2003 →
   **500** instead of a 404. The DTO comment even says "must be one of the tenant system
   UOMs", but nothing verifies it. Same hole in `update()`.
4. **No referential guard on delete** — `remove()` soft-deletes a group even when active
   items are still assigned, orphaning the MRP aggregation (compare the delete guards
   shipped in spec-006 and spec-007).

Additionally: `GET /api/consumption-groups` returns a **bare array** instead of the
spec-001 `{ consumptionGroups, count }` envelope (no frontend consumers exist yet, so the
change is backend-only), and the controller documents a `409` on POST that cannot happen
(codes are auto-generated `CG-YYYY-NNNN`; there is no duplicate path) — stale Swagger.

Note: `generateCode` (:21-24) intentionally omits `deletedAt: null` — the documented
convention (`suppliers.service.ts:18-21`): `@@unique([tenantId, code])` spans soft-deleted
rows, so the sequence must consider them. **Not a gap.**

This spec codifies the module's existing (correct) behavior as the contract and closes
the gaps above — with **no schema changes**.

---

## Acceptance criteria

### Endpoints
- [x] `POST /api/consumption-groups` — creates a group with an auto-generated code
      `CG-YYYY-NNNN` (per tenant, zero-padded, soft-deleted rows occupy their codes);
      `code` is never accepted from the client; defaults `isActive: true`; returns the
      entity with `consumptionUom` and `_count.items`.
- [x] `POST` (and `PATCH` when `consumptionUomId` is present) validates that
      `consumptionUomId` resolves to an existing UOM unit via the injected
      `UomService.findOneUnit` → `404` ("UOM unit … not found") instead of the current
      FK-violation `500`.
- [x] `GET /api/consumption-groups` — lists the tenant's active groups ordered by `code`
      asc, each with `consumptionUom` and `_count.items`.
- [x] `GET /api/consumption-groups` returns the list envelope
      `{ consumptionGroups: [...], count: <n> }` (spec-001 convention; currently a bare
      array; no frontend consumers to update).
- [x] `GET /api/consumption-groups/:id` — returns the group with its active member items
      (id, code, name, baseUom, conversion factors, stock) plus the computed
      `totalConsumptionQty`; `404` when not found in the tenant.
- [x] `PATCH /api/consumption-groups/:id` — partial update; `404` when not found.
- [x] `DELETE /api/consumption-groups/:id` — soft delete; `404` when not found; returns
      `{ message, id }`.
- [x] `DELETE` is blocked with `400` (message includes the live count) while active items
      are still assigned to the group.

### Tenant scoping (CLAUDE.md invariant)
- [x] All reads (`findAll`, `findOne`) scoped `where: { tenantId, deletedAt: null }` with
      `tenantId` from `req.user.tenantId`; `findOne`'s items include filtered
      `deletedAt: null`. (`generateCode` spans soft-deleted rows by documented design.)
- [x] `update()` write is tenant-scoped at the write itself:
      `updateMany({ where: { id, tenantId, deletedAt: null } })`, then re-fetch via the
      scoped read to preserve the response shape (`consumption-groups.service.ts:92-93`).
- [x] `remove()` soft-delete write is tenant-scoped at the write itself
      (`consumption-groups.service.ts:103-104`).
- [x] `create` writes `tenantId` from the JWT; never from request body or headers.

### Business rules
- [x] Code generation: `CG-${year}-NNNN`, next = max existing sequence + 1 for the
      tenant/prefix (including soft-deleted rows), zero-padded to 4.
- [x] `findOne` computes `totalConsumptionQty` =
      Σ over active items (Σ stock.onHandQuantity × purchaseToConsumptionFactor),
      rounded to 3 decimals.
- [x] Delete guard counts **active** member items via the group's own relation
      (`_count` / relation include on `ConsumptionGroup` — no direct `prisma.item.*`
      query from this module) and throws `400` while > 0.

### Module interconnection
- [x] `ConsumptionGroupsModule` imports `UomModule` and injects `UomService`;
      `create`/`update` call `UomService.findOneUnit(consumptionUomId)` for FK
      validation (UomUnit is a global catalog — no tenant scope, per the uom module's
      documented design). No direct `prisma.uomUnit.*` access from this module.

### DTO validation
- [x] `CreateConsumptionGroupDto`: `name` (`@IsString @MaxLength(255)`), `description?`,
      `consumptionUomId` (`@IsUUID`), `isActive?` (`@IsBoolean`) — `code` deliberately
      absent (auto-generated).
- [x] `UpdateConsumptionGroupDto extends PartialType(CreateConsumptionGroupDto)`.
- [x] Global `ValidationPipe` (`whitelist, forbidNonWhitelisted, transform`) rejects
      unknown fields (including a client-supplied `code`) with `400`.

### RBAC
- [x] Controller guarded by `@UseGuards(JwtAuthGuard, PermissionsGuard)` +
      `@ApiBearerAuth('JWT-auth')`.
- [x] Permissions: create → `INVENTORY:CREATE`, list/detail → `INVENTORY:VIEW`,
      update → `INVENTORY:EDIT`, delete → `INVENTORY:DELETE`.

### Error handling
- [x] `404 NotFoundException` — `findOne`/`update`/`remove` on missing or other-tenant id.
- [x] `404 NotFoundException` — `create`/`update` with a `consumptionUomId` that does not
      resolve (currently `500`).
- [x] `400 BadRequestException` — delete blocked while active items are assigned; message
      includes the live count.

### Swagger
- [x] Every handler has `@ApiOperation` + `@ApiResponse` and `@ApiParam` on `:id` routes.
- [x] POST's stale `409` response is removed (no duplicate path exists) and the new `404`
      (bad UOM) / `400` (delete guard) responses are documented.

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations.
- Client-supplied codes (auto-generation is the contract; suppliers-style optional
  override is deliberately not offered here).
- Guards against `BomComponent` / `GeneralNeedLine` references on delete — those models
  are owned by the unspecced `bom` / `general-needs` modules; their specs add the guards
  (adding them here would invert the cascade).
- The nested `stock` include in `findOne` (reads `Stock` via the items relation) — works,
  pre-existing; revisit when `stock-transactions` is specced.
- Pagination/filtering on the list endpoint.
- Frontend work — the module has no frontend consumers yet.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `ConsumptionGroup` | `in_consumption_groups` | `tenantId`, `code`, `name`, `description?`, `consumptionUomId` (FK → `UomUnit`), `isActive`, audit + soft-delete columns; `@@unique([tenantId, code])`, `@@index([tenantId])` |
| `UomUnit` *(read-only here)* | `cfg_uom_units` | global catalog — no `tenantId`, no `deletedAt`; `isActive` flag |

Key invariants:
- `code` unique per tenant **including soft-deleted rows** (DB constraint spans them) —
  hence `generateCode` reads all rows.
- Soft delete only (`deletedAt` + `deletedBy`); hard deletes never issued.
- Referenced by `Item.consumptionGroupId`, `BomComponent.consumptionGroupId`,
  `GeneralNeedLine.consumptionGroupId` — a group with active items cannot be deleted
  (service guard, this spec).

---

## API contracts

All routes prefixed `/api`, JWT-guarded, permission-gated as listed above.

### POST /api/consumption-groups
```json
// Request (code NOT accepted — auto-generated)
{ "name": "Ground Beef 80/20", "description": "Patty-grade beef", "consumptionUomId": "<uuid>", "isActive": true }

// Response 201
{ "id": "<uuid>", "tenantId": "<uuid>", "code": "CG-2026-0001", "name": "Ground Beef 80/20",
  "description": "Patty-grade beef", "consumptionUomId": "<uuid>", "isActive": true,
  "createdAt": "...", "updatedAt": "...", "deletedAt": null,
  "createdBy": "<uuid>", "updatedBy": "<uuid>", "deletedBy": null,
  "consumptionUom": { "id": "...", "code": "g", "name": "Gram" },
  "_count": { "items": 0 } }

// Errors: 404 UOM unit not found | 400 validation (incl. client-supplied code via forbidNonWhitelisted)
//         401 no token | 403 missing INVENTORY:CREATE
```

### GET /api/consumption-groups
```json
// Response 200 (target envelope — see unchecked criterion)
{ "consumptionGroups": [ { "id": "...", "code": "CG-2026-0001", "name": "Ground Beef 80/20",
    "consumptionUom": { "...": "..." }, "_count": { "items": 3 } } ],
  "count": 1 }

// Errors: 401 | 403 missing INVENTORY:VIEW
```

### GET /api/consumption-groups/:id
```json
// Response 200
{ "id": "...", "code": "CG-2026-0001", "name": "Ground Beef 80/20",
  "consumptionUom": { "...": "..." },
  "items": [ { "id": "...", "code": "...", "name": "...", "baseUom": "...",
      "purchaseToConsumptionFactor": "1000", "storageToConsumptionFactor": "1000",
      "stock": [ { "onHandQuantity": "25.5" } ] } ],
  "totalConsumptionQty": 25500 }

// Errors: 404 not found (or other tenant) | 401 | 403
```

### PATCH /api/consumption-groups/:id
```json
// Request (any subset of create fields)
{ "name": "Ground Beef 80/20 Premium" }

// Response 200 — updated entity with consumptionUom + _count.items

// Errors: 404 not found / UOM unit not found | 400 validation | 401 | 403 missing INVENTORY:EDIT
```

### DELETE /api/consumption-groups/:id
```json
// Response 200
{ "message": "Consumption group deleted successfully", "id": "<uuid>" }

// Errors: 400 has active items ("Cannot delete: N items still assigned...")
//         404 not found | 401 | 403 missing INVENTORY:DELETE
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/consumption-groups/consumption-groups.service.ts` | Scope `update()`/`remove()` writes via `updateMany` + re-fetch; inject `UomService` and validate `consumptionUomId` in `create`/`update`; add active-items delete guard (own-relation `_count`); wrap `findAll` in `{ consumptionGroups, count }` |
| `src/modules/consumption-groups/consumption-groups.module.ts` | Import `UomModule` |
| `src/modules/consumption-groups/consumption-groups.controller.ts` | Swagger: drop stale POST `409`, add `404` (bad UOM) on POST/PATCH and `400` (delete guard) on DELETE |
| `src/modules/consumption-groups/dto/*` | No changes (already compliant) |
| `src/modules/uom/*` | No changes (`findOneUnit` already exists and `UomModule` already exports `UomService`) |

### Cross-module dependencies
- `consumption-groups` → `uom` (new, this spec): `UomService.findOneUnit(id)` for FK
  validation. `UomModule` already exports the service (`uom.module.ts:13`); no circular
  risk (`uom` does not import `consumption-groups`).
- The delete guard reads the group's own `items` relation count — it does NOT query the
  `Item` model directly, so no `items` module dependency is introduced.

### Behavioral notes
- `updateMany` returns a count, not the entity — re-fetch with the same scoped read +
  `INCLUDE` to keep the response shape identical (spec-006/007 convention).
- The `update()` 404 path stays: `findOne` runs first and throws before any write.
- Validate the UOM **before** generating the code in `create()` so failed creates do not
  burn sequence numbers unnecessarily (cosmetic, but free).
- `generateCode` race: two concurrent creates can collide on `@@unique([tenantId, code])`
  → P2002. Known limitation shared with suppliers' `generateCode`; out of scope.

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe` (`whitelist, forbidNonWhitelisted, transform`);
  Swagger at `/api/docs` (`JWT-auth` bearer).

---

## Verification checklist

```bash
# 0. Login (multi-tenant admin: select DEMO after login — see test helpers)
TOKEN=<tenant-scoped token for admin@demo.com / DEMO>

# 1. Create → 201 with auto code
UOM_ID=$(curl -s http://localhost:3000/api/uom/units -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['units'][0]['id'])")
curl -s -X POST http://localhost:3000/api/consumption-groups \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"Spec-008 Test\",\"consumptionUomId\":\"$UOM_ID\"}" | python3 -m json.tool | grep -E "code|_count"
# Expected: "code": "CG-2026-NNNN", "_count": { "items": 0 }

# 2. Client-supplied code → 400 (forbidNonWhitelisted)
curl -s -X POST http://localhost:3000/api/consumption-groups \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"X\",\"consumptionUomId\":\"$UOM_ID\",\"code\":\"HACK\"}" | grep -o '"statusCode":400'
# Expected: 400

# 3. Bad consumptionUomId → 404 (currently 500 — the gap)
curl -s -X POST http://localhost:3000/api/consumption-groups \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Bad UOM","consumptionUomId":"00000000-0000-0000-0000-000000000000"}' | grep -o '"statusCode":404'
# Expected: 404

# 4. List → envelope
curl -s http://localhost:3000/api/consumption-groups -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('consumptionGroups' in d and 'count' in d)"
# Expected: True

# 5. Update from another tenant's token → 404 (scoped write — tenant isolation)
# Expected: 404, row unchanged for DEMO

# 6. Delete with assigned items → 400; delete empty group → 200 then GET → 404
# (assign an item to the group via PATCH /api/items/:id { consumptionGroupId }, then DELETE the group)
# Expected: 400 "Cannot delete: N items...", then after unassigning: 200, then 404

# 7. Build + tests
cd backend && pnpm build && pnpm test consumption-groups
# Expected: build passes, unit tests green
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-04 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 17) | Draft — 4 invariant gaps (2 unscoped writes, unvalidated UOM FK → 500, missing delete guard) + list-envelope + stale-Swagger gaps captured as unchecked criteria |
| 2026-06-04 | Shipped to origin (673cd73); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) — unit 16/16, e2e 16/16 (full suite 101/101 serialized), build + lint green. Side fixes: warehouses generateCode P2002 (9621cb5), e2e serialization (007f973) |
