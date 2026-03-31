# ADR-017: Supplier Ranking Score Model

**Status:** Accepted  
**Date:** 2026-03-31  
**Deciders:** Juan (FP&A / Systems Engineering), Sunset ERP Architecture  
**Tags:** procurement, supplier, ranking, analytics, grn, kpi

---

## CONTEXT

When a procurement agent selects a supplier for a Purchase Order or evaluates a preferred supplier suggestion, the decision is currently based on informal knowledge or manual price comparison. Sunset ERP has accumulated transactional data that can support objective, data-driven supplier evaluation:

- `GoodsReceipt.receivedDate` vs `PurchaseOrder.expectedDate` — delivery compliance
- `GoodsReceipt.condition` — quality of received goods
- `ApInvoice` price history per supplier/item — price competitiveness
- `SupplierItem.leadTimeDays` — lead time commitment vs actuals

Without a scoring model, this data sits unused. Buyers either ignore it or build manual spreadsheets that go stale. Supplier performance problems are caught late — only after a production line stops due to a late or damaged delivery.

---

## DECISION

Implement a `SupplierScore` model and `SupplierScoreService` that calculates a composite performance score per `(tenantId, supplierId, itemId)` and per `(tenantId, supplierId)` overall. Scores are pre-calculated on a nightly schedule and cached in `po_supplier_scores`. The Consolidation Console (ADR-016) uses cached scores to rank supplier suggestions in real time.

### Score Formula

```
TotalScore = 0.40 × priceScore
           + 0.30 × deliveryScore
           + 0.20 × qualityScore
           + 0.10 × leadTimeScore
```

All component scores are on a 0–100 scale. Higher is always better.

### Component Definitions

#### priceScore (40%)
Measures price competitiveness relative to the average market price across all suppliers for the same item over the same period.

```
priceScore = 100 × (avg_price_all_suppliers / this_supplier_avg_price)
```

- If supplier's price equals market average → score = 100
- If supplier's price is 20% above average → score = 83.3
- Score is capped at 100 (cannot exceed 100 even if below average)
- Requires at least 2 suppliers for the same item to be meaningful; falls back to 100 if only one supplier

#### deliveryScore (30%)
Percentage of GRNs received on or before the PO `expectedDate`.

```
deliveryScore = 100 × (on_time_grns / total_grns)
```

A GRN is "on time" if `receivedDate <= expectedDate`. Days late are not weighted — binary on-time / late. Future enhancement: weighted by days late.

Minimum 3 GRNs required for a meaningful score. Falls back to 75 (neutral) if fewer.

#### qualityScore (20%)
Percentage of GRNs with condition = `'complete'`.

```
qualityScore = 100 × (complete_grns / total_grns)
```

Conditions `partial`, `damaged`, `rejected` are all counted as non-complete. Future enhancement: weighted by severity (damaged/rejected worse than partial).

#### leadTimeScore (10%)
Measures how accurately the supplier's committed lead time matches their actual delivery behavior.

```
actualAvgLeadTime = avg(receivedDate - poDate) in days
committedLeadTime = SupplierItem.leadTimeDays

leadTimeScore = 100 × min(committedLeadTime / actualAvgLeadTime, 1.0)
```

- If actual matches committed → score = 100
- If actual is 50% longer than committed → score = 66.7
- Score cannot exceed 100

### Schema

```prisma
model SupplierScore {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  supplierId    String   @map("supplier_id") @db.Uuid
  itemId        String?  @map("item_id") @db.Uuid
  // null = overall supplier score (all items aggregated)
  periodCode    String   @map("period_code") @db.VarChar(20)
  // Format: 2026-Q1 | 2026-04 | 2026 | ALL
  periodType    String   @map("period_type") @db.VarChar(10)
  // quarterly | monthly | annual | all_time

  priceScore    Decimal  @map("price_score")    @db.Decimal(5,2)
  deliveryScore Decimal  @map("delivery_score") @db.Decimal(5,2)
  qualityScore  Decimal  @map("quality_score")  @db.Decimal(5,2)
  leadTimeScore Decimal  @map("lead_time_score") @db.Decimal(5,2)
  totalScore    Decimal  @map("total_score")    @db.Decimal(5,2)

  // Supporting counts for transparency
  poCount       Int      @map("po_count")
  grnCount      Int      @map("grn_count")
  onTimeCount   Int      @map("on_time_count")
  completeCount Int      @map("complete_count")
  avgPrice      Decimal? @map("avg_price") @db.Decimal(15,4)
  avgLeadDays   Decimal? @map("avg_lead_days") @db.Decimal(8,2)

  calculatedAt  DateTime @default(now()) @map("calculated_at")

  tenant   Tenant   @relation(fields: [tenantId],   references: [id])
  supplier Supplier @relation(fields: [supplierId], references: [id])
  item     Item?    @relation(fields: [itemId],     references: [id])

  @@unique([tenantId, supplierId, itemId, periodCode])
  @@index([tenantId])
  @@index([tenantId, supplierId])
  @@index([tenantId, itemId])
  @@index([totalScore])
  @@map("po_supplier_scores")
}
```

### Score Calculation Service

```typescript
class SupplierScoreService {
  // Called nightly by scheduled job
  async recalculateAll(tenantId: string): Promise<void>

  // Called for a specific supplier+item combination
  async recalculate(supplierId: string, itemId: string | null, periodCode: string, tenantId: string): Promise<SupplierScore>

  // Used by Consolidation Console: returns top N suppliers for an item
  async getTopSuppliersForItem(itemId: string, limit: number, tenantId: string): Promise<SupplierScore[]>

  // Used by PO creation: get score badge for a supplier+item
  async getScore(supplierId: string, itemId: string, tenantId: string): Promise<SupplierScore | null>
}
```

### Score Display in Consolidation Console

Each supplier suggestion shows a score badge:

```
🟢 92 — Proveedor A    (preferred, high score)
🟡 71 — Proveedor B    (alternative, medium score)
🔴 45 — Proveedor C    (alternative, low score — damaged GRNs)
```

Color thresholds:
- 🟢 Green: score ≥ 80
- 🟡 Yellow: score 50–79
- 🔴 Red: score < 50

### Supplier Ranking Dashboard (`/procurement/suppliers/ranking`)

Four visual widgets:

1. **Overall ranking** — horizontal bar chart, all suppliers sorted by totalScore
2. **Score breakdown** — radar/spider chart per supplier (4 dimensions)
3. **Price history** — line chart, price per (supplier, item) over last 12 months
4. **Delivery compliance timeline** — monthly on-time % per supplier, last 12 months

Filters: Item | Category | Period | Supplier

---

## CONSEQUENCES

### Positive

- Procurement decisions are data-driven rather than relationship-driven
- Price inflation from a single supplier becomes visible immediately
- Suppliers with repeated damaged deliveries are flagged automatically
- `isPreferred` on SupplierItem can be updated based on score evidence
- New suppliers start at neutral score (fallback values) — system doesn't penalize them unfairly
- Score history enables trend analysis: is supplier improving or declining?

### Negative

- Score accuracy depends on data quality: missing `expectedDate` on POs makes deliveryScore unmeasurable
- Small transaction counts produce statistically unreliable scores — minimum thresholds required
- Buyers may over-rely on score and ignore relationship context (new supplier with no history)
- Price score requires at least 2 suppliers per item — single-source items get default score
- Nightly recalculation lag: score reflects yesterday's transactions, not today's

### Neutral

- Score is advisory, not enforced — buyer can always choose a lower-scored supplier
- Items with no SupplierItem records cannot be scored — only items with at least one purchase history
- Score weights (40/30/20/10) are hardcoded initially; future enhancement to make them configurable per tenant

---

## ALTERNATIVES CONSIDERED

### Alternative 1: Simple last-price comparison only

**Description:** No composite score. Show only the last price paid per supplier per item.

**Pros:**
- Trivial to implement
- Buyers understand it immediately

**Cons:**
- Ignores delivery reliability and quality — a cheap supplier who delivers late or damaged is not a good supplier
- No aggregation across items for overall supplier performance

**Why not chosen:** Price alone is insufficient for supplier evaluation in manufacturing operations.

### Alternative 2: Manual supplier evaluation (scorecard forms)

**Description:** Procurement managers fill in periodic supplier scorecards manually (quarterly reviews).

**Pros:**
- Captures qualitative factors not in transactional data
- Common practice in procurement departments

**Cons:**
- Labour-intensive and inconsistent
- Scorecards go stale between review cycles
- Does not feed into real-time PO creation decisions

**Why not chosen:** Manual scorecards complement but cannot replace system-calculated scores for real-time use.

### Alternative 3: Third-party supplier intelligence integration

**Description:** Integrate with a supplier intelligence platform (e.g., Dun & Bradstreet, Riskmethods).

**Pros:**
- External risk signals (financial health, geopolitical)
- Industry benchmark comparisons

**Cons:**
- Cost and integration complexity
- External data for SME suppliers may be sparse
- Out of scope for current market (SME manufacturing)

**Why not chosen:** Out of scope. Can be added as a future integration point once internal scoring is established.

---

## IMPLEMENTATION NOTES

### Scheduled job
```typescript
// backend/src/jobs/supplier-score.job.ts
@Cron('0 2 * * *')  // 2:00 AM daily
async recalculateSupplierScores() {
  const tenants = await this.tenantService.findAllActive();
  for (const tenant of tenants) {
    await this.supplierScoreService.recalculateAll(tenant.id);
  }
}
```

### Minimum transaction requirements for valid score
| Component | Minimum records |
|-----------|----------------|
| priceScore | 1 AP Invoice per supplier per item |
| deliveryScore | 3 GRNs with expectedDate on PO |
| qualityScore | 3 GRNs |
| leadTimeScore | 3 GRNs + SupplierItem.leadTimeDays set |

If minimum not met, component falls back to 75 (neutral — neither penalizes nor rewards).

---

## RELATED DECISIONS

- ADR-015: Purchase Requisition — ranking surfaces preferred supplier at PR creation time
- ADR-016: PO Consolidation Rules Engine — top 3 suppliers by score shown in supplier selection step
- ADR-013: SupplierItem — `isPreferred`, `lastPrice`, `leadTimeDays` are inputs to score calculation

---

## REFERENCES

- [Sunset ERP Sprint 14 Plan](../../../SPRINT-14-PLAN.md)
- [CIPS — Supplier Performance Management](https://www.cips.org)
- [ISM — Supplier Performance Measurement](https://www.ismworld.org)
- [Kraljic Matrix — Supplier segmentation](https://hbr.org/1983/09/purchasing-must-become-supply-management)

---

**Review Date:** 2026-09-30 — Review weight distribution (40/30/20/10) based on tenant feedback. Consider making weights configurable per tenant if manufacturing and service tenants have significantly different priorities.