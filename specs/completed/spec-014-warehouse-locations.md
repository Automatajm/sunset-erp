# spec-014 — Warehouse Locations (Zones / Aisles / Racks / Levels / Bins)

Status: **Complete**  
Owner: Platform  
Sprint: 19  
Module(s): `warehouse-locations` (touches `frontend/lib/api/warehouse-locations.ts` for the list envelope)  
Last updated: 2026-06-06  

---

## Purpose

- **Who uses this module?** Warehouse managers and clerks who lay out the physical storage
  map — the zones, aisles, racks, levels, and bins where stock physically sits.
- **What business problem does it solve?** It models the five-level storage hierarchy
  (Warehouse → Zone → Aisle → Rack → Level → Bin) with a system-generated location code at
  each tier, so every unit of stock can be addressed to an exact physical spot.
- **What can the business NOT do without this module?** It cannot tell anyone where to put
  or find stock, cannot do bin-level counts or movements, and cannot give stock
  transactions and reconciliations a real location to reference.

## Business value

This module turns "the warehouse" into an addressable map: without it, stock is just a
number with no place, so pickers wander, counts are imprecise, and putaway is guesswork.
Accurate location codes are what make picking fast, counting reliable, and space usable —
the difference between a warehouse that runs smoothly and one where people hunt for
inventory. Because stock movements and cycle counts all reference these locations, getting
the hierarchy and its cascading codes right keeps every downstream inventory operation
honest.

---

## Problem

`warehouse-locations` owns the five-level physical storage hierarchy every stock
operation addresses: **Warehouse → Zone → Aisle → Rack → Level → Bin**, with a
system-generated `fullCode` (`ZONE-AISLE-RACK-LEVEL-BIN`) at each tier. It is a
direct prerequisite of `stock-transactions` and `stock-reconciliation` (next in the
module cascade) — `Stock`, `StockMovement`, and `StockCountLine` all FK into
`WarehouseLevel`/`WarehouseBin`.

The module is structurally healthy — thin controller, full Swagger coverage on all
20 handlers, validated DTOs, soft-delete + audit columns throughout — but the audit
(opportunity-finder, score 80) found four families of defects:

1. **Tenant-scoping gaps (7 queries).** Every duplicate-check and delete-guard query
   relies on *transitive* scoping (the parent was validated first) instead of
   including `tenantId` directly — violating the project's hard invariant. E.g.
   `warehouse-locations.service.ts:34` checks zone-code uniqueness with
   `{ warehouseId, code, deletedAt: null }` and no `tenantId`; the `stock.count`
   delete guard at `:352` has neither `tenantId` nor a `deletedAt` filter.
2. **Hierarchy-integrity bugs.**
   - `removeZone`/`removeAisle`/`removeRack` soft-delete a parent without checking
     for active children, orphaning live aisles/racks/levels under a deleted parent
     (only level→bins and bin→stock are guarded today).
   - Changing `code` via update recomputes only that record's own `fullCode`; every
     descendant keeps a stale `fullCode` embedding the old parent code.
   - Update paths never re-check sibling-code uniqueness, so renaming a code to an
     existing sibling's code succeeds — or, worse, surfaces as an unhandled Prisma
     `P2002` (500) because the DB unique indexes exist.
   - The unique indexes (`@@unique([zoneId, code])` etc.) do **not** include
     `deletedAt`, so re-creating a previously soft-deleted code passes the
     service-level dup check and dies at the DB with an unhandled `P2002` → 500.
3. **Weak enum validation.** `zoneType` and `binType` document closed sets in
   Swagger but accept any string (`@IsString`, no `@IsIn`).
4. **Response format drift.** The five list endpoints return bare arrays; the
   project convention (spec-001, re-affirmed by spec-013) is the
   `{ <resource>: [...], count }` envelope.

`updateZone` also skips the `.toUpperCase()` normalization that `createZone` applies,
so a zone created as `STOR` can be renamed to `stor`.

This spec pins the module to the invariants and fixes all of the above without
schema changes.

---

## Acceptance criteria

### Endpoints (existing surface — preserved)
- [x] 20 endpoints under `/api/warehouse-locations`: for each of `zones`, `aisles`,
      `racks`, `levels`, `bins` — `POST /<entity>`, `GET /<entity>/by-<parent>/:parentId`,
      `PATCH /<entity>/:id`, `DELETE /<entity>/:id`.
- [x] All handlers guarded by `@UseGuards(JwtAuthGuard, PermissionsGuard)` +
      `@ApiBearerAuth('JWT-auth')` at controller level.
- [x] Every handler has `@ApiOperation` + `@ApiResponse` (and `@ApiParam` on
      parameterized routes).
- [x] Controller is thin — every handler delegates to `WarehouseLocationsService`
      with `req.user.tenantId` / `req.user.id`.

### Tenant scoping — every query carries `tenantId`
- [x] Parent-existence checks, fetch-before-update, and fetch-before-delete are
      scoped `{ id, tenantId, deletedAt: null }`.
- [x] List queries are scoped `{ <parentId>, tenantId, deletedAt: null }`.
- [x] Duplicate-code checks include `tenantId`:
      `createZone`, `createAisle`, `createRack`, `createLevel`, `createBin`.
- [x] Delete-guard counts include `tenantId`:
      `removeLevel`'s `warehouseBin.count` and `removeBin`'s `stock.count`.
- [x] `removeBin`'s `stock.count` — resolved: the `Stock` model has **no** `deletedAt`
      column (live quantity snapshot, never soft-deleted), so `tenantId` +
      `onHandQuantity > 0` is the full scope; documented in the service.

### Hierarchy integrity — deletes
- [x] `removeZone` throws `400 BadRequestException` while active (non-deleted)
      aisles exist in the zone.
- [x] `removeAisle` throws `400` while active racks exist in the aisle.
- [x] `removeRack` throws `400` while active levels exist in the rack.
- [x] `removeLevel` throws `400` while active bins exist in the level.
- [x] `removeBin` throws `400` while stock on hand (`onHandQuantity > 0`) exists in the bin.
- [x] All deletes are soft (`deletedAt: new Date()`, `deletedBy: userId`) and return
      `{ message, id }`.

### Hierarchy integrity — `fullCode`
- [x] `fullCode` is system-generated on create at every tier:
      aisle `ZONE-AISLE`, rack `ZONE-AISLE-RACK`, level `ZONE-AISLE-RACK-LEVEL`,
      bin `ZONE-AISLE-RACK-LEVEL-BIN`. Clients never supply it.
- [x] Changing `code` via `PATCH` recomputes `fullCode` for the record **and all of
      its non-deleted descendants** (zone → aisles → racks → levels → bins) in a
      single transaction.
- [x] `updateZone` uppercases `dto.code` exactly as `createZone` does.

### Duplicate handling
- [x] Creates throw `409 ConflictException` when an active sibling already has the code.
- [x] Updates that change `code` re-check sibling uniqueness and throw `409` on conflict
      (all five entities).
- [x] Creates and updates map Prisma `P2002` (unique-index collision — e.g. the code
      exists only on a soft-deleted sibling, invisible to the `deletedAt: null`
      dup-check) to `409 ConflictException` with a clear message — never a 500.

### DTO validation
- [x] All `@Body()` params bind to DTOs with `class-validator` decorators; UUIDs use
      `@IsUUID`, codes use `@IsString` + `@MaxLength`, capacities use `@IsNumber` +
      `@Min(0)` + `@Type(() => Number)`.
- [x] `zoneType` restricted with `@IsIn(['storage','receiving','shipping','quarantine','production','returns'])`
      on create + update DTOs.
- [x] `binType` restricted with `@IsIn(['standard','pallet','big_bag','tank','silo','ibc','container','bulk'])`
      on create + update DTOs.

### RBAC
- [x] `POST` → `INVENTORY:CREATE`, `GET` → `INVENTORY:VIEW`, `PATCH` → `INVENTORY:EDIT`,
      `DELETE` → `INVENTORY:DELETE` on every entity.

### Error handling
- [x] `404 NotFoundException` when the parent (warehouse/zone/aisle/rack/level) or the
      target record does not exist in the caller's tenant.
- [x] `409` on duplicate sibling code at create.
- [x] `400` on validation failure (global `ValidationPipe`).
- [x] `400` on parent delete while active children exist (zones/aisles/racks — see above).

### Response format
- [x] List endpoints return the envelope:
      `{ zones, count }`, `{ aisles, count }`, `{ racks, count }`, `{ levels, count }`,
      `{ bins, count }` — each item keeping its `_count` child summary.
- [x] `frontend/lib/api/warehouse-locations.ts` getters unwrap the new envelope
      (5 functions); no other frontend changes.
- [x] Mutation responses return the entity (create/update) or `{ message, id }` (delete).

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations (the `deletedAt`-blind unique
  indexes are handled in code via `P2002 → 409`, not by altering indexes).
- New endpoints: single-record `GET`, full-tree/cascading views, bulk creation,
  location import. (Bulk stock-location import lives in `bulk-import`.)
- `stock-transactions` / `stock-reconciliation` — they are the next cascade entries;
  this spec only guarantees the hierarchy they depend on.
- Moving entities between parents (changing `zoneId`/`aisleId`/`rackId`/`levelId`
  on update) — update DTOs deliberately omit parent FKs; re-parenting stays unsupported.
- Capacity enforcement (`maxWeightKg`/`maxVolumeLtr`/`maxPallets` are descriptive
  metadata; enforcement belongs to stock-transactions).
- Frontend UI changes beyond the five envelope consumers.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `WarehouseZone` | `in_wh_zones` | `tenantId`, `warehouseId`, `code` (≤20, uppercased), `name`, `zoneType` (default `storage`), `isActive`; `@@unique([tenantId, warehouseId, code])` |
| `WarehouseAisle` | `in_wh_aisles` | `tenantId`, `zoneId`, `code` (≤10), `fullCode` (`ZONE-AISLE`), `isActive`; `@@unique([zoneId, code])` |
| `WarehouseRack` | `in_wh_racks` | `tenantId`, `aisleId`, `code` (≤10), `fullCode`, `isActive`; `@@unique([aisleId, code])` |
| `WarehouseLevel` | `in_wh_levels` | `tenantId`, `rackId`, `code` (≤10), `fullCode`, `maxWeightKg`, `maxVolumeLtr`, `maxPallets`; `@@unique([rackId, code])`; FKs from `Stock`, `StockMovement`, `StockCountLine` |
| `WarehouseBin` | `in_wh_bins` | `tenantId`, `levelId`, `code` (≤10), `fullCode`, `binType` (default `standard`), `allowMixedItems`, capacities, `notes`; `@@unique([levelId, code])`; FKs from `Stock`, `StockMovement`, `StockCountLine` |

Key invariants:
- All five models carry full audit columns (`createdBy/updatedBy/deletedBy`,
  `createdAt/updatedAt/deletedAt`) and soft-delete.
- `fullCode` is derived, never client-supplied; it must always equal the
  concatenation of the live ancestor chain's codes.
- Unique indexes do **not** include `deletedAt` → soft-deleted siblings still
  occupy their code at the DB level; the service must surface this as `409`.
- `Stock.binId`/`Stock.levelId` (owned by `stock-transactions`) gate bin deletion;
  the count query is documented here as a read-only cross-module dependency until
  stock-transactions ships a service API for it.

---

## API contracts

All routes prefixed `/api/warehouse-locations`, JWT + permissions guarded.
The four operations are uniform across the five entities; zones shown in full,
the rest abbreviated to their distinct fields.

### POST /api/warehouse-locations/zones *(INVENTORY:CREATE)*
```json
// Request
{ "warehouseId": "<uuid>", "code": "stor", "name": "Storage Area",
  "zoneType": "storage", "description": "Main raw-materials area", "isActive": true }

// Response 201 — code uppercased
{ "id": "...", "tenantId": "...", "warehouseId": "...", "code": "STOR",
  "name": "Storage Area", "zoneType": "storage", "isActive": true, "...": "audit" }

// Errors: 404 warehouse not found | 409 code exists in warehouse (incl. soft-deleted → P2002 mapping) | 400 validation (zoneType not in whitelist)
```

### GET /api/warehouse-locations/zones/by-warehouse/:warehouseId *(INVENTORY:VIEW)*
```json
// Response 200 (target envelope)
{ "zones": [ { "id": "...", "code": "STOR", "name": "Storage Area",
    "zoneType": "storage", "isActive": true, "_count": { "aisles": 3 } } ],
  "count": 1 }
```

### PATCH /api/warehouse-locations/zones/:id *(INVENTORY:EDIT)*
```json
// Request (all optional; code uppercased; code change cascades fullCode to all descendants)
{ "code": "RECV", "name": "Receiving", "zoneType": "receiving", "isActive": true }

// Response 200 — updated zone
// Errors: 404 zone not found | 409 new code already used by sibling | 400 validation
```

### DELETE /api/warehouse-locations/zones/:id *(INVENTORY:DELETE)*
```json
// Response 200
{ "message": "Zone deleted successfully", "id": "..." }

// Errors: 404 zone not found | 400 active aisles exist in zone
```

### POST /api/warehouse-locations/aisles *(INVENTORY:CREATE)*
```json
// Request
{ "zoneId": "<uuid>", "code": "01", "name": "Aisle 1", "isActive": true }
// Response 201 — fullCode: "STOR-01"
// Errors: 404 zone | 409 code exists in zone | 400 validation
```

### GET /api/warehouse-locations/aisles/by-zone/:zoneId *(INVENTORY:VIEW)*
```json
{ "aisles": [ { "code": "01", "fullCode": "STOR-01", "_count": { "racks": 2 } } ], "count": 1 }
```

### PATCH /api/warehouse-locations/aisles/:id *(INVENTORY:EDIT)*
```json
// { "code": "02" } → fullCode "STOR-02" + descendant racks/levels/bins recomputed
// Errors: 404 | 409 sibling code | 400
```

### DELETE /api/warehouse-locations/aisles/:id *(INVENTORY:DELETE)*
```json
{ "message": "Aisle deleted successfully", "id": "..." }
// Errors: 404 | 400 active racks exist
```

### POST /api/warehouse-locations/racks *(INVENTORY:CREATE)*
```json
{ "aisleId": "<uuid>", "code": "01", "name": "Rack 1" }
// 201 — fullCode "STOR-01-01" | Errors: 404 aisle | 409 | 400
```

### GET /api/warehouse-locations/racks/by-aisle/:aisleId *(INVENTORY:VIEW)*
```json
{ "racks": [ { "fullCode": "STOR-01-01", "_count": { "levels": 4 } } ], "count": 1 }
```

### PATCH /api/warehouse-locations/racks/:id *(INVENTORY:EDIT)*
```json
// code change recomputes own + descendant fullCodes | Errors: 404 | 409 | 400
```

### DELETE /api/warehouse-locations/racks/:id *(INVENTORY:DELETE)*
```json
{ "message": "Rack deleted successfully", "id": "..." }
// Errors: 404 | 400 active levels exist
```

### POST /api/warehouse-locations/levels *(INVENTORY:CREATE)*
```json
{ "rackId": "<uuid>", "code": "01", "maxWeightKg": 1000, "maxVolumeLtr": 2000, "maxPallets": 4 }
// 201 — fullCode "STOR-01-01-01" | Errors: 404 rack | 409 | 400
```

### GET /api/warehouse-locations/levels/by-rack/:rackId *(INVENTORY:VIEW)*
```json
{ "levels": [ { "fullCode": "STOR-01-01-01", "_count": { "bins": 6, "stock": 2 } } ], "count": 1 }
```

### PATCH /api/warehouse-locations/levels/:id *(INVENTORY:EDIT)*
```json
// code change recomputes own + descendant bin fullCodes | Errors: 404 | 409 | 400
```

### DELETE /api/warehouse-locations/levels/:id *(INVENTORY:DELETE)*
```json
{ "message": "Level deleted successfully", "id": "..." }
// Errors: 404 | 400 active bins exist
```

### POST /api/warehouse-locations/bins *(INVENTORY:CREATE)*
```json
{ "levelId": "<uuid>", "code": "01", "binType": "pallet",
  "maxWeightKg": 25000, "allowMixedItems": false, "notes": "..." }
// 201 — fullCode "STOR-01-01-01-01" | Errors: 404 level | 409 | 400 (binType whitelist)
```

### GET /api/warehouse-locations/bins/by-level/:levelId *(INVENTORY:VIEW)*
```json
{ "bins": [ { "fullCode": "STOR-01-01-01-01", "binType": "pallet",
    "allowMixedItems": false, "_count": { "stock": 1 } } ], "count": 1 }
```

### PATCH /api/warehouse-locations/bins/:id *(INVENTORY:EDIT)*
```json
// leaf — code change recomputes own fullCode only | Errors: 404 | 409 | 400
```

### DELETE /api/warehouse-locations/bins/:id *(INVENTORY:DELETE)*
```json
{ "message": "Bin deleted successfully", "id": "..." }
// Errors: 404 | 400 stock on hand exists (onHandQuantity > 0)
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/warehouse-locations/warehouse-locations.service.ts` | Add `tenantId` to 5 dup-checks + 2 delete-guard counts; add child guards to `removeZone`/`removeAisle`/`removeRack`; dup-check + uppercase on updates; transactional `fullCode` descendant cascade on code change; map `P2002` → `409`; wrap 5 list methods in envelopes |
| `src/modules/warehouse-locations/warehouse-locations.controller.ts` | Swagger: add `400` responses to zone/aisle/rack deletes; `200` envelope descriptions on lists |
| `src/modules/warehouse-locations/dto/create-zone.dto.ts`, `update-zone.dto.ts` | `@IsIn` whitelist on `zoneType` |
| `src/modules/warehouse-locations/dto/create-bin.dto.ts`, `update-bin.dto.ts` | `@IsIn` whitelist on `binType` |
| `frontend/lib/api/warehouse-locations.ts` | Unwrap `{ zones\|aisles\|racks\|levels\|bins, count }` in the 5 getters |

### Cross-module dependencies
- **`warehouses` (spec-004)** — parent-existence check on zone create (read-only,
  own `this.prisma.warehouse` query is acceptable: the FK target is validated, not
  business data consumed).
- **`stock-transactions` (unspecced)** — `removeBin` counts `Stock.onHandQuantity`
  directly via Prisma. Documented exception to the module-interconnection rule until
  stock-transactions ships; revisit when that spec lands.
- Consumed by: `stock-transactions`, `stock-reconciliation`, `bulk-import` (FKs into
  `WarehouseLevel`/`WarehouseBin`).

### fullCode cascade — implementation contract
On `code` change, inside one `this.prisma.$transaction`:
1. Update the record's own `code` + `fullCode`.
2. Recompute descendants tier by tier (zone: aisles → racks → levels → bins),
   filtering every tier `{ tenantId, deletedAt: null }`, by string-prefix rebuild
   (`newFullCode + suffix`) — not per-row refetch of the ancestor chain.
3. Bins are leaves — no cascade needed on bin code change.

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`);
  Swagger at `/api/docs`; module registered in `app.module.ts:79`.

---

## Verification checklist

```bash
# 0. Login (see spec-001) → $TOKEN; pick a warehouse id → $WH
BASE=http://localhost:3000/api/warehouse-locations
AUTH="Authorization: Bearer $TOKEN"

# 1. Create zone — code uppercased
curl -s -X POST $BASE/zones -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"warehouseId\":\"$WH\",\"code\":\"stor\",\"name\":\"Storage\"}" | jq .code
# Expected: "STOR"

# 2. Invalid zoneType → 400
curl -s -X POST $BASE/zones -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"warehouseId\":\"$WH\",\"code\":\"X1\",\"name\":\"X\",\"zoneType\":\"garage\"}" | jq .statusCode
# Expected: 400

# 3. List envelope
curl -s $BASE/zones/by-warehouse/$WH -H "$AUTH" | jq 'has("zones") and has("count")'
# Expected: true

# 4. Duplicate zone code → 409 (repeat step 1)
# Expected: 409

# 5. Build hierarchy: aisle 01 under STOR, rack 01, level 01, bin 01
#    → bin .fullCode == "STOR-01-01-01-01"

# 6. Rename aisle code 01→02 → descendant fullCodes cascade
curl -s -X PATCH $BASE/aisles/$AISLE -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"code":"02"}' | jq .fullCode          # Expected: "STOR-02"
curl -s $BASE/bins/by-level/$LEVEL -H "$AUTH" | jq '.bins[0].fullCode'
# Expected: "STOR-02-01-01-01"

# 7. Update to a sibling's code → 409
# 8. Delete zone with active aisles → 400; delete bin chain bottom-up → 200 each
# 9. Soft-delete aisle 02, re-create code "02" → 409 (P2002 mapped), not 500

# 10. Tenant isolation: token for another tenant cannot read/update/delete these ids
# Expected: 404 on PATCH/DELETE by id; empty list on GET by parent

# 11. RBAC: token lacking INVENTORY:DELETE → DELETE returns 403

# 12. Build + lint + tests
cd backend && pnpm build && pnpm lint && pnpm test warehouse-locations
# Expected: all pass
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 80) | Draft — 7 unscoped queries, 3 missing delete guards, fullCode cascade staleness, update dup-checks, P2002 mapping, zoneType/binType whitelists, list envelope captured as unchecked criteria |
| 2026-06-06 | Test scaffolding written (40 unit / 18 e2e, 31 tagged [GAP]) | Red as expected on all gaps |
| 2026-06-06 | All 15 gaps implemented: tenant-scoped dup-checks + guards, child delete guards, transactional fullCode cascade, update dup-checks + uppercase, P2002→409, @IsIn whitelists, list envelopes (backend + frontend consumers) | Unit 40/40 ✅, e2e 18/18 ✅, backend build ✅, frontend build ✅, module lint clean (repo lint errors pre-existing only) |
| 2026-06-06 | Shipped to origin (`500160d`); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
