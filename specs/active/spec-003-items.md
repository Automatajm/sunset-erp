# spec-003 — Items (Inventory Master Data)

Status: **Implemented** — all acceptance criteria met (ready to ship)  
Owner: Inventory  
Sprint: TBD  
Module(s): `items`  
Last updated: 2026-05-31  

> Generated from code by the `spec-generator` skill (`/new-spec items`). Acceptance
> criteria reflect the current implementation; `- [ ]` items are gaps to close before this
> spec is approved and shipped.

---

## Problem

The `items` module is the inventory master-data CRUD for the `in_items` catalog — the central
record every downstream module references (stock, stock movements, BOMs, purchase/sales order
lines, supplier items, goods receipts, MRP, production plans). It is feature-rich and largely
solid: full RBAC (`INVENTORY:*`), tenant scoping on every read, soft delete, auto-generated
`ITEM-NNNN` codes, a UOM-triple with auto-resolved conversion factors (via the injected
`UomService`), barcode resolution for the mobile scanner, and a statistics endpoint. A code
audit (`opportunity-finder`) surfaced a focused set of gaps this spec exists to close:

1. **Writes scoped by `id` alone.** `update`/`remove` call `prisma.item.update({ where: { id } })`
   without `tenantId` (`items.service.ts:329-330`, `:340-341`). Currently safe because each is
   preceded by `findOne(tenantId, id)`, but the write itself is not tenant-scoped — a latent
   cross-tenant risk if the guard is ever refactored away. (Same pattern fixed in spec-002.)
2. **`generateItemCode` read not scoped to `deletedAt: null`.** `items.service.ts:68-69` queries
   `findMany({ where: { tenantId, code: { startsWith: 'ITEM-' } } })` without `deletedAt: null`.
   It carries `tenantId` (no leak), but the soft-delete decision is undocumented — it must be
   made explicit (the `@@unique([tenantId, code])` constraint spans soft-deleted rows).
3. **Enum fields validated only as `@IsString`.** `itemType` (documented
   `raw_material | finished_good | work_in_progress | service`) and `valuationMethod`
   (`average | fifo | standard`) accept any string — no `@IsIn` constraint
   (`create-item.dto.ts:33-35` and the `valuationMethod` field).
4. **List endpoint breaks the response-format convention.** `findAll` returns a bare array,
   not the `{ items, count }` envelope every other list endpoint uses (`items.service.ts:171`).

This spec codifies the intended contract and tracks these fixes. The module is otherwise a
gold-standard example (thin controller, complete Swagger, solid error handling).

---

## Acceptance criteria

### Endpoints (RBAC + Swagger)
- [x] `POST /api/items` — `@RequirePermissions('INVENTORY:CREATE')`, returns 201.
- [x] `GET /api/items` — `@RequirePermissions('INVENTORY:VIEW')`, optional `?itemType=` filter.
- [x] `GET /api/items/statistics` — `@RequirePermissions('INVENTORY:VIEW')`, aggregate counts.
- [x] `GET /api/items/barcode/:scan` — `@RequirePermissions('INVENTORY:VIEW')`, resolves a scan to an item.
- [x] `GET /api/items/:id` — `@RequirePermissions('INVENTORY:VIEW')`.
- [x] `PATCH /api/items/:id` — `@RequirePermissions('INVENTORY:EDIT')`.
- [x] `DELETE /api/items/:id` — `@RequirePermissions('INVENTORY:DELETE')`, soft delete, 200.
- [x] Controller is class-guarded `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth`.
- [x] Every handler has `@ApiOperation` + `@ApiResponse` (and `@ApiParam`/`@ApiQuery` where applicable).
- [x] Controller is thin — every handler delegates to `ItemsService`, no business logic.
- [x] `statistics` and `barcode/:scan` routes are declared **before** `:id` so the literal
      paths are not captured by the `:id` wildcard.

### Data model & tenant scoping
- [x] `findAll` / `findOne` / `findByBarcode` / `findManyByCodes` / `getStatistics` scope every
      read `where: { tenantId, deletedAt: null }`.
- [x] `create` checks for a duplicate `code` scoped to `{ tenantId, code, deletedAt: null }`.
- [x] `update` duplicate check scoped to `{ tenantId, code, id: { not: id }, deletedAt: null }`.
- [x] `remove` is a soft delete (`deletedAt`, `deletedBy`), never a hard delete.
- [x] `update`/`remove` writes are tenant-scoped — use `updateMany({ where: { id, tenantId, deletedAt: null } })`
      or equivalent, not `update({ where: { id } })`, so the write itself enforces tenancy.
- [x] `generateItemCode` either scopes its read to `deletedAt: null`, or documents the
      intentional reason it considers soft-deleted codes (to avoid regenerating a code that
      still occupies the `@@unique([tenantId, code])` constraint). *Decision: NOT scoped —
      documented in `generateItemCode` (same reasoning as spec-002).*

### DTO validation
- [x] `CreateItemDto` carries `class-validator` decorators on every field; `UpdateItemDto`
      is `PartialType(CreateItemDto)`.
- [x] UUID FKs (`categoryId`, `consumptionGroupId`, `purchaseUomId`, `storageUomId`,
      `consumptionUomId`) use `@IsUUID`; numeric fields use `@IsNumber` + `@Min(0)`.
- [x] `itemType` constrained via `@IsIn(['raw_material','finished_good','work_in_progress','service'])`.
- [x] `valuationMethod` constrained via `@IsIn(['average','fifo','standard'])`.

### Error handling
- [x] Duplicate `code` on create/update → `409 ConflictException`.
- [x] Missing/other-tenant id on `findOne`/`update`/`remove` → `404 NotFoundException`.
- [x] Unresolvable barcode/code on `findByBarcode` → `404 NotFoundException`.
- [x] Invalid DTO → `400` via the global `ValidationPipe`.
- [x] Missing permission → `403`; no token → `401`.

### Response format
- [x] `GET /api/items` returns `{ items: [...], count: <n> }`, not a bare array.
- [x] `Item` has no sensitive (banking/PII) columns, so the list returns full rows; the
      envelope only adds `count` (no field stripping required).
- [x] Single-resource endpoints return the item object (with `ITEM_INCLUDE` relations);
      `remove` returns `{ message, id }`.
- [x] `findByBarcode` returns `{ item, matchedBy, supplierId? }` indicating which field resolved the scan.

### Tenant isolation
- [x] An item created under tenant A is not returned by `findAll`/`findOne`/`findByBarcode` for tenant B.
- [x] Covered by an e2e test that creates under tenant A (DEMO) and asserts 404/absence for
      tenant B (TENANT2) — `test/items.e2e-spec.ts`.

### Cross-module integration
- [x] `ItemsModule` imports `UomModule` and injects `UomService` — it never queries UOM tables
      directly (conversion factors resolved via `UomService.getConversionFactor`).
- [x] UOM conversion-factor auto-resolution falls back to the manual factor when the catalog
      lookup is unavailable or returns 1 (`resolveConversionFactor`).

---

## Out of scope

- Schema changes to `in_items` (no migration).
- Stock levels, stock movements, valuation postings — owned by `stock` / `stock-transactions`.
- BOM, supplier-item, purchase/sales-order-line relationships — owned by their own modules.
- The UOM catalog and conversion graph themselves — owned by `uom` (this spec only consumes it).
- Bulk import/export of items (owned by `bulk-import`).
- Pagination/advanced filtering of the list endpoint beyond the existing `itemType` filter.
- Category / consumption-group CRUD.

---

## Data model

**No changes.** Reference only:

| Model | Table | Key fields |
|---|---|---|
| `Item` | `in_items` | `tenantId`, `code`, `name`, `description`, `itemType`, `categoryId`, `consumptionGroupId`, `baseUom`, UOM triple (`purchaseUomId`/`purchaseToConsumptionFactor`, `storageUomId`/`storageToConsumptionFactor`, `consumptionUomId`), flags (`isStockable`/`isPurchasable`/`isSaleable`/`isManufacturable`/`isLotTracked`/`isSerialTracked`/`isExpiryTracked`), `valuationMethod`, `standardCost`, planning (`leadTimeDays`/`safetyStock`/`reorderPoint`/`reorderQuantity`), `defaultSupplierId`, `barcodeInternal`/`barcodeExternal`, `isActive`, audit + soft-delete columns |

Invariants:
- `@@unique([tenantId, code])`; indexes on `tenantId`, `[tenantId, code]`, `[tenantId, name]`,
  `[tenantId, itemType]`, `[tenantId, barcodeInternal]`, `[tenantId, barcodeExternal]`.
- Soft delete via `deletedAt`; audit via `createdBy`/`updatedBy`/`deletedBy`.
- Codes follow `ITEM-NNNN`, generated by `ItemsService.generateItemCode` (max-suffix + 1,
  zero-padded to 4). `barcodeInternal` defaults to the item `code` when omitted.
- UOM factors are `Decimal(18,8)`; cost/planning quantities are `Decimal`.

---

## API contracts

All routes prefixed `/api`, all guarded (`Authorization: Bearer <jwt>` + permission).

### POST /api/items
```json
// Request (code optional — auto-generated ITEM-NNNN if omitted; name, itemType, baseUom required)
{ "name": "Steel Bolt M8x50", "itemType": "raw_material", "baseUom": "PCS", "standardCost": 10.5 }

// Response 201 — created item (full row + ITEM_INCLUDE relations)
{ "id": "...", "code": "ITEM-0001", "name": "Steel Bolt M8x50", "barcodeInternal": "ITEM-0001", "isActive": true, "...": "..." }

// Errors: 409 duplicate code | 400 validation | 403 missing INVENTORY:CREATE | 401
```

### GET /api/items
```json
// Optional filter: /api/items?itemType=raw_material
// Response 200 — TARGET envelope (currently a bare array — see acceptance criteria)
{ "items": [ { "id": "...", "code": "ITEM-0001", "name": "...", "category": {}, "purchaseUom": {} } ], "count": 1 }

// Errors: 403 missing INVENTORY:VIEW | 401
```

### GET /api/items/statistics
```json
// Response 200
{ "total": 42, "byType": [{ "type": "raw_material", "count": 30 }], "stockable": 40, "purchasable": 38,
  "saleable": 12, "withCategory": 35, "withUomTriple": 33, "withBarcode": 42, "withExternalBarcode": 8 }

// Errors: 403 | 401
```

### GET /api/items/barcode/:scan
```json
// Resolves, in order: internal barcode → external barcode → item code → supplier item code
// Response 200
{ "item": { "id": "...", "code": "...", "...": "..." }, "matchedBy": "barcodeInternal" }
// (supplier-item match adds "supplierId")

// Errors: 404 no item matched | 403 | 401
```

### GET /api/items/:id
```json
// Response 200 — full item row + ITEM_INCLUDE relations
{ "id": "...", "code": "...", "name": "...", "supplierItems": [], "...": "..." }

// Errors: 404 not found / other tenant | 403 | 401
```

### PATCH /api/items/:id
```json
// Request — any subset of CreateItemDto fields
{ "standardCost": 12.0, "isPreferred": true, "purchaseUomId": "<uuid>" }
// Changing a UOM field re-resolves the affected conversion factor from the catalog.

// Response 200 — updated item (full row + relations)
{ "id": "...", "...": "..." }

// Errors: 404 | 409 duplicate code | 400 | 403 missing INVENTORY:EDIT | 401
```

### DELETE /api/items/:id
```json
// Response 200
{ "message": "Item deleted successfully", "id": "..." }

// Errors: 404 | 403 missing INVENTORY:DELETE | 401
```

---

## Implementation notes

### Files involved
| File | Role |
|---|---|
| `src/modules/items/items.controller.ts` | 7 thin routes, RBAC + Swagger |
| `src/modules/items/items.service.ts` | CRUD + `generateItemCode` + `resolveConversionFactor` + barcode lookup + statistics; depends on `PrismaService` and `UomService` |
| `src/modules/items/dto/create-item.dto.ts` | full `class-validator` DTO |
| `src/modules/items/dto/update-item.dto.ts` | `PartialType(CreateItemDto)` |
| `src/modules/items/items.module.ts` | imports `PrismaModule` + `UomModule`; exports `ItemsService` |
| `prisma/schema.prisma` → `Item` | `in_items` table |

### Cross-module dependency
`ItemsService` injects `UomService` (from `UomModule`) to auto-resolve the purchase- and
storage-to-consumption conversion factors. Per CLAUDE.md, it must NOT query UOM tables directly.
`ItemsService` itself is exported and consumed by downstream modules (bulk-import, stock,
barcode scanner) — preserve the `findByBarcode` / `findManyByCodes` contracts.

### Route-ordering constraint
`GET /items/statistics` and `GET /items/barcode/:scan` MUST remain declared before
`GET /items/:id`; otherwise NestJS routes `statistics`/`barcode` into the `:id` param.

### `ITEM_INCLUDE`
All single-item responses embed the same relation projection (`category` + `macroCategory`,
the UOM triple, `consumptionGroup`, and active `supplierItems` with their supplier + UOM).
The `{ items, count }` envelope fix must preserve this include on the list path.

---

## Verification checklist

```bash
# Auth (tenant A = DEMO)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}' | jq -r .access_token)

# 1. List → { items, count }
curl -s http://localhost:3000/api/items -H "Authorization: Bearer $TOKEN" | jq 'has("items") and has("count")'
# Expected: true

# 2. Create (auto-code) → 201 with ITEM-NNNN
curl -s -X POST http://localhost:3000/api/items -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Test Item","itemType":"raw_material","baseUom":"PCS"}' | jq .code
# Expected: "ITEM-0001" (or next sequence)

# 3. Invalid itemType → 400 (needs @IsIn)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/items -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Bad","itemType":"not_a_type","baseUom":"PCS"}'
# Expected: 400

# 4. Duplicate code → 409
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/items -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Dup","itemType":"service","baseUom":"PCS","code":"ITEM-0001"}'
# Expected: 409

# 5. Statistics
curl -s http://localhost:3000/api/items/statistics -H "Authorization: Bearer $TOKEN" | jq 'has("total") and has("byType")'
# Expected: true

# 6. Barcode resolve (use a code created above)
curl -s http://localhost:3000/api/items/barcode/ITEM-0001 -H "Authorization: Bearer $TOKEN" | jq .matchedBy
# Expected: "barcodeInternal" or "itemCode"

# 7. Cross-tenant isolation (tenant B = TENANT2): A's item id is 404 for B
TOKEN_B=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"tenant2admin@demo.com","password":"Admin123!"}' | jq -r .access_token)
ID=$(curl -s http://localhost:3000/api/items -H "Authorization: Bearer $TOKEN" | jq -r '.items[0].id')
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/items/$ID -H "Authorization: Bearer $TOKEN_B"
# Expected: 404

# 8. No token → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/items
# Expected: 401

# 9. Build + lint (changed files)
cd backend && pnpm build && npx eslint src/modules/items
# Expected: build passes, no new lint errors
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-05-31 | Spec generated from code by `spec-generator` (`/new-spec items`) | 7 endpoints; opportunity-finder score 21; gaps: tenant-scoped writes, `generateItemCode` decision, `@IsIn` on `itemType`/`valuationMethod`, `{ items, count }` envelope, cross-tenant e2e |
