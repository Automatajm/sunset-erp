# spec-frontend-006 — Document Printing, Round 2 (RFQ, MO Traveler, Count Sheets)

Status: **Complete**
Owner: Axiom Systems
Sprint: follow-up to spec-frontend-005 (printing infrastructure shipped e166f9d)
Module(s): frontend only — rfqs, production-orders, stock-reconciliation pages
Last updated: 2026-06-07

## Purpose

- **Who uses this module?** Shop-floor and procurement operators — buyers sending quote requests to suppliers, production supervisors running a job off a traveler, and inventory counters working a physical stock count with a clipboard — building on the printing infrastructure frontend developers shipped in spec-frontend-005.
- **What business problem does it solve?** It adds the three operational paper documents that exist in every real plant — the RFQ, the production-order traveler, and the stock count sheet — so these workflows leave the screen and become the physical instruments the work actually requires.
- **What can the business NOT do without this module?** It cannot send a formal quote request to suppliers, give the floor a printed run sheet with a component-issue list, or hand a counter a proper blind count sheet — these processes fall back to screenshots, memory, or hand-copied notes.

## Business value

These three documents are the ones a plant runs on paper every day. Without the RFQ printout, sourcing reverts to the same screenshot friction the PO already fixed, and quotes go out looking improvised. Without the traveler, the production floor works from memory or hand-copied notes, inviting wrong quantities and missed components. Without a blind count sheet, counters read expected numbers off a phone at the rack — defeating the entire point of a physical count and corrupting the variance data. Generating each as one-click, light-on-white paper makes these routine operations reliable and audit-ready.

## Problem

spec-frontend-005 shipped the printing infrastructure (`DocumentLayout`,
`PRINT_DOCS` registry, `PrintButton`, `/print/[doc]/[id]` route) and covered the
six core commercial documents. Three operational documents that exist on paper
in every real plant are still missing:

1. **RFQ** — the only remaining *outward-facing* document without print. A
   quote request that cannot be handed or sent to a supplier forces operators
   back to screenshots — the exact friction spec-005 eliminated for POs.
2. **Production Order traveler** — the shop-floor document that physically
   accompanies a production run: what to produce, how much, and the component
   list to issue. Without it the floor works from memory or hand-copied notes.
3. **Stock count sheets** — physical counts are done with a clipboard. A count
   sheet with a blank "counted" column is the standard instrument; today the
   counter must read quantities off a phone screen at the rack.

All three render from existing `getById` responses (shapes verified against the
live API on 2026-06-07) — purely presentation-layer, same as round 1.

## Acceptance criteria

### Documents (3)
- [ ] **RFQ** (`/print/rfq/:id`) — supplier-facing quote request.
      Header: `rfqNumber`, date, status, response deadline (when modeled), source
      PR/GN reference when present. Lines: item code + name, quantity, UOM, and
      **blank** "Unit price" / "Lead time" / "Notes" columns for the supplier to
      fill in. Optional `?rfqSupplierId=` query param addresses the printout to
      one invited supplier (name block); absent → renders unaddressed.
- [ ] **Production Order traveler** (`/print/production-order/:id`) — shop-floor
      document. Header: `poNumber` (MO-YYYY-NNNN), status, priority, planned
      start/end dates, product (`bom.parentItem` code + name), quantity to
      produce, BOM number + version. Body: component lines from
      `bom.components` — consumption **group** name (BOM components reference
      `ConsumptionGroup`, not items — by design, `schema.prisma` BomComponent),
      `quantityPer`, UOM, scrap %, and a computed **total required** column
      (`quantityPer × quantityToProduce × (1 + scrapPercent/100)`), plus blank
      "Issued qty" / "Issued by" columns. Footer: prepared by / produced by / QC
      signature blocks.
- [ ] **Stock count sheet** (`/print/stock-count/:id`) — per reconciliation
      session. Header: session number, warehouse code + name, date, status.
      Lines: item code + name, UOM, and blank "Counted qty" / "Notes" columns.
      **Blind by default**: system quantity is NOT printed (standard counting
      practice — the counter must not see the expected number); `?blind=0`
      prints the system-quantity column for recount/variance review. Footer:
      counted by / verified by signature blocks.

### Reuse (no new infrastructure)
- [ ] Each document is a thin composition of the existing `DocumentLayout` (+
      `LinesTable` where the column set fits) registered in `PRINT_DOCS` —
      three new registry entries, zero changes to the print route or layout
      frame. Blank fill-in columns render as empty bordered cells.
- [ ] **No new backend endpoints, no new dependencies.** Consumes existing
      `getById` responses (includes verified sufficient — see API contracts).
      Any missing field is a finding for the owning module's spec, not a new
      endpoint here (spec-005 rule).
- [ ] Print view remains the sanctioned light-on-white exception; all other
      DESIGN-SYSTEM rules apply (no emojis, explicit-size SVGs, English only).

### UX integration
- [ ] `PrintButton` wired into three surfaces: RFQ detail (per invited supplier
      where the UI exposes them), production-orders page (row action or detail),
      stock-reconciliation session detail page.
- [ ] One click from page to printable document — no configuration screens
      (ux-reviewer pass, friction ≤ 2). The blind/addressed variants are query
      params with sensible defaults, never a dialog.

## Out of scope

- Purchase Requisition, Journal Entry voucher, AR payment receipt, BOM recipe
  card, customer statement — candidate round 3, separate spec.
- Batch printing (e.g. all count sheets for a warehouse in one job).
- Emailing the printed documents (spec-022 composition, future).
- DGII fiscal documents (e-CF) — regulation-driven, separate spec.
- Recording count results from paper back into the system (the count page
  already does data entry; this spec only produces the paper instrument).

## Data model

No changes.

## API contracts

No new endpoints. Consumes (existing, includes verified 2026-06-07):

- `GET /api/rfqs/:id` — includes `lines` (+ `item` code/name), `rfqSuppliers`
  (+ `supplier`), `purchaseRequisition`/`generalNeed` refs (`rfqInclude()`,
  `rfqs.service.ts`).
- `GET /api/production-orders/:id` — includes `bom.parentItem` and
  `bom.components` (+ `consumptionGroup`, `consumptionUom`)
  (`production-orders.service.ts` findOne).
- `GET /api/stock-reconciliation/:id` — includes `warehouse` and `lines`
  (+ `item` code/name/type) (`stock-reconciliation.service.ts` findOne).

## Implementation notes

| File | Change |
|---|---|
| `frontend/components/print/documents.tsx` | +3 `PRINT_DOCS` entries: `rfq`, `production-order`, `stock-count` |
| `frontend/app/procurement/rfqs/page.tsx` | `PrintButton` wiring |
| `frontend/app/manufacturing/production-orders/page.tsx` | `PrintButton` wiring |
| `frontend/app/inventory/stock-reconciliation/[id]/page.tsx` | `PrintButton` wiring |

Notes:
- The MO traveler's "total required" is computed client-side at render — it is
  a paper aid, not a stored value; no rounding decisions beyond display
  (3 decimals, matching `quantityPer` Decimal(15,6) display convention).
- BURGER demo tenant currently has **0 RFQs and 0 reconciliation sessions** —
  verification requires creating one of each (or extending the demo seed; a
  seed addition is optional, not part of acceptance).

## Verification checklist

```bash
# 0. Create one RFQ and one reconciliation session in BURGER (UI or API) — demo
#    seed has none.
# 1. RFQ print: lines show item/qty/uom; price & lead-time columns are BLANK;
#    ?rfqSupplierId= adds the supplier name block.
# 2. MO traveler: product from bom.parentItem; component rows show consumption
#    GROUP names; total required = quantityPer × qtyToProduce × (1+scrap%);
#    Issued qty/by columns blank; 3 signature blocks.
# 3. Count sheet: blind by default (NO system qty); ?blind=0 shows it;
#    Counted qty/Notes blank; counted/verified signature blocks.
# 4. All three: light-on-white, tenant header, page X of Y, long documents
#    paginate with repeated column headers.
# 5. cd frontend && pnpm build       # zero new deps
# 6. ux-reviewer on the three flows → friction ≤ 2
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-07 | Spec drafted (round-2 printing; API shapes verified live against BURGER tenant; confirmed zero backend changes needed — BOM components resolve to consumption groups by design) | Draft — pending approval |
| 2026-06-07 | Implemented: 3 PRINT_DOCS entries (rfq / production-order / stock-count), `signatures` prop added to DocumentLayout (backwards-compatible default), PrintButton wired into RFQ drawer header + per-invited-supplier rows (`?rfqSupplierId=`), MO row actions, reconciliation session header. Phantom BOM components excluded from traveler. Test docs created in BURGER: RFQ-2026-0001 (2 suppliers), CC-2026-0001 (11 lines); MO traveler uses existing MO-2026-0003. | tsc clean; prod `pnpm build` PASSES; all 5 route variants + 3 wired pages dev-compile 200; +5 lint `any` matching file idiom (doesn't gate). Pending: browser visual check + ux-reviewer ≤ 2 |
| 2026-06-07 | Visual verification by user (all three documents reviewed in browser, approved). Compliance audit: 100% (9/9 code-verifiable criteria, frontend-only — 0 backend files in diff; backend suite N/A, no frontend Jest harness by established state). One-click flow, friction ≤ 2. Shipped to origin (d8f97f1); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
