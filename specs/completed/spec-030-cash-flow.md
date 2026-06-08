# spec-030 — Cash Flow (Projections + Lines + Summary + Generate-from-Data)

Status: **Complete**
Owner: Axiom Systems
Sprint: finance hardening (2 of 5 — opportunity-finder score 20)
Module(s): cash-flow
Last updated: 2026-06-07

## Purpose

- **Who uses this module?** Finance and treasury staff who forecast liquidity and decide when the business can pay suppliers, make purchases, or take on commitments.
- **What business problem does it solve?** It projects future cash inflows and outflows over a date range, auto-populated from AR invoices, purchase orders, and budget lines, and produces a monthly summary with running balance so the business can see when cash will be tight or flush.
- **What can the business NOT do without this module?** Without it, the business cannot anticipate cash shortfalls or surpluses — it discovers a liquidity crunch only when a payment bounces, with no forward view to plan around it.

## Business value

Cash-flow visibility is the difference between making payroll and missing it: a profitable company can still fail if money goes out before it comes in. This module projects the timing of receipts and payments and shows the running balance month by month, so treasury can spot a shortfall weeks ahead and arrange financing, delay a purchase, or chase a receivable in time. Pulling projections automatically from AR, POs, and budgets means the forecast reflects real commitments rather than manual guesses that go stale the day they are made.

## Problem

The cash-flow module manages cash-flow projections (`ac_cash_flow_projections`),
their inflow/outflow lines (`ac_cash_flow_lines`), a monthly summary report
(running balance), and auto-population from AR invoices, POs, and budget lines.
It is functional and (unlike budgets) already carries full Swagger annotations,
but the opportunity-finder (2026-06-06, score 20) found four cross-tenant write
leaks plus DTO/envelope gaps:

1. **Cross-tenant writes — `id`-only `where`** (4 sites, CRITICAL): every write
   keys off `id` alone, so a guessed id from another tenant is mutable/deletable:
   - `service:170-172` — `cashFlowProjection.update({ where: { id } })`
   - `service:189-195` — `cashFlowProjection.update({ where: { id } })` (soft delete)
   - `service:296-298` — `cashFlowLine.update({ where: { id: lineId } })`
   - `service:323-329` — `cashFlowLine.update({ where: { id: lineId } })` (soft delete)
   The fetch-first methods (`findOne`, the line `findFirst`) ARE scoped, so the
   leak is narrow, but the writes must scope per CLAUDE.md
   (`updateMany({ where: { id, tenantId, deletedAt: null } })` + refetch).
2. **`create` pre-check only** (`service:27-39`) — checks the unique code but no
   `P2002 → 409` net, so a concurrent create races the `@@unique([tenantId,
   projectionCode])`.
3. **`updateCashFlowLine` takes `@Body() Partial<CreateCashFlowLineDto>`**
   (`controller:138`) — a type hint, not a validated DTO; junk fields slip past
   `forbidNonWhitelisted`.
4. **`generateFromData` takes an inline-typed `@Body()`** (`controller:186-193`)
   — no DTO, no validation on the date strings or include flags.
5. **No list envelope** — `findAll` returns a bare array, not
   `{ cashFlowProjections, count }` (CLAUDE.md standard).
6. **Weak field validation** — `amount` has no `@Max` cap (`Decimal(18,2)`);
   `lineType` has no `@IsIn(['inflow','outflow'])`; `scenario` has no
   `@IsIn(['optimistic','realistic','pessimistic'])`; `accountId` is `@IsString`,
   not `@IsUUID`.

This spec closes the scoping leaks, adds the envelope, the missing DTOs, and the
field whitelists/caps — without changing behavior or schema.

## Acceptance criteria

### Tenant scoping & soft delete
- [ ] All 4 writes scope by `tenantId`: projection update/soft-delete and line
      update/soft-delete use `updateMany({ where: { id, tenantId, deletedAt:
      null } })` + refetch, never `where: { id }` alone
      (`service:170, 189, 296, 323`).
- [x] All reads (`findAll`, `findOne`, line `findFirst`, account check,
      generate-from-data sources) already scope `{ tenantId, deletedAt: null }`
      (`service:72, 103, 216, 264, 310, 442, 469, 500`).
- [x] `createMany` in generate-from-data stamps `tenantId` on every row
      (`service:453, 484, 520`).

### Endpoints (10)
- [x] All 10 routes guarded `@UseGuards(JwtAuthGuard, PermissionsGuard)` +
      `@RequirePermissions('ACCOUNTING:<ACTION>')`.
- [ ] `findAll` returns `{ cashFlowProjections, count }` (currently a bare
      array, `service:81-99`).

### DTO validation
- [x] `CreateCashFlowProjectionDto` / `CreateCashFlowLineDto` carry
      `class-validator` decorators.
- [ ] `updateCashFlowLine` binds a real `UpdateCashFlowLineDto`
      (PartialType of `CreateCashFlowLineDto`), not `Partial<…>`
      (`controller:138`).
- [ ] `generateFromData` binds a real `GenerateCashFlowDto`
      (`startDate?`, `endDate?` `@IsDateString`; `includeAR?`/`includePO?`/
      `includeBudget?` `@IsBoolean`), not an inline `@Body()` (`controller:186`).
- [ ] `amount` carries `@Max()` per `Decimal(18,2)` capacity; `lineType`
      carries `@IsIn(['inflow','outflow'])`; `scenario` carries
      `@IsIn(['optimistic','realistic','pessimistic'])`; `accountId` is
      `@IsUUID`.

### Error handling
- [x] Not-found paths throw `NotFoundException` (`findOne:124`, line lookups
      `:273, 319`, account `:224`); duplicate code throws `ConflictException`
      (`:36, 150`).
- [ ] `create` adds a `P2002 → ConflictException` catch around
      `cashFlowProjection.create`, keeping the existing pre-check.

### Response format
- [x] All 10 handlers carry `@ApiOperation` + `@ApiResponse` (cash-flow already
      fully annotated, `controller:40-182`).

## Out of scope

- The summary math (monthly grouping, running balance) and the generate-from-data
  heuristics (AR invoiceDate → inflow; PO expectedDate-or-+30d → outflow; budget
  5.x accounts → outflow) — documented as-is, not changed.
- A status/approval state machine — cash-flow projections have no status field;
  none added.
- Numeric code generation — projections use a user-supplied `projectionCode`.
- Schema changes (none).

## Data model

No changes.

| Model | Table | Key fields | Constraints |
|---|---|---|---|
| CashFlowProjection | `ac_cash_flow_projections` | projectionCode, projectionName, startDate, endDate, scenario | `@@unique([tenantId, projectionCode])`; soft delete; audit cols |
| CashFlowLine | `ac_cash_flow_lines` | cashFlowProjectionId, lineDate, lineType, category, amount `Decimal(18,2)`, accountId? | soft delete; audit cols; FK to projection + optional account |

Reads `Account`, `ArInvoice`, `PurchaseOrder`, `BudgetLine` (generate-from-data),
all tenant-scoped via direct Prisma.

## API contracts

### POST /api/cash-flow  — `ACCOUNTING:CREATE`
```jsonc
// Request: CreateCashFlowProjectionDto { projectionCode, projectionName, startDate, endDate, scenario?, description? }
// Response 201: CashFlowProjection + cashFlowLines[]
// Errors: 409 projection code already exists
```

### GET /api/cash-flow?scenario=  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: { "cashFlowProjections": [ … + cashFlowLines[] ], "count": N }   // envelope to add
```

### GET /api/cash-flow/:id  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: CashFlowProjection + cashFlowLines[]
// Errors: 404 not found
```

### PATCH /api/cash-flow/:id  — `ACCOUNTING:EDIT`
```jsonc
// Request: UpdateCashFlowProjectionDto (partial)
// Response 200: updated projection
// Errors: 404 not found; 409 code collision
```

### DELETE /api/cash-flow/:id  — `ACCOUNTING:DELETE`  (soft delete, 200)
```jsonc
// Response 200: { "message": "Cash flow projection <code> deleted successfully" }
// Errors: 404 not found
```

### POST /api/cash-flow/:id/lines  — `ACCOUNTING:CREATE`
```jsonc
// Request: CreateCashFlowLineDto { lineDate, lineType, category, amount, description?, accountId? }
// Response 201: CashFlowLine + account
// Errors: 404 projection/account not found
```

### PATCH /api/cash-flow/:id/lines/:lineId  — `ACCOUNTING:EDIT`
```jsonc
// Request: UpdateCashFlowLineDto (partial)   // bind a real DTO
// Response 200: updated CashFlowLine
// Errors: 404 projection/line not found
```

### DELETE /api/cash-flow/:id/lines/:lineId  — `ACCOUNTING:DELETE`  (soft delete, 200)
```jsonc
// Response 200: { "message": "Cash flow line deleted successfully" }
// Errors: 404 projection/line not found
```

### GET /api/cash-flow/:id/summary  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: { projectionCode, projectionName, scenario, startDate, endDate,
//   periods: [{ period, totalInflows, totalOutflows, netCashFlow, runningBalance, inflows[], outflows[] }],
//   totals: { totalInflows, totalOutflows, netCashFlow, endingBalance } }
// Errors: 404 not found
```

### POST /api/cash-flow/:id/generate-from-data  — `ACCOUNTING:CREATE`
```jsonc
// Request: GenerateCashFlowDto { startDate?, endDate?, includeAR?, includePO?, includeBudget? }
// Response 201: { message, linesCreated, breakdown: { arInflows, poOutflows, budgetOutflows } }
// Errors: 404 projection not found
```

## Implementation notes

| File | Change |
|---|---|
| `cash-flow.service.ts` | Scope 4 writes by `tenantId` (`:170, 189, 296, 323`); `{ cashFlowProjections, count }` envelope; `P2002 → 409` catch in `create` |
| `cash-flow.controller.ts` | Bind `UpdateCashFlowLineDto` + `GenerateCashFlowDto` |
| `dto/update-cash-flow-line.dto.ts` | NEW — `PartialType(CreateCashFlowLineDto)` |
| `dto/generate-cash-flow.dto.ts` | NEW — date strings + include flags |
| `dto/create-cash-flow-line.dto.ts` | `@Max` on `amount`, `@IsIn` on `lineType`, `@IsUUID` on `accountId` |
| `dto/create-cash-flow-projection.dto.ts` | `@IsIn` on `scenario` |
| frontend | `frontend-sync` sweep for `GET /cash-flow` consumers after the envelope change |

Cross-module reads (direct Prisma, tenant-scoped): `Account`, `ArInvoice`,
`PurchaseOrder`, `BudgetLine` — accepted read-only debt (aggregation), as in
spec-029.

## Verification checklist

```bash
# 1. Tenant-scoped writes: tenant B cannot update/delete tenant A's projection/line → 404
# 2. Envelope: GET /api/cash-flow → { cashFlowProjections: [...], count: N }
# 3. DTO: PATCH /api/cash-flow/:id/lines/:lineId with a junk field → 400
# 4. amount over the Decimal(18,2) cap → 400; lineType:'sideways' → 400; scenario:'wild' → 400
# 5. generate-from-data with startDate:'notadate' → 400
# 6. summary: inflow/outflow lines produce period totals + running balance
# 7. cd backend && pnpm build && pnpm test cash-flow.service && pnpm test:e2e
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-07 | Spec generated from code by spec-generator (opportunity-finder score 20: 4 cross-tenant write leaks, weak update-line/generate DTOs, bare-array list, missing field whitelists/caps) | Draft — pending review |
| 2026-06-07 | Implemented + test-scaffolded: 4 cross-tenant write leaks closed (updateMany + refetch), P2002→409, { cashFlowProjections, count } envelope (+ frontend-sync extractList), real UpdateCashFlowLineDto + GenerateCashFlowDto, @Max/@IsIn/@IsUUID DTO caps. Unit 15/15, e2e 13/13 (tenant-isolation verified). | Implemented |
| 2026-06-07 | Ship gates: compliance 100% (0 id-only writes, 4 updateMany, envelope, P2002); unit 15/15; full e2e 430/430 on two consecutive runs (one transient 20-fail run from shared-DB contention, green on re-run); nest build OK; lint clean (src 0 prettier; test/ tsconfig exclusion is pre-existing repo debt). Shipped to origin (067faa7); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
