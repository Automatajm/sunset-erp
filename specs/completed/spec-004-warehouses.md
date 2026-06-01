# spec-004 — Warehouses (Inventory Locations Master Data)

Status: **Complete**  
Owner: Inventory  
Sprint: TBD  
Module(s): `warehouses`  
Last updated: 2026-05-31  

> Generated from code by the `spec-generator` skill (`/new-spec warehouses`). Acceptance
> criteria reflect the current implementation; `- [ ]` items are gaps to close before this
> spec is approved and shipped.

---

## Problem

The `warehouses` module is the master-data CRUD for the `in_warehouses` catalog and the entry
point to the warehouse location hierarchy (`Zone → Aisle → Rack → Level → Bin`). Every stock
record and stock movement references a warehouse; the location tree backs bin-level stock
placement, the mobile count scanner, and the capacity/occupancy analytics surfaced on the
list and stats endpoints. The module is solid in shape — thin controller, full RBAC
(`INVENTORY:*`), tenant-scoped reads, soft delete, auto-generated `WH-{TYPE}-{NNN}` codes, and
two read-heavy analytics endpoints (`findAll` enriched with capacity/occupancy via two
`$queryRaw` aggregates, and a per-warehouse `stats` endpoint). A code audit
(`opportunity-finder`, score 25) surfaced a focused set of gaps this spec exists to close:

1. **Writes scoped by `id` alone.** `update`/`remove` call `prisma.warehouse.update({ where: { id } })`
   without `tenantId` (`warehouses.service.ts:306-307`, `:316-317`). Currently safe because each
   is preceded by `findOne(tenantId, id)`, but the write itself is not tenant-scoped — a latent
   cross-tenant risk if the guard is ever refactored away. (Same pattern fixed in spec-002/spec-003.)
2. **`getStats` zone count omits `tenantId`.** `warehouses.service.ts:231-233` queries
   `warehouseZone.count({ where: { warehouseId, deletedAt: null } })` without `tenantId` —
   inconsistent with the sibling aisle/rack/level/bin counts (`:234-245`) which all carry it.
   Defended by the preceding `findOne`, but the scoping must be explicit and consistent.
3. **`warehouseType` validated only as `@IsString`.** The documented enum
   (`regular | consignment | transit`) accepts any string (`create-warehouse.dto.ts:27-30`);
   an invalid type silently falls back to the `REG` prefix in `generateCode`
   (`warehouses.service.ts:23`). Needs an `@IsIn` constraint.
4. **No `@ApiResponse` on any endpoint.** All 7 handlers have `@ApiOperation` but none declare
   `@ApiResponse` (`warehouses.controller.ts:31,38,45,53,61,69,78`) — the documented success and
   error codes (200/201/404/409) are absent from Swagger.

This spec codifies the intended contract and tracks these fixes. The module is otherwise a
clean example (thin controller, correct error handling, properly tenant-scoped reads and
`$queryRaw` aggregates).

---

## Acceptance criteria

### Endpoints (RBAC + Swagger)
- [x] `POST /api/warehouses` — `@RequirePermissions('INVENTORY:CREATE')`, returns 201.
- [x] `GET /api/warehouses` — `@RequirePermissions('INVENTORY:VIEW')`, enriched with stock/zone counts + capacity/occupancy.
- [x] `GET /api/warehouses/:id` — `@RequirePermissions('INVENTORY:VIEW')`.
- [x] `GET /api/warehouses/:id/location-tree` — `@RequirePermissions('INVENTORY:VIEW')`, full `Zone→Aisle→Rack→Level→Bin` hierarchy.
- [x] `GET /api/warehouses/:id/stats` — `@RequirePermissions('INVENTORY:VIEW')`, capacity + stock + location counts.
- [x] `PATCH /api/warehouses/:id` — `@RequirePermissions('INVENTORY:EDIT')`.
- [x] `DELETE /api/warehouses/:id` — `@RequirePermissions('INVENTORY:DELETE')`, soft delete, `@HttpCode(200)`.
- [x] Controller is class-guarded `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth('JWT-auth')`.
- [x] Every handler has `@ApiOperation` (and `@ApiParam` on `:id` routes).
- [x] Every handler declares `@ApiResponse` for its success code (and 404/409 where applicable).
- [x] Controller is thin — every handler delegates to `WarehousesService`, no business logic.
- [x] The literal sub-routes (`:id/location-tree`, `:id/stats`) are nested under `:id` and do not
      collide with the bare `:id` route.

### Data model & tenant scoping
- [x] `findAll` / `findOne` / `getLocationTree` / `generateCode` scope every read
      `where: { tenantId, deletedAt: null }` (or, for the relation reads in the tree, `deletedAt: null`).
- [x] The two `$queryRaw` capacity aggregates in `findAll` scope by `z.tenant_id = ${tenantId}` and
      `deleted_at IS NULL` at every join level (`warehouses.service.ts:91-129`).
- [x] `create` checks for a duplicate `code` scoped to `{ tenantId, code, deletedAt: null }`.
- [x] `update` duplicate check scoped to `{ tenantId, code, id: { not: id }, deletedAt: null }`.
- [x] `remove` is a soft delete (`deletedAt`, `deletedBy`), never a hard delete.
- [x] `update`/`remove` writes are tenant-scoped — use
      `updateMany({ where: { id, tenantId, deletedAt: null } })` or equivalent, not
      `update({ where: { id } })`, so the write itself enforces tenancy.
- [x] `getStats` `warehouseZone.count` is scoped with `tenantId` (consistent with the sibling
      aisle/rack/level/bin counts).
- [x] `generateCode` reads scoped to `{ tenantId, deletedAt: null }` with the `WH-{TYPE}-` prefix.

### DTO validation
- [x] `CreateWarehouseDto` carries `class-validator` decorators on every field
      (`@IsString`/`@IsOptional`/`@IsBoolean`/`@MaxLength`); `UpdateWarehouseDto` is `PartialType(CreateWarehouseDto)`.
- [x] `warehouseType` constrained via `@IsIn(['regular','consignment','transit'])` so an invalid
      type is rejected with 400 rather than silently defaulting to the `REG` prefix.

### Error handling
- [x] Duplicate `code` on create/update → `409 ConflictException`.
- [x] Missing/other-tenant id on `findOne`/`update`/`remove`/`getLocationTree`/`getStats` → `404 NotFoundException`.
- [x] Invalid DTO → `400` via the global `ValidationPipe`.
- [x] Missing permission → `403`; no token → `401`.

### Response format
- [x] `GET /api/warehouses/:id` and `POST` return the warehouse row plus `stockCount`/`zoneCount`.
- [x] `GET /api/warehouses` returns each warehouse enriched with `stockCount`, `zoneCount`,
      `capacityKg`, `capacityLtr`, `capacityPallets`, `occupancyPct` (null when no capacity configured).
- [x] `GET /api/warehouses/:id/stats` returns `{ stockLines, totalOnHand, occupancyPct, locations{…}, capacity{…} }`.
- [x] `remove` returns `{ message, id }`.
- [x] `GET /api/warehouses` list response is documented; whether it adopts the
      `{ warehouses, count }` envelope or stays a bare enriched array is decided in this spec.
      *Decision: stays a bare enriched array — the per-row enrichment (capacity/occupancy) is the
      contract consumed by the frontend; changing the envelope is a breaking change out of scope here.*

### Tenant isolation
- [x] A warehouse created under tenant A is not returned by `findAll`/`findOne` for tenant B.
- [x] Covered by an e2e test that creates under tenant A (DEMO) and asserts 404/absence for
      tenant B (TENANT2) — `test/warehouses.e2e-spec.ts`.

### Cross-module integration
- [x] `WarehousesModule` imports only `PrismaModule`; it owns the `Warehouse*` models and reads
      `Stock` only via aggregate counts (read-only, tenant-scoped) — no write to another module's data.
- [x] `WarehousesService` is exported for downstream modules (stock, location import, scanner).

---

## Out of scope

- Schema changes to `in_warehouses` or the location-hierarchy tables (no migration).
- CRUD of zones / aisles / racks / levels / bins (owned by their own location modules); this spec
  only **reads** the hierarchy for the tree and stats endpoints.
- Stock levels, stock movements, valuation — owned by `stock` / `stock-transactions`.
- Changing the `findAll` response shape to a `{ warehouses, count }` envelope (would break the
  frontend's reliance on the bare enriched array).
- Pagination / advanced filtering of the list endpoint.
- The capacity/occupancy calculation algorithm itself (bin-overrides-level rule is preserved as-is).

---

## Data model

**No changes.** Reference only:

| Model | Table | Key fields |
|---|---|---|
| `Warehouse` | `in_warehouses` | `tenantId`, `code`, `name`, `warehouseType`, `address`, `isActive`, `locationTrackingEnabled`, audit + soft-delete; `@@unique([tenantId, code])` |
| `WarehouseZone` | `in_wh_zones` | `tenantId`, `warehouseId`, `code`, `name`, `isActive`; `@@unique([tenantId, warehouseId, code])` |
| `WarehouseAisle` | `in_wh_aisles` | `tenantId`, `zoneId`, `code`, `name`; `@@unique([zoneId, code])` |
| `WarehouseRack` | `in_wh_racks` | `tenantId`, `aisleId`, `code`, `name`; `@@unique([aisleId, code])` |
| `WarehouseLevel` | `in_wh_levels` | `tenantId`, `rackId`, `code`, `maxWeightKg`, `maxVolumeLtr`, `maxPallets`; `@@unique([rackId, code])` |
| `WarehouseBin` | `in_wh_bins` | `tenantId`, `levelId`, `code`, `maxWeightKg`, `maxVolumeLtr`, `maxPallets`; `@@unique([levelId, code])` |
| `Stock` | `in_stock` | read-only here: `tenantId`, `warehouseId`, `onHandQuantity` (no `deletedAt` — not soft-deleted) |

Invariants:
- `@@unique([tenantId, code])` on `Warehouse`; codes follow `WH-{TYPE}-{NNN}` (`TYPE` ∈ `REG`/`CON`/`TRN`,
  3-digit zero-padded sequence), generated by `WarehousesService.generateCode`.
- Soft delete via `deletedAt` on all `Warehouse*` models; audit via `createdBy`/`updatedBy`/`deletedBy`.
- Capacity is `Decimal(10,2)` for kg/ltr, `Int` for pallets, defined at Level and overridden by Bin
  when bins exist (the `findAll`/`stats` "bin overrides level" rule).
- `Stock` has **no** `deletedAt` — aggregate reads over `Stock` correctly omit a soft-delete filter.

---

## API contracts

All routes prefixed `/api`, all guarded (`Authorization: Bearer <jwt>` + permission).

### POST /api/warehouses
```json
// Request (code optional — auto-generated WH-{TYPE}-{NNN}; name required)
{ "name": "Main Warehouse", "warehouseType": "regular", "address": "Zona Industrial", "locationTrackingEnabled": true }

// Response 201 — created warehouse (+ stockCount/zoneCount default 0)
{ "id": "...", "code": "WH-REG-001", "name": "Main Warehouse", "warehouseType": "regular", "isActive": true, "...": "..." }

// Errors: 409 duplicate code | 400 validation (incl. invalid warehouseType) | 403 missing INVENTORY:CREATE | 401
```

### GET /api/warehouses
```json
// Response 200 — bare enriched array (one entry per warehouse)
[ { "id": "...", "code": "WH-REG-001", "name": "...", "stockCount": 12, "zoneCount": 3,
    "capacityKg": 5000, "capacityLtr": null, "capacityPallets": 120, "occupancyPct": 10 } ]

// Errors: 403 missing INVENTORY:VIEW | 401
```

### GET /api/warehouses/:id
```json
// Response 200 — warehouse row + counts
{ "id": "...", "code": "...", "name": "...", "stockCount": 12, "zoneCount": 3, "...": "..." }

// Errors: 404 not found / other tenant | 403 | 401
```

### GET /api/warehouses/:id/location-tree
```json
// Response 200 — nested Zone → Aisle → Rack → Level → Bin (each with _count + stock counts)
[ { "id": "...", "code": "Z1", "aisles": [ { "code": "A1", "racks": [ { "code": "R1",
    "levels": [ { "code": "L1", "bins": [ { "code": "B1", "_count": { "stock": 2 } } ] } ] } ] } ] } ]

// Errors: 404 warehouse not found / other tenant | 403 | 401
```

### GET /api/warehouses/:id/stats
```json
// Response 200
{ "stockLines": 12, "totalOnHand": 340.5, "occupancyPct": 10,
  "locations": { "zones": 3, "aisles": 6, "racks": 12, "levels": 48, "bins": 240 },
  "capacity": { "maxWeightKg": 5000, "maxVolumeLtr": null, "maxPallets": 120 } }

// Errors: 404 warehouse not found / other tenant | 403 | 401
```

### PATCH /api/warehouses/:id
```json
// Request — any subset of CreateWarehouseDto fields
{ "name": "Renamed", "isActive": false, "locationTrackingEnabled": true }

// Response 200 — updated warehouse
{ "id": "...", "...": "..." }

// Errors: 404 | 409 duplicate code | 400 (incl. invalid warehouseType) | 403 missing INVENTORY:EDIT | 401
```

### DELETE /api/warehouses/:id
```json
// Response 200
{ "message": "Warehouse deleted successfully", "id": "..." }

// Errors: 404 | 403 missing INVENTORY:DELETE | 401
```

---

## Implementation notes

### Files involved
| File | Role |
|---|---|
| `src/modules/warehouses/warehouses.controller.ts` | 7 thin routes, RBAC + Swagger (add `@ApiResponse`) |
| `src/modules/warehouses/warehouses.service.ts` | CRUD + `generateCode` + `findAll` capacity/occupancy aggregates + `getLocationTree` + `getStats`; depends on `PrismaService` only |
| `src/modules/warehouses/dto/create-warehouse.dto.ts` | `class-validator` DTO (add `@IsIn` on `warehouseType`) |
| `src/modules/warehouses/dto/update-warehouse.dto.ts` | `PartialType(CreateWarehouseDto)` |
| `src/modules/warehouses/warehouses.module.ts` | imports `PrismaModule`; exports `WarehousesService` |
| `prisma/schema.prisma` → `Warehouse` + `WarehouseZone/Aisle/Rack/Level/Bin` | `in_warehouses` + `in_wh_*` tables |

### Capacity/occupancy computation
`findAll` runs two raw aggregates (level capacity, bin capacity) and applies "bin overrides level
when bins exist". `getStats` mirrors this with Prisma `aggregate` calls per hierarchy level.
Both are preserved as-is — this spec does not change the algorithm, only the tenant-scoping
consistency of the `getStats` zone count.

### Code generation
`WarehousesService.generateCode(tenantId, warehouseType)` produces `WH-{TYPE}-{NNN}` where
`TYPE` is mapped from `warehouseType` via `TYPE_PREFIX` (`regular→REG`, `consignment→CON`,
`transit→TRN`, default `REG`). Adding `@IsIn` to the DTO closes the silent-default path.

### Global infrastructure
Global prefix `api`, `ValidationPipe` (`whitelist`/`forbidNonWhitelisted`/`transform`), Swagger at
`/api/docs` with `JWT-auth` — all inherited from spec-001.

---

## Verification checklist

```bash
# Auth (tenant A = DEMO)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}' | jq -r .access_token)

# 1. Create (auto-code) → 201 with WH-{TYPE}-{NNN}
curl -s -X POST http://localhost:3000/api/warehouses -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Test WH","warehouseType":"regular"}' | jq .code
# Expected: "WH-REG-001" (or next sequence)

# 2. Invalid warehouseType → 400 (needs @IsIn)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/warehouses -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Bad","warehouseType":"not_a_type"}'
# Expected: 400

# 3. Duplicate code → 409
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/warehouses -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Dup","code":"WH-REG-001"}'
# Expected: 409

# 4. List → enriched array with capacity/occupancy keys
curl -s http://localhost:3000/api/warehouses -H "Authorization: Bearer $TOKEN" \
  | jq '.[0] | has("stockCount") and has("occupancyPct") and has("capacityPallets")'
# Expected: true

# 5. Stats
ID=$(curl -s http://localhost:3000/api/warehouses -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')
curl -s http://localhost:3000/api/warehouses/$ID/stats -H "Authorization: Bearer $TOKEN" \
  | jq 'has("locations") and has("capacity") and has("stockLines")'
# Expected: true

# 6. Location tree
curl -s http://localhost:3000/api/warehouses/$ID/location-tree -H "Authorization: Bearer $TOKEN" | jq 'type'
# Expected: "array"

# 7. Cross-tenant isolation (tenant B = TENANT2): A's warehouse id is 404 for B
TOKEN_B=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"tenant2admin@demo.com","password":"Admin123!"}' | jq -r .access_token)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/warehouses/$ID -H "Authorization: Bearer $TOKEN_B"
# Expected: 404

# 8. No token → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/warehouses
# Expected: 401

# 9. Build + lint (changed files)
cd backend && pnpm build && npx eslint src/modules/warehouses
# Expected: build passes, no new lint errors
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-05-31 | Spec generated from code by `spec-generator` (`/new-spec warehouses`) | 7 endpoints; opportunity-finder score 25; gaps: tenant-scoped update/remove writes, `getStats` zone-count `tenantId`, `@IsIn` on `warehouseType`, `@ApiResponse` on all handlers, cross-tenant e2e |
| 2026-05-31 | Implemented all gaps (tenant-scoped `updateMany` writes, zone-count `tenantId`, `@IsIn` on `warehouseType`, `@ApiResponse` ×7) + unit/e2e tests | All acceptance criteria met; ready to ship |
| 2026-05-31 | Shipped to origin (cb9f71a); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%); unit 20/20 + e2e 13/13 |
