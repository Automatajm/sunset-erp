# ADR-016: PO Consolidation Rules Engine

**Status:** Accepted  
**Date:** 2026-03-31  
**Deciders:** Juan (FP&A / Systems Engineering), Sunset ERP Architecture  
**Tags:** procurement, purchase-order, consolidation, grouping, uom, supplier

---

## CONTEXT

Once Purchase Requisitions are approved (ADR-015), procurement agents must convert them into Purchase Orders. The naive approach — one PR becomes one PO — creates operational and commercial problems:

**Problem 1 — PO explosion:** 20 PRs from different departments for the same supplier generate 20 separate POs. The supplier receives 20 orders when one would suffice. This increases processing costs, misses volume pricing, and creates tracking overhead.

**Problem 2 — Delivery fragmentation:** PRs submitted on different days for delivery within the same week result in multiple partial deliveries. Consolidating into one delivery reduces freight costs and receiving labor.

**Problem 3 — Duplicate lines:** Two PRs requesting the same item from the same supplier for the same date should produce one PO line with summed quantities, not two separate lines on two POs.

**Problem 4 — UOM mismatch at PO creation:** PRs express quantities in `consumptionUom` (production units). POs must express quantities in `purchaseUom` (what the supplier ships). The conversion is currently manual.

**Problem 5 — Supplier selection without data:** When a PR has no preferred supplier, the buyer selects based on memory or informal records. There is no system-supported ranking or last-price history.

---

## DECISION

Implement a `ConsolidationEngine` service that ingests approved PRs, applies 8 grouping rules, suggests PO groups, and creates POs after buyer review and validation. The engine is interactive — it proposes, the buyer decides.

### The 8 Grouping Rules

Rules are applied in sequence. Each rule can split or merge proposed groups.

#### Rule 1 — Same Supplier (primary grouping)
PRs assigned to the same supplier are placed in the same candidate PO group. This is the base rule; all other rules may subdivide the result.

```
Input:  10 PRs for Proveedor A
Output: 1 candidate group for Proveedor A
```

#### Rule 2 — Delivery Window (temporal consolidation)
Within a same-supplier group, PRs whose `requiredDate` falls within a configurable window (default 7 days) are consolidated. PRs outside the window start a new group.

```
Window = 7 days
PRs for Proveedor A:
  Apr 14 + Apr 16 + Apr 18 → Group A1 (within window)
  Apr 25 + Apr 26          → Group A2 (new window)
```

Window is configurable per tenant in `ConsolidationConfig`. Urgent PRs can override the window.

#### Rule 3 — Deduplication (same item + same date)
Within a group, if two or more PR lines reference the same `(itemId, deliveryDate)`, their quantities are summed into a single PO line. The original PR lines are linked to the merged PO line.

```
PR-001 line 1: Item X, 100 KG, Apr 15
PR-007 line 2: Item X,  50 KG, Apr 15
→ PO line: Item X, 150 KG, Apr 15 (linked to both PR lines)
```

#### Rule 4 — Minimum Order Alert
If a candidate PO group's estimated total falls below the supplier's minimum order amount (`Supplier.minimumOrder` — to be added), the engine emits a warning. The buyer can add more items, split to another supplier, or override.

```
Proveedor B minimum: $500
Candidate group: $320
→ ⚠️ "Below minimum order. Add items or consider alternative supplier."
```

#### Rule 5 — Category-Based Supplier Suggestion
When a PR line has no preferred supplier, the engine looks at the item's `categoryId` and finds other `SupplierItem` records for items in the same category. This surfaces suppliers already approved for similar materials.

#### Rule 6 — Preferred Supplier (from SupplierItem)
For each item in a PR line:
1. Check `SupplierItem.isPreferred = true` → use this supplier
2. If none preferred → show ranking top 3 (ADR-017 score)
3. If no SupplierItem exists → buyer must select manually

The preferred supplier suggestion can be overridden by the buyer at any time.

#### Rule 7 — Origin Separation (MRP vs Manual)
MRP-generated PRs carry `source = 'mrp'`. The engine can be configured to:
- `auto_group`: mix MRP and manual PRs in the same PO (default)
- `separate`: keep MRP and manual PRs in distinct POs for traceability

Configurable per tenant.

#### Rule 8 — Lead Time Split
If items in the same supplier group have significantly different lead times, and those lead times would result in different optimal order dates, the engine splits into separate POs.

```
Proveedor C:
  Item X: lead time 3 days, needed Apr 15 → order by Apr 12
  Item Y: lead time 21 days, needed Apr 15 → order by Mar 25
→ Two POs because optimal order dates differ by >7 days
```

### Configuration Schema

```prisma
// Added to TenantSettings JSON or separate table
model ConsolidationConfig {
  id                  String  @id @default(uuid()) @db.Uuid
  tenantId            String  @unique @map("tenant_id") @db.Uuid
  deliveryWindowDays  Int     @default(7)   @map("delivery_window_days")
  maxDeliveryGapDays  Int     @default(15)  @map("max_delivery_gap_days")
  priceVarianceWarnPct Decimal @default(10) @map("price_variance_warn_pct") @db.Decimal(5,2)
  mrpSeparation       String  @default("auto_group") @map("mrp_separation") @db.VarChar(20)
  // auto_group | separate
  leadTimeSplitDays   Int     @default(7)   @map("lead_time_split_days")
  updatedAt           DateTime @updatedAt   @map("updated_at")
  updatedBy           String?  @map("updated_by") @db.Uuid

  @@map("po_consolidation_config")
}
```

### UOM Conversion at PO Creation

PR lines carry quantities in `consumptionUom`. PO lines must carry quantities in `purchaseUom`. The conversion uses `UomConversionService` (ADR-014):

```typescript
const supplierItem = await this.supplierItemService.findBySupplierAndItem(
  supplierId, itemId, tenantId
);

const poQty = prQty / supplierItem.conversionFactor;
// Example: prQty = 175 KG, factor = 50 (1 SACO = 50 KG)
// poQty = 3.5 SACOS
```

The PO line shows the quantity in `purchaseUom` — the unit the supplier understands.

### Pre-flight Validation

Before creating POs from a candidate group, the engine runs:

| Check | Type | Blocks PO? |
|-------|------|-----------|
| No pending_item lines | Error | ✅ Yes |
| No duplicate (supplier+item+date) | Error | ✅ Yes |
| Price > last price + variance % | Warning | ❌ No |
| Total below supplier minimum | Warning | ❌ No |
| Supplier has recent damaged GRNs | Warning | ❌ No |
| Item has no SupplierItem for this supplier | Warning | ❌ No |

### Consolidation Console UI Flow

```
Step 1: PR Selection
  ─ Filtered table of approved PRs
  ─ Select PRs to include in this consolidation run
  ─ Quick filter: exclude pending_item | urgent only | date range

Step 2: Proposed Groups
  ─ System applies 8 rules and shows proposed PO groups
  ─ Each group: supplier, lines, total, warnings
  ─ Buyer can: split group, merge groups, move line, change supplier

Step 3: Line Review
  ─ Per group: show each line with
      Item (code + name), Qty in consumptionUom → converted to purchaseUom
      Last price | Current price | Variance %
      Delivery date
      Supplier ranking badge
  ─ Buyer can edit: qty, price, date

Step 4: Pre-flight
  ─ Error list (blocking)
  ─ Warning list (non-blocking, buyer acknowledges)

Step 5: Confirm
  ─ "Create N Purchase Orders"
  ─ All POs created in draft
  ─ PR lines linked to PO lines
  ─ PR status → in_progress
```

---

## CONSEQUENCES

### Positive

- Procurement agents save hours of manual grouping per week
- Fewer, larger POs per supplier → better volume pricing leverage
- Deduplication prevents accidental double-ordering
- UOM conversion automatic — no buyer needs to know that 175 KG = 3.5 SACOS
- Preferred supplier and ranking visible at decision time — data-driven sourcing
- Pre-flight catches errors before POs are sent to suppliers

### Negative

- Engine adds complexity — buyers must learn the consolidation UI
- Rules may not fit every scenario — override capability is essential
- If ConsolidationConfig is misconfigured, engine may produce suboptimal groups
- Lead time split (Rule 8) requires accurate `leadTimeDays` on `SupplierItem` — stale data causes incorrect splits

### Neutral

- Buyers retain full override capability — engine proposes, buyer decides
- PRs without a matched supplier still appear in consolidation — buyer assigns manually
- POs created from consolidation are in `draft` status — same approval/confirmation flow as manual POs

---

## ALTERNATIVES CONSIDERED

### Alternative 1: Auto-create POs directly from approved PRs (no consolidation step)

**Description:** Each approved PR line automatically becomes a PO line. System groups by supplier automatically with no buyer intervention.

**Pros:**
- Zero buyer effort — fully automated
- Fast — POs appear immediately after PR approval

**Cons:**
- Cannot handle cases where buyer wants different supplier than suggested
- No opportunity to adjust quantities or prices before sending to supplier
- Deduplication without buyer review may silently merge quantities the buyer wanted separate

**Why not chosen:** Procurement requires human review for price validation and supplier selection. Full automation is appropriate for MRP replenishment in a future sprint.

### Alternative 2: Simple grouping by supplier only (no windowing, no deduplication)

**Description:** Group approved PRs by supplier. One group = one PO. Buyer manually removes duplicates.

**Pros:**
- Much simpler engine to build and maintain
- Easier for buyers to understand

**Cons:**
- Does not solve delivery fragmentation
- Does not solve duplicate lines
- UOM conversion still manual

**Why not chosen:** Partial solution that misses the most valuable consolidation benefits.

### Alternative 3: External procurement platform integration (e.g., Coupa, SAP Ariba)

**Description:** Export PRs to an external procurement platform for consolidation and PO creation.

**Pros:**
- Mature, battle-tested consolidation and supplier management features

**Cons:**
- Integration complexity and cost
- Loss of ERP data integrity — POs created outside the system
- Doesn't fit the target market (SME manufacturing)

**Why not chosen:** Out of scope and contrary to Sunset ERP's goal of being a self-contained manufacturing ERP.

---

## IMPLEMENTATION NOTES

### ConsolidationEngine service structure
```typescript
// backend/src/modules/procurement/consolidation.engine.ts
class ConsolidationEngine {
  propose(prIds: string[], config: ConsolidationConfig): CandidateGroup[]
  validate(group: CandidateGroup): ValidationResult
  createPo(group: CandidateGroup, tenantId: string): PurchaseOrder
}

interface CandidateGroup {
  supplierId:   string;
  supplierName: string;
  deliveryDate: Date;
  lines:        CandidateLine[];
  totalEstimate: Decimal;
  warnings:     string[];
  errors:       string[];
}
```

### Minimum order field on Supplier
```prisma
// Add to Supplier model
minimumOrderAmount  Decimal? @map("minimum_order_amount") @db.Decimal(15,2)
minimumOrderCurrency String? @map("minimum_order_currency") @db.VarChar(3)
```

---

## RELATED DECISIONS

- ADR-015: Purchase Requisition Flow — provides the approved PRs that this engine consumes
- ADR-014: Stock Triple UOM — provides the UOM conversion used at PO line creation
- ADR-017: Supplier Ranking — provides the score displayed during supplier selection in Step 3

---

## REFERENCES

- [Sunset ERP Sprint 14 Plan](../../../SPRINT-14-PLAN.md)
- [APICS Dictionary — Purchase Order Consolidation](https://www.apics.org)
- [ISM — Principles of Purchasing and Supply Chain Management](https://www.ismworld.org)

---

**Review Date:** 2026-09-30 — Review rule effectiveness based on buyer feedback. Consider ML-based grouping suggestions if manual overrides exceed 30% of engine proposals.