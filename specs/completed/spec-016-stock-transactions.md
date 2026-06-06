# spec-016 — Stock Transactions (Inventory Movements, WAC Costing & Reports)

Status: **Complete**  
Owner: Platform  
Sprint: 19  
Module(s): `stock-transactions` (touches `frontend/lib/api/stock-transactions.ts` for the list envelope)  
Last updated: 2026-06-06  

---

## Problem

`stock-transactions` is the inventory engine: it owns `StockMovement` (the immutable
movement ledger, `SM-YYYY-NNNN`) and `Stock` (current position per item/warehouse with
triple-UOM quantities and WAC `unitCost`), exposes manual receipts/issues plus six
read-side reports (balance, ledger, valuation, planning/ATP, ABC, aging, turnover), and
provides the internal `receiveFromApInvoice` / `shipFromArInvoice` entry points the
invoice modules call. `goods-receipts`, `stock-reconciliation`, and both invoice modules
depend on it; every valuation and COGS figure in the system trusts this module's math.

Structure is good — thin controller, `UomService` injected for conversions (not
duplicated), batched reference resolution, and `StockMovement` correctly has no
`deletedAt` (ledger immutability). The audit (opportunity-finder, score 73) found:

1. **Cross-tenant reads (6 queries).** `findAll`'s cycle-count resolution
   (`stock-transactions.service.ts:158-160`) and all five of `getLedger`'s reference
   lookups (`:530-561` — `arInvoice`, `apInvoice`, `purchaseOrder`, `goodsReceipt`,
   `stockCountSession`) query `where: { id: { in } }` with **no `tenantId`** — the most
   invariant violations found in any module so far.
2. **Unscoped stock writes (3).** `tx.stock.update({ where: { id: existing.id } })` at
   `:84`, `:332`, `:437` — writes not tenant-scoped at the write itself (spec-015
   precedent).
3. **Stock-corruption paths.**
   - Issuing more than on-hand **silently drives stock negative**, and inconsistently:
     `purchaseQty` clamps at 0 (`Math.max`, `:87`) while `onHandQuantity`/`storageQty`/
     `consumptionQty` decrement unbounded (`:89-98`) — the triple-UOM invariant breaks
     and every report downstream lies.
   - `transactionType` `transfer`/`adjustment` are accepted by the manual endpoint but
     handled as **phantom receipts**: both warehouse FKs end up `null` and stock is
     incremented from nowhere (`:31-46`).
   - A negative or absurd `unitCost`/`quantity` passes the DTO and corrupts WAC.
   - `movementNumber` races on `@@unique([tenantId, movementNumber])` → unhandled
     P2002 → 500.
4. **Filter and format drift.** `findAll` accepts a `warehouseId` filter and silently
   ignores it (`:135-139`); it returns a bare array while the convention is
   `{ movements, count }`; 7 GET endpoints take free-string query params with no
   validation; `GET /planning` lacks `@ApiResponse`.

Also observed, deliberately deferred (see Out of scope): `dto.uom` is stored on the
movement but ignored by `calcAllQties` (conversion assumes the item's canonical UOM);
`shipFromArInvoice` records the issue movement even when no `Stock` row exists; the
internal AP/AR paths target the first active warehouse as a heuristic.

---

## Acceptance criteria

### Endpoints (existing surface — preserved)
- [x] 9 endpoints under `/api/stock-transactions`: `POST /`, `GET /`, `GET /balance`,
      `GET /ledger`, `GET /valuation`, `GET /planning`, `GET /abc`, `GET /aging`,
      `GET /turnover`, `GET /:id` (static routes declared before `:id`).
- [x] Controller-level `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth`.
- [x] Controller is thin — all logic in `StockTransactionsService` (+ `UomService`).
- [x] `GET /planning` has at least one `@ApiResponse` (only handler missing one).

### Tenant scoping
- [x] Primary reads scoped to `tenantId`: movements (`findAll:137`, `findOne:186`,
      ledger `:465`, aging groupBy `:1083`), stock (`:206,:716,:765,:961,:1069,:1195`),
      PO/SO lines (planning, with nested `deletedAt: null`), item/warehouse existence
      checks (`:20-28`, with `deletedAt: null`).
- [x] `findAll`'s cycle-count resolution includes `tenantId`
      (`stockCountSession.findMany` `:158-160`).
- [x] `getLedger`'s five reference lookups include `tenantId`:
      `arInvoice` (`:532`), `apInvoice` (`:538`), `purchaseOrder` (`:544`),
      `goodsReceipt` (`:550`), `stockCountSession` (`:556`).
- [x] The three `stock` writes are tenant-scoped at the write itself
      (`updateMany({ where: { id, tenantId } })` or equivalent): manual create (`:84`),
      `receiveFromApInvoice` (`:332`), `shipFromArInvoice` (`:437`).
- [x] `StockMovement` has no `deletedAt` by design (immutable ledger) — no soft-delete
      filters required on movement queries; `Stock` likewise.

### Manual transaction integrity (POST /)
- [x] `transactionType` restricted to `receipt | issue` (`@IsIn` on the DTO);
      `transfer`/`adjustment` are NOT creatable through this endpoint (they belong to
      internal flows) — sending them → `400`, never a phantom receipt.
- [x] **Issues require sufficient stock**: an issue greater than the current
      `storageQty` for the item/warehouse → `400` stating available vs requested;
      stock can never go negative through this endpoint. The asymmetric
      `Math.max(0, ...)` clamp on `purchaseQty` is removed — all three UOM quantities
      move consistently or not at all.
- [x] `movementNumber` race maps Prisma `P2002` to `409 ConflictException` — never 500.
- [x] Movement number is system-assigned `SM-YYYY-NNNN` (yearly sequence, zero-padded 4,
      tenant-scoped, spans all rows).
- [x] Receipt with `unitCost` recomputes WAC via `UomService.calcNewWAC`; receipt without
      `unitCost` keeps the existing cost; first receipt creates the `Stock` row.
- [x] Quantities are converted to all three UOMs via `UomService.calcAllQties` and the
      movement stores `purchaseQty/consumptionQty` alongside `quantity` (storage).
- [x] Item and warehouse validated in-tenant (`404` otherwise); movement and stock
      mutate inside one `$transaction`.

### DTO validation
- [x] `quantity` must be strictly positive (`@IsPositive`) and capped
      (`@Max(999999999999)`, within `Decimal(15,3)`); the misleading
      "negative for OUT" description is corrected (direction comes from
      `transactionType` only).
- [x] `unitCost` bounded: `@Min(0)` + `@Max(999999999999)` — a negative cost can no
      longer corrupt WAC.
- [x] GET query params validated via query DTOs (400 on violation):
      `transactionType`/`movementType` `@IsIn` whitelists, `itemId`/`warehouseId`
      `@IsUUID`, `itemType` `@IsIn(['raw_material','finished_good','consumable'])`,
      `dateFrom`/`dateTo` `@IsDateString`, `alertOnly` `@IsIn(['true','false'])`.
- [x] `POST` body binds `CreateStockTransactionDto` with `class-validator` throughout;
      `lotNumber`/`serialNumber`/`referenceType`/`referenceId`/`notes` optional and
      length-capped.

### Filters & reports (read side — preserved behavior)
- [x] `findAll` applies the `warehouseId` filter it already accepts
      (`OR: [{ fromWarehouseId }, { toWarehouseId }]`, same semantics as ledger).
- [x] `getLedger`: running balance per item/warehouse (seeded from pre-`dateFrom`
      movements), signed quantities, reference-number resolution incl. `GRN_CANCEL`
      "(cancel)" suffix and `opening_balance`, totals block, `{ rows, totals, count }`.
- [x] `getStockBalance`: triple-UOM quantities with per-UOM unit costs and
      `availableQty = max(0, storageQty − reservedQuantity)`.
- [x] `getValuation`: `{ asOf, rows, totalInventoryValue, totalItems }`, value =
      `purchaseQty × WAC`.
- [x] `getStockPlanning`: ATP = available + open-PO supply − open-SO demand; alert
      levels ok/warning/critical/overstock; `doubleOrderRisk`; `alertOnly` filter.
- [x] `getAbcAnalysis`: items ranked by value, cumulative % classification
      (A ≤ 80 < B ≤ 95 < C).
- [x] `getStockAging`: days since last movement bucketed (`0-30 … 180+`,
      `no_movement`), slow-moving > 60d, dead > 180d.
- [x] `getInventoryTurnover`: COGS / avg inventory with annualization for partial
      periods, days-on-hand, performance tiers.

### RBAC
- [x] `POST` → `INVENTORY:CREATE`; all 8 GETs → `INVENTORY:VIEW`.

### Response format
- [x] `GET /api/stock-transactions` returns `{ movements: [...], count }`;
      `frontend/lib/api/stock-transactions.ts` `getAll` unwraps it (1 getter; report
      endpoints keep their existing structured shapes).
- [x] Decimal fields serialized as numbers on movements and report rows.

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations.
- The `dto.uom` semantics gap (client-provided UOM is stored but not used for
  conversion — `calcAllQties` assumes the item's canonical UOM). Fixing this changes
  the UOM-conversion contract and belongs to a follow-up with the `uom` module.
- Behavior changes to the internal `receiveFromApInvoice` / `shipFromArInvoice` flows
  beyond write-scoping: warehouse-selection heuristic, best-effort semantics (callers
  wrap in try/catch), and shipping without a `Stock` row stay as-is — they are owned by
  the unspecced invoice modules' contracts.
- Transfers between warehouses and manual adjustments as first-class endpoints (today
  they exist only as internal movement types from GRN-cancel/cycle-count flows).
- Lot/serial-level stock tracking enforcement, bin-level moves (`warehouse-locations`
  FKs on movements exist but are unused here).
- Reservation management (`reservedQuantity` is read, never written here).
- Pagination of report endpoints; performance work (N+1 in internal loops).

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `StockMovement` | `in_stock_movements` | `tenantId`, `movementNumber` (`SM-YYYY-NNNN`), `movementType` (`receipt/issue/transfer/adjustment/opening_balance`), `itemId`, `fromWarehouseId`/`toWarehouseId`, triple-UOM qtys, `unitCost`, `unitCostAtMovement`, `movementValue` (signed), `referenceType`/`referenceId`, lot/serial; `@@unique([tenantId, movementNumber])`; **no `deletedAt`** (immutable) |
| `Stock` | `in_stock` | `tenantId`, `itemId`, `warehouseId`, `purchaseQty`/`storageQty`/`consumptionQty` (+UOMs), `onHandQuantity` (synced to storage), `reservedQuantity`, `unitCost` (WAC), `levelId`/`binId` optional; `@@unique([tenantId, itemId, warehouseId, levelId, binId, lotNumber, serialNumber])`; **no `deletedAt`** |
| Read-only FK targets | — | `Item` (`isStockable`, conversion factors, reorder fields), `Warehouse`, `PurchaseOrderLine`/`SalesOrderLine` (planning), `ArInvoice`/`ApInvoice`/`PurchaseOrder`/`GoodsReceipt`/`StockCountSession` (reference display) |

Key invariants:
- WAC: `newCost = (oldQty×oldCost + inQty×inCost) / (oldQty + inQty)` on receipts only;
  issues consume at current WAC.
- The three UOM quantities on `Stock` always move together (same movement, converted
  via the item's factors); `onHandQuantity` mirrors `storageQty`.
- Movements are never updated or deleted — corrections are new movements.
- Through the manual endpoint, `storageQty` can never go below zero.

---

## API contracts

All routes prefixed `/api/stock-transactions`, JWT + permissions guarded.

### POST /api/stock-transactions *(INVENTORY:CREATE)*
```json
// Request
{ "transactionType": "receipt", "itemId": "<uuid>", "warehouseId": "<uuid>",
  "quantity": 100, "uom": "PCS", "unitCost": 45.5,
  "lotNumber": "LOT-2026-001", "notes": "Manual receipt" }

// Response 201 — movement with SM number, triple-UOM qtys, joined item/warehouses
{ "id": "...", "movementNumber": "SM-2026-0001", "movementType": "receipt",
  "quantity": 100, "purchaseQty": 100, "consumptionQty": 100,
  "item": { "...": "..." }, "toWarehouse": { "...": "..." } }

// Errors: 400 transactionType not receipt|issue / quantity <= 0 or > cap /
//         unitCost < 0 or > cap / insufficient stock on issue |
//         404 item or warehouse not in tenant | 409 movementNumber race | 403
```

### GET /api/stock-transactions?itemId=&warehouseId=&transactionType= *(INVENTORY:VIEW)*
```json
// Response 200 (target envelope; warehouseId filter now APPLIED via from/to OR-match)
{ "movements": [ { "movementNumber": "SM-2026-0001", "referenceDisplay": "CC-2026-0001",
    "quantity": 100, "...": "..." } ], "count": 1 }
// Errors: 400 invalid query param | 403
```

### GET /api/stock-transactions/balance?itemId=&warehouseId= *(INVENTORY:VIEW)*
```json
// Response 200 — array of stock positions
[ { "purchaseQty": 10, "storageQty": 100, "consumptionQty": 1000,
    "unitCost": 45.5, "unitCostStorage": 4.55, "unitCostConsumption": 0.455,
    "totalValue": 455, "reservedQuantity": 0, "availableQty": 100,
    "item": { "...": "..." }, "warehouse": { "...": "..." } } ]
```

### GET /api/stock-transactions/ledger?itemId=&warehouseId=&itemType=&movementType=&referenceNumber=&dateFrom=&dateTo= *(INVENTORY:VIEW)*
```json
// Response 200
{ "rows": [ { "movementNumber": "...", "referenceNumber": "INV-2026-0001",
    "signedQuantity": -10, "openingBalance": 110, "closingBalance": 100, "...": "..." } ],
  "totals": { "totalIn": 0, "totalOut": 0, "netMovement": 0, "totalInValue": 0,
    "totalOutValue": 0, "netValue": 0, "openingBalance": 0, "closingBalance": 0 },
  "count": 1 }
```

### GET /api/stock-transactions/valuation?warehouseId=&itemType= *(INVENTORY:VIEW)*
```json
{ "asOf": "...", "rows": [ { "itemCode": "...", "purchaseQty": 10, "unitCost": 45.5,
    "totalValue": 455 } ], "totalInventoryValue": 455, "totalItems": 1 }
```

### GET /api/stock-transactions/planning?warehouseId=&itemType=&alertOnly= *(INVENTORY:VIEW)*
```json
{ "rows": [ { "itemCode": "...", "onHandQty": 100, "availableQty": 100,
    "poSupplyQty": 50, "soDemandQty": 30, "atpQty": 120, "alertLevel": "ok",
    "doubleOrderRisk": false, "suggestedOrderQty": 0, "openPOs": [], "openSOs": [] } ],
  "summary": { "total": 1, "critical": 0, "warning": 0, "overstock": 0, "ok": 1,
    "doubleOrderRisk": 0, "totalStockValue": 455 } }
```

### GET /api/stock-transactions/abc?warehouseId=&itemType= *(INVENTORY:VIEW)*
```json
{ "rows": [ { "rank": 1, "itemCode": "...", "totalValue": 455, "valuePct": 100,
    "cumulativePct": 100, "abcClass": "A" } ],
  "summary": { "grandTotal": 455, "classA": { "count": 1, "value": 455 },
    "classB": { "...": "..." }, "classC": { "...": "..." } }, "asOf": "..." }
```

### GET /api/stock-transactions/aging?warehouseId=&itemType= *(INVENTORY:VIEW)*
```json
{ "rows": [ { "itemCode": "...", "daysSinceLastMovement": 12, "agingBucket": "0-30",
    "isSlowMoving": false, "isDead": false } ],
  "summary": { "totalItems": 1, "slowMovingCount": 0, "deadStockCount": 0,
    "buckets": { "0-30": { "count": 1, "value": 455 }, "...": "..." } }, "asOf": "..." }
```

### GET /api/stock-transactions/turnover?warehouseId=&itemType=&dateFrom=&dateTo= *(INVENTORY:VIEW)*
```json
{ "rows": [ { "itemCode": "...", "openingValue": 0, "closingValue": 455,
    "avgInventory": 227.5, "cogs": 0, "turnoverRatio": null, "daysOnHand": null,
    "performance": "no_movement" } ],
  "summary": { "overallTurnover": null, "periodDays": 157 },
  "period": { "dateFrom": "2026-01-01", "dateTo": "2026-06-06", "isAnnualized": true } }
```

### GET /api/stock-transactions/:id *(INVENTORY:VIEW)*
```json
// Response 200 — single movement with joins, Decimals as numbers
// Errors: 404 unknown / other-tenant id | 403
```

### Internal service API (no HTTP route — consumed by invoice modules)
```ts
receiveFromApInvoice(tenantId, userId, apInvoice)  // receipt + WAC per stockable line
shipFromArInvoice(tenantId, userId, arInvoice)     // issue at WAC, signed COGS movementValue
// Best-effort: skips non-stockable/missing items, returns void, callers try/catch.
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/stock-transactions/stock-transactions.service.ts` | Add `tenantId` to the 6 reference lookups; tenant-scope the 3 `stock` writes (`updateMany`); insufficient-stock guard on manual issue (remove asymmetric clamp); reject non-`receipt|issue` types (defense-in-depth behind the DTO); `P2002 → 409`; apply `warehouseId` filter in `findAll`; `findAll` envelope `{ movements, count }` |
| `src/modules/stock-transactions/stock-transactions.controller.ts` | Bind GET query DTOs; `@ApiResponse` on `/planning` |
| `src/modules/stock-transactions/dto/create-stock-transaction.dto.ts` | `@IsIn(['receipt','issue'])` on `transactionType`; `@IsPositive` + `@Max` on `quantity`; `@Min(0)` + `@Max` on `unitCost` |
| `src/modules/stock-transactions/dto/query.dtos.ts` | **New** — `FindMovementsQueryDto`, `LedgerQueryDto`, `ReportQueryDto`, `PlanningQueryDto`, `TurnoverQueryDto` |
| `frontend/lib/api/stock-transactions.ts` | `getAll` unwraps `{ movements, count }` |

### Cross-module dependencies
- **`uom` (spec-005)** — `UomService.calcAllQties` / `calcNewWAC` / `calcFinancialValue`
  injected via `UomModule` (correct pattern).
- **Read-only reference lookups** — `ArInvoice`, `ApInvoice`, `PurchaseOrder`,
  `GoodsReceipt`, `StockCountSession` models read directly for display-number
  resolution; documented exception until those modules ship specs (display-only,
  `select` limited to id + number).
- Consumed by: `ar-invoices`, `ap-invoices` (internal methods), `goods-receipts`,
  `stock-reconciliation`, `bulk-import` (module exports `StockTransactionsService`).

### Insufficient-stock guard — implementation contract
Inside the existing `$transaction`, before mutating on an `issue`:
```ts
const available = Number(existing?.storageQty ?? 0);
if (isIssue && allQtys.storageQty > available) {
  throw new BadRequestException(
    `Insufficient stock: available ${available}, requested ${allQtys.storageQty}`);
}
```
An issue against a non-existent `Stock` row is by definition insufficient (`available 0`).

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`,
  `transform`); Swagger at `/api/docs`; module registered in `app.module.ts`.

---

## Verification checklist

```bash
# 0. Login (spec-001) → $TOKEN; a stockable item → $ITEM; a warehouse → $WH
BASE=http://localhost:3000/api/stock-transactions
AUTH="Authorization: Bearer $TOKEN"

# 1. Receipt → 201, SM-YYYY-NNNN, stock created/updated with WAC
curl -s -X POST $BASE -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"transactionType\":\"receipt\",\"itemId\":\"$ITEM\",\"warehouseId\":\"$WH\",\"quantity\":100,\"uom\":\"PCS\",\"unitCost\":10}" | jq '.movementNumber'
# Expected: "SM-2026-NNNN"

# 2. Issue more than on-hand → 400 with available vs requested
curl -s -X POST $BASE -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"transactionType\":\"issue\",\"itemId\":\"$ITEM\",\"warehouseId\":\"$WH\",\"quantity\":999999,\"uom\":\"PCS\"}" | jq '.statusCode,.message'
# Expected: 400, "Insufficient stock..."

# 3. transfer/adjustment via manual endpoint → 400; quantity 0 → 400; unitCost -5 → 400
# 4. GET / → { movements, count }; ?warehouseId=$WH actually filters
curl -s "$BASE?warehouseId=$WH" -H "$AUTH" | jq 'has("movements") and has("count")'
# Expected: true
# 5. ?transactionType=weird → 400 (query DTO)
# 6. WAC check: receipt 100 @ 10 then 100 @ 20 → balance unitCost 15
curl -s "$BASE/balance?itemId=$ITEM" -H "$AUTH" | jq '.[0].unitCost'
# Expected: 15
# 7. Issue 50 → balance 150, unitCost still 15; ledger shows signed -50 and running balance
# 8. Reports respond 200 with documented shapes: /ledger /valuation /planning /abc /aging /turnover
# 9. Tenant isolation (tenant2admin): movements/balances of tenant A invisible; POST with A's item → 404
# 10. Build + lint + tests
cd backend && pnpm build && pnpm test stock-transactions.service && pnpm test:e2e stock-transactions
# Expected: all pass
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 73) | Draft — 6 cross-tenant reference lookups, 3 unscoped stock writes, silent negative stock, phantom transfer/adjustment receipts, P2002 mapping, ignored warehouseId filter, DTO/query whitelists + caps, list envelope captured as unchecked criteria |
| 2026-06-06 | Test scaffolding written (18 unit / 17 e2e, 16 tagged [GAP]) | Red as expected on all gaps |
| 2026-06-06 | All 12 gaps implemented: tenantId on 6 reference lookups + 3 stock writes (updateMany), insufficient-stock guard (issue <= on-hand, missing row = 0, asymmetric clamp removed), receipt/issue whitelist + service guard, P2002->409, warehouseId filter applied, query DTOs, quantity/unitCost caps, { movements, count } envelope + frontend unwrap, @ApiResponse on /planning | Unit 18/18, e2e 17/17 (incl. live WAC flow 100@10+100@20->15), backend build OK, frontend build OK, module lint clean |
| 2026-06-06 | Shipped to origin (`5ab1f9e`); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
