# spec-023 — Goods Receipts (GRN)

Status: **Complete**  
Owner: Procurement  
Sprint: Procurement cluster (post spec-020)  
Module(s): `goods-receipts`  
Last updated: 2026-06-06  

---

## Problem

Goods Receipts (GRN) is the gate through which all purchased inventory enters the
system. A GRN posts immediately on create: it writes the receipt header + lines,
creates one `StockMovement` per line, upserts `Stock` (recomputing WAC via
`UomService.calcNewWAC`), increments the linked PO lines' `receivedQuantity`, and
rolls the PO status (`confirmed → partial → received`). Cancel reverses all of it.
AP Invoices (3-way match) build directly on GRN lines. If this module leaks or
mis-posts, inventory valuation and the whole procurement chain are wrong.

The code is functionally rich but the audit (opportunity-finder, 2026-06-06,
score 66) found concrete gaps:

1. **Cross-tenant write path** — `purchaseOrderLine.findFirst` at
   `goods-receipts.service.ts:110` omits `tenantId`, and the matching writes at
   `:264` / `:482` update by bare `id`. A `poLineId` belonging to another tenant
   passes validation and **increments that tenant's `receivedQuantity`**. This is
   the only known unscoped *write* in the procurement cluster.
2. **More unscoped reads** — `stockMovement.findFirst` (`:409`),
   `purchaseOrderLine.findMany` (`:273`, `:490`) omit `tenantId`;
   `resolveSupplierID` (`:62`) omits `deletedAt: null`.
3. **Fragile number generators** — `generateGrnNumber` / `generateMovementNumber`
   use `findFirst + orderBy desc` (string sort breaks past `-9999`) instead of the
   pre-approved numeric-max pattern, and a concurrent-create `P2002` on
   `@@unique([tenantId, grnNumber])` surfaces as a 500 instead of a 409.
4. **PO linkage not validated** — a line's `poLineId` is never checked to belong
   to the header's `poId`; over-receipt (received > ordered) is unbounded.
5. **Weak DTO validation** — `condition` is a free string (frontend uses exactly
   `complete|partial|damaged|rejected`), `receivedDate` is `@IsString`, Decimal
   fields have no `@Max` caps, `lines` accepts an empty array (posts a GRN with
   no lines).
6. **Dead duplicated code** — `getInventoryTurnover`
   (`goods-receipts.service.ts:538-736`, ~200 lines) has no caller; the live
   version is `stock-transactions.service.ts:1227`. Module-interconnection
   violation.
7. **Bare-array list responses** — `findAll` / `findByPo` return arrays, not the
   `{ <resource>, count }` envelope (pre-approved convention; requires a
   `frontend-sync` sweep of `lib/api/goods-receipts.ts`).

This spec codifies the GRN contract as it exists, fixes the gaps above, and does
not change the database schema.

---

## Acceptance criteria

### Endpoints (existing behavior preserved)
- [x] `POST /api/goods-receipts` — creates a GRN (PO-linked or manual), posts stock
      movements, upserts stock with WAC, updates PO line received quantities and PO
      status, all inside a single `$transaction`. Returns the full detail (re-read
      via `findOne`).
- [x] `GET /api/goods-receipts` — lists GRNs with supplier (direct or via PO),
      PO number, warehouse, `lineCount`, computed `totalValue`.
- [x] `GET /api/goods-receipts/stats` — `{ total, posted, cancelled, today, totalValue }`;
      `totalValue` from posted, non-deleted lines via raw SQL.
- [x] `GET /api/goods-receipts/:id` — detail with lines (ordered by `lineNumber`),
      item, PO line (`orderedQuantity`, `unitPrice`), stock movement refs.
- [x] `GET /api/goods-receipts/by-po/:poId` — all GRNs for one PO.
- [x] `PATCH /api/goods-receipts/:id` — updates `condition` / `notes` only;
      `400` if the GRN is cancelled.
- [x] `POST /api/goods-receipts/:id/cancel` — reverses stock (negative adjustment
      movements at original cost), recomputes WAC, decrements PO line received
      quantities, rolls PO status back; `409` if already cancelled.
- [x] Every handler has `@ApiOperation` + `@ApiResponse` + `@ApiBearerAuth('JWT-auth')`.

### Tenant scoping & cross-tenant integrity
- [x] `purchaseOrderLine.findFirst` (`create`, service `:110`) includes `tenantId`
      — a cross-tenant `poLineId` is a `404`, never readable.
- [x] PO-line writes are tenant-scoped: `:264` and `:482` use
      `updateMany({ where: { id, tenantId, deletedAt: null } })` — a cross-tenant
      `poLineId` can never be incremented/decremented.
- [x] `stockMovement.findFirst` (`cancel`, `:409`) includes `tenantId`.
- [x] `purchaseOrderLine.findMany` (PO status rollup, `:273` and `:490`) includes
      `tenantId`.
- [x] `resolveSupplierID` (`:62`) adds `deletedAt: null` to the PO lookup.
- [x] All remaining id-only `update({ where: { id } })` calls on tenant-owned rows
      (`goodsReceipt` `:389`/`:402`, `purchaseOrder` `:281`/`:494`, `stock`
      `:231`/`:469`) migrate to `updateMany` scoped by `tenantId` (+
      `deletedAt: null` where the model has it; `Stock`/`StockMovement` have no
      soft delete — `tenantId` only).
- [x] All `goodsReceipt` reads (`findAll`, `findOne`, `findByPo`, `getStats`, raw
      SQL) scoped by `tenantId` + `deletedAt: null`; line includes filter
      `deletedAt: null`.

### Document number generation
- [x] `generateGrnNumber` migrates to the numeric-max pattern
      (`findMany` → parse trailing int → `reduce Math.max`), format
      `GRN-<year>-<seq 4>`.
- [x] `generateMovementNumber` migrates to the same pattern, format `MOV-<year>-<seq 4>`.
- [x] Concurrent-create collision on `@@unique([tenantId, grnNumber])` maps
      `P2002 → 409 ConflictException` with a retry message.
- [x] Generators deliberately span soft-deleted rows (spec-012 exception) — no
      `deletedAt` filter in generator queries.

### PO linkage integrity
- [x] A line carrying `poLineId` requires the header `poId`, and the PO line must
      belong to that PO (and tenant) — otherwise `400 BadRequestException`.
- [x] Over-receipt guard: if cumulative `receivedQuantity` (existing + incoming)
      exceeds the PO line's `orderedQuantity`, the create is rejected with `400`
      and a message naming the line and remaining quantity. *(Policy: hard block,
      no tolerance — confirm at spec review.)*
- [x] Receiving against a cancelled PO is rejected (`400`).
- [x] PO status rollup after create: all lines fully received → `received`; any
      received → `partial`; else `confirmed`. After cancel: any received →
      `partial`, else `confirmed`.

### DTO validation
- [x] `condition` (create + update DTOs) gets
      `@IsIn(['complete', 'partial', 'damaged', 'rejected'])` — the exact set the
      frontend renders.
- [x] `receivedDate` uses `@IsDateString` (not `@IsString`).
- [x] `receivedQuantity` gets `@Max(99999999999)` (column `Decimal(15,3)` − 1 order);
      `unitCost` gets `@Max(9999999999)` (column `Decimal(15,4)` − 1 order).
- [x] `lines` gets `@ArrayMinSize(1)` — a GRN with zero lines is a `400`.
- [x] Existing validation preserved: UUIDs (`poId`, `supplierId`, `warehouseId`,
      `itemId`, `poLineId`), `receivedQuantity` `@IsPositive`, `unitCost` `@Min(0)`,
      `expiryDate` `@IsDateString`, `@MaxLength` on strings, nested
      `@ValidateNested({ each: true })` lines.

### Response format
- [x] `GET /api/goods-receipts` returns `{ goodsReceipts: [...], count: n }`.
- [x] `GET /api/goods-receipts/by-po/:poId` returns `{ goodsReceipts: [...], count: n }`.
- [x] `frontend-sync` sweep executed for the envelope change — known consumers:
      `frontend/lib/api/goods-receipts.ts:76` (`getAll`), `:91` (`getByPo`), and the
      AP-invoices page if it lists GRNs.

### Architecture cleanup
- [x] Dead `getInventoryTurnover` (`goods-receipts.service.ts:538-736`) deleted —
      the live implementation is `stock-transactions.service.ts:1227` (exposed at
      `GET /api/stock-transactions/inventory-turnover`). No route in this module
      references it.

### RBAC
- [x] Controller guarded by `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
- [x] Permissions: create → `INVENTORY:CREATE`; reads → `INVENTORY:VIEW`;
      update → `INVENTORY:EDIT`; cancel → `INVENTORY:DELETE`.

### Error handling
- [x] `404` warehouse / PO / item / PO line / GRN not found (tenant-scoped lookups).
- [x] `400` cancelled PO on create; `400` update of a cancelled GRN.
- [x] `409` cancel of an already-cancelled GRN.
- [x] Cancel blocks with `409` when stock has been partially consumed
      (`stock.purchaseQty < line.receivedQuantity`), naming item and quantities.
- [x] `409` on `grnNumber` collision (see number generation above).

### Stock & valuation invariants (existing, must not regress)
- [x] One `StockMovement` (`movementType: 'receipt'`, `referenceType: 'GRN'`) per
      line, carrying purchase/storage/consumption quantities from
      `UomService.calcAllQties` and `movementValue = purchaseQty × incomingCost`
      rounded to 2 decimals.
- [x] Stock upsert: WAC recomputed via `UomService.calcNewWAC` on existing stock;
      new stock rows start at incoming cost. Missing `unitCost` on a line falls
      back to current WAC.
- [x] Cancel posts negative `adjustment` movements (`referenceType: 'GRN_CANCEL'`)
      at `unitCostAtMovement` original cost and recomputes WAC from remaining value
      (4-decimal rounding, zero-quantity → WAC 0).

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations.
- A `draft → posted` GRN lifecycle (GRNs post immediately by design; `status` stays
  `posted | cancelled`).
- Quality-inspection / quarantine workflows on receipt (`condition` stays a label).
- Editing or soft-deleting GRN *lines* after posting (header `condition`/`notes` only).
- AP-invoice 3-way-match logic (owned by `ap-invoices`; it consumes GRN data).
- Inventory-turnover analytics (owned by `stock-transactions`; this spec only
  deletes the dead duplicate here).
- Lot/expiry enforcement (fields recorded, not validated against item flags).
- Multi-warehouse receipt in a single GRN (header-level `warehouseId` by design).

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `GoodsReceipt` | `grn_receipts` | `tenantId`, `grnNumber`, `poId?`, `supplierId?`, `warehouseId`, `receivedDate`, `status` (`posted`/`cancelled`), `condition`, `supplierRef?`, audit + soft delete; `@@unique([tenantId, grnNumber])` |
| `GoodsReceiptLine` | `grn_receipt_lines` | `tenantId`, `grnId` (cascade), `lineNumber`, `poLineId?`, `itemId`, `warehouseId`, `stockMovementId?`, `receivedQuantity Decimal(15,3)` + `uom` (purchase = financial unit), `storageQty/Uom?`, `consumptionQty/Uom?`, `unitCost? Decimal(15,4)`, `lotNumber?`, `expiryDate?`, audit + soft delete |

Key invariants:
- `receivedQuantity`/`uom` are the **purchase UOM** — the financial unit of record
  that feeds WAC. Storage and consumption quantities are auxiliary (Sprint 14A),
  derived by `UomService.calcAllQties` (supplier-item conversion factor when a
  `SupplierItem` exists).
- `Stock` and `StockMovement` have **no soft delete** (immutable ledger) — their
  queries scope by `tenantId` only.
- `GoodsReceipt.supplierId` is set directly for manual GRNs or resolved from the
  PO; list/detail responses prefer the direct relation and fall back to the PO's
  supplier.
- AP invoices reference GRNs (`ApInvoice` ↔ `ApInvoiceGrn`) and GRN lines
  (`ApInvoiceLine` ↔ `ApLineGrnLine`) for 3-way match.

---

## API contracts

All routes prefixed `/api`, JWT-guarded, permission-gated as listed.

### POST /api/goods-receipts *(INVENTORY:CREATE)*
```json
// Request — PO-linked (supplierId resolved from PO) or manual (supplierId given)
{
  "poId": "<uuid, optional>",
  "supplierId": "<uuid, optional — required for meaningful manual GRNs>",
  "warehouseId": "<uuid>",
  "receivedDate": "2026-06-06",
  "condition": "complete",            // complete | partial | damaged | rejected
  "supplierRef": "INV-2026-00123",
  "notes": "Delivered by truck",
  "lines": [                           // min 1 line
    {
      "poLineId": "<uuid, optional — must belong to poId>",
      "itemId": "<uuid>",
      "receivedQuantity": 100.5,       // > 0, ≤ 99999999999
      "uom": "KG",
      "unitCost": 3.5,                 // ≥ 0, ≤ 9999999999, optional (falls back to WAC)
      "lotNumber": "LOT-2026-001",
      "expiryDate": "2026-12-31",
      "notes": "Minor dents"
    }
  ]
}

// Response 201 — full detail (same shape as GET /:id)
{ "id": "...", "grnNumber": "GRN-2026-0001", "status": "posted", "lines": [ ... ], "supplierName": "...", "poNumber": "...", "warehouseCode": "...", "...": "..." }

// Errors: 404 warehouse/PO/item/PO-line not found | 400 cancelled PO, empty lines,
//         PO-line not in PO, over-receipt, validation | 409 grnNumber collision (retry)
```

### GET /api/goods-receipts *(INVENTORY:VIEW)*
```json
// Response 200 — envelope (NEW; was a bare array)
{
  "goodsReceipts": [
    {
      "id": "...", "grnNumber": "GRN-2026-0001", "status": "posted",
      "condition": "complete", "receivedDate": "2026-06-06",
      "lineCount": 3, "totalValue": 1250.75,
      "supplierName": "...", "supplierCode": "...", "poNumber": "PO-2026-0007",
      "warehouseCode": "WH-01", "warehouseName": "Main", "lines": [ ... ]
    }
  ],
  "count": 1
}
```

### GET /api/goods-receipts/stats *(INVENTORY:VIEW)*
```json
// Response 200
{ "total": 12, "posted": 10, "cancelled": 2, "today": 1, "totalValue": 45210.50 }
```

### GET /api/goods-receipts/:id *(INVENTORY:VIEW)*
```json
// Response 200 — header + supplier/PO/warehouse denormalized + lines asc by lineNumber
{
  "id": "...", "grnNumber": "GRN-2026-0001", "status": "posted",
  "supplierName": "...", "supplierCode": "...", "poNumber": "...",
  "warehouseCode": "...", "warehouseName": "...",
  "purchaseOrder": { "poNumber": "...", "status": "partial", "total": "...", "supplier": { "...": "..." } },
  "lines": [
    {
      "lineNumber": 1, "itemId": "...", "receivedQuantity": "100.5", "uom": "KG",
      "storageQty": "100.5", "storageUom": "KG", "consumptionQty": "100500", "consumptionUom": "G",
      "unitCost": "3.5", "lotNumber": "...", "expiryDate": "...",
      "item": { "code": "...", "name": "...", "baseUom": "KG" },
      "purchaseOrderLine": { "orderedQuantity": "200", "unitPrice": "3.4" },
      "stockMovement": { "id": "...", "movementType": "receipt" }
    }
  ]
}

// Errors: 404 GRN not found
```

### GET /api/goods-receipts/by-po/:poId *(INVENTORY:VIEW)*
```json
// Response 200 — envelope (NEW; was a bare array)
{ "goodsReceipts": [ { "id": "...", "grnNumber": "...", "warehouse": { "...": "..." }, "lines": [ ... ] } ], "count": 2 }
```

### PATCH /api/goods-receipts/:id *(INVENTORY:EDIT)*
```json
// Request — condition/notes only; lines are immutable after posting
{ "condition": "damaged", "notes": "Two boxes crushed" }

// Response 200 — updated GRN header
// Errors: 404 not found | 400 GRN is cancelled | 400 condition not in whitelist
```

### POST /api/goods-receipts/:id/cancel *(INVENTORY:DELETE)*
```json
// Response 200
{ "message": "GRN GRN-2026-0001 cancelled successfully", "id": "..." }

// Errors: 404 not found | 409 already cancelled |
//         409 stock partially consumed (names item, available vs required)
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/goods-receipts/goods-receipts.service.ts` | Tenant-scope the 6 unscoped queries; `updateMany` pattern on all id-only writes; numeric-max generators; `P2002 → 409`; PO-line-belongs-to-PO + over-receipt guards; `{ goodsReceipts, count }` envelopes; delete dead `getInventoryTurnover` (~200 lines) |
| `src/modules/goods-receipts/goods-receipts.controller.ts` | No route changes; Swagger response descriptions updated for envelopes + new 400/409 paths |
| `src/modules/goods-receipts/dto/create-goods-receipt.dto.ts` | `@IsIn` condition, `@IsDateString` receivedDate, `@ArrayMinSize(1)` lines |
| `src/modules/goods-receipts/dto/create-grn-line.dto.ts` | `@Max` caps on `receivedQuantity` / `unitCost` |
| `src/modules/goods-receipts/dto/update-goods-receipt.dto.ts` | `@IsIn` condition |
| `frontend/lib/api/goods-receipts.ts` | `getAll` / `getByPo` unwrap the new envelope |
| `frontend/app/procurement/goods-receipts/page.tsx` | Verify via `frontend-sync` — consumes `getAll`; AP-invoices surfaces re-checked |

### Cross-module dependencies
- **Imports `UomModule`** — `UomService.calcAllQties` (purchase/storage/consumption
  quantities, supplier-item conversion) and `calcNewWAC` (weighted-average cost).
  UOM catalog must be seeded (`npx ts-node prisma/seed-uom.ts`) or conversions 404.
- **Exports `GoodsReceiptsService`** — consumed by `ap-invoices` (3-way match).
- Touches `PurchaseOrder` / `PurchaseOrderLine` rows directly inside its
  transaction (received-quantity rollup + status). This is accepted as part of the
  posting transaction (atomicity requires same-tx writes), now properly
  tenant-scoped — documented here per the module-interconnection rule.
- `Stock` / `StockMovement` writes are this module's posting responsibility
  (shared ledger with `stock-transactions`).

### Behavioral notes
- The create transaction iterates lines sequentially (movement numbers must be
  ordered within the tx) — fine at GRN line counts.
- `getStats.today` uses server-local midnight bounds; acceptable for the current
  single-region deployment.
- Over-receipt policy is a **hard block** with no tolerance. If a tolerance
  (e.g. +5%) is wanted later, it becomes a tenant setting in a separate spec.

---

## Verification checklist

```bash
# 0. Login (BURGER tenant holds the demo data — single tenant, no selection step)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@burger.do","password":"Admin123!"}' | jq -r .access_token)

# 1. List — envelope
curl -s http://localhost:3000/api/goods-receipts -H "Authorization: Bearer $TOKEN" \
  | jq 'has("goodsReceipts") and has("count")'
# Expected: true

# 2. Stats
curl -s http://localhost:3000/api/goods-receipts/stats -H "Authorization: Bearer $TOKEN" | jq .
# Expected: { total, posted, cancelled, today, totalValue }

# 3. Create a manual GRN (use real warehouseId/itemId/supplierId from the seed)
curl -s -X POST http://localhost:3000/api/goods-receipts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"warehouseId":"<wh>","supplierId":"<sup>","condition":"complete",
       "lines":[{"itemId":"<item>","receivedQuantity":10,"uom":"KG","unitCost":2.5}]}' | jq .grnNumber
# Expected: "GRN-2026-NNNN" (numeric max — create two, numbers are consecutive)

# 4. Empty lines → 400
curl -s -X POST http://localhost:3000/api/goods-receipts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"warehouseId":"<wh>","lines":[]}' | jq .statusCode
# Expected: 400

# 5. Bad condition → 400
curl -s -X PATCH http://localhost:3000/api/goods-receipts/<id> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"condition":"pristine"}' | jq .statusCode
# Expected: 400

# 6. Cancel → 200, re-cancel → 409
curl -s -X POST http://localhost:3000/api/goods-receipts/<id>/cancel \
  -H "Authorization: Bearer $TOKEN" | jq .message
curl -s -X POST http://localhost:3000/api/goods-receipts/<id>/cancel \
  -H "Authorization: Bearer $TOKEN" | jq .statusCode
# Expected: "GRN ... cancelled successfully", then 409

# 7. Stock reversal — onHand back to pre-GRN value after cancel
curl -s "http://localhost:3000/api/stock-balance?itemId=<item>" -H "Authorization: Bearer $TOKEN" | jq .
# Expected: quantity unchanged vs before step 3

# 8. Tenant isolation (e2e suite covers cross-tenant poLineId → 404)
cd backend && pnpm test goods-receipts && pnpm test:e2e -- goods-receipts
# Expected: all green, incl. cross-tenant 404s

# 9. Build + lint + frontend consumers
pnpm build && pnpm lint && cd ../frontend && pnpm build
# Expected: both builds pass (frontend uses the unwrapped envelope)
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (opportunity-finder score 66: 6 critical scoping, 5 DTO, 6 error-handling, 1 architecture) | Draft — pending review |
| 2026-06-06 | Test scaffolds written (27 unit / 19 e2e, 23 tagged [GAP] red) | Red as designed |
| 2026-06-06 | All 20 gaps implemented: tenant-scoped reads/writes (updateMany pattern), numeric-max generators, P2002→409, PO-linkage + over-receipt guards, DTO whitelist/caps/ArrayMinSize, `{ goodsReceipts, count }` envelopes + frontend-sync (getAll/getByPo unwrap), dead getInventoryTurnover deleted (−202 lines) | Unit 30/30 ✅, e2e 22/22 ✅ (cross-tenant write leak verified closed) |
| 2026-06-06 | Shipped to origin (3d8fb3d); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
