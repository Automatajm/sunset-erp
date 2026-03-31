# Sprint 14 — Master Plan
**Sunset ERP** · Target: April–May 2026  
**Scope:** Triple UOM in Stock, Purchase Requisition → PO Flow, PO Consolidation Console, Supplier Ranking

---

## Overview

Sprint 14 closes the gap between the UOM architecture already designed in ADR-013 (schema complete in Sprint 11) and the operational modules that still use a single quantity field. It then builds the full procurement intake flow: from stakeholder request through approval, consolidation, and PO creation.

```
Sprint 14A — Stock Triple UOM       (schema + service + GRN update)
Sprint 14B — Purchase Requisition   (PR module: create, submit, approve, reject)
Sprint 14C — PO from PRs            (Procurement Console: consolidation + 8 grouping rules)
Sprint 14D — Supplier Ranking       (score engine + dashboard)
```

No breaking changes to existing data. All migrations are additive.

---

## Sprint 14A — Stock Triple UOM

### Problem
`Stock.onHandQuantity` and `StockMovement.quantity` store a single value with no UOM context. The Item model already has `purchaseUomId`, `storageUomId`, `consumptionUomId` and conversion factors (ADR-013), but nothing uses them at transaction time.

### Schema Changes

#### `in_stock` — add 3 quantity columns
```sql
ALTER TABLE in_stock
  ADD COLUMN purchase_qty      DECIMAL(15,3) NOT NULL DEFAULT 0,
  ADD COLUMN purchase_uom      VARCHAR(20)   NOT NULL DEFAULT '',
  ADD COLUMN storage_qty       DECIMAL(15,3) NOT NULL DEFAULT 0,
  ADD COLUMN storage_uom       VARCHAR(20)   NOT NULL DEFAULT '',
  ADD COLUMN consumption_qty   DECIMAL(15,3) NOT NULL DEFAULT 0,
  ADD COLUMN consumption_uom   VARCHAR(20)   NOT NULL DEFAULT '';

-- Migrate existing data: all 3 = onHandQuantity (factor = 1 until UOMs configured)
UPDATE in_stock SET
  purchase_qty    = on_hand_quantity,
  storage_qty     = on_hand_quantity,
  consumption_qty = on_hand_quantity;
```

`onHandQuantity` is kept as a **computed alias** = `storageQty` for backward compatibility during transition.

#### `in_stock_movements` — add 3 quantity columns
```sql
ALTER TABLE in_stock_movements
  ADD COLUMN purchase_qty      DECIMAL(15,3),
  ADD COLUMN purchase_uom      VARCHAR(20),
  ADD COLUMN consumption_qty   DECIMAL(15,3),
  ADD COLUMN consumption_uom   VARCHAR(20);

-- existing quantity field becomes storageQty (no rename, backward compat)
-- storage_uom = existing uom field
```

#### `grn_receipt_lines` — add converted quantities
```sql
ALTER TABLE grn_receipt_lines
  ADD COLUMN storage_qty       DECIMAL(15,3),
  ADD COLUMN storage_uom       VARCHAR(20),
  ADD COLUMN consumption_qty   DECIMAL(15,3),
  ADD COLUMN consumption_uom   VARCHAR(20);
-- receivedQuantity / uom = purchaseQty / purchaseUom (already correct)
```

#### `po_purchase_order_lines` — link UOM to catalog
```sql
ALTER TABLE po_purchase_order_lines
  ADD COLUMN purchase_uom_id   UUID REFERENCES cfg_uom_units(id);
-- uom string field preserved for display; purchaseUomId is the FK source of truth
```

#### `in_stock_movements` — add financial audit fields (ADR-019)
```sql
ALTER TABLE in_stock_movements
  ADD COLUMN unit_cost_at_movement DECIMAL(15,4),
  ADD COLUMN movement_value        DECIMAL(15,2);
-- unit_cost_at_movement: WAC at time of movement — required for GRN cancellation reversal
-- movement_value: purchaseQty × unitCostAtMovement — pre-calculated for audit trail
```

### New Service: `UomConversionService`

Central conversion service used by all modules:

```typescript
// backend/src/modules/uom/uom-conversion.service.ts

interface AllQties {
  purchaseQty:    Decimal; purchaseUom:    string;  // ← financial unit of record
  storageQty:     Decimal; storageUom:     string;  // auxiliary — warehouse display
  consumptionQty: Decimal; consumptionUom: string;  // auxiliary — production display
}

class UomConversionService {
  // Core: convert qty between any two UomUnit IDs
  async convert(qty, fromUomId, toUomId, tenantId): Promise<Decimal>

  // Used by GRN on receipt: given purchaseQty + item, return all 3
  async calcAllQties(purchaseQty, itemId, supplierItemId?, tenantId): Promise<AllQties>

  // FINANCIAL RULE (ADR-019): all monetary values derive from purchaseUom × WAC
  // Never call this with storageQty or consumptionQty directly — convert first
  calcFinancialValue(qty, uomType: 'purchase' | 'storage' | 'consumption', item): Decimal

  // WAC recalculation at GRN receipt (ADR-019)
  calcNewWAC(existingPurchaseQty, existingUnitCost, incomingPurchaseQty, incomingUnitCost): Decimal

  // Factor resolution order:
  // 1. SupplierItem.conversionFactor (most specific — per supplier)
  // 2. UomConversion catalog (system-level)
  // 3. Item.purchaseToConsumptionFactor (manual fallback)
  // 4. 1.0 (identity — no conversion configured)
}
```

### GRN Service Update

When creating a GRN line, `UomConversionService.calcAllQties()` is called and all 3 quantities are stored in `GoodsReceiptLine` and the resulting `StockMovement`.

After posting all quantities, the service calls `calcNewWAC()` to update `Stock.unitCost` (ADR-019). The WAC is always computed in `purchaseUom`. `StockMovement.unitCostAtMovement` captures the WAC at time of receipt for audit trail and GRN cancellation reversal.

### Stock Balance Page Update

The Stock Balance page gains 3 quantity columns:

| Item | Warehouse | Purchase Qty | Purchase UOM | Storage Qty | Storage UOM | Consumption Qty | Consumption UOM |
|------|-----------|-------------|--------------|-------------|-------------|-----------------|-----------------|
| Harina | WH-01 | 3.5 | SACO | 175 | KG | 175 | KG |
| Tela Denim | WH-01 | 2 | ROLLO | 80 | M | 8000 | CM |

### Deliverables
- [ ] Prisma migration: Stock + StockMovement + GRNLine + POLine
- [ ] `UomConversionService` with full test coverage — including `calcFinancialValue()` and `calcNewWAC()`
- [ ] GRN service updated to call conversion on receipt + WAC recalculation
- [ ] `StockMovement.unitCostAtMovement` + `movementValue` populated on every stock-in event
- [ ] GRN cancellation: WAC reversal with partial-consumption guard
- [ ] Stock Balance page: 3 UOM columns + financial value column (purchaseQty × WAC)
- [ ] Item master UI: configure purchaseUom / storageUom / consumptionUom + factors
- [ ] Production issue (MO material consumption): COGS via consumptionQty → purchaseQty → WAC

---

## Sprint 14B — Purchase Requisition (PR)

### Problem
There is no formal intake channel for purchase needs. Items are requested informally, procurement creates POs without traceability to the business need, and MRP suggestions have no approval gate.

### PR Origins

```
MRP (automatic)          Production Plan        Manual Request
      ↓                        ↓                      ↓
                    PURCHASE REQUISITION
                           ↓
                      Approval Gate
                           ↓
                   Procurement Console
                           ↓
                     PURCHASE ORDER
```

### Schema: `po_purchase_requisitions`

```prisma
model PurchaseRequisition {
  id           String   @id @default(uuid())
  tenantId     String
  prNumber     String   // PR-YYYY-NNNN
  title        String   // Short description
  requestedBy  String   // userId
  departmentId String?  // cost center / department
  priority     String   @default("normal")  // normal | urgent | critical
  requiredDate DateTime @db.Date
  justification String?
  source       String   @default("manual")  // manual | mrp | production_plan
  sourceRefId  String?  // MO id or plan id if from MRP/production
  estimatedAmount Decimal?
  status       String   @default("draft")
  // draft → submitted → approved → in_progress → completed
  //                   → rejected
  //                   → cancelled
  approvedBy   String?
  approvedAt   DateTime?
  rejectedBy   String?
  rejectedAt   DateTime?
  rejectionReason String?
  notes        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  createdBy    String
  updatedBy    String

  lines        PurchaseRequisitionLine[]
}

model PurchaseRequisitionLine {
  id           String  @id @default(uuid())
  tenantId     String
  prId         String
  lineNumber   Int
  
  // Item — real or generic
  itemId       String?  // null = generic item (pending master data)
  itemStatus   String   @default("catalog")  // catalog | pending_item | item_created
  genericDescription String?  // used when itemId is null
  genericSpec  String?  // technical specs for generic items
  
  quantity     Decimal
  uom          String   // in consumptionUom when from MRP
  unitEstimate Decimal? // estimated unit price
  
  requiredDate DateTime @db.Date
  warehouseId  String?  // destination warehouse
  notes        String?
  
  // When item is created from generic:
  createdItemId String?  // FK to Item after master data creation
  
  // PO link (set when PR is converted to PO)
  poLineId     String?
}
```

### PR States & Transitions

```
DRAFT
  └─[submit]→ SUBMITTED
                └─[approve]→ APPROVED → IN_PROGRESS → COMPLETED
                └─[reject]→ REJECTED
  └─[cancel]→ CANCELLED (any state before approved)
```

### Approval Rules (Sprint 14B: single-level)

| Estimated Amount | Auto-approve | Required Approver |
|-----------------|--------------|-------------------|
| < $500 | ✅ Yes | — |
| $500–$5,000 | ❌ No | Supervisor |
| $5,000–$25,000 | ❌ No | Manager |
| > $25,000 | ❌ No | Director/CFO |

Thresholds configurable per tenant in `TenantSettings`.

### Generic Item Flow

```
Stakeholder creates PR with free-text description
  ↓
PR submitted and approved
  ↓
Procurement sees "⚠️ Pending Item" badge on PR line
  ↓
Procurement goes to Items → New Item (creates in catalog)
  ↓
Returns to PR → assigns real itemId to line
  ↓
PR line status: pending_item → item_created
  ↓
PR can now be included in PO consolidation
```

### Frontend Pages

**`/procurement/requisitions`**
- List with status pills: Draft / Submitted / Approved / In Progress / Completed / Rejected
- Filters: Requester, Department, Required Date (daterange), Priority (multiselect), Source (MRP/Manual), Status
- Stats: Pending Approval count, Urgent count, Pending Item count
- Button: + New Requisition

**`/procurement/requisitions/[id]`**
- Header: PR number, status, requestor, priority badge
- Lines table: item (or generic with warning), qty, UOM, required date, estimated price
- Approval panel: approve / reject with reason
- Timeline: status history

### Deliverables
- [ ] Schema: PurchaseRequisition + PurchaseRequisitionLine
- [ ] Backend module: CRUD + submit + approve + reject + cancel
- [ ] Auto-approve for amounts < threshold
- [ ] Generic item flow: pending_item → item_created
- [ ] Frontend: list page + detail page + create modal + approve/reject actions
- [ ] MRP hook: `mrpService.createPR()` for auto-generated requests

---

## Sprint 14C — PO from PRs (Procurement Console)

### Problem
Approved PRs exist as individual requests. Converting them to POs efficiently requires grouping, deduplication, supplier selection, and validation — all currently done manually outside the system.

### The 8 Grouping Rules Engine

```typescript
interface ConsolidationConfig {
  deliveryWindowDays:   number;  // default 7
  maxDeliveryGapDays:   number;  // default 15 — split if gap > this
  priceVarianceWarn:    number;  // default 10% — warn if > last price
  minOrderAmountWarn:   boolean; // warn if PO below supplier MOQ
}
```

| # | Rule | Logic |
|---|------|-------|
| 1 | Same Supplier | PRs from same supplier → same PO (default) |
| 2 | Delivery Window | PRs within N days of each other → same PO |
| 3 | Deduplication | Same (supplier + item + deliveryDate) → sum quantities |
| 4 | Minimum Order | Alert if consolidated PO below supplier minimum |
| 5 | Category Group | Items in same category → suggest same supplier |
| 6 | Preferred Supplier | Use SupplierItem.isPreferred; fallback to ranking top 3 |
| 7 | Origin Separation | MRP PRs auto-grouped; manual PRs flagged for review |
| 8 | Lead Time Split | Different lead times on same supplier → split POs by delivery date |

### Consolidation Flow

**Step 1 — Select PRs**
```
Table of approved PRs with:
- Checkbox selection
- Group by: supplier / category / required date / origin
- Quick filters: Pending Item (exclude), Date range, Priority
- Warning badges: ⚠️ Generic item | 🔴 Urgent | 📦 Low stock
```

**Step 2 — System suggests PO groups**
```
System applies Rules 1-8 and proposes:

Group A: Proveedor A — 3 lines — delivery Apr 15-17 (within 7d window)
  ├── Line 1: Item X, 100 KG,  $2,800  [preferred supplier ✓]
  ├── Line 2: Item Y, 50 PCS,  $1,200  [preferred supplier ✓]
  └── Line 3: Item Z, 25 LTR,  $450    [preferred supplier ✓]
  Total: $4,450  ✅ above minimum $500

Group B: Proveedor A — 2 lines — delivery May 5 (>15d from Group A → split)
  ├── Line 1: Item W, 200 KG,  $3,600
  └── Line 2: Item V, 10 PCS,  $220
  Total: $3,820  ✅ above minimum

Group C: Proveedor B — 1 line — delivery Apr 18
  └── Line 1: Item Q, 5 CAJA,  $380   ⚠️ below minimum $500
```

**Step 3 — Review & adjust**
```
Per group:
- Change supplier (shows ranking top 3 with score)
- Edit quantities (with UOM in purchaseUom)
- Edit delivery date
- Edit unit price (warns if >10% above last price)
- Split group or merge groups manually
- Remove line from group
```

**Step 4 — Validate & confirm**
```
Pre-flight validation:
✅ No duplicate (supplier + item + date) combinations
✅ All items have itemId (no pending_item)
⚠️ Group C: below minimum order for Proveedor B
⚠️ Line 2 Group A: price $28.50 is 12% above last price $25.45
❌ Cannot proceed with pending items — assign items first
```

**Step 5 — Create POs**
```
For each approved group → create PO in draft status
PR lines → linked to PO lines via prLineId
PR status → in_progress
```

### PO Line UOM Enhancement

When building a PO line from a PR line:
- PR line has quantity in `consumptionUom` (from MRP/BOM)
- System looks up `SupplierItem` for the selected supplier
- Converts: `poQty = prQty / conversionFactor` (consumption → purchase)
- PO line shows quantity in `purchaseUom` (what the supplier understands)

```
PR line: 175 KG  (consumptionUom)
SupplierItem: purchaseUom = SACO, conversionFactor = 50
PO line: 3.5 SACOS  (purchaseUom — shown to supplier)
```

### Deliverables
- [ ] `ConsolidationEngine` service with 8 grouping rules
- [ ] `SupplierSuggestionService` using SupplierItem + ranking
- [ ] PR → PO line conversion with UOM transformation
- [ ] Frontend: Procurement Console page (3-step wizard)
- [ ] Pre-flight validation with warnings and errors
- [ ] PR status update after PO creation

---

## Sprint 14D — Supplier Ranking

### Score Formula

```
Score = 40% × priceScore
      + 30% × deliveryScore
      + 20% × qualityScore
      + 10% × leadTimeScore
```

| Component | Calculation |
|-----------|------------|
| `priceScore` | 100 × (market_avg_price / supplier_price) — lower is better |
| `deliveryScore` | % of GRNs received on or before PO expectedDate |
| `qualityScore` | % of GRNs with condition = 'complete' |
| `leadTimeScore` | 100 × (1 - actual_avg / benchmark_lead_time) |

Score is calculated per `(tenantId, supplierId, itemId)` — same supplier can rank differently per item.

### Data Sources
- `GoodsReceipt.receivedDate` vs `PurchaseOrder.expectedDate` → deliveryScore
- `GoodsReceipt.condition` → qualityScore
- `ApInvoice.unitPrice` history → priceScore
- `SupplierItem.leadTimeDays` → leadTimeScore benchmark

### Schema Addition

```prisma
model SupplierScore {
  id           String   @id @default(uuid())
  tenantId     String
  supplierId   String
  itemId       String?  // null = overall supplier score
  periodCode   String   // 2026-Q1, 2026-04, etc.
  
  priceScore      Decimal  @db.Decimal(5,2)
  deliveryScore   Decimal  @db.Decimal(5,2)
  qualityScore    Decimal  @db.Decimal(5,2)
  leadTimeScore   Decimal  @db.Decimal(5,2)
  totalScore      Decimal  @db.Decimal(5,2)
  
  // Supporting data
  poCount         Int
  grnCount        Int
  onTimeCount     Int
  completeCount   Int
  avgPrice        Decimal?
  
  calculatedAt DateTime @default(now())
  
  @@unique([tenantId, supplierId, itemId, periodCode])
  @@map("po_supplier_scores")
}
```

### Dashboard Page `/procurement/suppliers/ranking`

- Top suppliers by overall score (bar chart)
- Score breakdown per supplier (spider/radar chart)
- Price history per (supplier, item) — line chart
- Delivery compliance timeline
- Quality trend by quarter
- Filter by: item, category, period

### Deliverables
- [ ] `SupplierScoreService` — calculate and cache scores
- [ ] Scheduled job: recalculate scores nightly
- [ ] `SupplierScore` schema + migration
- [ ] Ranking shown in PO creation (top 3 per item)
- [ ] Dashboard page with 4 chart widgets

---

## Cross-Sprint Dependencies

```
14A (UOM)
  └─→ 14B (PR) uses consumptionUom in PR lines
       └─→ 14C (Consolidation) converts PR qty to purchaseUom for PO
            └─→ 14D (Ranking) feeds score into supplier suggestion in 14C
```

All sprints are independent at schema level but share services at runtime.

ADR-018 (Three-Way Match) is a Sprint 13 deliverable already in production. ADR-019 (Inventory Valuation) is implemented in Sprint 14A alongside the UOM runtime. The WAC rule and the 3-way match price validation in purchaseUom are complementary — the AP Invoice price that passes the match becomes the `unitCost` input for the WAC calculation at receipt.

---

## ADR Index for Sprint 14

| ADR | Title | Status |
|-----|-------|--------|
| ADR-014 | Stock Triple UOM — Runtime Implementation + Financial Valuation Rule | Accepted |
| ADR-015 | Purchase Requisition Flow | Accepted |
| ADR-016 | PO Consolidation Rules Engine | Accepted |
| ADR-017 | Supplier Ranking Score Model | Accepted |
| ADR-018 | Three-Way Match — PO ↔ GRN ↔ AP Invoice | Accepted |
| ADR-019 | Inventory Valuation Model (WAC) | Accepted |

---

## Estimated Effort

| Sprint | Backend | Frontend | Schema | Total |
|--------|---------|----------|--------|-------|
| 14A UOM | 2 days | 1 day | 0.5 days | 3.5 days |
| 14B PR | 2 days | 2 days | 0.5 days | 4.5 days |
| 14C Console | 3 days | 3 days | — | 6 days |
| 14D Ranking | 2 days | 1.5 days | 0.5 days | 4 days |
| **Total** | **9 days** | **7.5 days** | **1.5 days** | **18 days** |