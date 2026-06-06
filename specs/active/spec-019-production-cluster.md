# spec-019 — Production Cluster (Sales Orders ↔ Production Plans)

Status: **Draft**  
Owner: Platform  
Sprint: 19  
Module(s): `sales-orders` + `production-plans` (cyclic cluster — specced as one unit per `specs/MODULE-CASCADE.md`; touches `frontend/lib/api/sales-orders.ts` + `production-plans.ts` for the list envelopes)  
Last updated: 2026-06-06  

---

## Problem

The production cluster is the demand→supply spine: `sales-orders` captures customer
demand (`SO-YYYY-NNNN`, lines with discounts and totals) and `production-plans`
(`PP-YYYY-NNNN`) turns it into supply — plan lines optionally pegged to SO lines
(`ProductionPlanLine.soLineId`), auto-resolving the active BOM, generating
`ProductionOrder` MOs (Opción A) or linking existing ones (Opción B), with an
actual-vs-planned report. The cycle is FK-level, so one spec governs both modules.
Downstream consumers already trust this cluster: planning ATP reads
`SalesOrder.status in ['confirmed','shipped']` (spec-016) and the customers delete
guard counts active SOs (spec-013).

The audit (opportunity-finder, combined score 124 — SO 43 / PP 81) found:

1. **13 unscoped writes** (the spec-015..018 class): SO `update`
   (`sales-orders.service.ts:215`), `updateStatus` (`:237`), `remove` (`:258`);
   PP `update` (`production-plans.service.ts:167`), `updateLine` (`:202`),
   `updateStatus` (`:222`), `generateMos`'s line + plan writes (`:287`, `:297`),
   `linkMo`'s MO + line writes (`:325`, `:330`), `remove` (`:407`). Plus 3 reads:
   SO line includes without `deletedAt: null` (`:178`, `:223`) and PP's `soLine`
   check (`:67`).
2. **Sales orders have NO status state machine.** `PATCH /:id/status/:status`
   writes any string verbatim (`:234-249`) — `status='banana'` persists, silently
   excluded from ATP and every status filter. Production-plans has a proper
   transition map (`:210-219`); sales-orders needs the same.
3. **`generateMos` is untransacted and duplicates the number generator.** The
   MO-per-line loop (`:233-308`) creates MOs, flips line statuses and the plan
   status with no `$transaction` — a mid-loop failure strands MOs against `pending`
   lines (retry double-generates). The inline `MO-YYYY-NNNN` generator (`:258-267`)
   is the third copy of the pattern spec-017 consolidated, and races → P2002 → 500
   (`soNumber`/`planNumber` race the same way).
4. **Linkage and validation gaps.** `linkMo` steals MOs already linked to another
   line and re-links lines already `mo_created`; its body `{ moId }` and
   generate-mos' `{ lineIds }` are inline `@Body()` types with zero validation;
   SO `update` accepts a changed `customerId` without re-validating it in-tenant
   (cross-tenant linkage, the spec-018 supplier hole); `discountPercent` has no
   `@Max(100)` — a 200% discount produces **negative totals**; no `@Max` caps on
   quantities/prices; `?status=`/`?horizon=` free strings; both `findAll`s return
   bare arrays; the PP controller has **1 `@ApiResponse` across 10 handlers**.

Preserve what works: PP's transition map, auto-BOM resolution (active, highest
version), the actual-vs-planned report, SO totals math, both generators
tenant-scoped and spanning soft-deleted rows.

---

## Acceptance criteria

### Endpoints (existing surface — preserved)
- [x] `sales-orders`: 6 endpoints — `POST /`, `GET /`, `GET /:id`, `PATCH /:id`,
      `PATCH /:id/status/:status`, `DELETE /:id`.
- [x] `production-plans`: 10 endpoints — `POST /`, `GET /`, `GET /:id`,
      `GET /:id/actual-vs-planned`, `PATCH /:id`, `PATCH /:id/lines/:lineId`,
      `PATCH /:id/status/:status`, `POST /:id/generate-mos`,
      `POST /:id/lines/:lineId/link-mo`, `DELETE /:id`.
- [x] Both controllers `@UseGuards(JwtAuthGuard, PermissionsGuard)` + bearer; thin.
- [x] Every `production-plans` handler has at least one `@ApiResponse`
      (today 1/10); `sales-orders` already complete (19).

### Tenant scoping
- [x] Reads scoped `{ tenantId, deletedAt: null }`: SO customer/items checks,
      `findAll`/`findOne`; PP item/bom/plan/line checks, `findAll`/`findOne`,
      `linkMo`'s MO read, MO-number read.
- [x] SO: the 3 writes tenant-scoped at the write itself (`updateMany` + re-fetch):
      `update`, `updateStatus`, `remove`.
- [x] SO: lines includes filter `deletedAt: null` (`findOne`, `update` response
      include; `SalesOrderLine` is soft-deletable).
- [x] SO: `update` that changes `customerId` re-validates the customer in-tenant
      (`404 'Customer not found'`) — no cross-tenant linkage via draft edit.
- [x] PP: the 8 writes tenant-scoped at the write itself: `update`, `updateLine`,
      `updateStatus`, `generateMos`'s line/plan writes, `linkMo`'s MO/line writes,
      `remove`.
- [x] PP: the `soLineId` validation includes `deletedAt: null`.

### Sales-order lifecycle (new state machine)
- [x] `updateStatus` enforces a transition map exactly like production-plans':
      `draft → confirmed | cancelled`; `confirmed → shipped | cancelled`;
      `shipped → delivered`; `delivered → closed`; anything else (including unknown
      target strings) → `400` naming the allowed transitions. `cancelled`/`closed`
      are terminal.
- [x] `update` and `remove` are draft-only (`400` otherwise); delete is soft.
- [x] Totals: `lineTotal = qty × price − discount`, `subtotal = Σ lineTotal`,
      lines numbered, defaults (`status draft`, `currency USD`, `exchangeRate 1`).
- [x] Lines are immutable after creation (no line endpoint; `UpdateSalesOrderDto`
      omits `lines`) — documented.
- [x] `soNumber` race maps `P2002 → 409`.
- [x] `SO-YYYY-NNNN` system-assigned, tenant-scoped, spans soft-deleted (spec-012).

### Production-plan lifecycle (preserved + hardened)
- [x] Transition map enforced: `draft → confirmed|cancelled`,
      `confirmed → in_progress|cancelled`, `in_progress → completed|cancelled`;
      invalid target → `400` listing allowed.
- [x] Auto-BOM resolution: line without `bomId` gets the item's active BOM
      (highest version); explicit `bomId` validated in-tenant.
- [x] `update` allowed on draft/confirmed only; `remove` draft-only (soft).
- [x] `generateMos` runs inside **one `$transaction`**: per eligible line
      (pending + no linked MO + in `lineIds` scope) create the MO, flip the line to
      `mo_created`, and promote the plan `confirmed → in_progress` — atomically.
      MO numbers are generated through the tx (sees its own uncommitted writes);
      `P2002` on any number → `409`. (Moving `MO-YYYY-NNNN` generation into the
      `production-orders` module is deferred to that module's spec — documented.)
- [x] `linkMo` guards: MO already linked to a plan line → `409` naming the line;
      target line already `mo_created` → `400`; both writes tenant-scoped.
- [x] `planNumber` race maps `P2002 → 409`.
- [x] `PP-YYYY-NNNN` system-assigned, tenant-scoped, spans soft-deleted.
- [x] `actual-vs-planned` report: per-line variance, completion %, MO status
      aggregation, plan totals.

### DTO validation
- [x] Create DTOs validated throughout (`@IsUUID` FKs, `@Min(0.001)` quantities,
      `@IsDateString` dates, nested `@ValidateNested` lines).
- [x] `discountPercent` capped `@Max(100)` — no negative totals.
- [x] Numeric caps per Decimal column capacity on `unitPrice`, `orderedQuantity`,
      `plannedQty`, `producedQty` — overflow fails `400`, never 500.
- [x] PP date sanity: `periodEnd >= periodStart` and per-line
      `plannedEnd >= plannedStart` → `400`.
- [x] Inline `@Body()` types replaced with DTOs: `GenerateMosDto`
      (`lineIds?: string[]` `@IsUUID` each) and `LinkMoDto` (`moId` `@IsUUID`).
- [x] Query DTOs: SO `?status=` `@IsIn` (the 6 SO states); PP `?status=` `@IsIn`
      (5 PP states) + `?horizon=` `@IsIn(['weekly','monthly','quarterly'])` (matches
      the create DTO's `@IsEnum` — 'annual' is not a valid horizon today); invalid → `400`.

### RBAC
- [x] SO: `SALES:CREATE/VIEW/EDIT/APPROVE` (status) `/DELETE`.
      PP: `MFG:CREATE/VIEW/EDIT/APPROVE` (status) `/DELETE`;
      `generate-mos` → `MFG:CREATE`, `link-mo` → `MFG:EDIT`.

### Response format
- [x] `GET /api/sales-orders` → `{ salesOrders: [...], count }`;
      `GET /api/production-plans` → `{ productionPlans: [...], count }`; the
      frontend getters' `extractList` in `lib/api/sales-orders.ts` and
      `lib/api/production-plans.ts` extended to unwrap the new keys (both pages
      re-extract tolerantly, so the getter change suffices).
- [x] PP Decimals serialized as numbers (`formatPlan`); SO returns joined
      customer + lines; status updates return `{ message, <entity> }`;
      deletes return `{ message, id }`.

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations.
- `production-orders` module behavior (MOs are written here as a documented
  exception — the module is unspecced; its spec will own the MO number generator
  and may absorb `generateMos`'s write).
- Stock effects of SO `shipped`/`delivered` (shipping is `ar-invoices`'
  `shipFromArInvoice` flow, spec-016; SO status is a label here).
- SO line editing after creation; reservations (`reservedQuantity` written as 0,
  never managed here); taxes (`taxAmount` fixed at 0); multi-currency
  (`exchangeRate` fixed 1 — same deferral as spec-015).
- CRP (`crpStatus` is read-only surface in the report; capacity planning is
  future work).
- Pagination.
- Frontend changes beyond the two list getters.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `SalesOrder` | `sl_sales_orders` | `tenantId`, `soNumber` (`SO-YYYY-NNNN`), `customerId` FK, `orderDate`, `requestedDate`/`promisedDate`, `customerPo`, money block (`subtotal/discountAmount/taxAmount/total`, `currency`, `exchangeRate`), `status`, audit + soft-delete; `@@unique([tenantId, soNumber])` |
| `SalesOrderLine` | (child) | `tenantId`, `salesOrderId`, `lineNumber`, `itemId` FK, `orderedQuantity`/`reservedQuantity`/`shippedQuantity`, `uom`, `unitPrice`, `discountPercent`, `lineTotal`, `deliveryDate`, `status`, soft-delete |
| `ProductionPlan` | (mfg) | `tenantId`, `planNumber` (`PP-YYYY-NNNN`), `title`, `horizon`, `source`, `periodStart/End`, `status` (5 states), `crpStatus`, audit + soft-delete; `@@unique([tenantId, planNumber])` |
| `ProductionPlanLine` | (child) | `tenantId`, `planId`, `lineNumber`, `itemId` FK, `bomId` FK?, `plannedQty`/`producedQty`, `uom`, `plannedStart/End`, **`soLineId` FK? (the cluster edge)**, `status` (`pending/mo_created/completed`), soft-delete |
| Written cross-module | — | `ProductionOrder` (`poNumber` `MO-YYYY-NNNN`, `planLineId` back-edge) — unspecced, documented exception |
| Read-only | — | `Customer` (013), `Item` (003), `Bom` (011), `SalesOrderLine` from PP side |

Key invariants:
- One spec, one cycle: `SalesOrderLine ← ProductionPlanLine.soLineId` (demand peg)
  and `ProductionPlanLine ← ProductionOrder.planLineId` (supply execution).
- A plan line is `mo_created` iff at least one MO links to it; `generateMos` and
  `linkMo` are the only writers of that edge.
- SO and PP statuses move only along their transition maps; `cancelled`/`closed`/
  `completed` are terminal.
- Totals are derived, never client-supplied.

---

## API contracts

All routes prefixed `/api`, JWT + permissions guarded.

### POST /api/sales-orders *(SALES:CREATE)*
```json
// Request
{ "customerId": "<uuid>", "customerPo": "PO-CLIENT-99", "requestedDate": "2026-07-01",
  "lines": [ { "itemId": "<uuid>", "orderedQuantity": 50, "uom": "PCS",
               "unitPrice": 99.99, "discountPercent": 10 } ] }

// Response 201 — SO-YYYY-NNNN, draft, derived totals, joined customer + lines
{ "soNumber": "SO-2026-0001", "status": "draft", "subtotal": 4499.55, "total": 4499.55,
  "customer": { "code": "CL-2026-0001" }, "lines": [ { "lineNumber": 1, "lineTotal": 4499.55 } ] }

// Errors: 404 customer/item not in tenant | 400 validation (discount > 100, qty/price over cap) |
//         409 soNumber race | 403
```

### GET /api/sales-orders?status= *(SALES:VIEW)*
```json
// Response 200 (target envelope)
{ "salesOrders": [ { "soNumber": "SO-2026-0001", "status": "draft",
    "customer": { "...": "..." }, "_count": { "lines": 1 } } ], "count": 1 }
// Errors: 400 status not in whitelist | 403
```

### GET /api/sales-orders/:id *(SALES:VIEW)* — full SO with non-deleted lines; 404.

### PATCH /api/sales-orders/:id *(SALES:EDIT)*
```json
// Header fields only (lines immutable); changing customerId re-validates in-tenant
// Errors: 400 not draft | 404 SO or new customer | 403
```

### PATCH /api/sales-orders/:id/status/:status *(SALES:APPROVE)*
```json
// Response 200
{ "message": "Sales Order SO-2026-0001 confirmed", "salesOrder": { "status": "confirmed" } }
// Errors: 400 invalid transition (lists allowed) — draft→confirmed|cancelled,
//         confirmed→shipped|cancelled, shipped→delivered, delivered→closed | 404 | 403
```

### DELETE /api/sales-orders/:id *(SALES:DELETE)* — draft-only soft delete → { message, id }.

### POST /api/production-plans *(MFG:CREATE)*
```json
// Request
{ "title": "July run", "horizon": "monthly", "periodStart": "2026-07-01",
  "periodEnd": "2026-07-31",
  "lines": [ { "itemId": "<uuid>", "plannedQty": 1000, "uom": "PCS",
               "plannedStart": "2026-07-07", "plannedEnd": "2026-07-14",
               "soLineId": "<uuid>" } ] }

// Response 201 — PP-YYYY-NNNN, draft; bomId auto-resolved to the item's active BOM
// Errors: 404 item/bom/soLine not in tenant | 400 periodEnd < periodStart / line dates inverted |
//         409 planNumber race | 403
```

### GET /api/production-plans?horizon=&status= *(MFG:VIEW)*
```json
{ "productionPlans": [ { "planNumber": "PP-2026-0001", "status": "draft",
    "_count": { "lines": 1 }, "lines": [ { "status": "pending", "item": { "...": "..." } } ] } ],
  "count": 1 }
// Errors: 400 invalid query | 403
```

### GET /api/production-plans/:id *(MFG:VIEW)* — full plan, lines with item/bom/soLine/MOs, Decimals as numbers; 404.

### GET /api/production-plans/:id/actual-vs-planned *(MFG:VIEW)*
```json
{ "plan": { "planNumber": "PP-2026-0001", "crpStatus": null },
  "summary": [ { "lineNumber": 1, "plannedQty": 1000, "producedQty": 0, "variance": -1000,
    "completionPct": 0, "moSummary": { "total": 1, "draft": 1 } } ],
  "totals": { "totalPlanned": 1000, "totalProduced": 0, "linesMoCreated": 1 } }
```

### PATCH /api/production-plans/:id *(MFG:EDIT)* — draft/confirmed only; 400/404.

### PATCH /api/production-plans/:id/lines/:lineId *(MFG:EDIT)* — qty/dates/notes; 404 line.

### PATCH /api/production-plans/:id/status/:status *(MFG:APPROVE)*
```json
{ "message": "Plan PP-2026-0001 → confirmed", "productionPlan": { "status": "confirmed" } }
// Errors: 400 invalid transition (lists allowed) | 404 | 403
```

### POST /api/production-plans/:id/generate-mos *(MFG:CREATE)*
```json
// Request (GenerateMosDto)
{ "lineIds": ["<uuid>"] }   // optional — omit for all eligible lines

// Response 201 — atomic: MOs created + lines mo_created + plan → in_progress
{ "message": "1 MO created from plan PP-2026-0001", "created": 1,
  "mos": [ { "poNumber": "MO-2026-0001", "status": "draft", "planLineId": "..." } ] }
// 200 with created: 0 when no eligible lines
// Errors: 400 plan not confirmed/in_progress | 409 MO-number race | 404 | 403
```

### POST /api/production-plans/:id/lines/:lineId/link-mo *(MFG:EDIT)*
```json
// Request (LinkMoDto)
{ "moId": "<uuid>" }
// Response 200
{ "message": "MO MO-2026-0001 linked to plan line 1" }
// Errors: 404 plan/line/MO | 409 MO already linked to another line |
//         400 line already mo_created | 403
```

### DELETE /api/production-plans/:id *(MFG:DELETE)* — draft-only soft delete → { message, id }.

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/sales-orders/sales-orders.service.ts` | Tenant-scope 3 writes; `deletedAt: null` on line includes; SO status transition map; customerId re-validation on update; `P2002 → 409`; `{ salesOrders, count }` envelope |
| `src/modules/sales-orders/sales-orders.controller.ts` | Bind status-param whitelist + query DTO; envelope descriptions |
| `src/modules/sales-orders/dto/*` | `@Max(100)` discount, numeric caps, `FindSalesOrdersQueryDto` |
| `src/modules/production-plans/production-plans.service.ts` | Tenant-scope 8 writes; `deletedAt` on soLine check; `$transaction` around `generateMos` (tx-aware MO numbering, `P2002 → 409`); `linkMo` steal/already-linked guards; date sanity; `{ productionPlans, count }` envelope |
| `src/modules/production-plans/production-plans.controller.ts` | `@ApiResponse` on all 10 handlers; bind `GenerateMosDto`/`LinkMoDto` + query DTO |
| `src/modules/production-plans/dto/*` | Caps, date sanity, new `GenerateMosDto`, `LinkMoDto`, `FindPlansQueryDto` |
| `frontend/lib/api/sales-orders.ts`, `production-plans.ts` | `extractList` unwraps `salesOrders`/`productionPlans` keys |

### Cross-module dependencies
- **Writes `ProductionOrder`** (unspecced) in `generateMos`/`linkMo` — documented
  exception; that module's future spec owns the MO number generator (pattern: the
  tx-aware public method established in spec-017).
- Reads: `customers` (013), `items` (003), `bom` (011); consumed by: planning ATP
  (spec-016), customers delete guard (013), `ar-invoices`, `production-orders`.
- The SO transition map's `confirmed`/`shipped` states are load-bearing for
  spec-016's ATP — the new machine must keep those exact strings.

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe`; Swagger at `/api/docs`; both modules
  registered in `app.module.ts`.

---

## Verification checklist

```bash
# 0. Login (spec-001) → $TOKEN; customer → $CUST; item with active BOM → $ITEM
# 1. Create SO → 201 SO-YYYY-NNNN draft, derived totals; discountPercent 200 → 400
# 2. SO status: draft→confirmed → 200; confirmed→banana → 400 listing allowed;
#    confirmed→shipped→delivered→closed → 200 each; closed→anything → 400
# 3. SO update with another tenant's customerId → 404; update non-draft → 400
# 4. GET /sales-orders → { salesOrders, count }; ?status=weird → 400
# 5. Create PP with line pegged to a SO line (soLineId) → 201, bomId auto-resolved
# 6. PP periodEnd < periodStart → 400
# 7. confirm plan → generate-mos → 201: MO created, line mo_created, plan in_progress
#    (verify atomicity contract via tests); re-run generate-mos → created: 0
# 8. link-mo with an MO already linked → 409; line already mo_created → 400
# 9. actual-vs-planned → summary with variance + moSummary
# 10. Tenant isolation (tenant2admin): SO/PP ids → 404 on all verbs; lists empty
# 11. Build + lint + tests
cd backend && pnpm build && pnpm test sales-orders && pnpm test production-plans \
  && pnpm test:e2e production-cluster
# Expected: all pass
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Cluster spec generated from code by spec-generator (seeded by opportunity-finder combined audit, SO 43 + PP 81 = 124) | Draft — 13 unscoped writes + 3 unscoped reads, missing SO state machine, untransacted generateMos + inline MO generator, linkMo steal guards, customerId re-validation, discount cap, inline bodies → DTOs, query DTOs, 9 missing @ApiResponse, list envelopes captured as unchecked criteria |
| 2026-06-06 | Test scaffolding written (17 + 27 unit / 15 e2e, tagged [GAP]) | Red as expected on all gaps |
| 2026-06-06 | All 17 gaps implemented: 13 writes tenant-scoped (updateMany + refetch), SO state machine (draft->confirmed->shipped->delivered->closed, terminals enforced), customerId re-validation, transactional generateMos with tx-aware MO numbering, linkMo steal (409) + already-linked (400) guards, P2002->409 x3, soLine/lines deletedAt filters, date sanity, @Max(100) discount + per-column caps, GenerateMosDto/LinkMoDto, query DTOs, 29 @ApiResponse on PP controller, { salesOrders / productionPlans, count } envelopes + both frontend getters | Unit 17/17 + 27/27, e2e 15/15 (full SO->plan->MO cycle live), backend + frontend builds OK, lint clean |
