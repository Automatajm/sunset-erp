# spec-frontend-005 — Document Printing (PDF)

Status: **Draft**
Owner: Axiom Systems
Sprint: planned infrastructure (implement AFTER invoices and notifications)
Module(s): frontend only — purchase-orders, sales-orders, ar-invoices, ap-invoices, goods-receipts, stock-transactions pages
Last updated: 2026-06-06

## Problem

An ERP that cannot print is not an ERP. Today no page in `frontend/app/` can produce
a printable document: a PO cannot be handed to a supplier, an invoice cannot be sent
to a customer, a goods receipt cannot be signed at the warehouse door. Operators
screenshot tables — maximal friction for the most routine output of the system.

All required data already exists behind the current API (`lib/api/*` getters return
full entities with lines); this is purely a presentation-layer capability.

## Acceptance criteria

### Documents (6)
- [ ] Purchase Order — supplier-facing order document.
- [ ] Sales Order — customer-facing order confirmation.
- [ ] AR Invoice — customer invoice (DR fiscal fields when available).
- [ ] AP Invoice — internal payable record.
- [ ] Goods Receipt — signable receiving document.
- [ ] Stock Movement report — filtered ledger printout (date range + warehouse).

### Document anatomy (shared layout components)
- [ ] **Header**: tenant logo + name + address (from tenant/tenant-settings; graceful
      when logo absent), document number (`PREFIX-YYYY-NNNN`), date, status.
- [ ] **Body**: line-items table (code, description, qty, UOM, unit price, line
      total) + totals block (subtotal, tax where modeled, total, currency).
- [ ] **Footer**: signature blocks (prepared by / received by), payment terms /
      notes, page X of Y.
- [ ] One shared `DocumentLayout` (header/footer slots) — the 6 documents are
      thin compositions of it, not 6 copies.

### Technology
- [ ] **HTML + print CSS** (`@media print`, `@page`) as the default path — zero new
      dependencies, browser-native PDF via the print dialog. `react-pdf` is the
      fallback ONLY if print CSS cannot meet layout needs — **new npm dependency,
      ask first** per CLAUDE.md.
- [ ] **No new backend endpoints** — documents render from existing API data
      (`getById` responses); any missing field is a finding for the owning module's
      spec, not a new endpoint here.
- [ ] Print view is light-on-white (paper) even though the app is dark-only — the
      print stylesheet is the one sanctioned exception, per DESIGN-SYSTEM rules
      (no emojis, explicit-size SVGs, English only still apply).

### UX integration
- [ ] Print button on each relevant detail page/modal (PO detail, SO detail, AR/AP
      invoice detail, goods receipt detail, stock movement list) — explicit-size
      SVG icon, opens the print-ready view.
- [ ] "Download as PDF" option (browser print-to-PDF flow documented in the UI; or
      direct download if react-pdf is approved).
- [ ] Zero-friction target: one click from detail page to printable document —
      no configuration screens (ux-reviewer pass required, friction ≤ 2).

## Out of scope

- Email-attaching the PDFs (that is spec-022 notifications + a future composition).
- Custom template designer / per-tenant layout editing.
- DGII fiscal e-invoice (e-CF) compliance — separate, regulation-driven spec.
- Batch printing.

## Data model

No changes. Renders existing API responses. Tenant logo/address fields are read
from the existing tenant entity; absent values degrade gracefully.

## API contracts

No new endpoints. Consumes (existing): `GET /api/purchase-orders/:id`,
`GET /api/sales-orders/:id`, `GET /api/ar-invoices/:id`, `GET /api/ap-invoices/:id`,
`GET /api/goods-receipts/:id`, `GET /api/stock-transactions?...`.

## Implementation notes

| File | Change |
|---|---|
| `frontend/components/print/DocumentLayout.tsx` | Shared header/body/footer frame + print CSS |
| `frontend/components/print/<Doc>Document.tsx` ×6 | Thin per-document compositions |
| `frontend/app/**/page.tsx` (6 pages) | Print button wiring (ERPShell pages, existing primitives) |
| `frontend/app/print/[doc]/[id]/page.tsx` (or modal route) | Print-ready route |

Dependencies: spec-021 (currency display on monetary documents) and ar/ap-invoice
modules must exist for 3 of the 6 documents. **This spec is DRAFT — implement after
invoices and notifications are complete.**

## Verification checklist

```bash
# 1. PO detail → Print → browser preview shows header/lines/footer, paginated
# 2. Logo missing → header renders name/address only, no broken image
# 3. 40-line document → table breaks across pages with repeated column header
# 4. Print stylesheet: white background, black text, no nav/sidebar/buttons
# 5. cd frontend && pnpm build   # no new deps unless react-pdf was approved
# 6. ux-reviewer on the print flow → friction ≤ 2
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec drafted (planned infrastructure; no printing capability exists in any page) | Draft — implement after invoices + notifications |
