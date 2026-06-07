# spec-frontend-008 — Document Printing, Round 4 (BOM Recipe Card, Customer Statement)

Status: **Complete**
Owner: Axiom Systems
Sprint: follow-up to spec-frontend-007 (printing round 3 shipped be04a7f)
Module(s): frontend only — bom, customers/ar-invoices pages
Last updated: 2026-06-07

## Problem

The last two documents from the printing backlog (rounds 2–3 out-of-scope
lists):

1. **BOM recipe card** — in a food plant the "recipe" is posted at the work
   station: what goes into one unit, in what quantity, with what scrap
   allowance, and the routing steps to make it. The MO traveler (round 2)
   covers a production *run*; the recipe card is the standing reference per
   product. Today the BOM lives only in the dark-mode web page.
2. **Customer statement** — the classic "estado de cuenta": every non-void
   invoice for a customer with paid/balance columns, aging buckets, and a
   total due. Collections in DR run on printed/PDF statements handed or
   emailed to the customer. The data exists (`?customerId=` filter on AR
   invoices, shipped in spec-026); there is no document.

Both render from existing API responses (verified live against BURGER on
2026-06-07) — purely presentation-layer, same as rounds 1–3.

## Acceptance criteria

### Documents (2)
- [ ] **BOM recipe card** (`/print/bom/:id`) — standing product reference.
      Header: `bomNumber`, version-context (`isActive`, effective from/to when
      present), product (`parentItem` code + name). Body §1 — components: line
      table with consumption **group** code + name (BOM components reference
      `ConsumptionGroup` by design), `quantityPer` (per unit), UOM,
      scrap %, phantom components **excluded** (same rule as the MO traveler).
      Body §2 — routing steps (when `routings` non-empty): step number,
      description, setup time, run time per unit; section omitted entirely
      when the BOM has no routings. Footer: standard Prepared/Received
      signatures (default) — the recipe card is reference material, not an
      approval instrument.
- [ ] **Customer statement** (`/print/customer-statement/:customerId`) —
      estado de cuenta. Header: customer (name, code, email), statement date
      (render date). Body: table of all **non-void** AR invoices for the
      customer — invoice number, invoice date, due date, status, total, paid,
      **balance** (total − paid) — sorted by invoice date ascending. Totals
      row: sums of total/paid/balance. Aging block: balance bucketed by
      days-past-due computed from `dueDate` at render time (Current / 1–30 /
      31–60 / 61–90 / 90+), only over invoices with balance > 0. Empty state:
      "No invoices for this customer" when none exist. Footer: standard
      signatures; note block stating the statement reflects invoices as of
      the render date.
- [ ] Currency handling on the statement: amounts shown per invoice with the
      invoice's own `currency` code; totals and aging are summed **only when
      all listed invoices share one currency** — with mixed currencies, group
      totals/aging per currency (one block per currency). Never silently sum
      across currencies (spec-021 discipline).

### Reuse (no new infrastructure)
- [ ] Two new `PRINT_DOCS` registry entries on `DocumentLayout` (+ round-2/3
      `TH/TD` consts). Statement is the second parent-id-style fetch (customer
      id + list fetch) — the registry's `fetch(id, query)` contract already
      covers it.
- [ ] **No new backend endpoints, no new dependencies.** Consumes existing
      `GET /api/bom/:id` and `GET /api/ar-invoices?customerId=` +
      `GET /api/customers/:id`.
- [ ] Print view = sanctioned light-on-white exception; DESIGN-SYSTEM rules
      otherwise apply.

### UX integration
- [ ] `PrintButton` wired into two surfaces: the BOM page (row/detail,
      `doc="bom"`) and the customers page (row/detail,
      `doc="customer-statement"`).
- [ ] One click from page to printable document (ux-reviewer pass,
      friction ≤ 2).

## Out of scope

- Statement date-range filtering (`?from/?to`) — the AR list endpoint supports
  it; add when a client asks. The v1 statement is always "all open history".
- Emailing statements (notifications composition, future).
- AP supplier statement (mirror; add on demand).
- Batch printing all statements; DGII e-CF — unchanged.
- BOM cost rollup on the recipe card (costing infra is a future spec; the
  card shows quantities, not costs).

## Data model

No changes.

## API contracts

No new endpoints. Consumes (existing, verified live 2026-06-07):

- `GET /api/bom/:id` — `parentItem`, `components` (+ `consumptionGroup`
  code/name, quantityPer, scrapPercent, uom, isPhantom), `routings`
  (stepNumber, description, setupTime, runTimePerUnit, isActive).
- `GET /api/ar-invoices?customerId=<uuid>` — spec-026 envelope; per-invoice
  invoiceNumber/invoiceDate/dueDate/status/totalAmount/paidAmount/currency.
- `GET /api/customers/:id` — name, code, email.

## Implementation notes

| File | Change |
|---|---|
| `frontend/components/print/documents.tsx` | +2 `PRINT_DOCS` entries: `bom`, `customer-statement` |
| `frontend/app/manufacturing/boms/page.tsx` (actual BOM list page) | `PrintButton` wiring |
| `frontend/app/sales/customers/page.tsx` | `PrintButton` wiring |

Notes:
- Two BOM pages exist (`/manufacturing/bom` and `/manufacturing/boms`) — wire
  the one that is the real list surface; check at implementation time.
- Statement fetch composes two calls (`customersApi.getById` +
  `arInvoicesApi.getAll({ customerId })`) inside the registry's `fetch` —
  return `{ customer, invoices }`.
- Aging buckets at render time use the same day-boundaries as the AR aging
  endpoint (Current/1–30/31–60/61–90/90+) for consistency with the in-app
  aging report.

## Verification checklist

```bash
# 1. Recipe card: components show group code+name per-unit quantities + scrap;
#    phantom excluded; routing section renders for a BOM with routings and is
#    absent for one without.
# 2. Statement: non-void invoices only, sorted by date; balance = total−paid;
#    totals row sums; aging buckets match days-past-due; customer with no
#    invoices → explicit empty state.
# 3. Mixed-currency customer → totals/aging grouped per currency (no silent
#    cross-currency sum). Single-currency customer → one block.
# 4. Both: light-on-white, tenant header, page X of Y.
# 5. cd frontend && pnpm build       # zero new deps
# 6. ux-reviewer on both flows → friction ≤ 2
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-07 | Spec drafted (round-4 printing; shapes verified live: bom getById includes components+groups+routings; ar-invoices ?customerId= filter works — BURGER customer probe returned 2 invoices) | Draft |
| 2026-06-07 | Implemented: 2 PRINT_DOCS entries (bom / customer-statement). Recipe card: phantom excluded, routing section conditional. Statement: composed fetch (customer + invoices), non-void sorted ascending, per-currency totals AND per-currency aging blocks (Current/1-30/31-60/61-90/90+ computed from dueDate at render), explicit empty state. PrintButton wired: boms detail-panel tab bar ("Recipe Card"), customers row actions ("Statement"). `/manufacturing/boms` confirmed as the real surface (ERPShell nav target). | tsc clean; prod `pnpm build` PASSES; both print routes + 2 wired pages dev-compile 200 with live BURGER data |
| 2026-06-07 | Visual verification by user (both documents reviewed in browser, approved). Ship gates: compliance 100% (file:line audited); frontend-only — tsc clean, prod build PASS, both routes + 2 pages dev-compile 200 with live data; lint = established `any` idiom, no new error types. Shipped to origin (4f2622f); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
