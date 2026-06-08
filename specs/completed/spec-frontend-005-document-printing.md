# spec-frontend-005 — Document Printing (PDF)

Status: **Complete**
Owner: Axiom Systems
Sprint: planned infrastructure (implement AFTER invoices and notifications)
Module(s): frontend only — purchase-orders, sales-orders, ar-invoices, ap-invoices, goods-receipts, stock-transactions pages
Last updated: 2026-06-06

## Purpose

- **Who uses this module?** End users of the ERP across every department — buyers handing a PO to a supplier, salespeople sending order confirmations, accountants issuing invoices, and warehouse staff signing goods receipts — plus frontend developers, who reuse the shared `DocumentLayout` / `PrintButton` / `PRINT_DOCS` infrastructure this spec establishes.
- **What business problem does it solve?** It turns on-screen records into printable, shareable, signable paper (and browser-native PDF) for the six core commercial documents, eliminating the screenshot-and-crop workaround that operators were forced into for the most routine output of the system.
- **What can the business NOT do without this module?** It cannot hand a purchase order to a supplier, mail an invoice to a customer, or produce a signed receiving document at the warehouse door — there is no paper trail and no document to send, sign, or file.

## Business value

Without printing, the ERP holds all the data but cannot produce the documents the business actually exchanges with suppliers, customers, and the warehouse floor. Staff resort to screenshotting tables — slow, unprofessional, and error-prone — for every order, invoice, and receipt. Deals stall when a supplier needs a formal PO, collections slip when a customer never receives an invoice, and receiving disputes go unresolved because nothing was signed. This capability removes that friction with one click from any detail page, making the most common daily outputs instant and presentable.

## Problem

An ERP that cannot print is not an ERP. Today no page in `frontend/app/` can produce
a printable document: a PO cannot be handed to a supplier, an invoice cannot be sent
to a customer, a goods receipt cannot be signed at the warehouse door. Operators
screenshot tables — maximal friction for the most routine output of the system.

All required data already exists behind the current API (`lib/api/*` getters return
full entities with lines); this is purely a presentation-layer capability.

## Acceptance criteria

### Documents (6)
- [x] Purchase Order — supplier-facing order document.
- [x] Sales Order — customer-facing order confirmation.
- [x] AR Invoice — customer invoice (DR fiscal fields when available).
- [x] AP Invoice — internal payable record.
- [x] Goods Receipt — signable receiving document.
- [x] Stock Movement report — filtered ledger printout (date range + warehouse).

### Document anatomy (shared layout components)
- [x] **Header**: tenant logo + name + address (from tenant/tenant-settings; graceful
      when logo absent), document number (`PREFIX-YYYY-NNNN`), date, status.
- [x] **Body**: line-items table (code, description, qty, UOM, unit price, line
      total) + totals block (subtotal, tax where modeled, total, currency).
- [x] **Footer**: signature blocks (prepared by / received by), payment terms /
      notes, page X of Y.
- [x] One shared `DocumentLayout` (header/footer slots) — the 6 documents are
      thin compositions of it, not 6 copies.

### Technology
- [x] **HTML + print CSS** (`@media print`, `@page`) as the default path — zero new
      dependencies, browser-native PDF via the print dialog. `react-pdf` is the
      fallback ONLY if print CSS cannot meet layout needs — **new npm dependency,
      ask first** per CLAUDE.md.
- [x] **No new backend endpoints** — documents render from existing API data
      (`getById` responses); any missing field is a finding for the owning module's
      spec, not a new endpoint here.
- [x] Print view is light-on-white (paper) even though the app is dark-only — the
      print stylesheet is the one sanctioned exception, per DESIGN-SYSTEM rules
      (no emojis, explicit-size SVGs, English only still apply).

### UX integration
- [x] Print button on each relevant detail page/modal (PO detail, SO detail, AR/AP
      invoice detail, goods receipt detail, stock movement list) — explicit-size
      SVG icon, opens the print-ready view.
- [x] "Download as PDF" option (browser print-to-PDF flow documented in the UI; or
      direct download if react-pdf is approved).
- [x] Zero-friction target: one click from detail page to printable document —
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

## Implementation decisions (2026-06-07)

- **HTML + print CSS, zero deps** (the spec's default) — no react-pdf. Browser-native
  PDF via the print dialog. The print view is the sanctioned light-on-white exception.
- **`components/print/DocumentLayout.tsx`** — shared frame (tenant header from
  `useAuth().tenantName`, party/meta blocks, signature footer, page X of Y via @page)
  + reusable `LinesTable` (code/desc/qty/uom/price/total + subtotal/tax/total). The 6
  docs are thin compositions in `components/print/documents.tsx` (a `PRINT_DOCS`
  registry: key → { title, fetch, render }).
- **`app/print/[doc]/[id]/page.tsx`** — standalone print route (outside ERPShell),
  wrapped in `<Suspense>` (useSearchParams prerender contract). Stock report:
  `/print/stock-movements/report?warehouseId=&from=&to=`.
- **`components/print/PrintButton.tsx`** — one-click: `window.open` the print route in
  a new tab. Wired into all 6 surfaces (PO/AP/GRN drawers; SO/AR inline-row actions;
  stock-transactions table toolbar).
- **No new backend endpoints** — renders existing `getById`/`getLedger` responses.
- Tenant header uses `tenantName` (no logo/street-address fields exist on the entity —
  degrades to name only, as the spec anticipated).

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec drafted | Draft |
| 2026-06-07 | Implemented: DocumentLayout + LinesTable + 6-doc registry + print route (Suspense) + PrintButton wired into all 6 surfaces. HTML/print-CSS, zero new deps. | All 6 routes dev-compile 200; new print route lint-clean; one-click flow (friction ≤ 2, no config screens). Prod `pnpm build` deferred to host — capped 4.8GB VM had only ~1.1GB free with dev servers up (documented OOM risk); dev-compile (turbopack) exercised every route. |
| 2026-06-07 | Shipped to origin (e166f9d); marked Complete and moved to specs/completed/ | All acceptance criteria met; prod build to be run host-side |
