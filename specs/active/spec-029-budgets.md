# spec-029 — Budgets (Annual Budgets + Lines + Budget-vs-Actual)

Status: **Implemented — pending ship**
Owner: Axiom Systems
Sprint: finance hardening (1 of 5 — opportunity-finder score 29, highest of the unspecced finance modules)
Module(s): budgets
Last updated: 2026-06-07

## Problem

The budgets module manages annual budgets (`ac_budgets`), their per-account /
per-period lines (`ac_budget_lines`), an approval flow, a budget-vs-actual
report (lines vs posted journal-entry actuals), and MRP auto-generation of
budget lines from Sales Orders. It is functional but never had a spec, and the
opportunity-finder (2026-06-06, score 29 — highest of the five unspecced finance
modules) found four cross-tenant write leaks plus Swagger gaps:

1. **Cross-tenant writes — `id`-only `where`** (4 sites, CRITICAL): every write
   keys off `id` (or `id: existing.id`) without `tenantId`, so a guessed id from
   another tenant is mutable/deletable:
   - `service:31-32` — `budgetLine.deleteMany({ where: { budgetId } })` +
     `budget.delete({ where: { id: existing.id } })` (the soft-deleted-code
     reclaim path)
   - `service:100` — `budget.update({ where: { id } })`
   - `service:180` — `budgetLine.update({ where: { id: lineId } })`
   - `service:490` — `budgetLine.update({ where: { id: existing.id } })` (MRP
     overwrite)
   The fetch-first methods (`findOne`, the line `findFirst`) ARE scoped, so the
   leak is narrow in practice — but the writes must scope per CLAUDE.md
   (`updateMany({ where: { id, tenantId } })` + refetch).
2. **`create` existence check spans tenants correctly but the reclaim is a hard
   delete** (`service:24-32`): checks `{ tenantId, budgetCode }` (no
   `deletedAt`), and on a soft-deleted match HARD-deletes it + its lines to free
   the `@@unique([tenantId, budgetCode])`. This is deliberate (documented
   inline) but should use the standard `P2002 → 409` safety net too, not only
   the pre-check (a concurrent create still races).
3. **9 of 11 handlers lack `@ApiResponse`** (LOW): only `create` and
   `generate-from-so` document responses (`controller:42-43, 172-173`).
4. **`updateBudgetLine` takes `@Body() Partial<CreateBudgetLineDto>`**
   (`controller:114`) — a type hint, not a validated DTO class; unknown/invalid
   fields are not rejected.
5. **No list envelope** — `findAll` returns a bare array, not
   `{ budgets, count }` (CLAUDE.md standard for list endpoints).

This spec's purpose is to close the scoping leaks, normalize the response
envelope and DTO validation, and document the module — without changing its
behavior or schema.

## Acceptance criteria

### Tenant scoping & soft delete
- [ ] Every write scopes by `tenantId`: `budget.update`/soft-delete and
      `budgetLine.update`/soft-delete use `updateMany({ where: { id, tenantId,
      deletedAt: null } })` + refetch (or `update` with a tenant-checked
      composite), never `where: { id }` alone (`service:100, 180, 490`).
- [ ] The reclaim path (`service:31-32`) scopes both deletes by `tenantId`
      (`budgetLine.deleteMany({ where: { budgetId, tenantId } })`,
      `budget.delete` replaced by a tenant-checked delete).
- [x] All reads (`findAll`, `findOne`, line `findFirst`, `getBudgetVsActual`)
      already scope `{ tenantId, deletedAt: null }` (`service:54, 70-71, 176,
      197, 241`).
- [x] `journalEntryLine.aggregate` in the vs-actual report scopes `tenantId`
      and `journalEntry: { status: 'posted', deletedAt: null }` (`service:250-256`).

### Endpoints (11)
- [x] All 11 routes guarded `@UseGuards(JwtAuthGuard, PermissionsGuard)` +
      `@RequirePermissions('ACCOUNTING:<ACTION>')` (`controller:34, 40…`).
- [ ] `findAll` returns `{ budgets, count }` (currently a bare array,
      `service:58`).

### DTO validation
- [x] `CreateBudgetDto` / `CreateBudgetLineDto` / `GenerateBudgetFromSoDto`
      carry `class-validator` decorators.
- [ ] `updateBudgetLine` binds a real `UpdateBudgetLineDto`
      (PartialType of `CreateBudgetLineDto`), not `Partial<…>`
      (`controller:114`).
- [ ] `budgetAmount` carries `@Max()` per the `Decimal(18,2)` column capacity
      (CLAUDE.md cap rule); `GenerateBudgetFromSoDto.soStatuses` carries
      `@IsIn(['draft','confirmed','shipped','delivered'], { each: true })`.

### State machine & error handling
- [x] `update`/`addBudgetLine`/`updateBudgetLine`/`removeBudgetLine` reject
      edits to `approved` budgets with `BadRequestException` (`service:85, 128,
      172, 193`).
- [x] `remove` only deletes `draft` budgets (`service:109`).
- [x] `approveBudget` rejects re-approval and empty budgets (`service:214-216`).
- [x] Not-found paths throw `NotFoundException` (`findOne:79`, line lookups
      `:178, 199`); duplicate code/line throw `ConflictException`
      (`:34, 144`); MRP missing GL account throws `BadRequestException`
      (`:306`).
- [ ] `create` adds a `P2002 → ConflictException` catch around the final
      `budget.create` (race-safe duplicate code), keeping the existing
      pre-check.

### Response format
- [ ] All 11 handlers carry `@ApiOperation` + at least one `@ApiResponse`
      (9 currently missing `@ApiResponse`: `controller:48-160`).

## Out of scope

- Changing the budget-vs-actual math or the MRP generation algorithm (revenue →
  promisedDate period, cost → promisedDate − leadTime period). Documented as-is.
- The `unitCost = 0` material-cost placeholder in MRP generation
  (`service:411`) — material standard-costing is a future costing-infra spec;
  this spec preserves the current zero-cost behavior, only noting it.
- Numeric code generation: budgets use a user-supplied `budgetCode`, not a
  generated sequence — no generator to migrate.
- Schema changes (none).

## Data model

No changes.

| Model | Table | Key fields | Constraints |
|---|---|---|---|
| Budget | `ac_budgets` | budgetCode, budgetName, fiscalYear, status, approvedAt/By | `@@unique([tenantId, budgetCode])`; soft delete; audit cols |
| BudgetLine | `ac_budget_lines` | budgetId, accountId, fiscalPeriod, budgetAmount `Decimal(18,2)`, notes | `@@unique([budgetId, accountId, fiscalPeriod])`; soft delete; audit cols |

Invariants: budget lines belong to one budget; one line per
(budget, account, period); `budgetAmount` non-negative in practice (not
DB-enforced — DTO `@Max` cap to add). Reads `Account` (chart-of-accounts) and
`JournalEntryLine` (for actuals), `SalesOrder`/`Bom` (for MRP generation) — all
via direct Prisma reads, tenant-scoped.

## API contracts

### POST /api/budgets  — `ACCOUNTING:CREATE`
```jsonc
// Request: CreateBudgetDto
{ "budgetCode": "BUDGET-2026", "budgetName": "2026 Annual Budget", "fiscalYear": "2026", "description": "…" }
// Response 201: Budget + budgetLines[] (empty on create)
// Errors: 409 budget code already exists
```

### GET /api/budgets?fiscalYear=&status=  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: { "budgets": [ Budget + budgetLines[] ], "count": <n> }   // envelope to add
```

### GET /api/budgets/:id  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: Budget + budgetLines[] (ordered by period, account number)
// Errors: 404 not found
```

### PATCH /api/budgets/:id  — `ACCOUNTING:EDIT`
```jsonc
// Request: UpdateBudgetDto (partial of CreateBudgetDto)
// Response 200: updated Budget
// Errors: 404 not found; 400 approved budgets immutable; 409 code collision
```

### DELETE /api/budgets/:id  — `ACCOUNTING:DELETE`  (soft delete, 200)
```jsonc
// Response 200: { "message": "Budget <code> deleted successfully" }
// Errors: 404 not found; 400 only draft budgets deletable
```

### POST /api/budgets/:id/lines  — `ACCOUNTING:CREATE`
```jsonc
// Request: CreateBudgetLineDto { accountId, fiscalPeriod, budgetAmount, notes? }
// Response 201: BudgetLine + account
// Errors: 404 budget/account not found; 400 approved budget; 409 line exists for account+period
```

### PATCH /api/budgets/:id/lines/:lineId  — `ACCOUNTING:EDIT`
```jsonc
// Request: UpdateBudgetLineDto (partial)   // bind a real DTO, not Partial<…>
// Response 200: updated BudgetLine
// Errors: 404 budget/line not found; 400 approved budget
```

### DELETE /api/budgets/:id/lines/:lineId  — `ACCOUNTING:DELETE`  (soft delete, 200)
```jsonc
// Response 200: { "message": "Budget line deleted successfully" }
// Errors: 404 budget/line not found; 400 approved budget
```

### PATCH /api/budgets/:id/approve  — `ACCOUNTING:POST`
```jsonc
// Response 200: { "message": "…approved…", "budget": Budget }
// Errors: 404 not found; 400 already approved / no lines
```

### GET /api/budgets/:id/vs-actual?startPeriod=&endPeriod=  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: { budgetCode, budgetName, fiscalYear,
//   lines: [{ accountNumber, accountName, accountType, fiscalPeriod,
//             budgetAmount, actualAmount, variance, variancePercent }] }
// actualAmount = Σ(debit − credit) over posted JE lines for account+period
// Errors: 404 budget not found
```

### POST /api/budgets/:id/generate-from-so  — `ACCOUNTING:CREATE`
```jsonc
// Request: GenerateBudgetFromSoDto { soStatuses[], overwrite?, defaultMaterialAccount?, defaultLaborAccount?, defaultRevenueAccount? }
// Response 201: { message, linesGenerated, linesSkipped, salesOrdersProcessed, soLineItems, upsertedLines[], detail[], budget }
// Errors: 404 budget not found; 400 approved budget / GL account not found
```

## Implementation notes

| File | Change |
|---|---|
| `budgets.service.ts` | Scope 4 writes by `tenantId` (`:31, 100, 180, 490`); `{ budgets, count }` in `findAll`; `P2002 → 409` catch in `create` |
| `budgets.controller.ts` | `@ApiResponse` on 9 handlers; bind `UpdateBudgetLineDto` |
| `dto/update-budget-line.dto.ts` | NEW — `PartialType(CreateBudgetLineDto)` |
| `dto/create-budget-line.dto.ts` | `@Max()` cap on `budgetAmount` |
| `dto/generate-budget.dto.ts` | `@IsIn([...], { each: true })` on `soStatuses` |
| frontend | `frontend-sync` sweep for `GET /budgets` consumers after the envelope change |

Cross-module reads (no service injection — direct Prisma, tenant-scoped):
`Account`, `JournalEntryLine`, `SalesOrder` + `Bom`/`BomComponent`/`Routing`/
`WorkCenter`. Per CLAUDE.md these reads of other modules' data should ideally go
through their services; documented as accepted debt (read-only aggregation, not
worth the coupling churn in this spec) unless the reviewer says otherwise.

## Verification checklist

```bash
# 1. Tenant-scoped writes: tenant B cannot update/delete tenant A's budget/line
#    PATCH /api/budgets/<A-budget-id> as tenant B → 404 (not 200)
# 2. Envelope: GET /api/budgets → { budgets: [...], count: N }
# 3. DTO: PATCH /api/budgets/:id/lines/:lineId with a junk field → 400
# 4. budgetAmount over the Decimal(18,2) cap → 400
# 5. generate-from-so with soStatuses:['bogus'] → 400 (@IsIn)
# 6. Approved-budget guards: approve, then PATCH/add-line/delete-line → 400 each
# 7. vs-actual: a posted JE in the period moves actualAmount/variance
# 8. Swagger: GET /api/docs shows responses for all 11 budget handlers
# 9. cd backend && pnpm build && pnpm test budgets.service && pnpm test:e2e
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-07 | Spec generated from code by spec-generator (opportunity-finder score 29: 4 cross-tenant write leaks, 9 missing @ApiResponse, weak update-line DTO, bare-array list) | Draft — pending review |
