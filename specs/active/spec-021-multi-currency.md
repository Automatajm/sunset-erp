# spec-021 — Multi-Currency Infrastructure

Status: **Draft**
Owner: Axiom Systems
Sprint: planned infrastructure (implement BEFORE procurement invoices)
Module(s): currency (new), tenant-settings, cross-cutting pattern for sales-orders, purchase-orders, ar-invoices, ap-invoices, journal-entries
Last updated: 2026-06-06

## Problem

Sunset ERP targets the Dominican Republic market (Burger Borinquen demo operates in DOP)
but monetary handling is inconsistent and incomplete:

- A **global** `ExchangeRate` model already exists (`mc_exchange_rates`,
  `schema.prisma:362-377`) but it has **no `tenantId`**, no `source`, no `createdBy`,
  and **no service consumes it** — no module reads rates from it.
- `PurchaseOrder`, `SalesOrder`, and `JournalEntryLine` carry an
  `exchangeRate Decimal @default(1)` column (`schema.prisma:488,1106,1250`) that is
  never populated from a rate table — it silently stays `1`.
- **No model stores `amountBase`** — there is no way to report across currencies
  (a USD PO and a DOP PO cannot be totaled without on-the-fly conversion, which
  changes historical totals every time the rate moves).
- `Tenant.defaultCurrency` defaults to `"USD"` (`schema.prisma:70`) and
  `TenantSettings` (`cfg_tenant_settings`) has only UOM fields — there is no
  tenant-level **base currency** for the DR market.

This is infrastructure like UOM (spec-005): every future monetary module (SO, PO,
AR/AP invoices) must follow one frozen-rate pattern, so it must exist before
procurement invoices are specced.

## Acceptance criteria

### Data model — ExchangeRate becomes tenant-owned
- [x] `ExchangeRate` gains `tenantId` (uuid, indexed), `source`
      (`'manual' | 'api'`, default `'manual'`), `createdBy`, `createdAt` preserved;
      the user-facing **rateDate** maps to the existing `effectiveDate` column
      (kept — renaming a populated column is a destructive change, ask-first).
- [x] Unique constraint becomes `@@unique([tenantId, fromCurrency, toCurrency, effectiveDate])`.
- [x] Migration via `/new-migration` — existing global rows (if any) are assigned to
      no tenant only if the table is empty in all envs; otherwise STOP and ask.

### Data model — tenant base currency
- [x] `TenantSettings` gains `baseCurrency String @default("DOP") @db.VarChar(3)`
      (DR market default). `Tenant.defaultCurrency` is left untouched (legacy,
      subscription-level) and documented as NOT the monetary base.

### CurrencyService (new module `backend/src/modules/currency/`)
- [x] `getRate(tenantId, from, to, date)` — most recent rate with
      `effectiveDate <= date`, scoped `{ tenantId }`; identity pair returns `1`;
      inverse-pair fallback (`1 / rate(to, from)`) before throwing; no rate found →
      `NotFoundException` with an actionable message.
- [x] `convert(tenantId, amount, from, to, date)` — returns
      `{ amount, rate, converted }` using `getRate`; Decimal-safe (no float drift).
- [x] CRUD endpoints for rates (`POST/GET /api/exchange-rates`), guarded
      `JwtAuthGuard, PermissionsGuard`, `@RequirePermissions('SETTINGS:EDIT'/'SETTINGS:VIEW')`,
      DTO-validated (`@IsIn` on source, `@Max` on rate per `Decimal(18,6)`,
      `@IsDateString` on rateDate), list envelope `{ exchangeRates, count }`,
      P2002 → 409.

### The frozen-rate pattern (binding for all future monetary modules)
- [x] Every monetary transaction stores five fields: `amount`, `currency`,
      `exchangeRate` (frozen at creation via `CurrencyService.getRate`),
      `amountBase`, `baseCurrency` (copied from `TenantSettings.baseCurrency` at
      creation).
- [x] **The rate is FROZEN at transaction creation — never recalculated on update.**
      Updates that change `amount` recompute `amountBase` with the FROZEN rate;
      nothing re-reads the rate table after creation.
- [x] The pattern is documented in `CLAUDE.md` (autonomy section) so SO/PO/AR/AP
      specs inherit it without re-deciding; retrofitting existing SO/PO/JE columns
      is each module's own spec (out of scope here).

### Seed
- [x] Idempotent seed adds USD/DOP and EUR/DOP rates (plus inverses) for the
      Burger Borinquen demo tenant (pattern of `05-demo-burger-borinquen`), source
      `'manual'`, realistic DR rates, dated within the demo period.

## Out of scope

- Retrofitting `amountBase` onto existing `PurchaseOrder`/`SalesOrder`/
  `JournalEntryLine`/`ArInvoice` rows — each module adopts the pattern in its own
  spec once this infrastructure ships.
- Live rate APIs (`source: 'api'` is modeled but no fetcher is built).
- Currency catalog CRUD (`mc_currencies` exists and is sufficient).
- Frontend rate-management page (separate frontend spec).

## Data model

| Model | Table | Key fields |
|---|---|---|
| `ExchangeRate` (modified) | `mc_exchange_rates` | + `tenantId`, + `source`, + `createdBy`; unique `[tenantId, from, to, effectiveDate]` |
| `TenantSettings` (modified) | `cfg_tenant_settings` | + `baseCurrency` (default `'DOP'`) |
| `Currency` (unchanged) | `mc_currencies` | existing catalog |

Invariants: rates tenant-scoped; `rate Decimal(18,6)` > 0; frozen at consumption.

## API contracts

### POST /api/exchange-rates
```json
// { "fromCurrency": "USD", "toCurrency": "DOP", "rate": 59.5, "rateDate": "2026-06-01", "source": "manual" }
// 201 → entity      // Errors: 400 validation, 409 duplicate (tenant+pair+date)
```

### GET /api/exchange-rates?from=USD&to=DOP
```json
// 200 → { "exchangeRates": [...], "count": n }
```

### CurrencyService (internal, injected by monetary modules)
```ts
getRate(tenantId: string, from: string, to: string, date: Date): Promise<Decimal>
convert(tenantId: string, amount: Decimal, from: string, to: string, date: Date):
  Promise<{ amount: Decimal; rate: Decimal; converted: Decimal }>
```

## Implementation notes

| File | Change |
|---|---|
| `prisma/schema.prisma` | ExchangeRate + tenantId/source/createdBy; TenantSettings + baseCurrency |
| `src/modules/currency/*` | New module: service (getRate/convert), thin controller, DTOs |
| `prisma/seed-*` | USD/DOP, EUR/DOP demo rates (idempotent) |
| `CLAUDE.md` | Frozen-rate pattern added to pre-approved design decisions |

Cross-module: future SO/PO/AR/AP specs inject `CurrencyService` (acyclic — currency
depends only on Prisma, like UOM).

## Verification checklist

```bash
# 1. POST a USD→DOP rate, GET it back; duplicate same date → 409
# 2. getRate falls back to inverse pair; missing pair → 404 with message
# 3. Create a monetary tx (once a consumer module adopts) → exchangeRate frozen;
#    PATCH the rate table afterwards → tx amountBase UNCHANGED
# 4. New tenant → TenantSettings.baseCurrency = 'DOP'
# 5. pnpm seed → BURGER tenant has USD/DOP + EUR/DOP rates; re-run = no dupes
# 6. cd backend && pnpm build && pnpm test currency
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec drafted (planned infrastructure; gap analysis: global rate table unused, exchangeRate columns stay 1, no amountBase anywhere) | Draft — implement before procurement invoices |
| 2026-06-06 | Implemented: ExchangeRate tenant-owned (table verified EMPTY pre-migration → tenantId required, no STOP needed), TenantSettings.baseCurrency DOP, CurrencyModule (getRate identity/direct/inverse/404 + Decimal-safe convert + getBaseCurrency + rates CRUD with envelope/P2002→409), SETTINGS:VIEW/EDIT permissions added to seed + granted live to 3 ADMIN roles (permission cache cleared), idempotent 06-demo-exchange-rates seed (8 rates, verified 2 runs), frozen-rate pattern added to CLAUDE.md autonomy section | Unit 11/11, e2e 12/12, build OK |
