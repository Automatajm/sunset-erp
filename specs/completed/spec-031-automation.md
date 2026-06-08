# spec-031 — Automation Engine (Auto-JE Config + Review Queue)

Status: **Complete**
Owner: Axiom Systems
Sprint: finance hardening (3 of 5 — opportunity-finder score 18, last of the 3 critical)
Module(s): automation
Last updated: 2026-06-07

## Purpose

- **Who uses this module?** Accountants and finance reviewers who decide which accounting events post automatically and which need human sign-off before hitting the ledger.
- **What business problem does it solve?** It centralizes the policy for auto-generated journal entries — per accounting event, choose post-immediately, draft-and-queue-for-review, or no-auto-entry — and provides a review queue where draft entries are approved or rejected before they reach the general ledger.
- **What can the business NOT do without this module?** Without it, every operational event (invoices, payments, goods receipts, production) would require manual journal entries, or auto-postings would hit the ledger with no review gate or per-tenant control.

## Business value

This is what lets operations and accounting stay in sync without an army of bookkeepers: routine events post their own journal entries automatically, while higher-risk entries wait in a review queue for an accountant's approval. The business gets the speed of automation where it is safe and a human control point where it matters, instead of choosing between slow manual entry and uncontrolled auto-posting. Because it is the single gateway every module calls to emit a journal entry, it keeps the ledger consistent and auditable across the whole ERP.

## Problem

The automation module governs auto-generated journal entries: a per-module
config (`auto_automation_configs`) sets each accounting event's mode
(`full_auto` = post immediately, `review_required` = draft + queue, `manual` =
no auto-JE), and a review queue (`auto_je_queue`) holds draft JEs awaiting
finance approval. `handleAutoJe` is the shared entry point all other modules
call to emit a JE.

It is functional but never had a spec. The opportunity-finder (2026-06-06, score
18) found cross-tenant write leaks in the queue review paths — the most dangerous
class here because the writes touch the **general ledger**:

1. **Cross-tenant GL writes — `id`-only `where`** (CRITICAL): the approve/reject
   paths fetch the queue item scoped (`findFirst({ where: { id: queueId,
   tenantId } })`), so `item.jeId` is tenant-validated, but the subsequent GL
   writes key off `id` alone:
   - `service:217-220` — `journalEntry.update({ where: { id: item.jeId } })`
     (approve → post)
   - `service:251` — `journalEntryLine.deleteMany({ where: { journalEntryId:
     item.jeId } })` (reject → hard-delete lines)
   - `service:252` — `journalEntry.delete({ where: { id: item.jeId } })`
     (reject → hard-delete JE)
   - `service:221-229, 253-262` — the two `autoJeQueue.update({ where: { id:
     queueId } })` writes (queueId is pre-validated but the write is still
     unscoped).
   A guessed `jeId`/`queueId` belonging to another tenant is therefore
   mutable/deletable through these paths. Per CLAUDE.md every write must scope
   by `tenantId` (`updateMany`/`deleteMany` with `tenantId`).
2. **Reject is a hard delete** (`service:251-252`) — by design (a rejected draft
   JE is removed, not soft-deleted). This is acceptable but MUST be
   tenant-scoped and is documented here as intentional (these JEs never posted).

NOTE: `auto_automation_configs` and `auto_je_queue` have **no `deletedAt`
column** (config + transient queue tables) — the `deletedAt: null` rule does NOT
apply; only `tenantId` scoping does. The reads (`getConfigs`, `getMode`,
`getQueue`, `getQueueStats`) already scope `{ tenantId }` correctly.

This spec closes the GL write leaks. Swagger and DTOs are already complete
(every handler has `@ApiOperation` + `@ApiResponse`; all DTOs carry
`class-validator` decorators incl. `@IsEnum(AutomationMode)`), so the surface is
narrow.

## Acceptance criteria

### Tenant scoping (the spec's purpose)
- [ ] `approveQueueItem` scopes both writes by `tenantId`: the JE post uses
      `journalEntry.updateMany({ where: { id: item.jeId, tenantId } })`, and the
      queue update uses `autoJeQueue.updateMany({ where: { id: queueId,
      tenantId } })` (`service:217, 221`).
- [ ] `rejectQueueItem` scopes all three writes by `tenantId`:
      `journalEntryLine.deleteMany({ where: { journalEntryId: item.jeId,
      tenantId } })`, `journalEntry.deleteMany({ where: { id: item.jeId,
      tenantId } })`, and `autoJeQueue.updateMany({ where: { id: queueId,
      tenantId } })` (`service:251, 252, 253`).
- [x] All reads scope `{ tenantId }` (`getConfigs:30,39`, `getMode:79`,
      `getQueue:163`, `getQueueStats:197-199`, the approve/reject `findFirst`
      `:210, 244`).
- [x] `handleAutoJe` stamps `tenantId` on the JE and every line
      (`service:115, 128`) and on the queue row (`service:147`).
- [x] `updateConfig` upsert keys on the composite `tenantId_module`
      (`service:57`).

### Endpoints (6)
- [x] All 6 routes guarded `@UseGuards(JwtAuthGuard, PermissionsGuard)` +
      `@RequirePermissions('ACCOUNTING:VIEW' | 'ACCOUNTING:POST')`.
- [x] All 6 handlers carry `@ApiOperation` + `@ApiResponse`
      (`controller:29-118`).

### DTO validation
- [x] `UpdateAutomationConfigDto.mode` is `@IsEnum(AutomationMode)` (whitelist
      of full_auto/review_required/manual); `RejectQueueItemDto.rejectReason` is
      required `@IsString`.
- [ ] The `@ApiParam` module list on `PATCH config/:module` (`controller:48-52`)
      is updated to the current `AUTOMATION_MODULES` set (it omits the AP
      modules `ap_invoice`/`ap_payment`/`ap_reversal` and `po_receipt`/`mo_issue`
      added later) — doc-only accuracy fix.

### Error handling & state machine
- [x] `updateConfig` rejects an unknown module with `BadRequestException`
      (`service:51`).
- [x] `approveQueueItem`/`rejectQueueItem` throw `NotFoundException` for a
      missing/other-tenant queue item and `BadRequestException` when the item is
      not `pending` (`service:214-215, 248-249`).

## Out of scope

- The hardcoded `currency: 'USD'` / `exchangeRate: 1` on auto-generated JE lines
  (`service:134-135`) — auto-JEs are internal ledger postings, not
  user-currency transactions; the frozen-rate pattern (spec-021) governs the
  source monetary documents that call `handleAutoJe`, not the JE lines
  themselves. Left as-is; noted, not changed.
- Adding soft-delete to config/queue tables (they are config + transient by
  design; reject hard-deletes an unposted draft).
- Changing the auto-JE generation logic or the mode semantics.
- A list envelope: `getConfigs`/`getQueue` return arrays consumed by the
  automation settings UI; no `{ x, count }` envelope is introduced (these are
  fixed-cardinality config lists, not paginated resources) — if the reviewer
  wants consistency, that is a follow-up.
- Schema changes (none).

## Data model

No changes.

| Model | Table | Key fields | Constraints |
|---|---|---|---|
| AutomationConfig | `auto_automation_configs` | module, mode, isEnabled, notes | `@@unique([tenantId, module])`; NO soft delete; `updatedBy` only |
| AutoJeQueue | `auto_je_queue` | jeId, eventType, sourceType, sourceId, sourceRef, status, reviewedBy/At, rejectReason | NO soft delete; indexes on (tenant,status), (tenant,eventType), jeId |

Writes `JournalEntry` + `JournalEntryLine` (post on approve; hard-delete on
reject) — must be tenant-scoped. `handleAutoJe` is called by ar/ap-invoices,
payments, production (fg-delivery/variance), goods-receipts, mo-issue.

## API contracts

### GET /api/automation/config  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: AutomationConfig[] (creates full_auto defaults for missing modules)
```

### PATCH /api/automation/config/:module  — `ACCOUNTING:POST`
```jsonc
// Request: UpdateAutomationConfigDto { mode, isEnabled?, notes? }
// Response 200: upserted AutomationConfig
// Errors: 400 unknown module
```

### GET /api/automation/queue?status=&eventType=  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: AutoJeQueue[] each with full journalEntry + lines (debit/credit as numbers)
```

### GET /api/automation/queue/stats  — `ACCOUNTING:VIEW`
```jsonc
// Response 200: { pending, approved, rejected, total }
```

### PATCH /api/automation/queue/:id/approve  — `ACCOUNTING:POST`
```jsonc
// Request: ReviewQueueItemDto { notes? }
// Response 200: { message, queueId, jeId }   // JE posted, queue item approved
// Errors: 404 item not found; 400 item already reviewed
```

### PATCH /api/automation/queue/:id/reject  — `ACCOUNTING:POST`
```jsonc
// Request: RejectQueueItemDto { rejectReason, notes? }
// Response 200: { message, queueId, rejectReason }   // draft JE hard-deleted
// Errors: 404 item not found; 400 item already reviewed
```

## Implementation notes

| File | Change |
|---|---|
| `automation.service.ts` | Scope the 5 GL/queue writes by `tenantId` (`:217, 221, 251, 252, 253`) via `updateMany`/`deleteMany` |
| `automation.controller.ts` | Refresh the `@ApiParam` module list (doc accuracy) |

No frontend-sync needed: no response shape changes (no envelope added). No DTO
changes. No schema changes.

## Verification checklist

```bash
# 1. Tenant isolation: tenant B approving/rejecting tenant A's queue item → 404
#    (findFirst already scopes; the writes now cannot touch A's JE either)
# 2. Approve: a review_required JE goes draft → posted; queue item → approved
# 3. Reject: draft JE + its lines hard-deleted (tenant-scoped); queue → rejected
# 4. Unknown module on PATCH config/:module → 400
# 5. Approve/reject an already-reviewed item → 400
# 6. cd backend && pnpm build && pnpm test automation.service && pnpm test:e2e
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-07 | Spec generated from code by spec-generator (opportunity-finder score 18: 3+ cross-tenant GL write leaks in approve/reject; Swagger + DTOs already complete; config/queue tables have no soft-delete by design) | Draft — pending review |
| 2026-06-07 | Implemented + test-scaffolded: 5 cross-tenant GL/queue writes scoped (approve JE post + queue update; reject JE+lines hard-delete + queue update); @ApiParam module list refreshed. Unit 14/14, e2e 11/11. | Implemented |
| 2026-06-07 | Ship gates: compliance 100% (0 id-only writes, 10 tenant-scoped where clauses); unit 14/14; full e2e 441/441 on clean run (intermittent notification-drain flake on 2 prior runs, non-reproducible on re-run); nest build OK; lint clean (src 0 prettier; test/ tsconfig exclusion pre-existing). Shipped to origin; marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
