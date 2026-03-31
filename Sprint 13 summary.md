# Sprint 13 — Summary
**Sunset ERP** · Branch: `main` · Completed: March 31, 2026

---

## Overview

Sprint 13 delivered the **Goods Receipt (GRN) module** end-to-end, **3-Way Match** between PO ↔ GRN ↔ AP Invoice, a comprehensive **filter system** upgrade across Procurement pages, and the **AP Invoice creation modal** with dual flow (From PO / Manual).

---

## 1. GRN Module — Backend

**New module:** `backend/src/modules/goods-receipts/`

| File | Description |
|------|-------------|
| `dto/create-grn-line.dto.ts` | Line DTO: itemId, receivedQty, uom, unitCost, lotNumber |
| `dto/create-goods-receipt.dto.ts` | Header DTO: poId (optional), warehouseId, condition, lines |
| `dto/update-goods-receipt.dto.ts` | Patch DTO: condition, notes |
| `goods-receipts.service.ts` | Full service with 7 operations |
| `goods-receipts.controller.ts` | 7 REST endpoints |
| `goods-receipts.module.ts` | Module registration |

**Key behaviors:**
- Auto-generates `GRN-YYYY-NNNN` and `MOV-YYYY-NNNN` numbers
- `create()` posts stock + stock movements in a single Prisma transaction
- `cancel()` reverses stock movements and decrements PO received quantities
- Updates PO status: `approved → partial → received` based on line coverage
- Uses existing `INVENTORY:*` permissions (no new permissions needed)

**Endpoints:**
```
POST   /goods-receipts              Create GRN + post stock
GET    /goods-receipts              List all with supplier, PO, value
GET    /goods-receipts/stats        posted / cancelled / today / totalValue
GET    /goods-receipts/:id          Detail with lines
GET    /goods-receipts/by-po/:poId  GRNs for a specific PO
PATCH  /goods-receipts/:id          Update notes/condition
POST   /goods-receipts/:id/cancel   Cancel + reverse stock
```

---

## 2. GRN Module — Frontend

**New files:**
- `frontend/lib/api/goods-receipts.ts` — Full API client with typed interfaces
- `frontend/app/procurement/goods-receipts/page.tsx` — Full page

**Features:**
- ERPTable with 10 columns (GRN#, PO#, Supplier, Warehouse, Date, Lines, Value, Condition, Status)
- Stats bar: Posted / Cancelled / Today / Total Value — clickable status filters
- **6 filters:** Supplier `searchselect` · PO Number `searchselect` · Warehouse `searchselect` · Received Date `daterange` · Condition `multiselect` · Linked to PO `boolean`
- GrnDetailDrawer: info grid, lines table, total value, cancel action
- CreateGrnModal: PO search pre-fill + manual lines mode
- Nav: added to Procurement → Purchasing

---

## 3. 3-Way Match — Backend

**Schema migration:** `20260331143123_add_grn_link_to_ap_invoice`

| Model | Field added |
|-------|-------------|
| `ApInvoice` | `grnId String? @map("grn_id")` + relation |
| `ApInvoiceLine` | `grnLineId String? @map("grn_line_id")` + relation |
| `GoodsReceipt` | `apInvoices ApInvoice[]` (inverse) |
| `GoodsReceiptLine` | `apInvoiceLines ApInvoiceLine[]` (inverse) |

**New methods in `ap-invoices.service.ts`:**

| Method | Description |
|--------|-------------|
| `linkGrn()` | Links GRN to invoice header + auto-matches lines by `poLineId` |
| `unlinkGrn()` | Removes GRN link from draft invoice |
| `getMatchStatus()` | Per-line analysis: qty vs PO, qty vs GRN, price tolerance 2% |
| `validateThreeWayMatch()` | Called by `post()` — blocks posting if match fails |

**Match statuses:**
- `no_match` — no PO or GRN linked
- `two_way` — PO linked, no GRN
- `three_way_matched` ✅ — all lines pass (qty + price within 2% tolerance)
- `three_way_failed` ❌ — GRN linked but discrepancies found

**New endpoints:**
```
GET  /ap-invoices/:id/match-status   Per-line match analysis
POST /ap-invoices/:id/link-grn       Link GRN (body: { grnId })
POST /ap-invoices/:id/unlink-grn     Remove GRN link
```

---

## 4. AP Invoices — Frontend Upgrades

**`frontend/app/procurement/ap-invoices/page.tsx`** — major update:

### Create Modal (new)
- **Chooser screen** — 2 large cards: From PO vs Manual Entry
- **From PO flow:** search PO → preview lines → `createFromPo()` → draft created
- **Manual flow:** supplier, dates, currency, ref, line items, grand total live calc
- Purple gradient "+ New AP Invoice" button

### Filter Bar (8 filters)
| Filter | Type | Width |
|--------|------|-------|
| Supplier | `searchselect` | 210px |
| Supplier Ref | `search` | 150px |
| Invoice Date | `daterange` | 200px |
| Due Date | `daterange` | 195px |
| Match Status | `multiselect` | auto |
| Currency | `select` | auto |
| PO Number | `searchselect` | 185px |
| GRN Number | `searchselect` | 185px |

### 3-Way Match Tab (in drawer)
- Match badge: No Match / 2-Way / 3-Way ✓ / 3-Way ✗
- Link/Unlink GRN (draft invoices only)
- Per-line table: Inv Qty vs PO Qty vs GRN Rcvd, price diff %
- Success/failure summary messages

### Warning Banner
- Shown on draft invoices with PO but no GRN
- Guides user to create GRN first for full 3-way match

---

## 5. ERPFilterBar — New Capabilities

**`frontend/components/ui/ERPFilterBar.tsx`** — new filter types and props:

| Addition | Description |
|----------|-------------|
| `type: 'daterange'` | Uses ERPDatePicker — day, range, week, week-range |
| `dateWidth?: number` | Width override for date picker (default 200px) |
| `selectWidth?: number` | minWidth for searchselect trigger + panel |
| `inputWidth?: number` | Fixed width for search text input |
| `dateInSelection()` | Exported helper — strips time, day-level comparison |
| `dateSelectionToRange()` | Exported helper — converts DateSelection to {from, to} |

---

## 6. SearchSelect — Fix

**`frontend/components/ui/SearchSelect.tsx`:**
- New `minWidth` prop (default 280px)
- Panel always `Math.max(triggerWidth, minWidth)` — no more text wrapping
- `whiteSpace: 'nowrap'` on trigger and options

---

## 7. AP Invoices API Client

**`frontend/lib/api/ap-invoices.ts`** — 3 new methods:
```typescript
getMatchStatus(id)           → MatchStatus (typed)
linkGrn(id, grnId)          → { message, matchedLines, invoice }
unlinkGrn(id)               → { message, invoice }
```
Exported interfaces: `MatchLine`, `MatchStatus`

---

## 8. Correct Procurement Flow

```
PO (confirmed)
  ↓
GRN (Goods Receipt) — stock posted to warehouse
  ↓
AP Invoice (draft) — created from PO
  ↓
Link GRN → 3-Way Match validates (qty + price ±2%)
  ↓
Post → JE: Inventory DR / AP CR
  ↓
Pay → JE: AP DR / Cash CR
```

---

## Pending → Sprint 14

- [ ] Transfer Orders (warehouse → warehouse movements)
- [ ] `weightKg` / `volumeLtr` on Item model for real 3D occupancy calculation
- [ ] GRN in bulk import entity list