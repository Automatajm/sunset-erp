# spec-026 — AR Invoices (Accounts Receivable)

Status: **Complete**  
Owner: Finance  
Sprint: AR/AP invoices (mirror of spec-025; second frozen-rate consumer)  
Module(s): `ar-invoices` (injects `currency` per the frozen-rate gate; touches
`frontend/lib/api/ar-invoices.ts` for the list envelope)  
Last updated: 2026-06-06  

---

## Purpose

- **Who uses this module?** Accountants and accounts-receivable staff who bill customers and collect what's owed.
- **What business problem does it solve?** It closes the sales money loop — turning sales orders into customer invoices, posting revenue (and cost of goods) to the general ledger, shipping finished goods out of stock, collecting payments, and aging what customers owe.
- **What can the business NOT do without this module?** It cannot bill customers or track receivables — no invoices, no revenue recognition, no record of who owes what, and no way to chase overdue accounts.

## Business value

Accounts receivable is how the business gets paid. Without it, sales are made but never properly invoiced, revenue never lands in the books correctly, and there is no aging report to show which customers are late. Cash collection becomes guesswork, overdue balances pile up unnoticed, and the company finances its customers by accident. Structured invoicing, revenue posting, and aging turn completed sales into collected cash — the lifeblood of the operation.

---

## Problem

AR Invoices closes the sales money loop: invoices are created manually or from a
Sales Order (retroactive `invoiceDate = so.orderDate` with an end-of-current-month
guard), sent to the GL (DR `1.1.03` AR / CR `4.1.01` Revenue, plus CoGS pairs
DR `5.1.01` / CR `1.1.05` FG when a line carries `cogsAmount`), ship finished
goods out of stock, collect payments (DR `1.1.02` Cash / CR AR) with aging and
KPI reporting, and void with a reversal JE. It is the structural mirror of
`ap-invoices` and carries the **same pre-spec-025 defects**, plus one of its own.

The audit (opportunity-finder, 2026-06-06, score 74) found:

1. **Frozen-rate pattern absent** — `ArInvoice`/`ArPayment` have `currency` but
   no `exchangeRate`/`amountBase`/`baseCurrency`; `currency ?? 'USD'` hardcoded
   (`service:76,166`) on a DOP-base tenant. Aging/KPIs sum mixed currencies.
2. **`send()` swallows stock failures** — `shipFromArInvoice` wrapped in
   try/`console.error` (`:231-244`): the revenue JE posts even when the FG
   shipment fails — ledger and inventory silently diverge (exact mirror of the
   AP `post()` bug closed in spec-025).
3. **Dead COGS stub** — `calculateBomStandardCost` (`:650-676`) contains
   `components.every((c) => false)` — it ALWAYS returns `null` after burning two
   BOM queries per from-SO line. COGS from BOM has never worked; only the manual
   `cogsAmount` DTO field ever drives CoGS JE lines.
4. **Unscoped reads** — `journalEntry.findFirst` in the void reversal (`:593`)
   omits `tenantId`; the CoGS account override (`:482`) omits `deletedAt: null`.
5. **Money in JS floats** — `unitPrice * quantity` (`:40-42`) and `±0.001`
   epsilons (`:284`, `:308`).
6. **Void of a partially paid invoice** leaves payments and their JEs standing
   (`:262-267`) — spec-025 set the 409 policy.
7. **Fragile generators ×3** — `INV-`/`PAY-`/`JE-` string-sort (`:678-711`), no
   `P2002 → 409` despite uniques on `[tenantId, invoiceNumber]` /
   `[tenantId, paymentNumber]`.
8. **Weak DTOs** — `currency` free string, `lines` accepts `[]`,
   `discountPercent` unbounded, no `@Max` caps, `paymentMethod` not `@IsIn`-enforced,
   `findAll` query params unvalidated.
9. **Bare-array list** (`:188`) — the frontend `getAll` types `r.data` as
   `ArInvoice[]` directly; the envelope change crashes `.map` without the sweep.
10. Five id-only writes (`:212,:246,:268,:309,:421`) violate the scoped-`updateMany`
    pattern.

Swagger is already complete (11/11 handlers) and the controller is thin — this
spec is service + DTO + schema work, mirroring spec-025's shape.

---

## Acceptance criteria

### Endpoints (existing behavior preserved)
- [x] `POST /api/ar-invoices` — manual draft invoice; line totals + discounts;
      optional manual `cogsAmount`/account overrides per line.
- [x] `POST /api/ar-invoices/from-so/:soId` — drafts from a
      `confirmed | shipped | delivered` SO (`400` otherwise); `400` when a
      non-void invoice exists for the SO; **retroactive** `invoiceDate = so.orderDate`
      with the end-of-current-month guard (`400` beyond it); due +30 days.
- [x] `GET /api/ar-invoices?status=&customerId=&from=&to=` — filtered list.
- [x] `GET /api/ar-invoices/aging` — Current / 1-30 / 31-60 / 90+ buckets
      (statuses `sent | partial | overdue`).
- [x] `GET /api/ar-invoices/kpis` — invoiced/collected/pending/overdue + collectionRate.
- [x] `GET /api/ar-invoices/:id` — detail with lines, payments, customer, SO.
- [x] `PATCH /api/ar-invoices/:id` — draft only; dueDate/notes.
- [x] `PATCH /api/ar-invoices/:id/send` — draft → sent; AR/Revenue JE (+ CoGS
      pairs per line with `cogsAmount`); fiscal-period guard; ships FG stock OUT.
- [x] `PATCH /api/ar-invoices/:id/void` — reversal JE when sent.
- [x] `POST /api/ar-invoices/:id/payments` — payment + JE, over-payment `400`,
      rolls `sent → partial → paid`.
- [x] `DELETE /api/ar-invoices/:id` — soft delete, draft only.
- [x] Swagger complete (11/11 `@ApiOperation` + `@ApiResponse`); thin controller;
      `AR:CREATE/VIEW/EDIT/APPROVE/PAYMENT/DELETE` permissions.

### Frozen-rate pattern (spec-021 gate — second consumer, mirror of spec-025)
- [x] Additive migration: `ArInvoice` and `ArPayment` gain
      `exchangeRate Decimal(18,6) @default(1)`, `amountBase Decimal(15,2) @default(0)`,
      `baseCurrency VARCHAR(3) @default("DOP")`.
- [x] `ArInvoicesModule` imports `CurrencyModule`; the service injects
      `CurrencyService`; no direct `mc_exchange_rates` queries.
- [x] `create`/`createFromSalesOrder`: `currency` defaults to
      `getBaseCurrency(tenantId)` (NOT `'USD'`; from-so uses `so.currency ?? base`),
      catalog-validated on manual create; `exchangeRate` frozen at `invoiceDate`
      (the retroactive SO date for from-so); `amountBase = totalAmount × rate`
      (Decimal 2dp); missing rate → actionable `404`.
- [x] `applyPayment` freezes its OWN rate at `paymentDate` onto the payment row.
- [x] The invoice rate is never re-read after creation (`update` only touches
      dueDate/notes — `amountBase` immutable post-create).
- [x] Aging and KPIs add base sums: `outstandingBase` per row, `amountBase` per
      bucket, `invoicedBase`/`pendingBase` on KPIs.

### Tenant scoping & write pattern
- [x] `journalEntry.findFirst` (`createReversalJe`, `:593`) includes `tenantId`.
- [x] CoGS account override (`createInvoiceJe`, `:482`) includes `deletedAt: null`.
- [x] The five id-only writes (`update` `:212`, `send` `:246`, `void` `:268`,
      `applyPayment` `:309`, `remove` `:421`) migrate to
      `updateMany({ where: { id, tenantId, deletedAt: null } })` + refetch where a
      body is returned.
- [x] All other reads scoped (customer/SO/item validation, findAll/findOne,
      aging, KPIs, GL accounts, fiscal period, BOM lookups).

### Sending integrity (mirror of spec-025 posting integrity)
- [x] `send()` no longer swallows `shipFromArInvoice` errors: the FG shipment
      runs FIRST and a failure aborts the send with `400` (cause included) before
      the JE and the status flip; invoices with no item lines skip the stock path.
- [x] `void` requires `paidAmount = 0` — voiding a `partial` invoice is `409`
      ("reverse payments first"); `paid` stays blocked.

### Dead COGS stub
- [x] `calculateBomStandardCost` is removed and `createFromSalesOrder` sets
      `cogsAmount: null` directly — the stub always returned `null` anyway
      (`components.every((c) => false)`) while burning two queries per line.
      BOM-based standard costing is out of scope (needs costing infrastructure);
      the manual `cogsAmount` path (and its CoGS JE pairs) is preserved and pinned.

### Decimal-safe money
- [x] Line totals/discounts/subtotal computed with `Decimal`; payment comparisons
      use Decimal `gt`/`gte` — `±0.001` epsilons removed.

### Document number generation
- [x] `generateInvoiceNumber` (`INV-<year>-NNNN`), `generatePaymentNumber`
      (`PAY-<year>-NNNN`), `generateJeNumber` (`JE-<YYYYMM>-NNNN`) migrate to the
      numeric-max pattern.
- [x] `P2002 → 409 ConflictException` on invoice create, from-so create, and
      payment create.

### DTO validation
- [x] `currency` gets `@Length(3, 3)`; catalog-validated in the service.
- [x] `lines` gets `@ArrayMinSize(1)`; `discountPercent` gets `@Max(100)`.
- [x] `@Max` caps: `quantity` `@Max(99999999999)` (`Decimal(15,3)`), `unitPrice`
      `@Max(9999999999)` (`Decimal(15,4)`), `cogsAmount` + payment `amount`
      `@Max(999999999999)` (`Decimal(15,2)`).
- [x] `paymentMethod` gets `@IsIn(['wire', 'ach', 'check', 'transfer', 'cash', 'card'])` (superset of both AR/AP documented enums).
- [x] `GET /` query DTO: `status`
      `@IsIn(['draft', 'sent', 'partial', 'paid', 'overdue', 'void'])`,
      `customerId` `@IsUUID`, `from`/`to` `@IsDateString`.
- [x] Existing validation preserved (`@IsUUID` ids, `@IsDateString` dates,
      `@Min` floors, nested lines, account-override UUIDs).

### Response format
- [x] `GET /api/ar-invoices` returns `{ arInvoices: [...], count: n }`.
- [x] `frontend-sync`: `frontend/lib/api/ar-invoices.ts` `getAll` unwraps the
      envelope (today it returns `r.data` typed as `ArInvoice[]` — the page's
      `.map` would crash).

### Error handling
- [x] `404` customer/SO/item/invoice not found; `400` wrong status for
      edit/send/void/pay, over-payment, SO-date beyond month-end, fiscal period
      closed, missing GL accounts (`1.1.03`, `4.1.01`, `1.1.02`).
- [x] `409` on number collisions and void-with-payments.

---

## Out of scope

- BOM-based standard costing (the dead stub is removed, not implemented — needs
  a costing infrastructure spec; manual `cogsAmount` continues to drive CoGS JEs).
- Setting `status = 'overdue'` automatically (no scheduler exists; aging already
  reads it if ever set — spec-022 notifications territory).
- Payment reversal / refunds (void-with-payments stays 409 until then).
- Tax calculation (`taxAmount` 0 on manual; copied from SO on from-so).
- Credit notes, recurring invoices, dunning.
- Multi-currency GL lines (base amounts live on invoice/payment headers).

---

## Data model

**One additive migration** (frozen-rate adoption; everything else preserved):

```prisma
// ArInvoice — add after `currency`:
exchangeRate Decimal @default(1) @map("exchange_rate") @db.Decimal(18, 6)
amountBase   Decimal @default(0) @map("amount_base") @db.Decimal(15, 2)
baseCurrency String  @default("DOP") @map("base_currency") @db.VarChar(3)

// ArPayment — add after `amount`:
exchangeRate Decimal @default(1) @map("exchange_rate") @db.Decimal(18, 6)
amountBase   Decimal @default(0) @map("amount_base") @db.Decimal(15, 2)
baseCurrency String  @default("DOP") @map("base_currency") @db.VarChar(3)
```

Reference:

| Model | Table | Key fields |
|---|---|---|
| `ArInvoice` | `ar_invoices` | `tenantId`, `invoiceNumber` (`@@unique([tenantId, invoiceNumber])`), `customerId`, `soId?`, `jeId?`, dates, `status` (`draft/sent/partial/paid/overdue/void`), totals `Decimal(15,2)`, `currency`, + frozen-rate trio (new), audit + soft delete |
| `ArInvoiceLine` | `ar_invoice_lines` | `quantity Decimal(15,3)`, `unitPrice Decimal(15,4)`, `discountPercent Decimal(5,2)`, `lineTotal Decimal(15,2)`, `cogsAmount? Decimal(15,2)`, revenue/cogs account overrides |
| `ArPayment` | `ar_payments` | `paymentNumber` (`@@unique([tenantId, paymentNumber])`), `amount Decimal(15,2)`, `paymentMethod?`, `jeId?`, + frozen-rate trio (new), audit + soft delete |

Key invariants:
- Status flow: `draft → sent → partial → paid`; `void` from `draft`/`sent` only
  (payments must be zero); `overdue` is a reporting status (never set by code).
- GL accounts: AR `1.1.03`, Revenue `4.1.01`, Cash `1.1.02`, CoGS `5.1.01`,
  FG `1.1.05`. JEs via `AutomationService.handleAutoJe`.
- From-SO invoices are retroactive (`invoiceDate = so.orderDate`) — the frozen
  rate uses THAT date, so historical SO invoicing picks the historically correct rate.

---

## API contracts

All routes prefixed `/api`, JWT-guarded. Statuses: `draft | sent | partial | paid | overdue | void`.

### POST /api/ar-invoices *(AR:CREATE)*
```json
// Request
{ "customerId": "<uuid>", "soId": "<uuid, optional>",
  "invoiceDate": "2026-06-06", "dueDate": "2026-07-06",
  "currency": "USD",          // optional; defaults to tenant base, catalog-validated
  "lines": [ { "itemId": "<uuid, optional>", "description": "Burgers x100",
    "quantity": 100, "uom": "PCS", "unitPrice": 5.5, "discountPercent": 0,
    "cogsAmount": 320, "revenueAccountId": "<uuid, optional>", "cogsAccountId": "<uuid, optional>" } ] }

// Response 201 — draft with frozen-rate fields
{ "id": "...", "invoiceNumber": "INV-2026-0001", "status": "draft",
  "currency": "USD", "exchangeRate": "59.5", "amountBase": "32725", "baseCurrency": "DOP",
  "subtotal": "550", "totalAmount": "550", "lines": [ ... ] }

// Errors: 404 customer/SO/item/currency/rate | 400 validation | 409 number collision
```

### POST /api/ar-invoices/from-so/:soId *(AR:CREATE)*
```json
// Response 201 — invoiceDate = so.orderDate (retroactive), rate frozen at THAT date,
// due +30d, totals copied from SO, cogsAmount null (BOM costing out of scope)
// Errors: 404 SO | 400 SO status | 400 invoice exists | 400 beyond end of current month
```

### GET /api/ar-invoices?... *(AR:VIEW)* — `{ "arInvoices": [...], "count": n }` (NEW envelope); 400 on bad query
### GET /api/ar-invoices/aging — buckets gain `amountBase`; rows gain `outstandingBase`
### GET /api/ar-invoices/kpis — adds `invoicedBase`, `pendingBase`
### GET /api/ar-invoices/:id — detail (unchanged shape + trio)

### PATCH /api/ar-invoices/:id/send *(AR:APPROVE)*
```json
// Response 200
{ "message": "Invoice INV-2026-0001 sent", "invoice": { "status": "sent", "jeId": "..." },
  "journalEntry": { "...": "DR 1.1.03 / CR 4.1.01 (+ CoGS pairs)" } }
// Errors: 400 not draft | 400 FG shipment failed (NEW — no longer swallowed) |
//         400 fiscal period closed | 400 GL accounts missing
```

### PATCH /api/ar-invoices/:id/void *(AR:APPROVE)* — Errors add: 409 has payments (NEW)
### POST /api/ar-invoices/:id/payments *(AR:PAYMENT)*
```json
// Response 201 — payment carries its own frozen rate
{ "payment": { "paymentNumber": "PAY-2026-0001", "exchangeRate": "59.5",
  "amountBase": "29750", "baseCurrency": "DOP" }, "newStatus": "partial", "remaining": 925 }
// Errors: 400 draft/void | 400 exceeds outstanding | 400 bad paymentMethod | 409 number collision
```

### PATCH /api/ar-invoices/:id, DELETE /api/ar-invoices/:id — unchanged (draft only)

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `prisma/schema.prisma` + migration `ar_frozen_rate` | Frozen-rate trio on `ArInvoice` + `ArPayment` (additive) |
| `src/modules/ar-invoices/ar-invoices.module.ts` | Import `CurrencyModule` |
| `src/modules/ar-invoices/ar-invoices.service.ts` | Inject `CurrencyService`; freeze rate on create/from-so (retroactive date)/payment; Decimal money; send() ships FIRST + aborts on failure; void payment guard 409; JE read + CoGS account scoped; 5 writes → scoped `updateMany`; numeric-max generators ×3 + P2002→409; remove dead `calculateBomStandardCost`; `{ arInvoices, count }`; aging/KPIs base sums |
| `src/modules/ar-invoices/dto/*` | currency `@Length(3,3)`, `@ArrayMinSize(1)`, `@Max` caps + `@Max(100)` discount, `@IsIn` paymentMethod, new `QueryArInvoicesDto` |
| `src/modules/ar-invoices/ar-invoices.controller.ts` | Bind query DTO (Swagger already complete) |
| `frontend/lib/api/ar-invoices.ts` | `getAll` unwraps the `arInvoices` envelope |

### Cross-module dependencies
- **`CurrencyService`** (spec-021) — base currency + frozen rates (create/from-so/payment).
- **`AutomationService.handleAutoJe`** — invoice/payment/reversal JEs.
- **`StockTransactionsService.shipFromArInvoice`** — FG stock OUT at send;
  failures now ABORT the send (mirror of spec-025's policy).
- GL accounts required: `1.1.03`, `4.1.01`, `1.1.02` (+ `5.1.01`/`1.1.05` for CoGS pairs).

### Behavioral notes
- From-SO frozen rate uses the RETROACTIVE invoice date — a June SO invoiced
  today freezes June's rate, keeping historical reporting correct.
- The send-aborts-on-shipment-failure policy mirrors spec-025; SOs whose stock
  was already shipped through the SO flow ship nothing here (no item lines case).
- Migration via the shadow-DB workaround (`migrate diff` + `deploy`).

---

## Verification checklist

```bash
# 0. Migration + login
cd backend && npx prisma migrate deploy && npx prisma generate
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}' | jq -r .access_token)

# 1. DOP invoice (no currency) → identity rate 1, amountBase = total
# 2. Foreign-currency invoice → frozen rate; later rates do NOT move amountBase
# 3. Envelope + query whitelist (status=weird → 400)
# 4. lines [] → 400; discountPercent 150 → 400; paymentMethod "iou" → 400
# 5. send → JE; partial payment (own frozen rate) → void → 409; full pay → paid
# 6. from-so: create SO, confirm, from-so → invoiceDate = orderDate, cogsAmount null
# 7. Tests + builds
pnpm test ar-invoices.service && pnpm test:e2e ar-invoices
pnpm build && cd ../frontend && pnpm build
# Expected: all green
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (opportunity-finder score 74: 7 critical scoping, 6 correctness incl. dead COGS stub, 7 DTO/frozen-rate, 0 swagger) — mirror of spec-025 | Draft — pending review |
| 2026-06-06 | Test scaffolds written (22 unit / 20 e2e, 22 tagged [GAP] red) | Red as designed |
| 2026-06-06 | All 23 gaps implemented (mirror of spec-025): ar_frozen_rate additive migration (trio on ArInvoice + ArPayment in ONE migration), CurrencyService injected (from-so freezes the rate at the RETROACTIVE orderDate), dead calculateBomStandardCost removed (zero BOM queries in from-so, cogsAmount null), send() ships FIRST + aborts on failure, void-with-payments 409, Decimal money, JE/CoGS-account reads scoped, 5 writes → scoped updateMany, numeric-max generators ×3 + P2002→409, DTO caps/whitelists (paymentMethod superset incl. card) + query DTO, { arInvoices, count } + frontend getAll unwrap, aging/KPIs base sums | Unit 23/23, e2e 19/19 (retroactive frozen rate verified live) |
| 2026-06-06 | Shipped to origin (09b397c); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
