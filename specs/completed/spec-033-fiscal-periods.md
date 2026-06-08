# spec-033 — Fiscal Periods (Period Master + Open/Closed/Locked State Machine)

Status: **Complete**
Owner: Axiom Systems
Sprint: finance hardening (5 of 5 — opportunity-finder score 3, cleanest of the five)
Module(s): fiscal-periods
Last updated: 2026-06-07

## Purpose

- **Who uses this module?** Accountants and finance controllers who run the monthly/quarterly close and control which accounting periods accept new entries.
- **What business problem does it solve?** It manages accounting periods with an open → closed → locked state machine (plus reopen/unlock), designates the current period, and guards against closing a period with unposted entries or deleting one that has any — so the books can be closed cleanly and protected from after-the-fact changes.
- **What can the business NOT do without this module?** Without it, there is no period close — entries could be posted or altered in any prior month at any time, so the business could never finalize a period or trust that a closed month's numbers will not change underneath it.

## Business value

Closing a period is how a business says "these numbers are final" — and that finality is what tax filings, audits, and reporting depend on. This module enforces the close: it blocks closing a month while entries are still unposted, and once closed (or locked) it stops anyone from quietly rewriting history. Without it, every prior period stays editable forever, so reported figures can drift after the fact and the business loses the audit trail and trust that financial controls exist.

## Problem

The fiscal-periods module manages accounting periods (`ac_fiscal_periods`) and a
status state machine (`open → closed → locked`, with `reopen`/`unlock` reverse
transitions), the "current period" singleton, and guards that block closing a
period with unposted JEs or deleting one with any JE. The opportunity-finder
(2026-06-06, score 3 — the cleanest of the five finance modules) confirmed full
Swagger, permissions, DTOs, scoped reads, and a correctly-validated state
machine. Remaining debt:

1. **`status` is an unconstrained `@IsString`** (`create-fiscal-period.dto.ts`)
   — it should whitelist `@IsIn(['open','closed','locked'])`. Without it,
   `create` (and `update` via PartialType) accept an arbitrary status string
   that bypasses the state machine.
2. **State-machine writes are `id`-only** (consistency / defense-in-depth): the
   six mutations each call `findOne(tenantId, id)` first (so ownership is
   validated), but the subsequent `update` keys off `id` alone — `update:176`,
   `closePeriod:207`, `reopenPeriod:234`, `lockPeriod:257`, `unlockPeriod:278`,
   `remove:314`. Per CLAUDE.md every write scopes `tenantId`.
3. **No list envelope** — `findAll` returns a bare array, not
   `{ fiscalPeriods, count }` (CLAUDE.md standard; the other finance modules now
   carry it).

This spec adds the status whitelist, scopes the writes, and adds the envelope —
no behavior or schema change.

## Acceptance criteria

### DTO validation
- [ ] `CreateFiscalPeriodDto.status` carries `@IsIn(['open','closed','locked'])`
      (inherited by `UpdateFiscalPeriodDto` via `PartialType`).
- [x] `periodCode`/`periodName`/`fiscalYear` are bounded `@IsString`;
      `startDate`/`endDate` are `@IsDateString`; `isCurrent` is `@IsBoolean`.

### Tenant scoping
- [ ] All six writes scope by `tenantId`: `update`, `closePeriod`,
      `reopenPeriod`, `lockPeriod`, `unlockPeriod`, `remove` use
      `updateMany({ where: { id, tenantId, deletedAt: null } })` + refetch (or a
      tenant-checked composite), never `where: { id }` alone.
- [x] All reads scope `{ tenantId, deletedAt: null }` (`findAll:65-67`,
      `findOne:90-93`, `getCurrentPeriod:106-109`, the duplicate-code checks
      `:18-22, 130-134`, the JE-count guards `:193-198, 301-305`).
- [x] The "unset other current" `updateMany` already scopes `tenantId`
      (`:33-37, 147-153`).

### State machine (already correct — documented)
- [x] `closePeriod` rejects already closed/locked and blocks on unposted JEs
      (`:187, 201`).
- [x] `reopenPeriod` allows only `closed → open`, rejects `locked` (`:226, 230`).
- [x] `lockPeriod` allows only `closed → locked` (`:253`).
- [x] `unlockPeriod` allows only `locked → closed` (`:274`).
- [x] `remove` blocks closed/locked and periods with any JE (`:295, 308`).
- [x] Setting `isCurrent` unsets the prior current period atomically.

### Endpoints (10) & response format
- [x] All routes guarded + `@RequirePermissions('ACCOUNTING:<ACTION>')` with
      full `@ApiOperation`/`@ApiResponse`.
- [ ] `findAll` returns `{ fiscalPeriods, count }` (currently a bare array,
      `service:78-85`).

## Out of scope

- Auto-generating a year of periods (a "create fiscal year" bulk helper) —
  useful but a new feature, not hardening.
- Cross-validating `startDate <= endDate` / non-overlap between periods — the
  module trusts the caller here today; could be a follow-up.
- Wiring period status into JE posting (blocking posts to closed periods is
  enforced by the JE module / spec-015, not here).
- Schema changes (none).

## Data model

No changes.

| Model | Table | Key fields | Constraints |
|---|---|---|---|
| FiscalPeriod | `ac_fiscal_periods` | periodCode, periodName, startDate, endDate, fiscalYear, fiscalQuarter?, status, isCurrent, closedAt/By | `@@unique([tenantId, periodCode])`; soft delete; audit cols |

Reads `JournalEntry` (count guards for close/delete), tenant-scoped.

## API contracts

### POST /api/fiscal-periods  — `ACCOUNTING:CREATE`
```jsonc
// Request: CreateFiscalPeriodDto { periodCode, periodName, startDate, endDate, fiscalYear, fiscalQuarter?, status?, isCurrent? }
// Response 201: FiscalPeriod
// Errors: 409 period code exists; 400 invalid status (not open|closed|locked)
```

### GET /api/fiscal-periods?fiscalYear=&status=  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: { "fiscalPeriods": [...], "count": N }   // envelope to add
```

### GET /api/fiscal-periods/current  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: FiscalPeriod (isCurrent)   // Errors: 404 none defined
```

### GET /api/fiscal-periods/:id  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: FiscalPeriod   // Errors: 404 not found
```

### PATCH /api/fiscal-periods/:id  — `ACCOUNTING:EDIT`
```jsonc
// Request: UpdateFiscalPeriodDto (partial)   // Response 200: updated; Errors: 404, 409
```

### PATCH /api/fiscal-periods/:id/close|reopen|lock|unlock  — `ACCOUNTING:POST`
```jsonc
// Response 200: { message, fiscalPeriod }
// close Errors: 400 already closed/locked OR unposted JEs exist
// reopen Errors: 400 only closed (locked must unlock first)
// lock Errors: 400 only closed ; unlock Errors: 400 only locked
```

### DELETE /api/fiscal-periods/:id  — `ACCOUNTING:DELETE`  (soft delete, 200)
```jsonc
// Response 200: { message, id }
// Errors: 400 closed/locked OR period has journal entries
```

## Implementation notes

| File | Change |
|---|---|
| `fiscal-periods.service.ts` | Scope the 6 writes by `tenantId` (`updateMany` + refetch); `{ fiscalPeriods, count }` envelope |
| `dto/create-fiscal-period.dto.ts` | `@IsIn(['open','closed','locked'])` on `status` |
| frontend | `frontend-sync`: `fiscalPeriodsApi` `extractList` already tolerates shapes — add `fiscalPeriods` key |

## Verification checklist

```bash
# 1. POST with status:'frozen' → 400 (@IsIn)
# 2. Envelope: GET /api/fiscal-periods → { fiscalPeriods: [...], count: N }
# 3. Tenant isolation: tenant B close/lock/delete of tenant A's period → 404
# 4. State machine: open→close→lock→unlock→reopen happy path; close with a draft JE → 400
# 5. remove a period that has JEs → 400
# 6. cd backend && pnpm build && pnpm test fiscal-periods.service && pnpm test:e2e
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-07 | Spec generated from code by spec-generator (opportunity-finder score 3: status missing @IsIn; id-only state-machine writes; bare-array list. State machine + scoping otherwise gold-standard) | Draft — pending review |
| 2026-06-07 | Implemented + test-scaffolded: status @IsIn whitelist; 6 writes tenant-scoped (update + 4 transitions + remove); { fiscalPeriods, count } envelope + frontend-sync. Unit 17/17, e2e 11/11. | Implemented |
| 2026-06-07 | Ship gates: compliance 100%; unit 17/17; full e2e 462/462 GREEN (the recurring exchange-rates flake was root-caused this run — its isolation test accumulated TENANT2 rates in a 28-day window that clean-e2e-residue.sh does not wipe; widened runDay to a ~33.6k-value date space, fixed in the same push). nest build OK; lint clean. Shipped to origin; marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
