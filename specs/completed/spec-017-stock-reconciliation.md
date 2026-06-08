# spec-017 — Stock Reconciliation (Cycle Counts & Count Assignments)

Status: **Complete**  
Owner: Platform  
Sprint: 19  
Module(s): `stock-reconciliation` (touches `stock-transactions` for the movement-number API and `frontend/app/inventory/stock-reconciliation/page.tsx` for the list envelope)  
Last updated: 2026-06-06  

---

## Purpose

- **Who uses this module?** Warehouse staff who physically count stock (counters) and the
  supervisors who assign counts, review variances, and approve and post the adjustments.
- **What business problem does it solve?** It runs the cycle-count workflow: snapshot
  system stock for a warehouse, let counters enter what is physically there, compute signed
  variances, and on approval post adjustment movements that bring recorded stock back in
  line with reality.
- **What can the business NOT do without this module?** It cannot reconcile what the system
  says it has against what is actually on the shelf, cannot correct drift from shrinkage or
  error, and cannot keep inventory records trustworthy over time.

## Business value

System stock and real stock always drift — through shrinkage, miscounts, and unrecorded
moves — and this module is how the business catches and corrects that drift in a controlled,
auditable way. Without it, inventory records slowly diverge from reality until valuation,
planning, and order promises are all based on numbers that are simply wrong. The
count-assignment, approval, and posting steps turn counting into an accountable process
rather than ad-hoc edits, and posting through the hardened movement ledger means every
correction is recorded as a real, traceable adjustment rather than a silent change.

---

## Problem

`stock-reconciliation` owns the physical-count workflow: a session snapshots current
stock for a warehouse (`CC-YYYY-NNNN`), counters enter quantities per line (in storage
or purchase UOM, auto-converted), variances are computed signed (negative = shortage),
and posting writes `adjustment` movements into the ledger spec-016 just hardened plus
the stock deltas. A second controller manages per-user count assignments resolved from
zone/aisle/level/bin, category, and item filters. Permissions split the workflow:
`INVENTORY:COUNT` for counting, `INVENTORY:APPROVE` for approval and posting.

The state machine and variance math are sound. The audit (opportunity-finder, score 96 —
the highest yet) found the module pre-dates every convention shipped in specs 013–016:

1. **11 unscoped writes — the worst write-scoping surface audited.** Every mutation
   validates via a scoped fetch then writes `where: { id }`:
   `startSession` (`stock-reconciliation.service.ts:164`), `updateLine` (`:225`),
   `submitForApproval` (`:266`), `approve` (`:293`), `cancel` (`:431`), and three
   inside `post()`'s transaction (`:391` stock, `:401` count line, `:411` session).
   Worse, the assignment service's two `stockCountLine.updateMany` calls (`:191`,
   `:239`) and the `delete` (`:244`) carry **no `tenantId` whatsoever**. Plus one
   read: the item factor lookup (`:192`) omits `deletedAt: null`.
2. **`post()` re-implements the movement-number generator inline** (`:344-351`)
   instead of using `StockTransactionsService` (module-interconnection rule) — and the
   `@@unique([tenantId, movementNumber])` race surfaces as an unhandled P2002 → 500
   mid-posting.
3. **Contract gaps.**
   - `countedStorageQty`/`countedPurchaseQty` are documented mutually exclusive but
     sending both silently prefers storage (`:188-202`).
   - A session created for a warehouse with zero stock positions is empty yet flows
     through the entire lifecycle (`:109-126`).
   - Assignment `dto.userId` is never validated as an active tenant member
     (`stock-count-assignment.service.ts:172`) — lines can be assigned to any UUID.
   - `preview()` is a stub (`:250-271`): ignores all filters and returns only totals
     while its Swagger promises a dry run.
4. **Convention drift.** `findAll` query params are free strings (no status whitelist,
   no `@IsUUID`); counted quantities lack `@Max` caps; `findAll` returns a bare array;
   the main controller has **zero `@ApiResponse`** (9 handlers — not even imported)
   and 3 assignment handlers lack one too.

Deliberately deferred (see Out of scope): `post()` applies variance *deltas* clamped at
zero rather than setting stock to the counted value (divergence when stock moved between
snapshot and posting), and adjustment movements write `consumptionQty = purchaseQty`
bypassing `calcAllQties` — both need the UOM-contract follow-up flagged in spec-016.

---

## Acceptance criteria

### Endpoints (existing surface — preserved)
- [x] 9 session endpoints under `/api/stock-reconciliation`: `GET /`, `GET /:id`,
      `POST /`, `PATCH /:id/start`, `PATCH /:id/lines`, `PATCH /:id/submit`,
      `PATCH /:id/approve`, `PATCH /:id/post`, `PATCH /:id/cancel`.
- [x] 4 assignment endpoints under `/api/stock-reconciliation/:sessionId/assignments`:
      `GET /`, `POST /`, `POST /preview`, `DELETE /:assignmentId`.
- [x] Both controllers guarded by `@UseGuards(JwtAuthGuard, PermissionsGuard)` +
      `@ApiBearerAuth`; controllers are thin.

### Tenant scoping
- [x] Reads scoped `{ tenantId, deletedAt: null }`: sessions (`:36,:53,:155,:175,:245,
      :283,:312,:423`), lines includes, warehouse/stock on create, the warehouse
      hierarchy + category/item resolution in assignments, `userTenant` enrichment.
- [x] The 8 session-service writes are tenant-scoped at the write itself
      (`updateMany({ where: { id, tenantId, deletedAt: null } })` + re-fetch or
      tx-equivalent): `startSession`, `updateLine` (line write), `submitForApproval`,
      `approve`, `cancel`, and `post()`'s stock / count-line / session writes.
- [x] The 3 assignment-service writes include `tenantId`:
      both `stockCountLine.updateMany` (assign `:191`, release `:239`) and the
      assignment `delete` (`:244` — via `deleteMany({ where: { id, tenantId } })`).
- [x] The item factor lookup in `updateLine` includes `deletedAt: null` (`:192-194`).

### Lifecycle (state machine — preserved)
- [x] `draft → in_progress → pending_approval → approved → posted`; `cancel` allowed
      from any non-terminal state (`400` on posted/cancelled); every transition guards
      the current status with a descriptive `400`.
- [x] `create` snapshots stock (system quantities + WAC `unitCostSnapshot`) into lines,
      optionally filtered by `itemIds`; session starts `draft`.
- [x] `create` throws `400` when no stock positions match (no empty sessions).
- [x] `submit` blocks while any line is `pending` (uncounted) and computes
      `linesWithVariance` / `totalLinesCount` / `totalVarianceValue` (signed).
- [x] `approve` records `approvedBy`/`approvedAt`/`approvalNotes`.
- [x] `post` creates one `adjustment` movement per variance line — signed
      `movementValue`, surplus → `toWarehouseId`, shortage → `fromWarehouseId`,
      `referenceType: CYCLE_COUNT` — updates stock, marks lines `adjusted` with
      `adjustmentMovementId`, all inside one `$transaction`.
- [x] `post` obtains movement numbers from
      `StockTransactionsService.generateMovementNumber(tenantId, tx)` (made public and
      tx-aware; `StockTransactionsModule` imported) — the inline duplicate generator is
      deleted — and maps `P2002` to `409 ConflictException`.

### Counting
- [x] Counts accepted in either UOM; the other derived via the item's
      storage/purchase→consumption factors; variances and `varianceValue` signed.
- [x] Sending **both** `countedStorageQty` and `countedPurchaseQty` → `400`
      (mutual exclusivity enforced, not silently resolved); sending neither stays `400`.
- [x] `countedStorageQty`/`countedPurchaseQty` capped with `@Max(999999999999)`
      (within `Decimal(15,3)`) — overflow fails with `400`, never 500.
- [x] Line counting requires session `in_progress` and the line to belong to the
      session + tenant (`404` otherwise).

### Assignments
- [x] Filter resolution: zones→aisles→racks→levels→bins expansion, categories /
      macro-categories → items, explicit `itemIds`; AND across filter types; lines
      already assigned to another user are skipped; `400` when nothing matches.
- [x] `dto.userId` must be an **active member of the tenant** (`userTenant` check) →
      `404 'User not found in tenant'` otherwise.
- [x] `preview` performs the real dry-run: the same resolution logic as `create`
      (shared private helper), returning
      `{ totalLines, unassignedLines, matchedLines, message }` without persisting.
- [x] `remove` releases the assigned lines (`assignedToUserId: null`) and deletes the
      assignment (hard delete — the model has no `deletedAt` by design).

### Codes (spec-012 conformance)
- [x] `sessionNumber` system-assigned `CC-YYYY-NNNN`, tenant-scoped
      (`@@unique([tenantId, sessionNumber])`), spans soft-deleted rows; not in any DTO.

### DTO validation
- [x] Bodies bind validated DTOs (`@IsUUID` arrays on every filter, `@IsDateString`
      on `countDate`, `@Min(0)` on counted quantities).
- [x] `GET /` query validated via a query DTO: `status`
      `@IsIn(['draft','in_progress','pending_approval','approved','posted','cancelled'])`,
      `warehouseId` `@IsUUID`; invalid → `400`.

### RBAC
- [x] `GET` → `INVENTORY:VIEW`; `create`/`start`/`cancel` → `INVENTORY:CREATE`;
      `lines`/`submit` → `INVENTORY:COUNT`; `approve`/`post` and assignment
      create/delete → `INVENTORY:APPROVE`; assignment list/preview → `INVENTORY:VIEW`.

### Swagger
- [x] Every handler in `stock-reconciliation.controller.ts` has at least one
      `@ApiResponse` (currently zero across 9 handlers).
- [x] `findAll`, `preview`, `remove` in `stock-count-assignment.controller.ts` gain
      `@ApiResponse` (create already has two).

### Response format
- [x] `GET /api/stock-reconciliation` returns `{ sessions: [...], count }`; the list
      page (`frontend/app/inventory/stock-reconciliation/page.tsx:239`) unwraps it.
- [x] `findOne` serializes all Decimal fields as numbers; assignment responses include
      enriched `user` + `assignedCount`.

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations.
- `post()` stock semantics: variance **deltas** clamped at zero are kept as-is (setting
  stock to the absolute counted value is a behavior change needing its own spec); the
  clamp-divergence risk when stock moves between snapshot and posting is documented,
  not fixed.
- Adjustment movements writing `consumptionQty = purchaseQty` with `purchaseUom`
  (bypasses `calcAllQties`) — belongs to the UOM-contract follow-up flagged in spec-016.
- Bin-level counting: `StockCountLine.levelId`/`binId`/`locationCode` exist but are
  never populated by `create` (snapshot is warehouse-level); the location filters in
  assignments therefore only match lines that have location data.
- Recount workflows, blind counts, count tolerances, partial posting.
- Pagination of sessions/lines.
- Frontend changes beyond the one list-envelope consumer.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `StockCountSession` | `in_stock_count_sessions` | `tenantId`, `sessionNumber` (`CC-YYYY-NNNN`), `warehouseId`, `countDate`, `status` (6 states), variance summary (`totalLinesCount`, `linesWithVariance`, `totalVarianceValue`), `approvedBy/At`, `postedAt`, audit + soft-delete; `@@unique([tenantId, sessionNumber])` |
| `StockCountLine` | `in_stock_count_lines` | `tenantId`, `sessionId`, `itemId`, system qtys + `unitCostSnapshot` (WAC at snapshot), counted/variance qtys (signed), `status` (`pending/counted/adjusted`), `assignedToUserId`, `adjustmentMovementId`, optional `levelId`/`binId`/`locationCode`, lot/serial, audit + soft-delete; `@@unique([sessionId, itemId, lotNumber, serialNumber])` |
| `StockCountAssignment` | `in_stock_count_assignments` | `tenantId`, `sessionId`, `userId`, filter arrays (zone/aisle/level/bin/category/macroCategory/item ids), `assignedLineIds[]`; **no `deletedAt`** (hard delete) |
| Written cross-module | — | `StockMovement` + `Stock` (spec-016) on post; read: `Warehouse`, `Item`, warehouse-locations hierarchy, `Category`, `UserTenant` |

Key invariants:
- Variances are signed everywhere: negative = shortage/loss, positive = surplus/gain.
- `unitCostSnapshot` freezes WAC at session creation — posting values variance at the
  snapshot cost, not the current cost.
- A line belongs to exactly one session; one assignment per line at a time
  (`assignedToUserId` + skip-already-assigned resolution).
- Posted sessions are immutable (no transition out of `posted`).

---

## API contracts

All routes prefixed `/api/stock-reconciliation`, JWT + permissions guarded.

### GET /api/stock-reconciliation?warehouseId=&status= *(INVENTORY:VIEW)*
```json
// Response 200 (target envelope)
{ "sessions": [ { "id": "...", "sessionNumber": "CC-2026-0001", "status": "draft",
    "warehouse": { "code": "WH1" }, "_count": { "lines": 12 } } ], "count": 1 }
// Errors: 400 status not in the 6-state whitelist / warehouseId not a UUID | 403
```

### GET /api/stock-reconciliation/:id *(INVENTORY:VIEW)*
```json
// Response 200 — session + lines with item UOM info, Decimals as numbers
{ "id": "...", "sessionNumber": "CC-2026-0001", "totalVarianceValue": -125.5,
  "lines": [ { "systemStorageQty": 100, "countedStorageQty": 95,
    "varianceStorageQty": -5, "varianceValue": -125.5, "status": "counted",
    "item": { "code": "...", "storageUom": { "code": "PCS" } } } ] }
// Errors: 404 unknown / other-tenant id | 403
```

### POST /api/stock-reconciliation *(INVENTORY:CREATE)*
```json
// Request
{ "warehouseId": "<uuid>", "description": "Q2 count", "countDate": "2026-06-15",
  "itemIds": ["<uuid>"], "notes": "..." }
// Response 201 — draft session, one line per stock position (system qtys + WAC snapshot)
// Errors: 404 warehouse not in tenant | 400 no stock positions match | 403
```

### PATCH /api/stock-reconciliation/:id/start *(INVENTORY:CREATE)*
```json
// Response 200 — status in_progress
// Errors: 400 not draft | 404 | 403
```

### PATCH /api/stock-reconciliation/:id/lines *(INVENTORY:COUNT)*
```json
// Request — exactly ONE of the counted quantities
{ "lineId": "<uuid>", "countedStorageQty": 95, "notes": "shelf damaged" }
// Response 200 — session refreshed; line counted with signed variances
// Errors: 400 session not in_progress / neither qty / BOTH qtys / qty > cap |
//         404 session or line not found | 403
```

### PATCH /api/stock-reconciliation/:id/submit *(INVENTORY:COUNT)*
```json
// Response 200 — pending_approval + variance summary populated
// Errors: 400 not in_progress / N line(s) have not been counted yet | 404 | 403
```

### PATCH /api/stock-reconciliation/:id/approve *(INVENTORY:APPROVE)*
```json
// Request
{ "approvalNotes": "Reviewed variances" }
// Response 200 — approved with approvedBy/approvedAt
// Errors: 400 not pending_approval | 404 | 403
```

### PATCH /api/stock-reconciliation/:id/post *(INVENTORY:APPROVE)*
```json
// Response 200 — posted; one SM adjustment per variance line (signed movementValue,
// referenceType CYCLE_COUNT), stock deltas applied, lines marked adjusted
// Errors: 400 not approved | 409 movement-number race (P2002) | 404 | 403
```

### PATCH /api/stock-reconciliation/:id/cancel *(INVENTORY:CREATE)*
```json
// Response 200 — cancelled
// Errors: 400 already posted/cancelled | 404 | 403
```

### GET /api/stock-reconciliation/:sessionId/assignments *(INVENTORY:VIEW)*
```json
// Response 200 — assignments enriched with user + assignedCount
[ { "id": "...", "userId": "...", "assignedLineIds": ["..."], "assignedCount": 5,
    "user": { "firstName": "...", "email": "..." } } ]
```

### POST /api/stock-reconciliation/:sessionId/assignments *(INVENTORY:APPROVE)*
```json
// Request — filters AND-combined; arrays OR within each type
{ "userId": "<uuid>", "zoneIds": ["<uuid>"], "categoryIds": [], "itemIds": [], "notes": "" }
// Response 201
{ "assignment": { "...": "..." }, "resolvedCount": 5, "message": "5 lines assigned to user" }
// Errors: 400 session not in_progress / no unassigned lines match |
//         404 session not found / userId not an active tenant member | 403
```

### POST /api/stock-reconciliation/:sessionId/assignments/preview *(INVENTORY:VIEW)*
```json
// Request — same body as create
// Response 200 (real dry run — same resolution logic, nothing persisted)
{ "totalLines": 12, "unassignedLines": 7, "matchedLines": 5,
  "message": "5 lines would be assigned" }
// Errors: 404 session | 403
```

### DELETE /api/stock-reconciliation/:sessionId/assignments/:assignmentId *(INVENTORY:APPROVE)*
```json
// Response 200
{ "message": "Assignment removed", "releasedLines": 5 }
// Errors: 404 assignment not found | 403
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/stock-reconciliation/stock-reconciliation.service.ts` | Tenant-scope the 8 writes (`updateMany` + re-fetch / tx-equivalent); `deletedAt: null` on the item factor read; reject both-counted-given; reject empty-session create; replace inline SM generator with injected `StockTransactionsService.generateMovementNumber(tenantId, tx)`; `P2002 → 409` around post's tx; `findAll` envelope `{ sessions, count }` |
| `src/modules/stock-reconciliation/stock-count-assignment.service.ts` | `tenantId` on the 2 `updateMany` + `deleteMany` writes; validate `dto.userId` against `userTenant`; extract shared `resolveAssignableLines()` and make `preview` a real dry run |
| `src/modules/stock-reconciliation/stock-reconciliation.controller.ts` | Bind `GET /` query DTO; `@ApiResponse` on all 9 handlers |
| `src/modules/stock-reconciliation/stock-count-assignment.controller.ts` | `@ApiResponse` on findAll/preview/remove |
| `src/modules/stock-reconciliation/dto/update-count-line.dto.ts` | `@Max` caps on counted quantities |
| `src/modules/stock-reconciliation/dto/find-sessions-query.dto.ts` | **New** — status whitelist + warehouseId UUID |
| `src/modules/stock-reconciliation/stock-reconciliation.module.ts` | Import `StockTransactionsModule` |
| `src/modules/stock-transactions/stock-transactions.service.ts` | `generateMovementNumber` made **public** with optional `tx?: Prisma.TransactionClient` param (reads through `tx ?? this.prisma` so in-transaction callers see their own uncommitted movements) |
| `frontend/app/inventory/stock-reconciliation/page.tsx` | Unwrap `{ sessions, count }` (line 239) |

### Cross-module dependencies
- **`stock-transactions` (spec-016)** — `post()` writes `StockMovement` + `Stock`
  directly inside its own transaction (kept: the posting must be atomic with line/session
  updates and the spec-016 service has no tx-composable write API yet — documented
  exception) but the movement-number generation is now the shared service method.
- **`uom` (spec-005)** — module already imports `UomModule` (factors come from the item
  row directly today; unchanged).
- Reads: `warehouse-locations` hierarchy (spec-014), `categories` (spec-009),
  `items` (spec-003), `auth`'s `UserTenant`.

### generateMovementNumber — sharing contract
```ts
// stock-transactions.service.ts
async generateMovementNumber(tenantId: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? this.prisma; // tx callers see their own uncommitted movements
  ...
}
```
`post()` calls it per variance line with its `tx`, preserving the current
sees-own-writes sequencing; the inline copy in this module is deleted.

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe`; Swagger at `/api/docs`; module registered in
  `app.module.ts`.

---

## Verification checklist

```bash
# 0. Login (spec-001) → $TOKEN; stocked warehouse → $WH (receipt some stock via spec-016 first)
BASE=http://localhost:3000/api/stock-reconciliation
AUTH="Authorization: Bearer $TOKEN"

# 1. Create session → 201, CC-YYYY-NNNN, draft, lines snapshot system qtys + WAC
curl -s -X POST $BASE -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"warehouseId\":\"$WH\"}" | jq '.sessionNumber,.status,(.lines|length)'
# Expected: "CC-2026-NNNN", "draft", > 0

# 2. Create against an empty warehouse → 400 (no stock positions)
# 3. GET / → { sessions, count }; ?status=weird → 400
# 4. start → in_progress; count a line with BOTH qtys → 400; with one qty → variances signed
# 5. submit with uncounted lines → 400 "N line(s) have not been counted yet"
# 6. count all lines → submit → pending_approval with totalVarianceValue
# 7. approve → approved (approvedBy set); post → posted
#    → GET /api/stock-transactions/ledger?warehouseId=$WH shows CYCLE_COUNT adjustments
#      with signed movementValue and CC-number resolution
# 8. assignments: POST with a non-member userId → 404; preview returns matchedLines
#    consistent with a subsequent create's resolvedCount; DELETE releases lines
# 9. Tenant isolation (tenant2admin): session ids → 404 on GET/PATCH; list empty
# 10. Build + lint + tests
cd backend && pnpm build && pnpm test stock-reconciliation && pnpm test:e2e stock-reconciliation
# Expected: all pass
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 96) | Draft — 11 unscoped writes + 1 unscoped read, duplicated SM generator + P2002 mapping, both-qty silent preference, empty-session create, unvalidated assignment userId, stub preview, query DTO, @Max caps, 12 missing @ApiResponse, list envelope captured as unchecked criteria |
| 2026-06-06 | Test scaffolding written (34 unit / 12 e2e, tagged [GAP]) | Red as expected on all gaps |
| 2026-06-06 | All 13 gaps implemented: 11 writes tenant-scoped (8 session + 3 assignment), item read deletedAt, empty-session 400, both-qty 400, shared tx-aware generateMovementNumber (StockTransactionsService made public) + P2002->409, userTenant membership check, real dry-run preview via shared resolver, query DTO, @Max caps, 12 @ApiResponse, { sessions, count } envelope + frontend unwrap | Unit 34/34 + stock-transactions 18/18, e2e 12/12 (full lifecycle vs live ledger), backend + frontend builds OK, lint clean |
| 2026-06-06 | Shipped to origin (`5bded9a`); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
