# ADR-018: Three-Way Match — PO ↔ GRN ↔ AP Invoice

**Status:** Accepted  
**Date:** 2026-03-31  
**Deciders:** Juan (FP&A / Systems Engineering), Sunset ERP Architecture  
**Tags:** procurement, ap-invoice, grn, purchase-order, accounting, internal-controls, three-way-match

---

## CONTEXT

In a standard accounts payable cycle, a supplier invoice is paid after verifying that:
1. The goods or services were ordered (Purchase Order exists)
2. The goods were actually received (Goods Receipt exists)
3. The supplier's invoice matches both in quantity and price

Without this verification, organizations are exposed to:

**Problem 1 — Overpayment:** Paying for quantities not received, or at prices higher than negotiated in the PO, without automated detection.

**Problem 2 — Phantom invoices:** Approving and posting AP invoices for goods never ordered or never received — a common vector for procurement fraud.

**Problem 3 — Price drift:** Supplier invoices arrive with slightly different unit prices than the PO. Without automated comparison, these discrepancies accumulate silently.

**Problem 4 — No receiving confirmation gate:** In Sunset ERP's original AP module (Sprint 10A), an AP Invoice could be posted to the general ledger without any link to a GRN. Stock could be received and booked separately from the liability recognition, creating timing and value mismatches.

The existing schema already has `GoodsReceipt`, `PurchaseOrder`, and `ApInvoice` as separate models. The 3-way match decision is about how these three documents are linked, validated, and enforced at posting time.

---

## DECISION

Implement a 3-way match system that:
1. Links `ApInvoice` → `GoodsReceipt` at header level via `grnId`
2. Links `ApInvoiceLine` → `GoodsReceiptLine` at line level via `grnLineId`
3. Validates quantities and prices per line before allowing an AP Invoice to post
4. Blocks posting if the match fails beyond configured tolerances
5. Provides a match status API that returns per-line analysis

### Match Status Levels

```
no_match          — Invoice has no PO and no GRN linked
two_way           — Invoice is linked to a PO but no GRN
three_way_matched — Invoice linked to PO + GRN, all lines pass validation
three_way_failed  — Invoice linked to PO + GRN, one or more lines fail
```

Only `three_way_matched` and `no_match` (for expense/service invoices) allow posting. `two_way` and `three_way_failed` block posting.

### Schema Changes

```prisma
// ApInvoice — header link to GRN
model ApInvoice {
  // ... existing fields ...
  grnId  String?  @map("grn_id") @db.Uuid   // ← added in Sprint 13
  goodsReceipt GoodsReceipt? @relation("ApInvoiceGrn", fields: [grnId], references: [id])
}

// ApInvoiceLine — line link to GRN line
model ApInvoiceLine {
  // ... existing fields ...
  grnLineId  String?  @map("grn_line_id") @db.Uuid  // ← added in Sprint 13
  goodsReceiptLine GoodsReceiptLine? @relation("ApLineGrnLine", fields: [grnLineId], references: [id])
}

// GoodsReceipt — inverse relation
model GoodsReceipt {
  apInvoices ApInvoice[] @relation("ApInvoiceGrn")
}

// GoodsReceiptLine — inverse relation  
model GoodsReceiptLine {
  apInvoiceLines ApInvoiceLine[] @relation("ApLineGrnLine")
}
```

Migration: `20260331143123_add_grn_link_to_ap_invoice`

### Match Validation Rules (per line)

| Check | Pass Condition | Tolerance |
|-------|---------------|-----------|
| PO quantity match | invoiceQty ≤ poOrderedQty | None — exact or under |
| GRN quantity match | invoiceQty ≤ grnReceivedQty | None — exact or under |
| Price match | abs(invoicePrice - poPrice) / poPrice ≤ tolerance | Configurable, default 2% |

All three checks must pass for a line to be `lineMatches = true`. The invoice can only post if all lines match.

### API Endpoints

```
GET  /ap-invoices/:id/match-status   — Per-line analysis, match status, canPost flag
POST /ap-invoices/:id/link-grn       — Link a GRN to a draft invoice (auto-matches lines by poLineId)
POST /ap-invoices/:id/unlink-grn     — Remove GRN link from a draft invoice
```

`linkGrn` and `unlinkGrn` only operate on invoices in `draft` status. Attempting these operations on a posted invoice returns HTTP 422.

### Match Status Response Shape

```typescript
interface MatchStatus {
  invoiceId:      string;
  invoiceNumber:  string;
  invoiceStatus:  string;
  matchStatus:    'no_match' | 'two_way' | 'three_way_matched' | 'three_way_failed';
  priceTolerance: string;  // "2%"
  canPost:        boolean;
  purchaseOrder?: { poNumber: string; status: string };
  goodsReceipt?:  { grnNumber: string; status: string; receivedDate: string; condition: string };
  lines: Array<{
    lineNumber:    number;
    itemCode:      string;
    itemName:      string;
    invoiceQty:    number;
    invoicePrice:  number;
    poQty:         number | null;
    poPrice:       number | null;
    grnQty:        number | null;
    poQtyOk:       boolean | null;
    grnQtyOk:      boolean | null;
    priceOk:       boolean | null;
    priceDiffPct:  number | null;
    lineMatches:   boolean;
    issues:        string[];
  }>;
  summary: { total: number; matched: number; failed: number };
}
```

### Post Validation

`validateThreeWayMatch()` is called inside `post()` before generating the Journal Entry:

```typescript
async post(id: string, tenantId: string): Promise<ApInvoice> {
  const invoice = await this.findOne(id, tenantId);

  if (invoice.status !== 'draft') throw new BadRequestException('Only draft invoices can be posted.');

  // 3-way match gate
  if (invoice.poId) {
    const match = await this.getMatchStatus(id, tenantId);
    if (!match.canPost) {
      throw new UnprocessableEntityException(
        `3-way match failed: ${match.summary.failed} line(s) have discrepancies. ` +
        `Resolve before posting.`
      );
    }
  }
  // ... generate JE, update status
}
```

Invoices without a `poId` (manual/expense invoices) bypass the match gate entirely — `canPost = true` by default.

### Auto-link Logic in `linkGrn()`

When a GRN is linked to an AP Invoice, the service attempts to auto-match lines:

```typescript
async linkGrn(invoiceId: string, grnId: string, tenantId: string) {
  // 1. Set grnId on ApInvoice header
  // 2. For each ApInvoiceLine with a poLineId:
  //      Find GoodsReceiptLine where poLineId matches
  //      If found → set grnLineId on the ApInvoiceLine
  // 3. Return: { matchedLines: N, invoice: updated }
}
```

Lines without a `poLineId` (manual invoice lines) are not auto-matched and receive `grnLineId = null`.

### UI Integration

**AP Invoice Drawer — 3-Way Match Tab:**
- Shows current match status badge: No Match / 2-Way / 3-Way ✓ / 3-Way ✗
- If `draft + poId + no grnId`: warning banner — "Consider receiving goods first"
- Link / Unlink GRN controls (draft invoices only)
- Per-line table: invoiceQty vs poQty vs grnQty, price diff %, pass/fail per line
- Summary: N/M lines matched
- Success/failure message blocks

---

## CONSEQUENCES

### Positive

- Eliminates overpayment risk — system enforces that invoice quantity ≤ received quantity
- Price drift caught automatically — 2% tolerance surfaced at posting time, not months later
- Fraud deterrent — phantom invoices (no matching GRN) cannot be posted
- Audit trail complete — full chain from PO line → GRN line → AP Invoice line is traceable
- Flexible — expense and service invoices bypass the gate via the no-match path
- Non-blocking until posting — buyers can create invoices before GRN, link later in draft

### Negative

- Adds a required step for all PO-backed invoices — must link GRN before posting
- Auto-match by `poLineId` fails for manual invoice lines — buyer must assign grnLineId manually
- Price tolerance is global (2%) — different item categories may warrant different tolerances
- One GRN per invoice header limit — invoices receiving from multiple GRNs (partial shipments) require workaround

### Neutral

- `two_way` match is a valid intermediate state — not an error, just incomplete
- GRN can be linked to multiple AP Invoices (partial invoicing of one GRN is not blocked)
- Match status is computed on demand — no materialized match result stored on invoice
- Existing posted invoices before Sprint 13 have `grnId = null` — treated as `no_match` / expense

---

## ALTERNATIVES CONSIDERED

### Alternative 1: Two-way match only (PO ↔ AP Invoice, no GRN required)

**Description:** Validate invoice against PO only. The GRN is treated as optional and does not participate in the match.

**Pros:**
- Simpler — no need to receive goods before approving invoice
- Covers price and quantity against PO

**Cons:**
- Does not verify actual receipt — can pay for goods not yet received or never received
- Weaker fraud control than 3-way match
- Timing mismatch: liability recognized before asset confirmed

**Why not chosen:** Two-way match is insufficient for manufacturing operations where inventory receipt is a distinct event. Three-way match is the industry standard for product-based procurement.

### Alternative 2: Enforce GRN before AP Invoice creation (hard dependency)

**Description:** Block AP Invoice creation entirely if no GRN exists for the PO. Receiving goods is a prerequisite.

**Pros:**
- Process is unambiguous — no GRN, no invoice
- Eliminates the partial-match intermediate states

**Cons:**
- Breaks real-world workflow — suppliers often send invoices before goods arrive
- Creates AP Invoice backlog waiting for receiving teams
- Cannot handle advance payment invoices

**Why not chosen:** Real AP workflows require the ability to create draft invoices before receiving. The warning banner in the UI addresses this without blocking.

### Alternative 3: Tolerance-based auto-approval (post without match if within tolerance)

**Description:** If all lines are within 2% on both quantity and price, post automatically without buyer review.

**Pros:**
- Reduces clicks for standard invoices

**Cons:**
- Removes human review from posting step
- Tolerance bands can accumulate into material variances over time
- Audit requirements typically mandate human sign-off on AP posting

**Why not chosen:** Posting is a financial control point. Auto-approval is appropriate only for invoices below a configurable threshold — reserved for a future automation sprint.

### Alternative 4: Store match result as a materialized field on ApInvoice

**Description:** Compute and store `matchStatus` on the invoice whenever the invoice or GRN changes.

**Pros:**
- Fast reads — no computation on GET /match-status
- Can be indexed and filtered

**Cons:**
- Must be invalidated and recomputed whenever GRN, PO, or invoice lines change
- Cache invalidation complexity outweighs read performance benefit at current scale

**Why not chosen:** Computed on demand is correct at current transaction volumes. Materialization is a future optimization if performance degrades.

---

## IMPLEMENTATION NOTES

### Price tolerance configuration
Currently hardcoded at 2%. Future enhancement: store per category or per supplier in TenantSettings:
```json
{
  "ap_match_price_tolerance_pct": 2.0,
  "ap_match_qty_tolerance_pct": 0.0
}
```

### One GRN per invoice limitation
The current schema has `ApInvoice.grnId` as a single FK. To support multiple GRNs per invoice (consolidated invoicing across shipments), a junction table would be needed:
```prisma
model ApInvoiceGrn {
  apInvoiceId String
  grnId       String
  @@unique([apInvoiceId, grnId])
}
```
This is documented as a future enhancement. Current design handles the common case (one invoice per shipment).

### Files delivered in Sprint 13
- Migration: `backend/prisma/migrations/20260331143123_add_grn_link_to_ap_invoice/`
- Service methods: `ap-invoices.service.ts` → `linkGrn()`, `unlinkGrn()`, `getMatchStatus()`, `validateThreeWayMatch()`
- Controller: `ap-invoices.controller.ts` → 3 new endpoints
- API client: `frontend/lib/api/ap-invoices.ts` → `linkGrn()`, `unlinkGrn()`, `getMatchStatus()`
- UI: `APDrawer` 3-Way Match tab + warning banner

---

## RELATED DECISIONS

- ADR-013: Triple UOM — GRN quantities used in match are in storageUom; future enhancement will compare in consumptionUom once ADR-014 is implemented
- ADR-014: Stock Triple UOM Runtime — GRN lines will carry all 3 quantities; match validation should use storageQty for comparison
- ADR-015: Purchase Requisition — PR → PO → GRN → AP Invoice is the complete procurement chain; 3-way match validates the final link
- ADR-016: PO Consolidation — consolidated POs produce GRNs that feed into this match

---

## REFERENCES

- [Sunset ERP Sprint 13 Summary](../../../SPRINT-13-SUMMARY.md)
- [APICS Dictionary — Three-Way Match](https://www.apics.org)
- [IIA — Internal Controls in Accounts Payable](https://www.theiia.org)
- [COSO Framework — Control Activities](https://www.coso.org)
- [ISO 9001 Clause 8.4 — Control of externally provided processes, products and services](https://www.iso.org)

---

**Review Date:** 2026-09-30 — Review one-GRN-per-invoice limitation based on usage patterns. Evaluate whether tolerance bands should be configurable per item category. Consider auto-posting for invoices below a configurable threshold.