# spec-032 — Financial Reports (Trial Balance, P&L, Balance Sheet, General Ledger)

Status: **Complete**
Owner: Axiom Systems
Sprint: finance hardening (4 of 5 — opportunity-finder score 12, validation-only)
Module(s): financial-reports
Last updated: 2026-06-07

## Problem

The financial-reports module produces four read-only reports by aggregating
posted journal-entry lines: Trial Balance, Profit & Loss, Balance Sheet, and
General Ledger. The opportunity-finder (2026-06-06, score 12) confirmed the
module is **clean on tenant scoping** (every aggregation query filters
`{ tenantId, deletedAt: null }` on both the line and its `journalEntry`, with
`status: 'posted'`) and has full Swagger + a parameters DTO. The remaining debt
is **input validation / error handling**:

1. **Half-specified date ranges are silently ignored** — the range reports use
   `else if (params.startDate && params.endDate)` (`service:14, 73, 346`), so
   passing only `startDate` (no `endDate`) applies NO date filter and silently
   returns all-time data. A client expecting a filtered report gets the wrong
   numbers with no error.
2. **Inverted ranges produce empty/garbage** — `startDate > endDate` is accepted
   and returns an empty report rather than a 400.
3. **General Ledger with an unknown account number returns empty** silently
   (`service:351`) — no signal that the `accountNumber` filter matched nothing
   because the account does not exist (vs. simply having no activity).
4. **Weak DTO fields** — `fiscalPeriod` is a free `@IsString` (no `YYYY-MM`
   shape check, `service` interpolates it into a `where`); `accountType` is a
   free `@IsString` and is in fact **unused** by the service (dead param) —
   either whitelist it or document it.

The frontend always sends `startDate`+`endDate` together (or neither — e.g.
`getTrialBalance()`), verified in `app/page.tsx` and `app/accounting/reports/
page.tsx`, so tightening to "both or neither" is contract-safe.

This spec hardens input validation and not-found signalling. It changes no
report math and no response shape.

## Acceptance criteria

### Tenant scoping (already satisfied — documented)
- [x] Every report query scopes both the line (`tenantId, deletedAt: null`) and
      the nested `journalEntry` (`tenantId, deletedAt: null, status: 'posted'`)
      (`service:11/18-19, 70/77-81, 226/232-237, 272-277, 343/353-354`).
- [x] No writes (read-only module).

### Date-range validation
- [ ] The range reports (trial-balance, profit-and-loss, general-ledger) throw
      `BadRequestException` when exactly one of `startDate`/`endDate` is provided
      (a half-specified range is a client error, not "all time").
- [ ] The range reports throw `BadRequestException` when `startDate > endDate`.
      Balance-sheet is an as-of report (only `endDate`, no range) and is exempt
      from the both-or-neither + ordering checks.
- [x] Passing neither date (nor fiscalPeriod) remains valid → all-time report
      (the `getTrialBalance()` no-arg call must keep working).
- [x] `fiscalPeriod` takes precedence over the date range (existing branch
      order, `service:12-15`).

### General Ledger account filter
- [ ] When `accountNumber` is supplied but no account with that number exists in
      the tenant, `getGeneralLedger` throws `NotFoundException` (distinguishes
      "wrong account number" from "no activity").

### DTO validation
- [ ] `fiscalPeriod` carries `@Matches(/^\d{4}-\d{2}$/)` (YYYY-MM).
- [ ] `accountType` carries `@IsIn(['asset','liability','equity','revenue',
      'cost','expense'])` (or is removed as dead — decision: keep + whitelist,
      it is part of the documented query surface).
- [x] `startDate`/`endDate` are `@IsDateString`; `accountNumber` is a bounded
      `@IsString`.

### Endpoints (4) & response format
- [x] All 4 routes guarded + `@RequirePermissions('ACCOUNTING:VIEW')` with full
      `@ApiOperation`/`@ApiQuery`/`@ApiResponse` (`controller:16-61`).
- [x] Report response shapes unchanged (frontend consumes them directly — no
      envelope, no field renames).

## Out of scope

- The P&L categorization logic (account-category buckets, EBITDA/EBIT/EBT
  waterfall) and the Balance Sheet net-income synthesis — documented as-is.
- Pagination of General Ledger (can be large) — a future concern; not changed.
- The unused `accountType` param's wiring into the service (it stays unused;
  this spec only validates it).
- Caching report results.
- Schema changes (none).

## Data model

No changes. Reads `JournalEntryLine` + `JournalEntry` + `Account`, all
tenant-scoped.

## API contracts

All four are `GET` under `ACCOUNTING:VIEW`; responses unchanged.

### GET /api/financial-reports/trial-balance?startDate=&endDate=&fiscalPeriod=
```jsonc
// Response 200: { reportName, parameters, asOfDate, accounts[], totals: { totalDebits, totalCredits, difference, isBalanced } }
// Errors: 400 only one of startDate/endDate; 400 startDate > endDate
```

### GET /api/financial-reports/profit-and-loss?startDate=&endDate=&fiscalPeriod=
```jsonc
// Response 200: structured P&L (revenue/costOfSales/grossProfit/sga/ebit/ebitda/financial/ebt/tax/netIncome + legacy expenses)
// Errors: 400 only one of startDate/endDate; 400 startDate > endDate
```

### GET /api/financial-reports/balance-sheet?endDate=
```jsonc
// Response 200: { assets, liabilities, equity (+ synthetic Current Period Net Income), totalLiabilitiesAndEquity, isBalanced }
// (as-of report — single endDate, no range to cross-validate)
```

### GET /api/financial-reports/general-ledger?startDate=&endDate=&fiscalPeriod=&accountNumber=
```jsonc
// Response 200: { reportName, parameters, entries: [{ date, entryNumber, accountNumber, accountName, description, debit, credit }] }
// Errors: 400 only one of startDate/endDate; 400 startDate > endDate; 404 accountNumber not found in tenant
```

## Implementation notes

| File | Change |
|---|---|
| `financial-reports.service.ts` | Private `validateDateParams(params)` (XOR + ordering → `BadRequestException`) called by the 3 range reports + balance-sheet ordering check; `accountNumber` existence check in `getGeneralLedger` (→ `NotFoundException`) |
| `dto/report-parameters.dto.ts` | `@Matches` on `fiscalPeriod`, `@IsIn` on `accountType` |

No frontend-sync needed: no response shape change; the frontend already sends
both-or-neither dates. No schema changes.

## Verification checklist

```bash
# 1. GET /trial-balance?startDate=2026-01-01 (no endDate) → 400
# 2. GET /profit-and-loss?startDate=2026-03-31&endDate=2026-01-01 → 400 (inverted)
# 3. GET /trial-balance (no params) → 200 all-time (regression: must still work)
# 4. GET /general-ledger?accountNumber=9.9.99 (nonexistent) → 404
# 5. GET /trial-balance?fiscalPeriod=2026-13 → 400 (@Matches) ; ?fiscalPeriod=2026-03 → 200
# 6. GET /balance-sheet?endDate=2026-03-31 → 200 (isBalanced present)
# 7. cd backend && pnpm build && pnpm test financial-reports.service && pnpm test:e2e
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-07 | Spec generated from code by spec-generator (opportunity-finder score 12: validation-only — scoping clean, Swagger complete; half-range silently ignored, inverted range, unknown-account silent empty, weak fiscalPeriod/accountType) | Draft — pending review |
| 2026-06-07 | Implemented + test-scaffolded: validateDateParams (half-range + inverted → 400) on trial-balance/P&L/general-ledger; general-ledger 404 on unknown accountNumber; @Matches/@IsIn DTO. Balance-sheet exempt (as-of). Unit 11/11, e2e 10/10. | Implemented |
| 2026-06-07 | Ship gates: compliance 100%; unit 11/11; full e2e 450/451 (the 1 failure = pre-existing cross-suite flake in exchange-rates.e2e — passes 12/12 in isolation; financial-reports is read-only and cannot have caused it); nest build OK; lint clean (src 0 prettier). Shipped to origin; marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
