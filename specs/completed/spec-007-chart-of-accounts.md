# spec-007 — Chart of Accounts (Accounting Foundation)

Status: **Complete**  
Owner: Accounting  
Sprint: 19  
Module(s): `chart-of-accounts` (touches `frontend/lib/api/chart-of-accounts.ts` and `frontend/app/settings/bulk-import/page.tsx` for the list envelope)  
Last updated: 2026-06-04  

---

## Problem

The chart of accounts is the root of the accounting domain: `journal-entries`, `budgets`,
`cash-flow`, AR/AP invoices, and the `categories` account mappings all hold foreign keys
into `ac_accounts`. It is Tier 0 in the module cascade and must be specced before any of
those. The module is mature (7 endpoints, full Swagger, thin controller, all reads
correctly scoped) — but a code audit (2026-06-04, opportunity-finder score 22) found six
concrete deviations from the project's invariants:

1. **Unscoped write in `update()`** — `chart-of-accounts.service.ts:111` uses
   `account.update({ where: { id } })`. The tenant check lives only in the prior
   `findOne`; the write itself is not scoped. The codebase convention (spec-006,
   `suppliers.service.ts:119`, `items.service.ts:337`) is
   `updateMany({ where: { id, tenantId, deletedAt: null } })` so the scope is enforced
   **at the write**.
2. **Unscoped soft-delete write in `remove()`** — `chart-of-accounts.service.ts:117-118`,
   same pattern: `update({ where: { id } })` with no `tenantId` / `deletedAt: null`.
3. **`accountType` is a free string** — `dto/create-account.dto.ts` and
   `dto/update-account.dto.ts` validate it as `@IsString @MaxLength(50)` only, while
   `getAccountsByType` (`chart-of-accounts.service.ts:86-90`) hard-assumes the five values
   `asset | liability | equity | revenue | expense`. Any other string creates an account
   invisible to the summary buckets. Needs `@IsIn([...])`.
4. **`parentAccountId` not validated as UUID** — `dto/create-account.dto.ts` uses
   `@IsString` only; should be `@IsUUID()`.
5. **No referential guard on delete** — `remove()` (`chart-of-accounts.service.ts:114-122`)
   soft-deletes an account even when active child accounts point at it via
   `parentAccountId`, silently orphaning the hierarchy. Compare the macro-categories
   delete guard (spec-006).
6. **System accounts are deletable-protected but not edit-protected** — `remove()` blocks
   `isSystem` accounts (`:116`) but `update()` lets a system account's `accountNumber` and
   `accountType` be rewritten freely, which can break automated postings.

Additionally, `GET /api/chart-of-accounts` returns a **bare array** instead of the
`{ <resource>: [...], count }` list envelope codified in spec-001. Two frontend consumers
depend on the bare array — `chartOfAccountsApi.getAll`'s `extractList`
(`frontend/lib/api/chart-of-accounts.ts:8-12`) and the bulk-import export path
(`frontend/app/settings/bulk-import/page.tsx:425`) — so the envelope change and both
consumer updates ship together.

This spec codifies the module's existing (correct) behavior as the contract and closes
the seven gaps above — with **no schema changes**.

---

## Acceptance criteria

### Endpoints
- [x] `POST /api/chart-of-accounts` — creates an account; `409` when `accountNumber`
      already exists for the tenant (active rows only); `404` when `parentAccountId` does
      not resolve to an active account in the tenant; defaults `currency: 'USD'`,
      `isActive: true`, `allowManualPosting: true`, `requireReconciliation: false`,
      `isSystem: false`.
- [x] `GET /api/chart-of-accounts` — lists the tenant's active accounts ordered by
      `accountNumber` asc; optional `?accountType=` filter.
- [x] `GET /api/chart-of-accounts` returns the list envelope
      `{ accounts: [...], count: <n> }` (spec-001 convention; currently a bare array).
      In the same change: `extractList` in `frontend/lib/api/chart-of-accounts.ts`
      handles `res.data.accounts`, and the bulk-import export extraction
      (`frontend/app/settings/bulk-import/page.tsx:425`) handles `res.data?.accounts`.
- [x] `GET /api/chart-of-accounts/by-type` — returns `{ byType, summary }` where `byType`
      groups the tenant's active accounts by `accountType` and `summary` carries
      `totalAccounts` plus per-type counts (`assets`, `liabilities`, `equity`, `revenue`,
      `expense`).
- [x] `GET /api/chart-of-accounts/code/:code` — returns the account by `accountNumber`;
      `404` when not found in the tenant.
- [x] `GET /api/chart-of-accounts/:id` — returns the account; `404` when not found in the
      tenant.
- [x] `PATCH /api/chart-of-accounts/:id` — partial update; `404` when not found; `409`
      when the new `accountNumber` collides with another active row in the tenant (self
      excluded).
- [x] `DELETE /api/chart-of-accounts/:id` — soft delete; `400` for `isSystem` accounts;
      `404` when not found; returns `{ message, id }`.

### Tenant scoping (CLAUDE.md invariant)
- [x] All reads (`create` duplicate + parent checks, `findAll`, `findOne`, `getByCode`,
      `getAccountsByType`, `update` conflict check) scoped
      `where: { tenantId, deletedAt: null }` with `tenantId` from `req.user.tenantId`.
- [x] `update()` write is tenant-scoped at the write itself:
      `updateMany({ where: { id, tenantId, deletedAt: null } })` per the spec-006
      convention, then re-fetch via the scoped `findOne` to preserve the response shape
      (`chart-of-accounts.service.ts:111`).
- [x] `remove()` soft-delete write is tenant-scoped at the write itself:
      `updateMany({ where: { id, tenantId, deletedAt: null } })`
      (`chart-of-accounts.service.ts:117-118`).
- [x] `create` writes `tenantId` from the JWT; never from request body or headers.

### Business rules
- [x] `remove()` is blocked with `400` (message includes the live count) while active
      child accounts (`parentAccountId = :id`, `deletedAt: null`, same tenant) exist —
      no orphaned hierarchy (`chart-of-accounts.service.ts:114-122`).
- [x] `update()` on an `isSystem` account rejects changes to `accountNumber` and
      `accountType` with `400 BadRequestException` (other fields — `name`,
      `accountCategory`, `currency`, `isActive`, `allowManualPosting` — stay editable).
- [x] `remove()` rejects `isSystem` accounts with `400` ("Cannot delete system account").
- [x] Re-parenting via PATCH is not supported — `UpdateAccountDto` intentionally omits
      `parentAccountId` (hierarchy is fixed at creation; this also rules out cycles).

### DTO validation
- [x] `CreateAccountDto`: `accountNumber` (`@IsString @MaxLength(50)`), `name`
      (`@IsString @MaxLength(255)`), `accountCategory?` (`@MaxLength(100)`), `currency?`
      (`@MaxLength(3)`), `isActive?` / `allowManualPosting?` (`@IsBoolean`) — all with
      Swagger annotations.
- [x] `accountType` is validated with
      `@IsIn(['asset', 'liability', 'equity', 'revenue', 'expense'])` in **both**
      `CreateAccountDto` and `UpdateAccountDto` (currently free `@IsString`).
- [x] `parentAccountId` is validated with `@IsUUID()` in `CreateAccountDto`
      (currently `@IsString`).
- [x] Global `ValidationPipe` (`whitelist, forbidNonWhitelisted, transform`) rejects
      unknown fields with `400`.

### RBAC
- [x] Controller guarded by `@UseGuards(JwtAuthGuard, PermissionsGuard)` +
      `@ApiBearerAuth('JWT-auth')`.
- [x] Permissions: create → `ACCOUNTING:CREATE`, list/by-type/code/detail →
      `ACCOUNTING:VIEW`, update → `ACCOUNTING:EDIT`, delete → `ACCOUNTING:DELETE`.

### Error handling
- [x] `409 ConflictException` — duplicate `accountNumber` on create and on update (self
      excluded).
- [x] `404 NotFoundException` — `findOne`/`getByCode`/`update`/`remove` on missing or
      other-tenant id; `create` with a non-resolving `parentAccountId`.
- [x] `400 BadRequestException` — delete of `isSystem` account.
- [x] `400 BadRequestException` — delete with active children, and system-account
      `accountNumber`/`accountType` edit (the two new guards under Business rules).

### Swagger
- [x] Every handler has `@ApiOperation` + `@ApiResponse` (success and error codes),
      `@ApiParam` on `:id`/`:code` routes, `@ApiQuery` on the list filter.

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations. (The missing Prisma self-relation
  for `parentAccountId` stays as-is; child lookups use the scalar column.)
- Usage guards against **other modules'** rows (journal-entry lines, budget lines,
  category account mappings referencing an account) — those belong to the
  `journal-entries` / `budgets` / `categories` specs, which own the referencing models
  and their services.
- Re-parenting (`parentAccountId` via PATCH) and hierarchy-tree endpoints.
- Account balances, posting, reconciliation workflows (`requireReconciliation` stays
  dormant).
- Auto-generated account numbers — `accountNumber` is a user-supplied business code
  (`1.1.03`), unique per tenant by design.
- Pagination/filtering beyond the existing `?accountType=` (tenant charts are small).
- Validating the `?accountType=` query param against the enum (an unknown value yields an
  empty list today — harmless; a query DTO is not worth the surface).
- Frontend changes beyond the two list-envelope consumer updates.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `Account` | `ac_accounts` | `tenantId`, `accountNumber`, `name`, `accountType`, `accountCategory?`, `parentAccountId?` (bare UUID column — no Prisma self-relation), `currency?`, `isSystem`, `allowManualPosting`, `requireReconciliation`, `isActive`, audit + soft-delete columns; `@@unique([tenantId, accountNumber])`, `@@index([tenantId])`, `@@index([tenantId, accountNumber])`, `@@index([accountType])` |

Key invariants:
- `accountNumber` unique **per tenant** (DB constraint); service enforces uniqueness among
  active (`deletedAt: null`) rows.
- `accountType` ∈ `asset | liability | equity | revenue | expense` (service/DTO-enforced;
  no DB check constraint).
- Soft delete only (`deletedAt` + `deletedBy`); hard deletes never issued.
- `isSystem` accounts: never deletable; `accountNumber`/`accountType` immutable (this
  spec).
- An account with active child accounts cannot be deleted (referential guard in service,
  not DB — this spec).
- Referenced by `JournalEntryLine`, `BudgetLine`, `CashFlowLine`, `ArInvoiceLine`,
  `ApInvoiceLine`, `Category` (inventory/COGS mappings) — all downstream modules.

---

## API contracts

All routes prefixed `/api`, JWT-guarded, permission-gated as listed above.

### POST /api/chart-of-accounts
```json
// Request
{ "accountNumber": "1.1.03", "name": "Cash on Hand", "accountType": "asset",
  "accountCategory": "current_asset", "parentAccountId": "<uuid|omit>",
  "currency": "USD", "isActive": true, "allowManualPosting": true }

// Response 201
{ "id": "<uuid>", "tenantId": "<uuid>", "accountNumber": "1.1.03", "name": "Cash on Hand",
  "accountType": "asset", "accountCategory": "current_asset", "parentAccountId": null,
  "currency": "USD", "isSystem": false, "allowManualPosting": true,
  "requireReconciliation": false, "isActive": true,
  "createdAt": "...", "updatedAt": "...", "deletedAt": null,
  "createdBy": "<uuid>", "updatedBy": "<uuid>", "deletedBy": null }

// Errors: 409 accountNumber exists | 404 parent not found | 400 validation (incl. bad accountType)
//         401 no token | 403 missing ACCOUNTING:CREATE
```

### GET /api/chart-of-accounts?accountType=asset
```json
// Response 200 (target envelope — see unchecked criterion)
{ "accounts": [ { "id": "...", "accountNumber": "1.1.03", "name": "Cash on Hand",
    "accountType": "asset", "isActive": true } ],
  "count": 1 }

// Errors: 401 | 403 missing ACCOUNTING:VIEW
```

### GET /api/chart-of-accounts/by-type
```json
// Response 200
{ "byType": { "asset": [ { "...": "..." } ], "liability": [], "equity": [],
    "revenue": [], "expense": [] },
  "summary": { "totalAccounts": 42, "assets": 12, "liabilities": 8, "equity": 4,
    "revenue": 6, "expense": 12 } }

// Errors: 401 | 403
```

### GET /api/chart-of-accounts/code/:code
```json
// Response 200 — the account entity (same shape as POST response)

// Errors: 404 not found (or other tenant) | 401 | 403
```

### GET /api/chart-of-accounts/:id
```json
// Response 200 — the account entity

// Errors: 404 not found (or other tenant) | 401 | 403
```

### PATCH /api/chart-of-accounts/:id
```json
// Request (any subset; parentAccountId NOT accepted)
{ "name": "Petty Cash" }

// Response 200 — updated entity

// Errors: 404 not found | 409 accountNumber exists | 400 validation, or system-account
//         accountNumber/accountType change | 401 | 403 missing ACCOUNTING:EDIT
```

### DELETE /api/chart-of-accounts/:id
```json
// Response 200
{ "message": "Account deleted successfully", "id": "<uuid>" }

// Errors: 400 system account ("Cannot delete system account")
//         400 has children ("Cannot delete: N child accounts still reference this account")
//         404 not found | 401 | 403 missing ACCOUNTING:DELETE
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/chart-of-accounts/chart-of-accounts.service.ts` | Scope `update()` and `remove()` writes via `updateMany({ where: { id, tenantId, deletedAt: null } })` + re-fetch; add child-account delete guard; add `isSystem` field-immutability guard in `update()`; wrap `findAll` in `{ accounts, count }` |
| `src/modules/chart-of-accounts/dto/create-account.dto.ts` | `accountType` → `@IsIn([...5 types])`; `parentAccountId` → `@IsUUID()` |
| `src/modules/chart-of-accounts/dto/update-account.dto.ts` | `accountType` → `@IsIn([...5 types])` |
| `src/modules/chart-of-accounts/chart-of-accounts.controller.ts` | New `@ApiResponse` lines for the added 400 paths (otherwise no changes — already compliant) |
| `src/modules/chart-of-accounts/chart-of-accounts.module.ts` | No changes |
| `frontend/lib/api/chart-of-accounts.ts` | `extractList` handles `res.data.accounts` |
| `frontend/app/settings/bulk-import/page.tsx` | `handleExport` extraction adds `res.data?.accounts` |

### Cross-module dependencies
- None. The child-account guard queries the module's **own** `Account` model
  (`parentAccountId` is a self-reference). Downstream usage guards (journal lines,
  budget lines, category mappings) are deliberately deferred to the owning modules'
  specs (see Out of scope) — adding them here would invert the cascade.

### Behavioral notes
- `updateMany` returns a count, not the entity — after the scoped `updateMany`, re-fetch
  via the existing scoped `findOne` to keep the response shape identical (spec-006
  convention).
- The `update()` 404 path stays: `findOne` runs first and throws before any write.
- The `isSystem` guard in `update()` compares the incoming `dto.accountNumber` /
  `dto.accountType` against the fetched row and only rejects when the value actually
  changes (sending the same value back is a no-op, not an error).
- Route order matters and is already correct: `@Get('by-type')` and `@Get('code/:code')`
  are declared before `@Get(':id')` so they are not shadowed.
- `accountCategory` update path exists in the service field-map; it stays editable on
  system accounts.

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe` (`whitelist, forbidNonWhitelisted, transform`);
  Swagger at `/api/docs` (`JWT-auth` bearer).

---

## Verification checklist

```bash
# 0. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}' | jq -r .access_token)

# 1. Create → 201
curl -s -X POST http://localhost:3000/api/chart-of-accounts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"accountNumber":"9.9.99","name":"Spec-007 Test","accountType":"expense"}' \
  | jq '{accountNumber, accountType, isSystem}'
# Expected: { "accountNumber": "9.9.99", "accountType": "expense", "isSystem": false }

# 2. Duplicate accountNumber → 409
curl -s -X POST http://localhost:3000/api/chart-of-accounts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"accountNumber":"9.9.99","name":"Dup","accountType":"expense"}' | jq .statusCode
# Expected: 409

# 3. Invalid accountType → 400 (@IsIn)
curl -s -X POST http://localhost:3000/api/chart-of-accounts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"accountNumber":"9.9.98","name":"Bad","accountType":"banana"}' | jq .statusCode
# Expected: 400

# 4. List → envelope
curl -s http://localhost:3000/api/chart-of-accounts \
  -H "Authorization: Bearer $TOKEN" | jq 'has("accounts") and has("count")'
# Expected: true

# 5. by-type summary is consistent
curl -s http://localhost:3000/api/chart-of-accounts/by-type \
  -H "Authorization: Bearer $TOKEN" | jq '.summary.totalAccounts == ([.summary.assets,.summary.liabilities,.summary.equity,.summary.revenue,.summary.expense] | add)'
# Expected: true (every account lands in one of the five buckets)

# 6. Create child, then delete parent → 400
PARENT_ID=<id from step 1>
curl -s -X POST http://localhost:3000/api/chart-of-accounts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"accountNumber\":\"9.9.99.1\",\"name\":\"Child\",\"accountType\":\"expense\",\"parentAccountId\":\"$PARENT_ID\"}" | jq .accountNumber
curl -s -X DELETE http://localhost:3000/api/chart-of-accounts/$PARENT_ID \
  -H "Authorization: Bearer $TOKEN" | jq .statusCode
# Expected: 400 with "Cannot delete: 1 child accounts..."

# 7. Delete child then parent → 200, then GET → 404 (soft-deleted)
curl -s -X DELETE http://localhost:3000/api/chart-of-accounts/<child-id> \
  -H "Authorization: Bearer $TOKEN" | jq .message
curl -s -X DELETE http://localhost:3000/api/chart-of-accounts/$PARENT_ID \
  -H "Authorization: Bearer $TOKEN" | jq .message
curl -s http://localhost:3000/api/chart-of-accounts/$PARENT_ID \
  -H "Authorization: Bearer $TOKEN" | jq .statusCode
# Expected: "Account deleted successfully" ×2, then 404

# 8. System account: PATCH accountNumber → 400; DELETE → 400
SYS_ID=<id of a seeded isSystem account>
curl -s -X PATCH http://localhost:3000/api/chart-of-accounts/$SYS_ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"accountNumber":"0.0.01"}' | jq .statusCode
curl -s -X DELETE http://localhost:3000/api/chart-of-accounts/$SYS_ID \
  -H "Authorization: Bearer $TOKEN" | jq .statusCode
# Expected: 400, 400

# 9. Update from another tenant's token → 404 (scoped write — tenant isolation)
# (create a second tenant/user, then PATCH the 9.9.99 id with that token)
# Expected: 404, and the row is unchanged for tenant DEMO

# 10. No token → 401
curl -s http://localhost:3000/api/chart-of-accounts | jq .statusCode
# Expected: 401

# 11. Build + tests
cd backend && pnpm build && pnpm test chart-of-accounts
# Expected: build passes, unit tests green
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-04 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 22) | Draft — 6 invariant gaps (2 unscoped writes, 2 weak DTO validators, missing child-delete guard, unprotected system-account edits) + list-envelope gap captured as unchecked criteria |
| 2026-06-04 | Shipped to origin (d0afac1); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) — unit 23/23, e2e 19/19 (full suite 85/85), build + lint green |
