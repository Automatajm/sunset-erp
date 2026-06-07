# spec-025 — AP Invoices (Accounts Payable)

Status: **Draft**  
Owner: Finance  
Sprint: AR/AP invoices (first consumer of spec-021 multi-currency)  
Module(s): `ap-invoices` (injects `currency` per the frozen-rate gate; touches
`frontend/lib/api/ap-invoices.ts` for the list envelope)  
Last updated: 2026-06-06  

---

## Problem

AP Invoices closes the procurement money loop: invoices are created manually or
from a PO, optionally 3-way matched against a GRN (2% price tolerance), posted to
the GL through the Automation engine (DR inventory/expense + price variance / CR
`2.1.01` AP), paid (DR AP / CR `1.1.02` Cash) with aging and KPI reporting, and
voided with a reversal JE. It is the **first monetary module specced after
spec-021**, so it must be the first adopter of the binding frozen-rate pattern.

The audit (opportunity-finder, 2026-06-06, score 98 — highest in the pipeline)
found:

1. **Frozen-rate pattern absent** — `ApInvoice`/`ApPayment` have `currency` but
   no `exchangeRate`/`amountBase`/`baseCurrency`; the code hardcodes
   `currency ?? 'USD'` (`service:101,179`) while the tenant base is DOP. Without
   `amountBase`, AP aging/KPIs silently sum mixed currencies.
2. **Cross-tenant read feeding the GL** — `purchaseOrderLine.findFirst` omits
   `tenantId` + `deletedAt` (`service:51-52`); a cross-tenant `poLineId` seeds
   `originalPoPrice` → `priceVariance` → a JE line derived from another tenant's
   price. `journalEntry.findFirst` in the void reversal (`:854`) is also
   unscoped.
3. **Posting swallows stock failures** — `post()` wraps
   `stockService.receiveFromApInvoice` in try/`console.error` (`:264-278`): the
   invoice posts and the JE lands even when the stock receipt fails — ledger and
   inventory silently diverge.
4. **Money in JS floats** — `unitPrice * quantity` subtotals (`:58-63`) and
   `±0.001` epsilon comparisons (`:326`, `:352`) instead of `Decimal`.
5. **Void of a partially paid invoice** (`:296-300`) reverses the invoice JE but
   leaves payments (and their JEs) standing — inconsistent ledger state.
6. **Fragile generators ×3** — `APINV-`/`APPAY-`/`JE-` use `findFirst + orderBy`
   string sort (`:912-944`); no `P2002 → 409` despite real uniques on
   `[tenantId, invoiceNumber]` and `[tenantId, paymentNumber]`.
7. **Weak DTOs** — `currency` free string, `lines` accepts `[]`,
   `discountPercent` unbounded (>100% → negative totals), no `@Max` caps,
   `paymentMethod` enum documented but not enforced, `linkGrn` takes a raw
   `@Body('grnId')` with no DTO, `findAll` query params unvalidated.
8. **Bare-array list** — `findAll` returns an array, not `{ apInvoices, count }`
   (frontend `extractList` only knows `value`).
9. **Missing Swagger** — 6 of 14 handlers lack `@ApiResponse`.
10. Nine id-only writes (`:236,:280,:304,:354,:480,:514,:523,:547,:552`) violate
    the pre-approved scoped-`updateMany` pattern.

This spec adopts the frozen-rate pattern (one additive migration), closes the
scoping and correctness gaps, and preserves the 3-way-match engine as-is.

---

## Acceptance criteria

### Endpoints (existing behavior preserved)
- [x] `POST /api/ap-invoices` — manual draft invoice with computed line totals,
      discounts, and `priceVariance` vs the PO line price.
- [x] `POST /api/ap-invoices/from-po/:poId` — drafts an invoice from a
      `confirmed | received | partial` PO (`400` otherwise); `400` when a
      non-void invoice already exists for the PO.
- [x] `GET /api/ap-invoices?status=&supplierId=&from=&to=` — filtered list.
- [x] `GET /api/ap-invoices/aging` — Current / 1-30 / 31-60 / 90+ buckets with
      per-bucket counts, amounts, and detail rows.
- [x] `GET /api/ap-invoices/kpis` — totalInvoiced/Paid/Pending/Overdue + paymentRate.
- [x] `GET /api/ap-invoices/:id` — detail with lines, payments, supplier, PO, GRN.
- [x] `GET /api/ap-invoices/:id/match-status` — per-line 3-way analysis
      (PO qty / GRN qty / 2% price tolerance), `matchStatus` ∈
      `no_match | two_way | three_way_matched | three_way_failed`, `canPost`.
- [x] `PATCH /api/ap-invoices/:id` — draft only; `dueDate`/`supplierRef`/`notes`.
- [x] `PATCH /api/ap-invoices/:id/post` — draft → posted; validates 3-way match
      when a GRN is linked; creates the AP JE; fiscal-period guard
      (`assertPeriodOpen`, `400` on closed/locked).
- [x] `PATCH /api/ap-invoices/:id/void` — reversal JE when posted.
- [x] `POST /api/ap-invoices/:id/payments` — payment + JE, over-payment `400`,
      rolls status `posted → partial → paid`.
- [x] `POST /api/ap-invoices/:id/link-grn` + `/unlink-grn` — draft only;
      auto-matches lines by `poLineId`; cross-PO GRN rejected (`400`).
- [x] `DELETE /api/ap-invoices/:id` — soft delete, draft only.

### Frozen-rate pattern (spec-021 gate — first consumer adoption)
- [x] Additive migration: `ApInvoice` and `ApPayment` gain
      `exchangeRate Decimal(18,6) @default(1)`, `amountBase Decimal(15,2) @default(0)`,
      `baseCurrency VARCHAR(3) @default("DOP")` (existing rows: rate 1, base =
      current amount — backfilled in the migration for the empty/dev tables).
- [x] `ApInvoicesModule` imports `CurrencyModule`; the service injects
      `CurrencyService`. No direct `mc_exchange_rates` queries.
- [x] `create`/`createFromPo`: `currency` defaults to
      `CurrencyService.getBaseCurrency(tenantId)` (NOT `'USD'`);
      `exchangeRate = getRate(tenantId, currency, baseCurrency, invoiceDate)`
      frozen at creation (identity pair → 1); `amountBase = totalAmount × rate`
      (Decimal, 2dp). Missing rate for a foreign currency → `404` with the
      actionable CurrencyService message.
- [x] `applyPayment`: the payment freezes its OWN rate at `paymentDate`
      (`payment.exchangeRate`, `payment.amountBase`, `payment.baseCurrency`).
- [x] The invoice rate is never re-read after creation (amounts are immutable
      after create — `update` only touches dueDate/supplierRef/notes — so
      `amountBase` never changes post-create).
- [x] Aging and KPIs report `amountBase` sums alongside the existing
      transaction-currency figures (`outstandingBase`, `totalInvoicedBase`, …).

### Tenant scoping & write pattern
- [x] `purchaseOrderLine.findFirst` (`create`, `:51`) includes `tenantId` +
      `deletedAt: null` — a cross-tenant `poLineId` is a `404`.
- [x] `journalEntry.findFirst` (`createReversalJe`, `:854`) includes `tenantId`.
- [x] The nine id-only writes migrate to
      `updateMany({ where: { id, tenantId, deletedAt: null } })` + refetch where a
      body is returned (`update`, `post`, `void`, `applyPayment`, `remove`,
      `linkGrn` ×2, `unlinkGrn`); `apInvoiceLine.updateMany` (`:547`) adds `tenantId`.
- [x] All other reads scoped (`findAll`, `findOne`, `getMatchStatus`, aging,
      KPIs, supplier/PO/item/GRN validation, account lookups, fiscal period).

### Posting integrity
- [x] `post()` no longer swallows `receiveFromApInvoice` errors: a stock-receipt
      failure aborts the post with `400` (message includes the cause) BEFORE the
      status flips — ledger and stock never diverge silently. *(Policy: fail the
      post; service-only invoices with no item lines do not hit the stock path.)*
- [x] `void` requires `paidAmount = 0` — voiding a `partial` invoice is `409`
      ("reverse payments first"); `paid` stays blocked; `draft` void allowed
      (no JE to reverse).

### Decimal-safe money
- [x] Line totals, discounts, variance, subtotal computed with `Decimal`
      (`mul`/`sub`/`toDecimalPlaces(2)`) — no float arithmetic.
- [x] Payment comparisons use Decimal (`gt`/`gte`) — the `±0.001` epsilons are
      removed; over-payment check is exact at 2dp.

### Document number generation
- [x] `generateInvoiceNumber` (`APINV-<year>-NNNN`), `generatePaymentNumber`
      (`APPAY-<year>-NNNN`), `generateJeNumber` (`JE-<YYYYMM>-NNNN`) migrate to
      the numeric-max pattern.
- [x] `P2002 → 409 ConflictException` with retry message on invoice create,
      from-po create, and payment create.

### DTO validation
- [x] `currency` gets `@Length(3, 3)`; the service validates it against the
      `mc_currencies` catalog (`404` unknown code).
- [x] `lines` gets `@ArrayMinSize(1)`.
- [x] `discountPercent` gets `@Max(100)`.
- [x] `@Max` caps per column capacity: `quantity` `@Max(99999999999)`
      (`Decimal(15,3)`), `unitPrice` `@Max(9999999999)` (`Decimal(15,4)`),
      payment `amount` `@Max(999999999999)` (`Decimal(15,2)`).
- [x] `paymentMethod` gets `@IsIn(['wire', 'ach', 'check', 'transfer', 'cash'])`.
- [x] `linkGrn` binds a `LinkGrnDto { @IsUUID() grnId }` (no raw `@Body('grnId')`).
- [x] `GET /` query DTO: `status` `@IsIn(['draft', 'posted', 'partial', 'paid', 'void'])`,
      `supplierId` `@IsUUID`, `from`/`to` `@IsDateString` — bad value `400`.
- [x] Existing validation preserved: `@IsUUID` ids, `@IsDateString` dates,
      `@Min` floors, nested `@ValidateNested` lines, account-override UUIDs.

### Response format
- [x] `GET /api/ap-invoices` returns `{ apInvoices: [...], count: n }`.
- [x] `frontend-sync` sweep: `frontend/lib/api/ap-invoices.ts` `extractList`
      unwraps `apInvoices` (today it only knows `value` — the envelope would
      silently return `[]`).

### RBAC
- [x] Guards + permissions on all 14 handlers: `AP:CREATE`, `AP:VIEW`, `AP:EDIT`,
      `AP:APPROVE` (post/void), `AP:PAYMENT`, `AP:DELETE` — all seeded.

### Error handling
- [x] `404` supplier/PO/item/PO-line/invoice/GRN not found; `400` wrong status
      for edit/post/void/pay/link, over-payment, cross-PO GRN, 3-way-match
      failure (with per-line issues), fiscal period closed, missing GL accounts
      (`2.1.01`, `1.1.04` fallback, `1.1.02`).
- [x] `409` on number collisions and on void-with-payments (see above).

### Swagger
- [x] `@ApiResponse` added to the 6 handlers missing it: `findAll`, `aging`,
      `kpis`, `findOne`, `void`, `remove`.
- [x] All 14 handlers have `@ApiOperation`; bearer + tags set.

---

## Out of scope

- `ar-invoices` (mirror module — its own spec adopts the same pattern next).
- Payment reversal / refund endpoints (void-with-payments stays blocked until then).
- Tax calculation (`taxAmount` stays 0 on manual creates; copied from PO on from-po).
- Retrofitting frozen-rate onto `PurchaseOrder`/`SalesOrder`/`JournalEntryLine`
  (each module's own spec, per spec-021).
- Multi-currency GL (JE lines stay in transaction currency; `amountBase` lives on
  the invoice/payment headers).
- Changing the 2% price tolerance or the 3-way match algorithm.
- Editing posted invoices, credit notes, recurring invoices.
- The per-PO duplicate-invoice TOCTOU race (single non-void invoice per PO is
  enforced by check; `@@unique([tenantId, invoiceNumber])` is the hard backstop).

---

## Data model

**One additive migration** (frozen-rate adoption; everything else preserved):

```prisma
// ApInvoice — add after `currency`:
exchangeRate Decimal @default(1) @map("exchange_rate") @db.Decimal(18, 6)
amountBase   Decimal @default(0) @map("amount_base") @db.Decimal(15, 2)
baseCurrency String  @default("DOP") @map("base_currency") @db.VarChar(3)

// ApPayment — add after `amount`:
exchangeRate Decimal @default(1) @map("exchange_rate") @db.Decimal(18, 6)
amountBase   Decimal @default(0) @map("amount_base") @db.Decimal(15, 2)
baseCurrency String  @default("DOP") @map("base_currency") @db.VarChar(3)
```

Reference:

| Model | Table | Key fields |
|---|---|---|
| `ApInvoice` | `ap_invoices` | `tenantId`, `invoiceNumber` (`@@unique([tenantId, invoiceNumber])`), `supplierId`, `poId?`, `grnId?`, `jeId?`, dates, `status` (`draft/posted/partial/paid/void`), `subtotal/taxAmount/totalAmount/paidAmount Decimal(15,2)`, `currency`, + frozen-rate trio (new), audit + soft delete |
| `ApInvoiceLine` | `ap_invoice_lines` | `quantity Decimal(15,3)`, `unitPrice/originalPoPrice Decimal(15,4)`, `discountPercent Decimal(5,2)`, `lineTotal/priceVariance Decimal(15,2)`, `poLineId?`, `grnLineId?`, account overrides |
| `ApPayment` | `ap_payments` | `paymentNumber` (`@@unique([tenantId, paymentNumber])`), `amount Decimal(15,2)`, `paymentMethod?`, `jeId?`, + frozen-rate trio (new), audit + soft delete |

Key invariants:
- Status flow: `draft → posted → partial → paid`; `void` reachable from
  `draft`/`posted` (and `partial` only once payment reversal exists — blocked here).
- `paidAmount` is the only mutable monetary field after posting; `amountBase` is
  frozen at creation (rate never re-read).
- GL accounts by number: AP `2.1.01`, default inventory DR `1.1.04`, price
  variance `5.2.01`, cash `1.1.02`. JE side effects via `AutomationService.handleAutoJe`.

---

## API contracts

All routes prefixed `/api`, JWT-guarded. Statuses: `draft | posted | partial | paid | void`.

### POST /api/ap-invoices *(AP:CREATE)*
```json
// Request
{
  "supplierId": "<uuid>", "poId": "<uuid, optional>",
  "invoiceDate": "2026-06-06", "dueDate": "2026-07-06",
  "supplierRef": "SUP-INV-0042",
  "currency": "USD",            // optional; defaults to TenantSettings.baseCurrency
  "lines": [                     // min 1
    { "itemId": "<uuid>", "description": "MDF 18mm", "quantity": 50, "uom": "sheets",
      "unitPrice": 28.5, "discountPercent": 0, "poLineId": "<uuid, optional>",
      "inventoryAccountId": "<uuid, optional>", "expenseAccountId": "<uuid, optional>" }
  ]
}

// Response 201 — draft invoice with frozen-rate fields
{ "id": "...", "invoiceNumber": "APINV-2026-0001", "status": "draft",
  "currency": "USD", "exchangeRate": "59.5", "amountBase": "84787.5", "baseCurrency": "DOP",
  "subtotal": "1425", "totalAmount": "1425", "lines": [ ... ] }

// Errors: 404 supplier/PO/item/PO-line/currency/rate not found |
//         400 validation (empty lines, discount > 100, caps) | 409 number collision
```

### POST /api/ap-invoices/from-po/:poId *(AP:CREATE)*
```json
// Response 201 — same shape; totals copied from the PO; currency = PO currency
// (rate frozen at today's date); due in 30 days
// Errors: 404 PO | 400 PO status not confirmed/received/partial | 400 invoice exists
```

### GET /api/ap-invoices?status=&supplierId=&from=&to= *(AP:VIEW)*
```json
// Response 200 — envelope (NEW; was a bare array)
{ "apInvoices": [ { "id": "...", "invoiceNumber": "...", "status": "...",
  "supplier": { "...": "..." }, "purchaseOrder": { "...": "..." },
  "goodsReceipt": { "...": "..." }, "_count": { "lines": 2, "payments": 1 } } ],
  "count": 4 }
// Errors: 400 status/supplierId/from/to outside the whitelists
```

### GET /api/ap-invoices/aging *(AP:VIEW)*
```json
// Response 200 — buckets keep transaction-currency `outstanding` and add base
{ "asOf": "...", "summary": { "current": { "count": 1, "amount": 1425, "amountBase": 84787.5 },
  "days1to30": { "...": "..." }, "days31to60": { "...": "..." }, "days90plus": { "...": "..." },
  "total": { "...": "..." } }, "detail": { "...": "..." } }
```

### GET /api/ap-invoices/kpis *(AP:VIEW)*
```json
{ "totalInvoiced": 0, "totalPaid": 0, "totalPending": 0, "totalOverdue": 0,
  "paymentRate": 0, "totalInvoicedBase": 0, "totalPendingBase": 0 }
```

### GET /api/ap-invoices/:id — detail; GET /api/ap-invoices/:id/match-status — 3-way analysis *(AP:VIEW)*
```json
// match-status response unchanged:
{ "matchStatus": "three_way_matched", "allLinesMatch": true, "priceTolerance": "2%",
  "lines": [ { "lineNumber": 1, "poQtyOk": true, "grnQtyOk": true, "priceOk": true,
  "issues": [] } ], "summary": { "total": 1, "matched": 1, "failed": 0 }, "canPost": true }
```

### PATCH /api/ap-invoices/:id *(AP:EDIT)* — draft only: dueDate/supplierRef/notes
### PATCH /api/ap-invoices/:id/post *(AP:APPROVE)*
```json
// Response 200
{ "message": "AP Invoice APINV-2026-0001 posted", "invoice": { "status": "posted", "jeId": "..." },
  "journalEntry": { "...": "DR inventory/expense (+variance 5.2.01) / CR 2.1.01" } }
// Errors: 400 not draft | 400 3-way match failed (per-line issues) |
//         400 fiscal period closed | 400 stock receipt failed (NEW — no longer swallowed) |
//         400 GL account missing
```

### PATCH /api/ap-invoices/:id/void *(AP:APPROVE)*
```json
// Response 200 — reversal JE posted when the invoice had one
// Errors: 400 already void | 400 fully paid | 409 has payments (NEW — reverse payments first)
```

### POST /api/ap-invoices/:id/payments *(AP:PAYMENT)*
```json
// Request
{ "paymentDate": "2026-06-10", "amount": 500, "paymentMethod": "wire", "reference": "W-123" }

// Response 201 — payment carries its own frozen rate
{ "message": "Payment of $500 applied...", "payment": { "paymentNumber": "APPAY-2026-0001",
  "exchangeRate": "59.5", "amountBase": "29750", "baseCurrency": "DOP" },
  "journalEntry": { "...": "DR 2.1.01 / CR 1.1.02" }, "newStatus": "partial", "remaining": 925 }

// Errors: 400 draft/void invoice | 400 exceeds outstanding | 400 period closed |
//         400 bad paymentMethod | 409 payment number collision
```

### POST /api/ap-invoices/:id/link-grn *(AP:EDIT)* — body `{ "grnId": "<uuid>" }` (DTO-validated)
### POST /api/ap-invoices/:id/unlink-grn *(AP:EDIT)*
### DELETE /api/ap-invoices/:id *(AP:DELETE)* — draft only, soft delete

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `prisma/schema.prisma` + migration `ap_frozen_rate` | Frozen-rate trio on `ApInvoice` + `ApPayment` (additive) |
| `src/modules/ap-invoices/ap-invoices.module.ts` | Import `CurrencyModule` |
| `src/modules/ap-invoices/ap-invoices.service.ts` | Inject `CurrencyService`; freeze rate + amountBase on create/from-po/payment; base-currency default; Decimal money math; post() rethrows stock failures; void payment guard (409); scope poLine + JE reads; 9 writes → scoped `updateMany`; numeric-max generators ×3; P2002→409; `{ apInvoices, count }`; aging/KPIs base sums |
| `src/modules/ap-invoices/ap-invoices.controller.ts` | `LinkGrnDto` + query DTO bindings; 6 missing `@ApiResponse` |
| `src/modules/ap-invoices/dto/*` | currency `@Length(3,3)`, `@ArrayMinSize(1)`, `@Max` caps, `@Max(100)` discount, `@IsIn` paymentMethod, new `LinkGrnDto` + `QueryApInvoicesDto` |
| `frontend/lib/api/ap-invoices.ts` | `extractList` unwraps `apInvoices` |

### Cross-module dependencies
- **`CurrencyService`** (spec-021) — `getBaseCurrency` + `getRate` at create/payment
  time only (the frozen-rate pattern). Currency must exist in `mc_currencies`;
  a missing pair rate surfaces the actionable 404.
- **`AutomationService.handleAutoJe`** — invoice/payment/reversal JEs (respects
  module auto/manual config).
- **`StockTransactionsService.receiveFromApInvoice`** — inventory receipt at post;
  failures now ABORT the post (behavior change, documented).
- GL accounts required: `2.1.01`, `1.1.02`, `1.1.04` (fallback DR), `5.2.01`
  (variance, optional).

### Behavioral notes
- BURGER demo has USD/DOP + EUR/DOP rates seeded (spec-021); DEMO/TENANT2 have
  none — invoices there must be DOP (identity rate 1) or e2e must POST a rate first.
- `from-po` freezes the rate at creation date (not PO date) — the PO's own
  multi-currency adoption is its module's spec.
- Migration runs via the shadow-DB workaround (`migrate diff` + `deploy` —
  `sunset_user` lacks CREATEDB).

---

## Verification checklist

```bash
# 0. Migration + login (BURGER has seeded rates)
cd backend && npx prisma migrate deploy && npx prisma generate
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@burger.do","password":"Admin123!"}' | jq -r .access_token)

# 1. Create a USD invoice → frozen rate + amountBase in DOP
curl -s -X POST http://localhost:3000/api/ap-invoices \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"supplierId":"<sup>","invoiceDate":"2026-06-06","dueDate":"2026-07-06",
       "currency":"USD","lines":[{"description":"x","quantity":10,"unitPrice":100}]}' \
  | jq '{invoiceNumber,currency,exchangeRate,amountBase,baseCurrency}'
# Expected: exchangeRate 59.5, amountBase 59500, baseCurrency DOP

# 2. PATCH a NEW rate into the table afterwards → invoice amountBase UNCHANGED (frozen)
curl -s -X POST http://localhost:3000/api/exchange-rates -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fromCurrency":"USD","toCurrency":"DOP","rate":99,"rateDate":"2026-06-07"}' >/dev/null
curl -s http://localhost:3000/api/ap-invoices/<id> -H "Authorization: Bearer $TOKEN" | jq .amountBase
# Expected: still 59500

# 3. Default currency = tenant base (no currency in body → DOP, rate 1)
# 4. Envelope + query whitelist
curl -s http://localhost:3000/api/ap-invoices -H "Authorization: Bearer $TOKEN" \
  | jq 'has("apInvoices") and has("count")'          # Expected: true
curl -s "http://localhost:3000/api/ap-invoices?status=weird" \
  -H "Authorization: Bearer $TOKEN" | jq .statusCode  # Expected: 400

# 5. lines [] → 400; discountPercent 150 → 400; paymentMethod "iou" → 400
# 6. Post → JE; pay partially → status partial, payment has own frozen rate;
#    void while partial → 409
# 7. Tests + builds
pnpm test ap-invoices.service && pnpm test:e2e ap-invoices
pnpm build && cd ../frontend && pnpm build
# Expected: all green
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (opportunity-finder score 98: 10 critical scoping, 7 correctness, 7 DTO/frozen-rate, 6 swagger) | Draft — pending review |
| 2026-06-06 | Test scaffolds written (23 unit / 20 e2e, 23 tagged [GAP] red) | Red as designed |
| 2026-06-06 | All 26 gaps implemented: frozen-rate adoption (ap_frozen_rate + ap_payment_frozen_rate additive migrations; CurrencyService injected; currency defaults to tenant base, catalog-validated; invoice + payment each freeze their own rate), Decimal-safe money (epsilons removed), post() aborts on stock failure (stock runs FIRST, before the JE — service-only invoices skip the stock path), void-with-payments 409, poLine + JE reads scoped, 9 writes → scoped updateMany, numeric-max generators ×3 + P2002→409, DTO caps/whitelists + LinkGrnDto + query DTO, { apInvoices, count } envelope + frontend extractList, aging/KPIs base-currency sums, 6 @ApiResponse | Unit 23/23, e2e 20/20 (frozen rate verified live: later rates do not move amountBase) |
