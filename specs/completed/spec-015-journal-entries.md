# spec-015 — Journal Entries (General Ledger)

Status: **Draft**  
Owner: Platform  
Sprint: 19  
Module(s): `journal-entries` (touches `frontend/lib/api/journal-entries.ts` for the list envelope)  
Last updated: 2026-06-06  

---

## Problem

`journal-entries` is the general-ledger write path: double-entry journal entries with a
draft → posted lifecycle, system-assigned `JE-YYYYMM-NNNN` numbers, and line-level account
validation against the chart of accounts (spec-007). It is a direct prerequisite of
`production-orders`, `ar-invoices`, and `ap-invoices` (Tiers 5–6), all of which FK into
`JournalEntry` for their auto-generated ledger postings.

The module has a healthy skeleton — thin controller, 7/7 Swagger-annotated handlers,
nested DTO validation (`@ValidateNested` + `@ArrayMinSize(2)`), account checks enforcing
`allowManualPosting` + `isActive`, and spec-012-compliant code generation that correctly
spans soft-deleted rows. The audit (opportunity-finder, score 51) found four defect
families:

1. **Unscoped writes (4 sites) — the financial ledger's tenant-isolation gap.** Every
   mutation validates via `findOne(tenantId, id)` then writes `where: { id }` only:
   `update` (`journal-entries.service.ts:219`), `post` (`:251`), `unpost` (`:279`),
   `remove` (`:307`). The same class of bug spec-013 fixed in customers — the write
   itself must be tenant-scoped, not just the preceding read.
2. **Accounting correctness.**
   - The balance check (`:22`) sums JS floats and accepts `|debits − credits| ≤ 0.01`:
     an entry off by up to one cent **passes** and is stored unbalanced.
   - `@@unique([tenantId, entryNumber])` makes concurrent creates race → unhandled
     Prisma `P2002` → 500 (spec-014 established the `P2002 → 409` mapping convention).
   - A `debitAmount` beyond `Decimal(18,2)` range overflows → Prisma error → 500, not 400.
   - Line includes in `findAll` (`:136`) and `findOne` (`:166`) do not filter
     `deletedAt: null` on lines.
3. **Contract honesty.** `CreateJournalEntryLineDto` accepts `referenceType`/`referenceId`
   but `JournalEntryLine` has no such columns (`schema.prisma:1240`) and the service never
   maps them — fields validated, then silently dropped. `journalType` documents
   `general | adjustment | closing | opening` but accepts any string (no `@IsIn`); the
   `?status=` query filter is an unvalidated free string.
4. **Response format drift.** `findAll` returns a bare array; the project convention
   (spec-001, re-affirmed by specs 013/014) is the `{ journalEntries, count }` envelope.

Also observed, deliberately deferred (see Out of scope): line `currency` is hardcoded
`'USD'` (`:94`); post/unpost never consult `fiscal-periods`; account validation is one
query per line (N+1).

This spec pins the module to the invariants and fixes all four families without schema
changes.

---

## Acceptance criteria

### Endpoints (existing surface — preserved)
- [x] 7 endpoints under `/api/journal-entries`: `POST /`, `GET /`, `GET /:id`,
      `PATCH /:id`, `PATCH /:id/post`, `PATCH /:id/unpost`, `DELETE /:id`.
- [x] Controller-level `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth('JWT-auth')`.
- [x] Every handler has `@ApiOperation` + `@ApiResponse` (incl. 400/403/404 paths).
- [x] Controller is thin — every handler delegates to `JournalEntriesService` with
      `req.user.tenantId` / `req.user.id`.

### Tenant scoping
- [x] Reads scoped `{ tenantId, deletedAt: null }`: `findAll` (`:124-127`), `findOne`
      (`:159-164`), account checks (`:40-46`).
- [x] **Writes are tenant-scoped at the write itself** (not only via the preceding
      `findOne`): `update`, `post`, `unpost`, `remove` use
      `updateMany({ where: { id, tenantId, deletedAt: null } })` + re-fetch.
- [x] Line includes filter soft-deleted lines: `findAll` and `findOne` (and the
      includes on update/post/unpost responses via shared `LINES_INCLUDE`) add
      `where: { deletedAt: null }` to the `lines` include.
- [x] `generateJeNumber` scopes to `tenantId` and deliberately spans soft-deleted rows
      (spec-012 numeric-max contract) — `:326-336`.

### Double-entry integrity
- [x] Reject when any line has both debit and credit > 0, or neither (`:29-36`).
- [x] Balance check is **cent-exact**: compare debits and credits as integer cents
      (`Math.round(amount * 100)`), zero tolerance — an entry off by $0.01 is rejected
      with `400` stating both totals.
- [x] Every line's account must exist in-tenant (`404`), allow manual posting (`400`),
      and be active (`400`) — `:39-63`.
- [x] At least 2 lines required (`@ArrayMinSize(2)`).

### Lifecycle
- [x] Created entries start as `draft` with system-assigned `JE-YYYYMM-NNNN` and derived
      `fiscalPeriod` (`YYYY-MM` from `entryDate`).
- [x] `update` / `remove` allowed only on `draft` (`400` otherwise); `post` only on
      `draft`; `unpost` only on `posted`.
- [x] `update` recomputes `postingDate` + `fiscalPeriod` when `entryDate` changes.
- [x] `remove` is a soft delete (`deletedAt` + `deletedBy`) returning `{ message, id }`.
- [x] Lines are immutable after creation (no line-update API; documented).

### Codes (spec-012 conformance)
- [x] `entryNumber` is system-assigned, format `JE-YYYYMM-NNNN`, monthly sequence,
      zero-padded to 4.
- [x] Client-supplied `entryNumber` is rejected with `400` (not in DTO +
      `forbidNonWhitelisted`).
- [x] Concurrent-create race on `@@unique([tenantId, entryNumber])` maps Prisma `P2002`
      to `409 ConflictException` with a clear retry message — never a 500.

### DTO validation
- [x] `entryDate` `@IsDateString`; `description`/`reference` length-capped; lines
      `@ValidateNested({ each: true })`.
- [x] `journalType` restricted with `@IsIn(['general','adjustment','closing','opening'])`.
- [x] `referenceType`/`referenceId` **removed** from `CreateJournalEntryLineDto` — the
      columns do not exist and the values were silently dropped (contract lie). Clients
      sending them now get `400` via `forbidNonWhitelisted`.
- [x] `debitAmount`/`creditAmount` capped with `@Max(1e15)` (exactly-representable safe
      cap below the `Decimal(18,2)` capacity, whose true max is not a representable JS
      float) → out-of-range amounts fail with `400`, never a DB overflow 500.
- [x] `GET /?status=` validated: only `draft` or `posted` accepted
      (`FindJournalEntriesQueryDto` with `@IsIn(['draft','posted'])` + `@IsOptional`);
      anything else → `400`.

### RBAC
- [x] `POST` → `ACCOUNTING:CREATE`, `GET` → `ACCOUNTING:VIEW`, `PATCH /:id` →
      `ACCOUNTING:EDIT`, `post`/`unpost` → `ACCOUNTING:POST`, `DELETE` →
      `ACCOUNTING:DELETE`.

### Error handling
- [x] `404` unknown/other-tenant entry or account; `400` unbalanced / bad lifecycle /
      validation; `403` missing permission.
- [x] `409` on entryNumber unique-index collision (see Codes).

### Response format
- [x] `GET /api/journal-entries` returns `{ journalEntries: [...], count }`;
      `frontend/lib/api/journal-entries.ts` `getAll` unwraps it (1 getter).
- [x] Line amounts serialized as numbers (`Decimal.toNumber()` via
      `formatJournalEntryResponse`).
- [x] `post`/`unpost` return `{ message, journalEntry }`.

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations. (`referenceType`/`referenceId`
  columns are NOT added; the DTO fields are removed instead.)
- Multi-currency: line `currency` stays hardcoded `'USD'` with `exchangeRate 1`; a
  currency spec must follow tenant-settings.
- Fiscal-period enforcement (blocking post/unpost into closed periods) — requires the
  unspecced `fiscal-periods` module; deferred to its spec.
- Line editing on draft entries (delete + recreate is the workflow).
- Auto-generated JEs (`automation` module, `AutoJeQueue`) and the FK consumers
  (ar/ap-invoices, production variances).
- Batch posting, reversing entries, period-close workflows.
- N+1 account validation (could be one `findMany({ id: { in } })`) — micro-optimization,
  not a contract change; may be done opportunistically but is not a criterion.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `JournalEntry` | `ac_journal_entries` | `tenantId`, `entryNumber` (`JE-YYYYMM-NNNN`), `entryDate`, `postingDate`, `fiscalPeriod` (`YYYY-MM`), `journalType` (default `general`), `status` (`draft`/`posted`), audit + soft-delete; `@@unique([tenantId, entryNumber])` |
| `JournalEntryLine` | `ac_journal_entry_lines` | `tenantId`, `journalEntryId` (cascade), `lineNumber`, `accountId` FK → `Account`, `debitAmount`/`creditAmount` `Decimal(18,2)`, `currency`, `exchangeRate` `Decimal(18,6)`, audit + soft-delete |
| `Account` *(read-only, spec-007)* | `ac_accounts` | `allowManualPosting`, `isActive` gate manual JE lines |

Key invariants:
- Sum of line debits MUST equal sum of credits, cent-exact, per entry.
- Each line is single-sided: exactly one of `debitAmount`/`creditAmount` > 0.
- `entryNumber` unique per tenant; system-assigned; immutable (spec-012).
- Downstream FKs (`ArInvoice`, `ApInvoice`, `ProductionVariance`, `AutoJeQueue`) reference
  `JournalEntry` — `remove` is draft-only, so posted (referenced) entries are undeletable.

---

## API contracts

All routes prefixed `/api/journal-entries`, JWT + permissions guarded.

### POST /api/journal-entries *(ACCOUNTING:CREATE)*
```json
// Request
{ "entryDate": "2026-06-15", "journalType": "general",
  "description": "Office supplies", "reference": "INV-123",
  "lines": [
    { "accountId": "<uuid>", "debitAmount": 100.00, "creditAmount": 0, "description": "Supplies expense" },
    { "accountId": "<uuid>", "debitAmount": 0, "creditAmount": 100.00 }
  ] }

// Response 201 — entryNumber system-assigned, status draft
{ "id": "...", "entryNumber": "JE-202606-0001", "status": "draft",
  "fiscalPeriod": "2026-06", "journalType": "general",
  "lines": [ { "lineNumber": 1, "debitAmount": 100, "creditAmount": 0,
    "account": { "accountNumber": "...", "name": "...", "accountType": "..." } } ] }

// Errors: 400 unbalanced (cent-exact) / both-or-neither sides / journalType not in whitelist /
//         amount exceeds cap / entryNumber supplied / < 2 lines |
//         404 account not in tenant | 400 account is header or inactive |
//         409 entryNumber collision (concurrent create) | 403 missing permission
```

### GET /api/journal-entries?status=draft *(ACCOUNTING:VIEW)*
```json
// Response 200 (target envelope)
{ "journalEntries": [ { "id": "...", "entryNumber": "JE-202606-0001", "status": "draft",
    "entryDate": "...", "description": "...", "lines": [ { "...": "..." } ] } ],
  "count": 1 }

// Errors: 400 status not draft|posted | 403
```

### GET /api/journal-entries/:id *(ACCOUNTING:VIEW)*
```json
// Response 200 — full entry with lines (only non-deleted lines) ordered by lineNumber
// Errors: 404 unknown / other-tenant id | 403
```

### PATCH /api/journal-entries/:id *(ACCOUNTING:EDIT)*
```json
// Request (header fields only — lines immutable)
{ "entryDate": "2026-06-20", "description": "...", "reference": "..." }

// Response 200 — updated entry; fiscalPeriod/postingDate recomputed on entryDate change
// Errors: 400 not draft | 404 | 403
```

### PATCH /api/journal-entries/:id/post *(ACCOUNTING:POST)*
```json
// Response 200
{ "message": "Journal entry JE-202606-0001 posted successfully", "journalEntry": { "status": "posted" } }
// Errors: 400 not draft | 404 | 403
```

### PATCH /api/journal-entries/:id/unpost *(ACCOUNTING:POST)*
```json
// Response 200
{ "message": "Journal entry JE-202606-0001 unposted successfully", "journalEntry": { "status": "draft" } }
// Errors: 400 not posted | 404 | 403
```

### DELETE /api/journal-entries/:id *(ACCOUNTING:DELETE)*
```json
// Response 200
{ "message": "Journal entry deleted successfully", "id": "..." }
// Errors: 400 not draft | 404 | 403
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/journal-entries/journal-entries.service.ts` | Tenant-scope the 4 writes (`updateMany` + re-fetch); cent-exact balance check; `P2002 → 409` on create; `deletedAt: null` on `lines` includes; `findAll` envelope `{ journalEntries, count }` |
| `src/modules/journal-entries/journal-entries.controller.ts` | Bind `?status=` to a validated query DTO; Swagger: add `409` to POST, `400` to GET list |
| `src/modules/journal-entries/dto/create-journal-entry.dto.ts` | `@IsIn` on `journalType` |
| `src/modules/journal-entries/dto/create-journal-entry-line.dto.ts` | Remove `referenceType`/`referenceId`; `@Max` caps on amounts |
| `src/modules/journal-entries/dto/find-journal-entries-query.dto.ts` | **New** — `{ status?: 'draft' \| 'posted' }` with `@IsIn` + `@IsOptional` |
| `frontend/lib/api/journal-entries.ts` | `getAll` unwraps `{ journalEntries, count }` |

### Cross-module dependencies
- **`chart-of-accounts` (spec-007)** — line validation reads `Account`
  (`allowManualPosting`, `isActive`) via own Prisma query; read-only FK-target
  validation, acceptable per the warehouses precedent in spec-014.
- Consumed by: `ar-invoices`, `ap-invoices`, `production-orders`, `automation`
  (all unspecced) — module exports `JournalEntriesService`.

### Balance check — implementation contract
Sum integer cents, not floats:
```ts
const debits = lines.reduce((s, l) => s + Math.round(l.debitAmount * 100), 0);
const credits = lines.reduce((s, l) => s + Math.round(l.creditAmount * 100), 0);
if (debits !== credits) throw new BadRequestException(...);
```
The per-line single-sided check compares the rounded cents too (`> 0` → `>= 1` cent),
so sub-cent noise (e.g. `0.001`) cannot slip through either side.

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`);
  Swagger at `/api/docs`; module registered in `app.module.ts`.

---

## Verification checklist

```bash
# 0. Login (spec-001) → $TOKEN; two postable account ids → $ACC_DR, $ACC_CR
BASE=http://localhost:3000/api/journal-entries
AUTH="Authorization: Bearer $TOKEN"
LINES_OK='[{"accountId":"'$ACC_DR'","debitAmount":100,"creditAmount":0},{"accountId":"'$ACC_CR'","debitAmount":0,"creditAmount":100}]'

# 1. Create balanced → 201, JE-YYYYMM-NNNN, draft
curl -s -X POST $BASE -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"entryDate":"2026-06-15","journalType":"general","lines":'$LINES_OK'}' | jq '.entryNumber,.status'
# Expected: "JE-202606-NNNN", "draft"

# 2. Off-by-one-cent → 400 (cent-exact)
#    debit 100.00 vs credit 100.01
# Expected: 400 "not balanced"

# 3. journalType "weird" → 400; status=weird on GET → 400
# 4. referenceType in a line → 400 (forbidNonWhitelisted)
# 5. debitAmount 1e17 → 400 (cap), not 500
# 6. GET / → { journalEntries, count } envelope
curl -s $BASE -H "$AUTH" | jq 'has("journalEntries") and has("count")'
# Expected: true

# 7. Lifecycle: PATCH draft → 200; post → 200; PATCH posted → 400; unpost → 200; DELETE draft → 200
# 8. Account gates: header account line → 400; inactive account → 400; foreign account uuid → 404
# 9. Tenant isolation (tenant2admin token): GET/PATCH/POST/UNPOST/DELETE on tenant-A id → 404;
#    list does not contain tenant-A entries
# 10. Build + lint + tests
cd backend && pnpm build && pnpm test journal-entries.service && pnpm test:e2e journal-entries
# Expected: all pass
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 51) | Draft — 4 unscoped writes, line-include soft-delete gap, float-tolerant balance check, P2002 mapping, journalType/status whitelists, phantom referenceType/referenceId DTO fields, amount caps, list envelope captured as unchecked criteria |
| 2026-06-06 | Test scaffolding written (26 unit / 17 e2e, 15 tagged [GAP]) | Red as expected on all gaps |
| 2026-06-06 | All 10 gaps implemented: tenant-scoped writes (updateMany + refetch), cent-exact balance, P2002→409, deletedAt-filtered line includes, journalType/status whitelists, phantom DTO fields removed, @Max(1e15) caps, list envelope + frontend unwrap | Unit 26/26 ✅, e2e 17/17 ✅, backend build ✅, frontend build ✅, module lint clean |
