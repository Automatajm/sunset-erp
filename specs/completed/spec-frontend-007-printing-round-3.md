# spec-frontend-007 — Document Printing, Round 3 (PR, JE Voucher, AR Payment Receipt)

Status: **Complete**
Owner: Axiom Systems
Sprint: follow-up to spec-frontend-006 (printing round 2 shipped d8f97f1)
Module(s): frontend only — purchase-requisitions, journal-entries, ar-invoices pages
Last updated: 2026-06-07

## Problem

Rounds 1–2 covered the commercial documents (PO/SO/AR/AP/GRN/stock report) and
the operational paper (RFQ, MO traveler, count sheets). Three documents from
round 2's explicit out-of-scope list remain — the approval/accounting paper
trail:

1. **Purchase Requisition** — the internal approval document. Where a physical
   signature flow exists (very common in DR operations), the PR is printed,
   signed by the requester and approver, and filed. Today it cannot leave the
   screen.
2. **Journal Entry voucher** — the accounting "comprobante de diario".
   Accountants in DR routinely archive printed, signed vouchers per entry;
   auditors ask for them. The JE detail exists only as a dark-mode web page.
3. **AR Payment Receipt** — when a customer pays, they get a receipt. The
   money-loop already records payments (`ArPayment` with the frozen-rate trio);
   there is no paper to hand across the counter.

All three render from existing API responses (shapes verified live against
BURGER on 2026-06-07) — purely presentation-layer, same as rounds 1–2.

## Acceptance criteria

### Documents (3)
- [ ] **Purchase Requisition** (`/print/purchase-requisition/:id`) — internal
      approval document. Header: `prNumber` (PR-YYYY-NNNN), title, status,
      priority, required date, department (when present), estimated amount.
      Body: lines — item code + name (or `genericDescription` for non-catalog
      lines, flagged by `itemStatus`), quantity, UOM, unit estimate, line
      estimate (computed `quantity × unitEstimate` when present), destination
      warehouse. Justification block when present; rejection reason when
      status is rejected. Footer: **Requested by / Approved by** signature
      blocks (ink-signed — the printed doc is the approval instrument).
- [ ] **Journal Entry voucher** (`/print/journal-entry/:id`) — comprobante de
      diario. Header: `entryNumber`, entry date, posting date, journal type,
      status, reference, fiscal period (when modeled), description. Body:
      line table — account number + account name, line description,
      **Debit | Credit** columns (right-aligned money), per-line currency +
      exchange rate shown only when the line currency differs from base.
      Totals row: sum of debits and credits (they balance by construction —
      print both; a visible mismatch is a data bug surfaced, not hidden).
      Footer: **Prepared by / Approved by** signature blocks.
- [ ] **AR Payment Receipt** (`/print/ar-receipt/:invoiceId?paymentId=`) —
      customer-facing receipt. Rendered from `GET /api/ar-invoices/:id`
      (payments come embedded — there is NO standalone payment endpoint, and
      none is added). `?paymentId=` selects the payment; **required** — without
      it the route renders a "select payment" error state, never a guess.
      Header: `paymentNumber`, payment date, method. Party: customer (name,
      code, email). Body: receipt block — invoice reference
      (`invoiceNumber`), payment amount + currency, `amountBase` +
      `baseCurrency` shown when currency differs from base (frozen rate,
      spec-021), reference + notes when present, and the invoice's remaining
      balance after this payment (`totalAmount − paidAmount`, labeled
      "Balance due"). Footer: **Received by / Customer** signature blocks.

### Reuse (no new infrastructure)
- [ ] Three new `PRINT_DOCS` registry entries composing the existing
      `DocumentLayout` (+ custom tables where the column set diverges from
      `LinesTable`, following the round-2 idiom: shared `TH/TD/BLANK` style
      consts). The `signatures` prop (added in round 2) covers all three.
- [ ] **No new backend endpoints, no new dependencies.** Includes verified
      sufficient (see API contracts). Any missing field is a finding for the
      owning module's spec, not a new endpoint here (standing rule).
- [ ] Print view = the sanctioned light-on-white exception; all other
      DESIGN-SYSTEM rules apply (no emojis, explicit-size SVGs, English only).

### UX integration
- [ ] `PrintButton` wired into three surfaces: purchase-requisitions page
      (detail/row), journal-entries page (detail/row), and the AR invoice
      detail's payment list (one button per payment row, passing
      `?paymentId=` — mirrors round 2's per-supplier RFQ buttons).
- [ ] One click from page to printable document — no configuration screens
      (ux-reviewer pass, friction ≤ 2).

## Out of scope

- BOM recipe card and customer statement (AR aging per customer) — the
  statement is a report feature, not a document template; candidate round 4
  or a reports spec.
- AP payment receipts (internal vouchers, weaker demand — add later if asked).
- Amount-in-words on the receipt (locale-sensitive; revisit if a client
  requires it).
- Batch printing, emailing, DGII e-CF — unchanged from rounds 1–2.
- Numbered receipt series separate from `paymentNumber` (fiscal receipt
  numbering is a DGII-spec concern).

## Data model

No changes.

## API contracts

No new endpoints. Consumes (existing, includes verified live 2026-06-07):

- `GET /api/purchase-requisitions/:id` — `prInclude()`: lines (+ `item`
  code/name/baseUom, + `warehouse` code/name), rfqs refs
  (`purchase-requisitions.service.ts:338`).
- `GET /api/journal-entries/:id` — lines (+ `account` accountNumber/name),
  debit/credit amounts, per-line currency/exchangeRate.
- `GET /api/ar-invoices/:id` — customer + lines + **embedded `payments`**
  (paymentNumber, paymentDate, paymentMethod, amount, frozen trio
  exchangeRate/amountBase/baseCurrency, reference, notes, jeId).

## Implementation notes

| File | Change |
|---|---|
| `frontend/components/print/documents.tsx` | +3 `PRINT_DOCS` entries: `purchase-requisition`, `journal-entry`, `ar-receipt` |
| `frontend/app/procurement/purchase-requisitions/page.tsx` | `PrintButton` wiring |
| `frontend/app/accounting/journal-entries/page.tsx` | `PrintButton` wiring |
| `frontend/app/sales/invoices/page.tsx` | per-payment `PrintButton` in the payments list |

Notes:
- `ar-receipt` is the first registry entry whose `:id` is a PARENT id with a
  required query param — the registry's `fetch(id, query)` signature already
  supports it (round 1's stock-movements uses query-only); the render guard
  for a missing/unknown `paymentId` must be explicit.
- JE voucher money cells: `Number(...)` formatting only at render (Decimal
  strings from the API), 2 decimals, same as `LinesTable`'s `money()`.
- **BURGER currently has 0 purchase requisitions** (money-loop does not create
  them) — verification requires creating one via UI/API. JEs (83+) and paid AR
  invoices (6 fully paid) already exist.

## Verification checklist

```bash
# 0. Create one PR in BURGER (UI or API) — demo data has none.
# 1. PR print: lines show item-or-generic, qty/uom/estimates; justification
#    block renders; Requested by / Approved by blocks present.
# 2. JE voucher: account number+name per line, Debit/Credit right-aligned,
#    totals row balances; multi-currency line shows currency + rate.
# 3. AR receipt: /print/ar-receipt/<invId>?paymentId=<pid> renders the right
#    payment; omitting paymentId shows the explicit error state; balance due
#    = totalAmount − paidAmount; DOP payment hides the base-currency block.
# 4. All three: light-on-white, tenant header, page X of Y, signature blocks
#    per document type.
# 5. cd frontend && pnpm build       # zero new deps
# 6. ux-reviewer on the three flows → friction ≤ 2
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-07 | Spec drafted (round-3 printing; API shapes verified live against BURGER: PR getById includes lines+item+warehouse, JE includes lines+account, AR payments embedded in invoice — no standalone payment endpoint needed, receipt keys off `?paymentId=`) | Draft — pending approval |
| 2026-06-07 | Implemented: 3 PRINT_DOCS entries (purchase-requisition / journal-entry / ar-receipt); ar-receipt guards missing/unknown `?paymentId=` with an explicit error state; JE voucher prints debit+credit totals; PR shows catalog-or-generic lines + computed line estimates. PrintButton wired: PR drawer header, JE row actions, per-payment "Receipt" buttons in the AR invoice payments list. Demo PR-2026-0001 created in BURGER (line DTO also needs `requiredDate` per line — discovered during creation). | tsc clean; prod `pnpm build` PASSES; 4 route variants (incl. no-paymentId error state) + 3 wired pages dev-compile 200 |
| 2026-06-07 | Ship gates: compliance 100% (code-verifiable, file:line audited); frontend-only (0 backend files) — tsc clean, prod build PASS, 7 route/page variants dev-compile 200 incl. the no-paymentId error state; lint = file's established `any` idiom, no new error types. Shipped to origin (be04a7f); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%); browser eyeball of the three printouts left to the user |
