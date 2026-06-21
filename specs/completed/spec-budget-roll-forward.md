# spec-budget-roll-forward — Budget roll-forward automation

> Status: **Complete** · 2026-06-20
> Module: `backend/src/modules/budgets` + `frontend/app/accounting/budgets`
> Origin: deferred from [[spec-ux-foundation]] (roadmap pairing for budgets, T6.3) — a real
> feature, not UX reconstruction.

## Problem

Planning next year's budget means re-typing this year's: every account/period line, re-entered
by hand. Finance needs to **roll a budget forward** — create next year's draft from an existing
(usually approved) budget in one action, with an optional growth/inflation adjustment, then tweak.

Today the only automatic path is `generate-from-so` (MRP). There is no "carry the prior budget
forward" path — the manual fallback (create budget + add each line) is the only option.

## Acceptance criteria

- [x] `POST /budgets/:id/roll-forward` creates a NEW `draft` budget from the source budget.
- [x] Each **active** source `BudgetLine` is copied with: same `accountId`/`notes`,
      `fiscalPeriod` year remapped to the target year (`2026-01` → `2027-01`, `2026-Q1` → `2027-Q1`),
      `budgetAmount` scaled by `(1 + growthPercent/100)` rounded to 2 dp.
- [x] New budget: caller-supplied `targetBudgetCode` (unique check → 409), `targetFiscalYear`,
      optional `targetBudgetName` (default `"<source name> (FY<targetYear>)"`), `status='draft'`.
- [x] Source may be `draft` or `approved` (rolling an approved budget forward is the primary use).
- [x] Atomic: budget + all lines created in one `$transaction`; nothing partial on failure.
- [x] Returns `{ message, budget, linesCopied, growthPercent }`.
- [x] Frontend: a **Roll Forward** action on each budget opens a `FormModal` (target year prefilled
      to source year + 1, code prefilled, growth % default 0) → on success the new draft appears.
- [x] Swagger annotations; `@IsIn`/validators on the DTO; `tsc` 0; backend unit test for the
      period remap + growth math; `pnpm build` (frontend) green.

## Out of scope

- Editing/approving the rolled-forward budget (existing flows handle that).
- Period-shape conversion (monthly↔quarterly) — periods are remapped verbatim except the year.
- Multi-source merge; rolling forward more than one year at a time.

## Data model

No schema change. Uses existing `Budget` (`budgetCode` unique per tenant, `fiscalYear`, `status`)
and `BudgetLine` (`accountId`, `fiscalPeriod` `YYYY-MM`, `budgetAmount` `Decimal(18,2)`, unique
`[budgetId, accountId, fiscalPeriod]`). The remap preserves per-budget line uniqueness.

## API contract

`POST /budgets/:id/roll-forward` · `@RequirePermissions('ACCOUNTING:CREATE')`

Request (`RollForwardBudgetDto`):
```
targetFiscalYear:  string   // required, e.g. "2027"     @IsString @IsNotEmpty @MaxLength(20)
targetBudgetCode:  string   // required, e.g. "BUDGET-2027"  @IsString @IsNotEmpty @MaxLength(50)
targetBudgetName?: string   // optional                  @IsString @MaxLength(255)
growthPercent?:    number   // optional, default 0; -100..1000   @IsNumber @Min(-100) @Max(1000)
includeNotes?:     boolean  // optional, default true     @IsBoolean
```
Response `201`:
```
{ message: string, budget: Budget /* with lines */, linesCopied: number, growthPercent: number }
```
Errors: `404` source not found · `409` target code already exists · `400` source has no lines.

## Period remap

`fiscalPeriod.replace(/^\d{4}/, targetFiscalYear)` — swaps the leading 4-digit year, leaving the
month/quarter suffix intact. Lines whose period has no leading year are copied verbatim (logged).

## Status log

| Date | Change |
|------|--------|
| 2026-06-20 | Spec written from current budgets module + schema. |
| 2026-06-20 | Shipped. Backend: RollForwardBudgetDto, BudgetsService.rollForward ($transaction, Decimal-exact growth, year-only period remap), POST /budgets/:id/roll-forward (ACCOUNTING:CREATE) + Swagger; 4 new unit tests (23/23 pass). Frontend: budgetsApi.rollForward + a RollForwardModal (FormModal) wired to a "Roll Forward" action on any budget with lines (draft or approved). tsc 0, both builds green, eslint clean. |
