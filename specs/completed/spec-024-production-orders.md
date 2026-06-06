# spec-024 — Production Orders (MO)

Status: **Complete**  
Owner: Manufacturing  
Sprint: Production cluster follow-up (post spec-019)  
Module(s): `production-orders` (touches `production-plans` for the shared MO number
generator — deferred debt documented in spec-019; touches
`frontend/lib/api/production-orders.ts` for envelopes + update contract)  
Last updated: 2026-06-06  

---

## Problem

Production Orders (MO) is the execution heart of manufacturing: an MO is created
from a BOM, moves through `draft → released → in_progress → completed/cancelled`,
accumulates labor and material actuals, and on FG delivery posts an automatic
journal entry (DR FG Inventory / CR WIP via the Automation engine) and creates
merma/surplus variance records whose adjustment JEs are posted on demand.
`production-plans` (spec-019) generates MOs in bulk against the same
`@@unique([tenantId, poNumber])` sequence — spec-019 explicitly deferred ownership
of the MO number generator to this spec.

The audit (opportunity-finder, 2026-06-06, score 84 — highest in the pipeline so
far) found:

1. **No state machine** — `updateStatus` (`service:109-125`) takes the status from
   the URL with no whitelist and no transition map: `PATCH /:id/status/garbage`
   persists `status='garbage'`; `completed → draft` and reviving `cancelled` are
   allowed. The pre-approved convention (production-plans pattern) requires both.
2. **Duplicated, fragile MO generator** — `generatePoNumber` (`service:583-591`)
   and `production-plans.service.ts:309-315` independently generate the same
   `MO-<year>-NNNN` sequence using `findFirst + orderBy` (string sort breaks past
   9999) with no `P2002 → 409` on the real unique constraint.
   `generateJeNumber` (`service:593-603`) is a third copy of the `JE-YYYYMM-`
   sequence with the same fragility.
3. **FG delivery is re-executable** — `deliverFinishedGoods` (`service:256-276`)
   allows status `completed`, so a second call overwrites `quantityProduced` and
   posts a **duplicate JE**.
4. **Unscoped reads / pattern-violating writes** — `bom.findFirst`
   (`service:82-83`) omits `tenantId` + `deletedAt`; account-override lookups
   (`:477,:480`) omit `deletedAt: null`; five writes update by bare `id`
   (`:105,:111,:132,:268,:382`).
5. **Silently dropped DTO fields** — `priority` is sent by the frontend
   (`page.tsx:737`) and rendered (`page.tsx:677`) but has **no column** — dropped
   end-to-end, a user-visible bug. `workCenterId` is validated then dropped (no
   column, no frontend consumer). The frontend `update` sends `quantityToProduce`
   but the DTO expects `quantityOrdered` — with `forbidNonWhitelisted` the request
   is a 400: **editing MO quantity from the UI is broken today**.
6. **Weak DTOs** — `itemId`/`warehouseId`/`debitAccountId`/`creditAccountId` are
   `@IsString` not `@IsUUID`; no `@Max` caps on any numeric field; `?status=`
   query params unvalidated.
7. **Bare-array lists** — `findAll` and `getAllVariances` return arrays, not the
   `{ <resource>, count }` envelope. The frontend's `extractList` unwraps `value`,
   not `productionOrders` — the envelope change requires the frontend-sync sweep.
8. **DI anti-pattern** — `production-orders.module.ts` re-provides `PrismaService`
   and `AutomationService` in `providers` instead of importing their modules,
   creating duplicate instances (second PrismaClient connection pool).
9. **Missing Swagger** — 7 of 14 handlers lack `@ApiResponse`.

This spec fixes the gaps, adds the **single additive migration** this module was
always missing (`priority` column — the UI already sends and renders it), and
takes ownership of the MO number generator for both producers.

---

## Acceptance criteria

### Endpoints (existing behavior preserved)
- [x] `POST /api/production-orders` — creates a draft MO from a BOM
      (`itemId` = BOM parent item, `quantityToProduce` from `quantityOrdered`).
- [x] `GET /api/production-orders?status=` — lists MOs, optional status filter.
- [x] `GET /api/production-orders/:id` — MO detail with BOM + components.
- [x] `PATCH /api/production-orders/:id` — updates quantity/dates/notes, draft only (`400` otherwise).
- [x] `PATCH /api/production-orders/:id/status/:status` — status transition; stamps
      `actualStartDate` on first `in_progress`, `actualEndDate` on `completed`.
- [x] `DELETE /api/production-orders/:id` — soft delete, draft only (`400` otherwise).
- [x] `POST /api/production-orders/:id/labor-actuals` + `GET` — record/list labor
      with efficiency summary; blocked for `draft`/`cancelled` MOs (`400`).
- [x] `POST /api/production-orders/:id/material-actuals` + `GET` — record/list
      material consumption with variance summary; same status gate.
- [x] `POST /api/production-orders/:id/deliver` — FG delivery: sets
      `quantityProduced`, completes the MO, posts auto-JE (DR `1.1.05` FG / CR
      `1.1.04` WIP) when `unitCost` given, auto-creates merma/surplus variance.
- [x] `GET /api/production-orders/:id/variances` + `GET /api/production-orders/variances` —
      per-MO and global variance lists with summaries.
- [x] `PATCH /api/production-orders/variances/:varianceId/post-je` — posts the
      variance adjustment JE (merma: DR `6.2.07` losses / CR `1.1.05` FG; surplus:
      DR `1.1.05` / CR `4.1.01`), `status → je_posted`; `400` if already posted or
      zero cost; account overrides accepted.

### State machine (new — pre-approved convention)
- [x] `updateStatus` validates the target against the whitelist
      `['released', 'in_progress', 'completed', 'cancelled']` — anything else `400`.
- [x] Transition map enforced (production-plans pattern):
      `draft → released | cancelled`; `released → in_progress | cancelled`;
      `in_progress → completed | cancelled`; `completed` and `cancelled` are
      terminal. Invalid transition → `400` naming current and target status.
- [x] `deliverFinishedGoods` allows only `released | in_progress` (drops
      `completed` from the gate) — a second delivery is `400`, eliminating the
      duplicate-JE path.

### Document number generation (spec-019 deferred debt)
- [x] `generatePoNumber` migrates to numeric max (`findMany` → parse trailing int →
      `reduce Math.max`), format `MO-<year>-<seq 4>`, spanning soft-deleted rows.
- [x] `production-plans.service.ts` `generateMos` inline numbering (`:309-315`)
      updated to the identical numeric-max logic (cross-module edit, documented
      here; spec-019 status log already points to this spec).
- [x] `generateJeNumber` migrates to numeric max, format `JE-<YYYYMM>-<seq 4>`.
- [x] `P2002` on MO create / status writes maps to `409 ConflictException` with a
      retry message (constraint `@@unique([tenantId, poNumber])`).

### Tenant scoping & write pattern
- [x] `bom.findFirst` in `findOne` (`:82`) includes `tenantId` + `deletedAt: null`.
- [x] Account-override lookups in `createVarianceJe` (`:477`, `:480`) include
      `deletedAt: null`.
- [x] The five id-only writes (`update` `:105`, `updateStatus` `:111`, `remove`
      `:132`, `deliverFinishedGoods` `:268`, `postVarianceJe` `:382`) migrate to
      `updateMany({ where: { id, tenantId, deletedAt: null } })` + refetch where a
      body is returned.
- [x] All other reads scoped (`findAll`, `findOne`, actuals, variances, accounts,
      item validation) with `tenantId` + `deletedAt: null`.
- [x] Creates carry `tenantId` + audit columns (MO, labor, material, variance).

### Data model — single additive migration
- [x] `ProductionOrder.priority` column added (`priority VARCHAR(20) NULL`,
      mapped `priority`) via `prisma migrate dev --name mo_priority` — additive,
      no data loss. The UI already sends and renders this field; today it is
      silently dropped.
- [x] `create` and `update` persist `priority`; responses include it.
- [x] `workCenterId` removed from `CreateProductionOrderDto` — no column, no
      frontend consumer, validated-then-dropped today. (API contract change with
      zero known consumers — verified `frontend/lib/api/production-orders.ts`.)

### DTO validation
- [x] `priority` gets `@IsIn(['low', 'medium', 'high', 'urgent'])` — the exact set
      the frontend renders.
- [x] `CreateMaterialActualDto.itemId`, `DeliverFgDto.warehouseId`,
      `PostVarianceJeDto.debitAccountId`/`creditAccountId` move from `@IsString`
      to `@IsUUID`.
- [x] `@Max` caps per column capacity: `quantityOrdered`/`quantityDelivered`
      `@Max(99999999999)` (`Decimal(15,3)`), `qtyPlanned`/`qtyActual`
      `@Max(9999999999)` (`Decimal(15,4)`), `hoursPlanned`/`hoursActual`
      `@Max(99999)` (`Decimal(8,2)`), `laborRate`/`unitCost` `@Max(99999)`
      (`Decimal(10,4)`).
- [x] `GET /` status query validated via query DTO `@IsIn(['draft', 'released',
      'in_progress', 'completed', 'cancelled'])`; `GET /variances` query DTO with
      `@IsIn(['open', 'je_posted', 'closed'])` and
      `@IsIn(['merma', 'surplus', 'labor', 'material'])` — bad value `400`.
- [x] Existing validation preserved: `@IsUUID` bomId, `@Min` floors, `@IsDateString`
      dates, `@IsNumber` quantities, nested DTO classes on every `@Body()`.

### Response format
- [x] `GET /api/production-orders` returns `{ productionOrders: [...], count: n }`.
- [x] `GET /api/production-orders/variances` returns `{ variances: [...], count: n }`.
- [x] `frontend-sync` sweep executed: `extractList` (`lib/api/production-orders.ts`)
      unwraps `productionOrders`/`variances` (today it only knows `value`), and
      `update` sends `quantityOrdered` (today it sends `quantityToProduce`, which
      `forbidNonWhitelisted` rejects with `400` — UI quantity editing is broken).
- [x] Decimal fields serialized as numbers via the `formatMo`/`formatLaborActual`/
      `formatMaterialActual`/`formatVariance` helpers.

### Architecture / DI
- [x] `production-orders.module.ts` stops re-providing `PrismaService` and
      `AutomationService`; imports `AutomationModule` instead (`PrismaService`
      comes from the global `PrismaModule` per spec-001). Same fix applies to the
      `automation.module.ts` `PrismaService` re-provide if touched.

### RBAC
- [x] Controller guarded by `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
- [x] Permissions: create `INVENTORY:CREATE`; reads `INVENTORY:VIEW`; update/status/
      actuals/deliver `INVENTORY:EDIT`; delete `INVENTORY:DELETE`; variance JE
      `ACCOUNTING:POST`.

### Error handling
- [x] `404` BOM / work center / MO / item / variance not found (tenant-scoped).
- [x] `400` non-draft update/delete; actuals on `draft`/`cancelled` MO; FG delivery
      in wrong status; variance JE already posted / zero cost / missing GL accounts.
- [x] `400` invalid status value or transition (state machine above).
- [x] `409` MO number collision (P2002 mapping above).

### Swagger
- [x] `@ApiResponse` added to the 7 handlers missing it: `findAll`, `findOne`,
      `update`, `updateStatus`, `getLaborActuals`, `getMaterialActuals`, `remove`.
- [x] All 14 handlers have `@ApiOperation`; controller has `@ApiBearerAuth('JWT-auth')`.

---

## Out of scope

- FG delivery posting **stock movements / warehouse inventory** — `DeliverFgDto.warehouseId`
  is recorded for a future spec that wires MO output into the `Stock`/`StockMovement`
  ledger (goods-receipts WAC pattern). Today FG delivery is financial (JE) only.
- Material actuals consuming raw-material stock (same future spec).
- Backflushing from BOM components; routing/operations beyond the single
  `workCenter` validation removed here.
- Labor actuals linked to an HR employees module (`employeeId` stays a free string).
- Editing/deleting posted actuals or variances (append-only today).
- Centralizing the `JE-` sequence into `journal-entries`/automation (this spec only
  hardens the local copy; consolidation belongs to an accounting-infra spec).
- `spec-021` multi-currency — MO costing stays single-currency until it lands.
- Any frontend changes beyond the `frontend-sync` items listed.

---

## Data model

**One additive change** (everything else preserved):

```prisma
// ProductionOrder — add after `status`:
priority String? @db.VarChar(20)   // low | medium | high | urgent (UI already renders it)
```

Migration: `npx prisma migrate dev --name mo_priority` (additive, nullable, no
backfill needed). Reference:

| Model | Table | Key fields |
|---|---|---|
| `ProductionOrder` | `mfg_production_orders` | `tenantId`, `poNumber`, `itemId`, `bomId?`, `quantityToProduce/Produced Decimal(15,3)`, planned/actual dates, `status` (`draft/released/in_progress/completed/cancelled`), `priority?` (new), `planLineId?` (spec-019 link), audit + soft delete; `@@unique([tenantId, poNumber])` |
| `MoLaborActual` | `mfg_mo_labor_actuals` | `tenantId`, `moId`, `workDate?`, `employeeId?/Name?`, `hoursPlanned? Decimal(8,2)`, `hoursActual Decimal(8,2)`, `laborRate? Decimal(10,4)`, `laborCost? Decimal(15,2)`, audit + soft delete |
| `MoMaterialActual` | `mfg_mo_material_actuals` | `tenantId`, `moId`, `itemId`, `qtyPlanned/Actual Decimal(15,4)`, `unitCost Decimal(10,4)`, `varianceCost Decimal(15,2)`, audit + soft delete |
| `ProductionVariance` | `mfg_production_variances` | `tenantId`, `moId`, `varianceType` (`merma/surplus/labor/material`), `quantity? Decimal(15,4)`, `unitCost?`, `totalCost? Decimal(15,2)`, `status` (`open/je_posted/closed`), `jeId?` → `JournalEntry`, audit + soft delete |

Key invariants:
- `poNumber` sequence `MO-<year>-NNNN` is shared with `production-plans.generateMos`
  — both producers MUST use the numeric-max pattern; `@@unique([tenantId, poNumber])`
  is the collision backstop (`P2002 → 409`).
- Variance lifecycle: `open → je_posted` (via post-je); `closed` reserved.
- JE side effects go through `AutomationService.handleAutoJe` (respects per-module
  auto/manual config); GL accounts by `accountNumber`: FG `1.1.05`, WIP `1.1.04`,
  losses `6.2.07`, gains `4.1.01`.

---

## API contracts

All routes prefixed `/api`, JWT-guarded. Statuses: `draft | released | in_progress |
completed | cancelled`.

### POST /api/production-orders *(INVENTORY:CREATE)*
```json
// Request
{
  "bomId": "<uuid>",
  "quantityOrdered": 100,
  "plannedStartDate": "2026-06-10",
  "plannedEndDate": "2026-06-14",
  "priority": "high",                 // low | medium | high | urgent (NEW: persisted)
  "notes": "Rush order"
}
// workCenterId REMOVED (was validated then silently dropped; zero consumers)

// Response 201 — MO with numeric quantities + BOM detail
{ "id": "...", "poNumber": "MO-2026-0001", "status": "draft", "priority": "high",
  "quantityToProduce": 100, "quantityProduced": 0, "bom": { "...": "..." } }

// Errors: 404 BOM not found | 400 validation | 409 MO number collision (retry)
```

### GET /api/production-orders?status= *(INVENTORY:VIEW)*
```json
// Response 200 — envelope (NEW; was a bare array)
{ "productionOrders": [ { "id": "...", "poNumber": "...", "status": "...", "priority": "...", "...": "..." } ], "count": 3 }
// Errors: 400 status outside whitelist
```

### GET /api/production-orders/:id *(INVENTORY:VIEW)*
```json
// Response 200 — MO + bom.components (consumptionGroup, consumptionUom included)
// Errors: 404 not found / other tenant
```

### PATCH /api/production-orders/:id *(INVENTORY:EDIT)*
```json
// Request (draft only) — quantityOrdered, plannedStartDate, plannedEndDate, priority, notes
{ "quantityOrdered": 150, "priority": "urgent" }
// Response 200 — updated MO
// Errors: 404 | 400 not draft / validation
```

### PATCH /api/production-orders/:id/status/:status *(INVENTORY:EDIT)*
```json
// Response 200
{ "message": "Production order MO-2026-0001 status updated to released", "productionOrder": { "...": "..." } }
// Side effects: first in_progress stamps actualStartDate; completed stamps actualEndDate
// Errors: 404 | 400 status not in whitelist | 400 invalid transition (e.g. completed → draft)
```

### DELETE /api/production-orders/:id *(INVENTORY:DELETE)*
```json
// Response 200
{ "message": "Production order deleted", "id": "..." }
// Errors: 404 | 400 not draft
```

### POST /api/production-orders/:id/labor-actuals *(INVENTORY:EDIT)*
```json
// Request
{ "workDate": "2026-06-11", "employeeName": "Juan Perez", "hoursPlanned": 8,
  "hoursActual": 9.5, "laborRate": 15, "notes": "Overtime" }
// Response 201 — { message, laborActual } (laborCost = rate × hours when both given)
// Errors: 404 | 400 MO in draft/cancelled
```

### GET /api/production-orders/:id/labor-actuals *(INVENTORY:VIEW)*
```json
// Response 200
{ "actuals": [ ... ], "summary": { "totalPlannedHours": 8, "totalActualHours": 9.5,
  "varianceHours": 1.5, "totalLaborCost": 142.5, "efficiency": 84.21 } }
```

### POST /api/production-orders/:id/material-actuals *(INVENTORY:EDIT)*
```json
// Request
{ "itemId": "<uuid>", "qtyPlanned": 100, "qtyActual": 108, "unitCost": 2.5 }
// Response 201 — { message, materialActual } (varianceCost = (actual−planned) × unitCost)
// Errors: 404 MO/item | 400 MO in draft/cancelled
```

### GET /api/production-orders/:id/material-actuals *(INVENTORY:VIEW)*
```json
// Response 200
{ "actuals": [ ... ], "summary": { "totalMaterials": 1, "totalVarianceCost": 20,
  "overConsumed": 1, "underConsumed": 0 } }
```

### POST /api/production-orders/:id/deliver *(INVENTORY:EDIT)*
```json
// Request — allowed ONLY in released | in_progress (NEW: completed re-delivery blocked)
{ "quantityDelivered": 950, "unitCost": 25, "warehouseId": "<uuid, recorded>", "notes": "..." }

// Response 201
{ "message": "FG delivery confirmed for MO-2026-0001", "quantityDelivered": 950,
  "quantityPlanned": 1000, "variance": -50, "totalFgValue": 23750,
  "journalEntry": { "...": "DR 1.1.05 / CR 1.1.04" }, "variancesCreated": 1,
  "variances": [ { "varianceType": "merma", "totalCost": 1250, "status": "open" } ] }

// Errors: 404 | 400 wrong status (incl. second delivery)
```

### GET /api/production-orders/:id/variances *(INVENTORY:VIEW)*
```json
// Response 200
{ "variances": [ ... ], "summary": { "total": 1, "open": 1, "jePosted": 0,
  "totalMermaCost": 1250, "totalSurplusCost": 0, "netVarianceCost": 1250 } }
```

### GET /api/production-orders/variances?status=&varianceType= *(INVENTORY:VIEW)*
```json
// Response 200 — envelope (NEW; was a bare array)
{ "variances": [ { "...": "...", "productionOrder": { "poNumber": "..." } } ], "count": 4 }
// Errors: 400 status/varianceType outside whitelist
```

### PATCH /api/production-orders/variances/:varianceId/post-je *(ACCOUNTING:POST)*
```json
// Request (overrides optional)
{ "debitAccountId": "<uuid>", "creditAccountId": "<uuid>", "notes": "Q2 merma" }

// Response 200
{ "message": "Variance JE posted for merma — MO-2026-0001", "journalEntry": { "...": "..." },
  "variance": { "status": "je_posted", "jeId": "..." } }

// Errors: 404 variance | 400 already posted / zero cost / GL accounts missing |
//         400 JE skipped (module set to manual)
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `prisma/schema.prisma` + migration `mo_priority` | Add `ProductionOrder.priority VARCHAR(20) NULL` (additive) |
| `src/modules/production-orders/production-orders.service.ts` | State machine (whitelist + transition map); numeric-max `generatePoNumber`/`generateJeNumber`; `P2002 → 409`; deliver status gate (drop `completed`); scope `bom.findFirst` + account overrides; 5 writes → `updateMany` + refetch; persist `priority`; envelopes |
| `src/modules/production-orders/production-orders.controller.ts` | Query DTOs for `GET /` and `GET /variances`; 7 missing `@ApiResponse`; envelope descriptions |
| `src/modules/production-orders/dto/create-production-order.dto.ts` | Drop `workCenterId`; `@IsIn` priority; `@Max` caps |
| `src/modules/production-orders/dto/production-actuals.dto.ts` | `@IsUUID` on itemId/warehouseId/accountIds; `@Max` caps |
| `src/modules/production-orders/dto/query-production-orders.dto.ts` | **New** — status / variance query whitelists |
| `src/modules/production-orders/production-orders.module.ts` | Import `AutomationModule`; stop re-providing `PrismaService`/`AutomationService` |
| `src/modules/production-plans/production-plans.service.ts` | `generateMos` inline MO numbering → identical numeric-max logic (cross-module, owned here per spec-019) |
| `frontend/lib/api/production-orders.ts` | `extractList` unwraps `productionOrders`/`variances`; `update` sends `quantityOrdered` (fixes broken UI quantity edit) |

### Cross-module dependencies
- **`AutomationService.handleAutoJe`** — both JE paths (FG delivery, variance);
  respects the per-module auto/manual automation config (a manual setting returns
  `null` → variance post-je surfaces `400`).
- **`production-plans`** — co-producer of the MO sequence; its inline generator is
  updated here (documented cross-module edit per the interconnection rule).
  `linkMo` / `generateMos` behavior itself stays under spec-019.
- GL account resolution by `accountNumber` constants — chart-of-accounts seed must
  contain `1.1.04`, `1.1.05`, `6.2.07`, `4.1.01` for JEs to post (else FG JE is
  skipped silently by design; variance JE throws `400`).

### Behavioral notes
- `actualStartDate` only stamps on the FIRST transition to `in_progress`
  (preserved); `actualEndDate` stamps on `completed` — including via deliver.
- Transition map blocks `completed → in_progress`; if a re-delivery correction
  flow is ever needed it becomes its own spec (credit-JE reversal, not overwrite).
- The `priority` migration runs through the `new-migration` pipeline (migrate →
  generate → build → e2e impact check).

---

## Verification checklist

```bash
# 0. Migration + login
cd backend && npx prisma migrate dev --name mo_priority && npx prisma generate
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@burger.do","password":"Admin123!"}' | jq -r .access_token)

# 1. Create MO with priority → persisted
curl -s -X POST http://localhost:3000/api/production-orders \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"bomId":"<bom>","quantityOrdered":100,"priority":"high"}' | jq '{poNumber,priority,status}'
# Expected: "MO-2026-NNNN", "high", "draft"

# 2. List envelope + status whitelist
curl -s http://localhost:3000/api/production-orders -H "Authorization: Bearer $TOKEN" \
  | jq 'has("productionOrders") and has("count")'
curl -s "http://localhost:3000/api/production-orders?status=weird" \
  -H "Authorization: Bearer $TOKEN" | jq .statusCode
# Expected: true, then 400

# 3. State machine
curl -s -X PATCH http://localhost:3000/api/production-orders/<id>/status/garbage \
  -H "Authorization: Bearer $TOKEN" | jq .statusCode        # Expected: 400
curl -s -X PATCH http://localhost:3000/api/production-orders/<id>/status/completed \
  -H "Authorization: Bearer $TOKEN" | jq .statusCode        # Expected: 400 (draft → completed invalid)
curl -s -X PATCH http://localhost:3000/api/production-orders/<id>/status/released \
  -H "Authorization: Bearer $TOKEN" | jq .message           # Expected: updated to released

# 4. Deliver once → 201; deliver again → 400 (no duplicate JE)
curl -s -X POST http://localhost:3000/api/production-orders/<id>/deliver \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"quantityDelivered":95,"unitCost":25}' | jq .variancesCreated
curl -s -X POST http://localhost:3000/api/production-orders/<id>/deliver \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"quantityDelivered":95,"unitCost":25}' | jq .statusCode
# Expected: 1 (merma), then 400

# 5. Variances envelope + JE post
curl -s http://localhost:3000/api/production-orders/variances -H "Authorization: Bearer $TOKEN" \
  | jq 'has("variances") and has("count")'
# Expected: true

# 6. MO numbers numeric-consecutive across BOTH producers
#    (create one MO here, then generate MOs from a production plan; numbers must not collide)

# 7. Tests + builds
pnpm test production-orders.service && pnpm test:e2e production-orders
pnpm build && cd ../frontend && pnpm build
# Expected: all green
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (opportunity-finder score 84: 7 critical scoping, 2 architecture, 6 DTO, 6 error-handling, 7 swagger) | Draft — pending review |
| 2026-06-06 | Test scaffolds written (28 unit / 24 e2e, 27 tagged [GAP] red) | Red as designed |
| 2026-06-06 | All 24 gaps implemented: mo_priority additive migration (shadow-DB workaround: migrate diff + deploy), MO state machine (whitelist + transition map, terminals enforced), deliver re-entry blocked (duplicate JE closed), numeric-max MO/JE generators + production-plans generateMos aligned, P2002→409, bom/account lookups scoped, 5 writes → updateMany + refetch, priority persisted, workCenterId dropped, @IsUUID/@Max/@IsIn DTOs + query DTOs, envelopes + frontend-sync (extractList, quantityOrdered fix — UI quantity edit unbroken), DI fix (AutomationModule import) | Unit 33/33, e2e 26/26; spec-019 regression: plans 27/27, cluster e2e 15/15 |
| 2026-06-06 | Shipped to origin (05d9981); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
