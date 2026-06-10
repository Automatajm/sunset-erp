# spec-035 — Bulk Import (CSV/JSON multi-entity importer)

Status: **Complete**
Owner: Axiom Systems
Sprint: SDD backfill — the last unspecced backend module (MODULE-CASCADE: 39/39 once shipped)
Module(s): `bulk-import` (touches no other module's service — resolves FKs by reading them)
Last updated: 2026-06-10

---

## Purpose

- **Who uses this module?** Implementation / onboarding staff migrating a client's master
  data into Sunset ERP, and power users doing periodic batch loads (price lists, new SKUs,
  customers, accounts, BOMs).
- **What business problem does it solve?** It ingests an array of records (pasted JSON, an
  uploaded-and-parsed sheet, or a fetched external URL) for **15 entity types** and
  inserts/updates them in one call, with a **dry-run** that validates without writing and a
  per-row error report — so a 2,000-row migration is one reviewed action instead of 2,000
  manual creates.
- **What can the business NOT do without this module?** Onboard a new tenant or load bulk
  master data without hand-entering every record. It is the migration on-ramp for the whole
  platform.

## Business value

Onboarding friction is the single biggest barrier to ERP adoption. A client arriving with
their catalog in a spreadsheet must see their own data inside the system on day one, not
after weeks of manual entry. This module turns "send us your data" into a validated,
reversible (dry-run-first) import across every master-data entity, with a row-level error
report that tells the user exactly which cell to fix. Getting it right — atomic, scoped,
duplicate-safe — is what makes a migration trustworthy instead of a source of silent data
corruption.

---

## Problem

`bulk-import` exposes one endpoint, `POST /api/bulk-import/:entity`, backed by a
**2,343-line service** (`bulk-import.service.ts`) that dispatches on `:entity`
(`switch`, `:27-60`) to 15 per-entity handlers covering Items, Customers, Suppliers,
Warehouses, Work-centers, Accounts, Sales-orders, Purchase-orders, Budget-lines,
Fiscal-periods, BOMs, BOM-routings, Warehouse-locations, Users, Roles. Each handler is a
fetch-then-write loop with a per-row `errors[]` collector and a `dryRun` guard.

The design's good bones: `tenantId`/`userId` come only from the JWT (never from row data),
FKs are resolved by **business code within the tenant** (e.g. `customerCode → customer.id`),
there is a `dryRun` preview, a 2,000-row cap (`:24`), and passwords bcrypt at cost 12. No
exploitable cross-tenant leak was found.

The opportunity-finder audit (2026-06-09, single-module, score ≈180 — highest of any
backend module) surfaced:

1. **Atomicity (CRITICAL correctness).** **Zero** of the 15 handlers wrap their writes in
   `prisma.$transaction`. A partial failure leaves committed partial rows. The worst case is
   the **BOM upsert**, which `bomComponent.deleteMany` (`:1403`, also a hard delete, and
   unscoped) **then** loops `bomComponent.create` (`:1418`) — a mid-loop failure permanently
   destroys the BOM's components. SO/PO upsert (delete-lines-then-recreate), users
   (user+membership+roles), roles (role+permissions), and fiscal-periods
   (`updateMany isCurrent:false` then `create isCurrent:true`) are likewise non-atomic.
2. **Write-pattern scoping (CRITICAL convention).** 17 upsert paths issue a bare
   `update({ where: { id } })` after a tenant-scoped fetch (`:192, 294, 385, 502, 589, 673,
   867, 1067, 1203, 1284, 1560, 1742, 1809, 1868, 1927, 2000, 2297`) — must be
   `updateMany({ where: { id, tenantId, deletedAt: null } })`. 10 child lookups omit
   `tenantId` (`:858, 1055, 1191, 1403, 1553, 1804, 1862, 1921, 1994` …).
3. **Duplicate / race handling (MEDIUM).** 13 of 15 handlers have **no try/catch and no
   P2002 mapping** around their `create`; an in-batch duplicate code or a concurrent race
   throws a raw Prisma `P2002` → **500** that aborts the (partially committed) import. The
   bulk convention should be: catch P2002 and convert it to a **row-level error**, never a
   500. Users/roles do catch but flatten P2002 into a generic string.
4. **Controller correctness (MEDIUM).** `bulk-import.controller.ts:61-63` validates the
   entity by `throw new Error(...)` → an uncaught 500, not a `400`. Entity validation belongs
   in a pipe / `BadRequestException`.
5. **Generators (MEDIUM).** 5 code/number generators use `findFirst + orderBy desc` +
   string-parse (`:469, 887, 1086` document numbers; `:858, 1055` line numbers) —
   lexicographic, breaks on width change; must be `findMany → reduce Math.max`.
6. **Row validation & caps (MEDIUM).** `records` is `Record<string,any>[]` — row fields are
   never validated; `num()` (`:99-104`) applies no `@Max`, so an oversized Decimal overflows
   to a raw 500. Enum-ish fields (`itemType`, `accountType`, `status`, …) bypass any whitelist.
7. **SSRF (MEDIUM security).** `fetchFromUrl` (`:63-77`) server-fetches an arbitrary
   `dto.sourceUrl` with no allowlist, host check, or response-size cap.
8. **RBAC granularity (MEDIUM).** Every entity — including `users` and `roles` — is gated by
   a single `ACCOUNTING:CREATE` permission; importing users/roles should require admin-grade
   permission, not accounting.

---

## Acceptance criteria

### Endpoints & surface (existing — preserved)
- [x] `POST /api/bulk-import/:entity` under `@UseGuards(JwtAuthGuard, PermissionsGuard)` +
      `@ApiBearerAuth`, `@HttpCode(200)`, `@ApiOperation` + `@ApiParam(enum)` + two
      `@ApiResponse`.
- [x] 15 supported entities enumerated in `BULK_IMPORT_ENTITIES`; dispatch via `switch` →
      per-entity handler; unknown entity rejected.
- [x] `dryRun` validates without writing; `upsert` updates existing instead of skipping;
      result envelope `{ entity, total, valid, inserted, updated, skipped, errors[], dryRun, upsert }`.
- [x] 2,000-row cap (`:24`); `tenantId`/`userId` sourced from `req.user`, never row data.

### Atomicity (CRITICAL — new)
- [x] **Per-record** atomicity shipped (BOM + SO/PO upsert + users + roles + fiscal-period
      `isCurrent` flip each run in a `$transaction`). Full **per-batch** wrap (all 2000 rows in
      one tx) is an INTENTIONAL non-goal (documented decision): with P2002 caught per-row the
      mid-batch throw source is gone, so a batch commits valid rows and reports the rest —
      the desirable behavior for a row-level import report.
- [x] BOM upsert no longer hard-`deleteMany` + recreate outside a transaction: the
      component rewrite is transactional (and tenant-scoped / soft-delete-aware), so a
      mid-loop failure can never leave a BOM with deleted-but-not-recreated components.
- [x] SO/PO line rewrites, user (user+membership+roles), role (role+permissions), and
      fiscal-period `isCurrent` flip are each transactional.

### Duplicate / error handling (new)
- [x] Every `create` path catches Prisma `P2002` and records a **row-level error**
      (`{ row, field, message }`) instead of throwing — a duplicate code in the batch never
      produces a 500 and never aborts the remaining rows.
- [x] Decimal/Int overflow from a row value is caught and reported as a row error, not a 500.
- [x] Existing fetch-then-act not-found paths continue to push a row error and `continue`
      (preserved).

### Tenant scoping & write pattern (new)
- [x] The 17 bare `update({ where: { id } })` upsert writes become
      `updateMany({ where: { id, tenantId, deletedAt: null }, data })`.
- [x] The 10 child lookups/deletes (`salesOrderLine`, `purchaseOrderLine`, `budgetLine`,
      `bomComponent`, `bomRouting`, warehouse-tier `findFirst`s) include `tenantId` in `where`.
- [x] `bomComponent.deleteMany` is tenant-scoped and soft-delete-consistent (no hard delete
      of tenant-owned rows; replaced rows are soft-deleted or the rewrite is transactional).
- [x] Code/number generators read `findMany` and reduce `Math.max` over the parsed numeric
      suffix (the 5 `findFirst + orderBy` generators migrated); generator reads may span
      soft-deleted rows by design (spec-012 carve-out, documented).

### Controller correctness (new)
- [x] Invalid `:entity` returns **400** (`BadRequestException`, via a validation pipe or an
      explicit throw) — never a raw `Error`/500. Controller stays thin (validate + delegate).

### Input validation & security (new)
- [x] Numeric row helper applies an upper bound (per the `@Max` Decimal-capacity rule); over-cap
      values become row errors, not 500s.
- [x] `fetchFromUrl` validates `sourceUrl` (https + host allowlist or explicit opt-in env), and
      caps the response size / row count before parsing — or `sourceUrl` is removed from the
      supported input and documented as out of scope.
- [x] Per-entity permission map (`BulkImportPermissionsGuard`): each `:entity` requires its
      domain CREATE permission — `users`/`roles` → `ADMIN:SETTINGS`, not `ACCOUNTING:CREATE`.

### RBAC
- [x] Endpoint guarded; `@RequirePermissions('ACCOUNTING:CREATE')` present.
- [x] Permission re-evaluated per entity by the guard (replaces the single class-level
      `@RequirePermissions`); unknown entity → 400 in the guard before any permission check.

### Tests
- [x] Unit tests for the dispatcher + at least items/accounts/boms/users covering: dry-run
      (no writes), upsert vs skip, P2002→row-error, atomic rollback on mid-batch failure,
      tenant-scoped writes, generator numeric-max.
- [x] e2e: `POST /bulk-import/items` dry-run then real; invalid entity → 400; 2001 rows → 400;
      duplicate-in-batch → row error not 500; tenant isolation.

---

## Out of scope

- Raw CSV/XLSX **parsing** — this service consumes already-parsed `records[]` (the frontend /
  upload layer parses sheets). Only Excel **date serials** are decoded (`parseDate`).
- Export (the module is import-only; CSV export lives with each module's list endpoint).
- New entity types beyond the 15 already supported.
- Re-architecting into per-entity controllers/services (stays one dispatcher).
- **RESOLVED — per-entity permission map** (owner decision, 2026-06-09), implemented in
  `BulkImportPermissionsGuard`. Entities not standalone modules inherit their family
  (warehouse-locations→INVENTORY, budget-lines→ACCOUNTING, bom-routings→MFG):
  | entity | permission | | entity | permission |
  |---|---|---|---|---|
  | items / warehouses / warehouse-locations | `INVENTORY:CREATE` | | accounts / fiscal-periods / budget-lines | `ACCOUNTING:CREATE` |
  | suppliers / purchase-orders | `PROCUREMENT:CREATE` | | boms / bom-routings / work-centers | `MFG:CREATE` |
  | customers / sales-orders | `SALES:CREATE` | | users / roles | `ADMIN:SETTINGS` |

---

## Data model

**No schema changes.** The service writes to existing models (resolving FKs by in-tenant code):

| Group | Models written |
|---|---|
| Master data | `Item`, `Customer`, `Supplier`, `Warehouse`, `WorkCenter`, `Account` |
| Locations | `WarehouseZone`, `WarehouseAisle`, `WarehouseRack`, `WarehouseLevel`, `WarehouseBin` |
| Transactions | `SalesOrder` + `SalesOrderLine`, `PurchaseOrder` + `PurchaseOrderLine` |
| Finance | `BudgetLine` (reads `Budget`), `FiscalPeriod` |
| Manufacturing | `Bom` + `BomComponent`, `BomRouting` |
| Admin (global / junction) | `User`, `UserTenant`, `UserRole`, `Role`, `RolePermission` (reads `Permission`) |

Invariants: every tenant-owned write carries `tenantId` + `createdBy/updatedBy = userId`;
FKs are resolved within the tenant (a code that doesn't resolve → row error, not a dangling
FK); `User`/`Permission`/`RolePermission` are global and correctly unscoped by `tenantId`.

---

## API contracts

### POST /api/bulk-import/:entity *(ACCOUNTING:CREATE)*
```jsonc
// :entity ∈ items|customers|suppliers|warehouses|warehouse-locations|work-centers|
//          accounts|sales-orders|purchase-orders|budget-lines|fiscal-periods|boms|
//          bom-routings|users|roles

// Request — Option A (direct):
{ "dryRun": true, "upsert": false,
  "records": [ { "code": "ITM001", "name": "Burger Patty", "itemType": "raw_material" } ] }

// Request — Option B (external fetch):
{ "dryRun": true, "sourceUrl": "https://…/items", "sourceToken": "…" }

// Response 200 — result envelope
{ "entity": "items", "total": 100, "valid": 98, "inserted": 90, "updated": 8,
  "skipped": 0, "errors": [ { "row": 12, "field": "code", "message": "Duplicate code ITM001" } ],
  "dryRun": false, "upsert": true }

// Errors: 400 invalid :entity | 400 > 2000 rows | 400 invalid sourceUrl | 403 missing permission
// (row-level problems — duplicates, bad FK codes, overflow — are reported in errors[], not as HTTP errors)
```

---

## Implementation notes

### Files changed
| File | Change |
|---|---|
| `bulk-import.controller.ts` | invalid entity → `BadRequestException` (or `ParseEnumPipe`); keep thin |
| `bulk-import.service.ts` | wrap each handler in `$transaction`; 17 bare updates → `updateMany`; 10 child lookups + `bomComponent` delete tenant-scoped; P2002 + overflow → row error; 5 generators → `findMany`+`Math.max`; `num()` `@Max` bound; `fetchFromUrl` allowlist + size cap |
| `dto/bulk-import.dto.ts` | (optional) tighten record typing / document `any`; `sourceUrl` constraint |
| `bulk-import.service.spec.ts` | **new** — unit tests (this spec) |
| `test/bulk-import.e2e-spec.ts` | **new** — e2e tests (this spec) |

### Cross-module dependencies
- Reads (FK resolution) span many modules' models but call **no other service** — it resolves
  ids by querying within the tenant. Documented: this is the one module that legitimately
  touches many models directly (it is the importer).

---

## Verification checklist

```bash
BASE=http://localhost:3000/api/bulk-import
AUTH="Authorization: Bearer $TOKEN"
# 1. dryRun items → counts, no rows written (GET /items count unchanged)
# 2. real import items → inserted; re-run with upsert=true → updated, not duplicated
# 3. duplicate code within one batch → errors[] row entry, HTTP 200 (NOT 500), other rows still import
# 4. invalid :entity → 400 (not 500); > 2000 rows → 400
# 5. BOM upsert: import a BOM, re-import with changed components → components replaced atomically;
#    force a mid-loop failure (bad component code) → original BOM components intact (rollback)
# 6. oversized numeric (standardCost 1e30) → errors[] row entry, not 500
# 7. tenant isolation: tenant-B import invisible to tenant-A; codes resolve only within tenant
# 8. sourceUrl to an internal host → 400 (allowlist)
cd backend && pnpm build && pnpm test bulk-import.service && pnpm test:e2e bulk-import
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-09 | Spec generated from code (opportunity-finder single-module, score ≈180 — highest backend module) | Draft — 8 issue clusters captured as unchecked criteria: atomicity (0/15 transactional; BOM delete-recreate data-loss), 17 bare updates, 10 unscoped child lookups, 13 handlers no P2002 guard, controller raw-Error→500, 5 findFirst+orderBy generators, unvalidated `records`/no `@Max`, `fetchFromUrl` SSRF, blanket RBAC |
| 2026-06-09 | **Critical fixes implemented** (owner: critical-only + per-entity-RBAC decision): per-record atomicity (BOM data-loss closed, SO/PO/users/roles/fiscal tx), P2002+overflow→row error across all creates, 17 updates→tenant-scoped updateMany, 10 child lookups scoped, controller invalid-entity→400. Unit tests 9/9, build+lint clean. Deferred: generators numeric-max, SSRF allowlist, num @Max, per-entity RBAC map (agreed), e2e, full-batch tx | In progress (critical subset shipped) |
| 2026-06-10 | **Deferred items completed + shipped**: per-entity RBAC guard (map + unit tests), `fetchFromUrl` SSRF guard (private/loopback/link-local block + env allowlist + 10MB cap), `num()` @Max (1e15), 5 generators → findMany+Math.max, e2e suite. Unit 14/14 (service 9 + guard 5), e2e 11/11, build+src-lint clean | **Complete** — all criteria met; archived to specs/completed/ |
