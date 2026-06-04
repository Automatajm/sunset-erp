# spec-005 — UOM (Units of Measure & Conversion Engine)

Status: **Complete**  
Owner: Inventory  
Sprint: TBD  
Module(s): `uom`  
Last updated: 2026-06-04  

> Generated from code by the `spec-generator` skill (`/new-spec uom`). Acceptance criteria
> reflect the current implementation; `- [ ]` items are gaps to close before this spec is
> approved and shipped. This spec is the **first prerequisite back-fill** identified by
> `specs/MODULE-CASCADE.md` — `items` (spec-003) already ships and depends on `uom`.

---

## Problem

The `uom` module is the **units-of-measure catalog and conversion engine** that underpins every
quantity and every monetary value in the ERP. It owns two Prisma models and exposes four
read-only HTTP endpoints, but its real weight is the **cross-module financial primitives** in
`UomService` that other modules inject: `calcAllQties` (resolve a purchase quantity into
purchase / storage / consumption quantities), `calcNewWAC` (weighted-average-cost after a goods
receipt, ADR-019), and `calcFinancialValue` (value any UOM quantity in the financial unit of
record). `UomModule` exports `UomService` for `GoodsReceiptsModule`, `SupplierItemsModule`,
`StockTransactionsModule`, and `StockReconciliationModule`.

The module is well-shaped — thin controller, full RBAC (`INVENTORY:VIEW`), correct
`NotFoundException` handling, decimal-precision rounding and division-by-zero guards. A code
audit (`opportunity-finder`, score 16, **0 critical**) surfaced a focused set of gaps:

1. **No input validation / no `dto/` folder.** The `convert` endpoint takes raw `@Query()`
   strings and coerces `qty` via `Number(qty)` in the controller (`uom.controller.ts:50-51`):
   `Number("abc")` yields `NaN`, which flows silently into the conversion arithmetic; negative,
   zero, empty, or missing `qty` are not rejected. `findAllUnits` accepts any string for `type`
   and `system` (`uom.controller.ts:25`) — the documented enums
   (`volume | mass | count | length | area | time`, `metric | imperial | universal`) are not
   enforced, so an invalid value silently returns `[]`. The module has no `dto/` directory.
2. **`Number(qty)` parsing leaks into the controller.** `uom.controller.ts:51` does coercion
   that belongs in a query DTO (`@Type(() => Number)` + `@IsNumber`/`@IsPositive`) — controllers
   must be thin.
3. **`convert` has no `BadRequestException` for bad quantities.** `uom.service.ts:67-97` guards
   unknown codes and missing conversions with `NotFoundException`, but `NaN`/negative/zero `qty`
   is not rejected — bad input produces `NaN`/garbage output instead of a 400.
4. **No `@ApiResponse` on any endpoint.** All four handlers have `@ApiOperation` but none declare
   `@ApiResponse` (`uom.controller.ts:18,31,39,46`) — documented 200/400/404 codes are absent
   from Swagger.

### The tenant-scoping exception (must be codified, not "fixed")

`UomUnit` and `UomConversion` are **global reference catalogs**, not tenant-owned data: they have
**no `tenantId` column and no `deletedAt` column**, map to `cfg_uom_units` / `cfg_uom_conversions`
(the `cfg_` prefix marks system configuration), and `UomUnit.code` is **globally unique**
(`@@unique([code])`). UOM units (kg, liter, gal) and their conversion factors are universal
physics shared across all tenants. Therefore the catalog queries in `UomService`
(`findAllUnits`, `findOneUnit`, `findUnitByCode`, `findAllConversions`, `convert`,
`getConversionFactor`) **correctly omit** `tenantId`/`deletedAt` — this is the **one deliberate
exception** to the CLAUDE.md "scope every query with `tenantId`" invariant. Where the service
touches tenant-owned data it scopes correctly: `calcAllQties` filters `Item` and `SupplierItem`
with `{ id, tenantId, deletedAt: null }` (`uom.service.ts:130-131`, `:154-155`). This spec exists
partly to **document this exception** so no future refactor adds `tenantId` to a shared table.

---

## Acceptance criteria

### Endpoints (RBAC + Swagger)
- [x] `GET /api/uom/units` — `@RequirePermissions('INVENTORY:VIEW')`, optional `type` + `system` filters.
- [x] `GET /api/uom/units/:id` — `@RequirePermissions('INVENTORY:VIEW')`, 404 on unknown id.
- [x] `GET /api/uom/conversions` — `@RequirePermissions('INVENTORY:VIEW')`, includes `fromUom`/`toUom`.
- [x] `GET /api/uom/convert` — `@RequirePermissions('INVENTORY:VIEW')`, `from`+`to`+`qty` query params.
- [x] Controller is class-guarded `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth('JWT-auth')`.
- [x] Every handler has `@ApiOperation` (and `@ApiQuery`/`@ApiParam` where applicable).
- [x] Every handler declares `@ApiResponse` for its success code and documented error codes (200/400/404).

### Global-catalog scoping (the deliberate exception)
- [x] `UomUnit` / `UomConversion` are global catalogs — catalog reads omit `tenantId`/`deletedAt` **by design**.
- [x] `calcAllQties` scopes its `Item` read with `{ id, tenantId, deletedAt: null }` (`uom.service.ts:130-131`).
- [x] `calcAllQties` scopes its `SupplierItem` read with `{ id, tenantId, deletedAt: null }` (`uom.service.ts:154-155`).
- [x] A code comment on each catalog query documents that the missing `tenantId` is intentional (global `cfg_` table), to prevent a future "fix".

### DTO validation
- [x] A `dto/` folder exists with `ConvertQueryDto` (`from: @IsString @IsNotEmpty`, `to: @IsString @IsNotEmpty`, `qty: @Type(()=>Number) @IsNumber @IsPositive`).
- [x] A `UnitFilterDto` validates `type` (`@IsOptional @IsIn(['volume','mass','count','length','area','time'])`) and `system` (`@IsOptional @IsIn(['metric','imperial','universal'])`).
- [x] Controller binds query params to these DTOs; no `Number(...)` coercion remains in the controller.
- [x] `:id` is validated as a UUID (`ParseUUIDPipe` or `@IsUUID` DTO).

### Error handling
- [x] `findOneUnit` throws `NotFoundException` on unknown id (`uom.service.ts:46`).
- [x] `findUnitByCode` throws `NotFoundException` on unknown code (`uom.service.ts:52`).
- [x] `convert` throws `NotFoundException` when no conversion exists between two codes (`uom.service.ts:83-86`).
- [x] Conversion math guards division-by-zero (`uom.service.ts:186`, `:255-256`, `:262-263`).
- [x] `convert` throws `BadRequestException` when `qty` is `NaN`, ≤ 0, or missing.
- [x] Invalid `type`/`system` filter values are rejected with 400 (via `@IsIn`) rather than silently returning `[]`.

### Response format
- [x] `GET /units` returns `UomUnit[]` ordered by `type, system, isBase desc, code`.
- [x] `GET /units/:id` returns a single `UomUnit`.
- [x] `GET /conversions` returns `UomConversion[]` with `fromUom`/`toUom` selects.
- [x] `GET /convert` returns `{ fromUom, toUom, inputQty, outputQty, factor, isAutomatic }`; identity (`from===to`) returns factor 1 without a DB hit.

### Cross-module integration (financial primitives)
- [x] `UomModule` exports `UomService` (`uom.module.ts`) for downstream injection.
- [x] `calcAllQties` resolves the purchase→consumption factor by the documented priority chain (SupplierItem → UomConversion catalog → Item fallback → 1.0) (`uom.service.ts:149-173`).
- [x] `calcNewWAC` computes weighted-average cost in `purchaseUom` and returns `{ newUnitCost, newPurchaseQty, totalValue }` (`uom.service.ts:213-228`).
- [x] `calcFinancialValue` always converts to `purchaseUom` before valuing (never values storage/consumption directly) (`uom.service.ts:237-267`).
- [x] These three methods have unit tests pinning their formulas and rounding (no HTTP surface; service-level only).

---

## Out of scope

- **Admin CRUD for units/conversions.** `UomUnit`/`UomConversion` are seed-managed `cfg_` catalogs;
  create/update/deactivate endpoints are not added here. (A future `uom-admin` spec if needed.)
- **Adding `tenantId` to the global catalog.** Explicitly excluded — see the scoping exception above.
- **Per-tenant unit overrides or custom units.** The catalog stays global.
- **Changes to `Item`, `SupplierItem`, or GRN/WAC posting logic** beyond what `UomService` already
  computes — those belong to their own modules' specs (items spec-003, supplier-items, goods-receipts).
- **Schema changes.** This spec preserves the existing data model.
- **Refactoring the rounding helpers** into a shared util — noted but not required here.

---

## Data model

No changes. The module owns two **global** (non-tenant) reference models:

| Model | Table | Key fields | Constraints / notes |
|-------|-------|-----------|---------------------|
| `UomUnit` | `cfg_uom_units` | `id`, `code`, `name`, `type`, `system`, `isBase`, `isActive`, `symbol` | `@@unique([code])` (global); indexes on `type`, `system`, `[type,system]`. **No `tenantId`, no `deletedAt`.** |
| `UomConversion` | `cfg_uom_conversions` | `id`, `fromUomId`, `toUomId`, `factor` (`Decimal(18,8)`), `isActive` | `@@unique([fromUomId,toUomId])`; FKs to `UomUnit`. **No `tenantId`, no `deletedAt`.** |

Invariants:
- `code` is the stable external key for a unit (e.g. `GAL`, `LTR`); conversions are keyed by the
  ordered pair `(fromUomId, toUomId)` and are directional (reverse factor is a separate row).
- `factor` is `Decimal(18,8)`; service arithmetic rounds outputs to 6 dp (quantities) / 4 dp (WAC)
  / 2 dp (financial value).
- Reads filter `isActive: true`; there is no soft delete (no `deletedAt` on these tables).

---

## API contracts

### GET /api/uom/units
```jsonc
// Query: ?type=volume&system=metric   (both optional)
// Permission: INVENTORY:VIEW
// 200 →
[ { "id": "uuid", "code": "LTR", "name": "Liter", "type": "volume",
    "system": "metric", "isBase": true, "isActive": true, "symbol": "L" } ]
// Errors: 400 invalid type/system (after @IsIn), 401 no token, 403 missing permission
```

### GET /api/uom/units/:id
```jsonc
// Param: id (UUID)
// Permission: INVENTORY:VIEW
// 200 → single UomUnit
// Errors: 400 malformed UUID, 404 unit not found, 401, 403
```

### GET /api/uom/conversions
```jsonc
// Permission: INVENTORY:VIEW
// 200 →
[ { "id": "uuid", "fromUomId": "uuid", "toUomId": "uuid", "factor": "3.78541178",
    "isActive": true,
    "fromUom": { "code": "GAL", "name": "Gallon", "type": "volume", "system": "imperial" },
    "toUom":   { "code": "LTR", "name": "Liter",  "type": "volume", "system": "metric" } } ]
// Errors: 401, 403
```

### GET /api/uom/convert
```jsonc
// Query: ?from=GAL&to=LTR&qty=2   (all required; qty > 0)
// Permission: INVENTORY:VIEW
// 200 →
{ "fromUom": "GAL", "toUom": "LTR", "inputQty": 2, "outputQty": 7.570824,
  "factor": 3.78541178, "isAutomatic": true }
// from === to → outputQty = inputQty, factor = 1 (no DB hit)
// Errors: 400 qty NaN/≤0/missing or from/to missing, 404 no conversion between codes, 401, 403
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|------|--------|
| `uom.controller.ts` | Bind query params to `ConvertQueryDto` / `UnitFilterDto`; remove `Number(qty)`; add `@ApiResponse` to all 4 handlers; `ParseUUIDPipe` on `:id`. |
| `uom/dto/convert-query.dto.ts` *(new)* | `from`, `to`, `qty` with class-validator + `@Type`. |
| `uom/dto/unit-filter.dto.ts` *(new)* | `type`, `system` with `@IsOptional @IsIn(...)`. |
| `uom.service.ts` | `BadRequestException` guard at top of `convert`; intent comments on catalog queries. |
| `uom.service.spec.ts` *(new — test-writer)* | Unit tests for convert, calcAllQties, calcNewWAC, calcFinancialValue. |
| `test/uom.e2e-spec.ts` *(new — test-writer)* | e2e for the 4 endpoints + 400/404/401/403. |

### Cross-module dependencies
- **Exported:** `UomService` (via `UomModule.exports`) → injected by `GoodsReceiptsModule`,
  `SupplierItemsModule`, `StockTransactionsModule`, `StockReconciliationModule`.
- **Reads (tenant-owned, correctly scoped):** `Item`, `SupplierItem` inside `calcAllQties`.
- Per CLAUDE.md, these modules must inject `UomService` rather than re-query UOM tables directly.

### Global infrastructure
- Reuses `JwtAuthGuard`, `PermissionsGuard`, `@RequirePermissions`, global error filter and
  response conventions from spec-001. No new infra.
- ADR references in code: ADR-014 (3-UOM model), ADR-019 (purchaseUom as financial unit of record).

---

## Verification checklist

```bash
# Auth (admin@demo.com / DEMO seed) — login returns { access_token }
TOKEN=$(curl -s localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.com","password":"Admin123!"}' | jq -r .access_token)

# 1. List units → ordered array
curl -s localhost:3000/api/uom/units -H "Authorization: Bearer $TOKEN" | jq 'type'
# Expected: "array"

# 2. Filter by valid type → only that type
curl -s "localhost:3000/api/uom/units?type=volume" -H "Authorization: Bearer $TOKEN" | jq '[.[].type] | unique'
# Expected: ["volume"]

# 3. Invalid type → 400 (needs @IsIn)
curl -s -o /dev/null -w '%{http_code}' "localhost:3000/api/uom/units?type=bogus" -H "Authorization: Bearer $TOKEN"
# Expected: 400

# 4. Unit by unknown id → 404
curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/uom/units/00000000-0000-0000-0000-000000000000 -H "Authorization: Bearer $TOKEN"
# Expected: 404

# 5. Malformed UUID → 400 (ParseUUIDPipe)
curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/uom/units/not-a-uuid -H "Authorization: Bearer $TOKEN"
# Expected: 400

# 6. Convert valid → outputQty present
curl -s "localhost:3000/api/uom/convert?from=GAL&to=LTR&qty=2" -H "Authorization: Bearer $TOKEN" | jq '.outputQty'
# Expected: a positive number (~7.57)

# 7. Convert identity (from===to) → factor 1
curl -s "localhost:3000/api/uom/convert?from=LTR&to=LTR&qty=5" -H "Authorization: Bearer $TOKEN" | jq '.factor'
# Expected: 1

# 8. Convert bad qty → 400 (needs BadRequestException + DTO)
curl -s -o /dev/null -w '%{http_code}' "localhost:3000/api/uom/convert?from=GAL&to=LTR&qty=abc" -H "Authorization: Bearer $TOKEN"
# Expected: 400

# 9. Convert with no conversion path → 404
curl -s -o /dev/null -w '%{http_code}' "localhost:3000/api/uom/convert?from=GAL&to=KG&qty=1" -H "Authorization: Bearer $TOKEN"
# Expected: 404

# 10. No token → 401
curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/uom/units
# Expected: 401

# 11. Build + lint (changed files)
cd backend && pnpm build && pnpm lint
# Expected: build passes, no new lint errors

# 12. Unit tests for financial primitives
pnpm test src/modules/uom/uom.service.spec.ts
# Expected: convert / calcAllQties / calcNewWAC / calcFinancialValue green
```

---

## Status log

| Date | Status | Note |
|------|--------|------|
| 2026-06-04 | Draft | Spec generated from code by `spec-generator` (`/new-spec uom`). opportunity-finder score 16, 0 critical. Key finding: UOM is the deliberate global-catalog exception to tenant scoping — codified here, not "fixed". 18 `[x]` already-met / 11 `[ ]` to-do. |
| 2026-06-04 | Implemented | All 11 gaps closed: `dto/` (ConvertQueryDto, UnitFilterDto), ParseUUIDPipe, @ApiResponse ×4, BadRequestException qty guard, intent comments on global-catalog queries. Unit 22/22, e2e 12/12, build + lint clean. Side fixes: removed unused `Decimal` import; `seed-uom.ts` now resolves DEMO tenant by code instead of a hardcoded UUID (was crashing with P2003). |
| 2026-06-04 | Complete | Shipped to origin (e219d8d); marked Complete and moved to specs/completed/. All acceptance criteria met (100% — 30/30, spec-reviewer). |
