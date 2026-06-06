# spec-020 — Procurement Cluster (Purchase Orders ↔ RFQs ↔ Requisitions ↔ General Needs)

Status: **Complete**  
Owner: Platform  
Sprint: 19  
Module(s): `purchase-orders` + `rfqs` + `purchase-requisitions` + `general-needs` (incl. `mrp.service.ts`) — four-module cyclic cluster, specced as one unit per `specs/MODULE-CASCADE.md`; touches the 4 frontend `lib/api` getters for the list envelopes  
Last updated: 2026-06-06  

---

## Problem

The procurement cluster is the buy-side spine: demand enters as **general needs**
(manual, MRP explosion via `MrpService`, or legacy MO explode), converts to
**purchase requisitions**, optionally goes to quote via **RFQs** (invite → respond →
compare → award), and lands as **purchase orders** whose `receive` flow writes stock.
The cycle is real: GN→PR (`sourceRefId`/`prLineId`), PR→RFQ (`rfq.prId`/`prLineId`),
RFQ→PO (`po.rfqId`/`rfqLine.poLineId`). ~2,500 lines across 5 services.

The audit (two parallel auditors, combined ~316 pts / 100 findings — by far the
largest surface yet) found four families:

1. **Cross-tenant injection in `award` — the worst tenant hole in the codebase.**
   `rfqs.service.ts:294/:307/:332` validate `rfqResponseLineId` with **no tenantId**,
   and `:364/:406` write `rfqLine.update({where:{id: dto.rfqLineId}})` with the id
   taken **straight from the DTO, never validated in-tenant** — a crafted award can
   read and mutate another tenant's RFQ lines and drive PO creation from them. Plus
   `award`'s supplier check misses `deletedAt` (`:320`), `submitResponse`'s
   supplier-count and `send`'s bulk supplier update have no tenantId (`:269`, `:178`).
2. **~30 unscoped writes** across all five services (the spec-015..019 class): every
   `update({where:{id}})` after a scoped read in PO (`:129,:157,:202,:277,:291`),
   PR (`:121,:171,:271,:290`), RFQ (`:152,:183,:263,:273,:358,:364,:406,:413,:427,:452,:468`),
   GN (`:145,:182,:206,:294,:309,:412`), MRP (`:290`).
3. **Five untransacted multi-write flows**, two of them money-critical:
   - `PO.receive` (`purchase-orders.service.ts:168-283`): line updates + `stock` +
     `stockMovement` + PO status across many awaits, **no `$transaction`** — partial
     failure corrupts inventory. It also writes spec-016's models **directly** and
     duplicates the `SM-` number generator (spec-017 made the shared one public).
   - `RFQ.award` (`:286-440`): N POs + response/line/supplier/RFQ updates untransacted.
   - `PR.convertToRfq`, `GN.convertToPr`, `MrpService.runMrp` / `explodeFromMos` —
     same pattern.
4. **Status chaos + convention drift.** RFQ has **no transition map** (ad-hoc `if`s);
   PO/PR have maps that their own flows bypass (`receive` sets
   `partially_received/received` outside the map; `convertToRfq` forces
   `in_progress`); `submitResponse` only accepts status `sent`, so **after the first
   response the remaining invited suppliers are locked out**; no re-award guard.
   Four inline number generators (`PO-` and `PR-` **duplicated** across modules) use
   lexicographic `findFirst+orderBy`; no P2002→409 anywhere; no `@Max` caps;
   `expectedDate` validated as `@IsString`; 3 inline `@Body()` objects with zero
   validation (`convertToRfq`, `convertToPr`, `explodeFromMos`); 22 handlers missing
   `@ApiResponse`; all 4 `findAll`s bare arrays; `explodeFromMos` picks the
   preferred supplier **without filtering by item** (`general-needs.service.ts:370` —
   random supplier suggested); `AwardRfqDto.warehouseId` accepted but never used;
   `runMrp` and `explodeFromMos` use different MO-status whitelists.

Preserve what works: GN's transition map, PR's approval workflow with
approve/reject audit fields, scoped membership checks in `convertToRfq` line
selection, over-receive guard, the comparison matrix, MRP's UOM-aware aggregation.

---

## Acceptance criteria

### Endpoints (existing surface — preserved: 7 PO + 7 PR + 10 RFQ + 10 GN = 34)
- [x] All four controllers guarded (`JwtAuthGuard, PermissionsGuard` + bearer), thin,
      with `PROCUREMENT:CREATE/VIEW/EDIT/APPROVE/DELETE` mapping as inventoried.
- [x] Every handler has at least one `@ApiResponse` (22 missing: PO 4, PR 5, RFQ 6, GN 7).

### Tenant scoping — award injection (the priority fix)
- [x] `award` validates **every** `rfqLineId` and `rfqResponseLineId` in-tenant AND
      belonging to the target RFQ (response line → its rfqLine → this RFQ) before any
      write; cross-tenant or cross-RFQ ids → `404`.
- [x] `award`'s supplier check includes `deletedAt: null`; `send`'s
      `rfqSupplier.updateMany` and `submitResponse`'s `rfqSupplier.count` include
      `tenantId`.

### Tenant scoping — writes (pre-approved pattern, all five services)
- [x] All ~30 `update({where:{id}})` writes become
      `updateMany({where:{id, tenantId[, deletedAt: null]}})` (+ re-fetch where the
      response needs the entity): PO ×5, PR ×4, RFQ ×11, GN ×6, MRP ×1, and the
      cross-module writes inside transactions carry `tenantId` likewise.
- [x] Reads already scoped throughout (verified — incl. `convertToRfq`'s line
      selection and all FK validations except those listed above).

### Transactions (all five multi-write flows)
- [x] `PO.receive` runs in one `$transaction`: line updates + stock find/update/create
      + movement create + PO status — atomically; movement numbers come from the
      shared public `StockTransactionsService.generateMovementNumber(tenantId, tx)`
      (spec-017) — the inline `SM-` duplicate is deleted; `StockTransactionsModule`
      imported. (Stock/movement writes stay direct-but-scoped as a documented
      exception: spec-016's service has no tx-composable receive API yet. The
      bypassed `GoodsReceipt` model is the goods-receipts module's spec to wire.)
- [x] `RFQ.award` runs in one `$transaction` (PO creates + all link/status writes);
      PO numbers via a now-public tx-aware
      `PurchaseOrdersService.generatePoNumber(tenantId, tx)` injected into
      `RfqsService` — the inline duplicate is deleted.
- [x] `PR.convertToRfq` and `GN.convertToPr` each run in one `$transaction`; the
      inline `PR-` generator in general-needs is replaced by a public tx-aware
      `PurchaseRequisitionsService.generatePrNumber(tenantId, tx)` injected into
      `GeneralNeedsService`; the `RFQ-` number for `convertToRfq` comes from a public
      tx-aware `RfqsService.generateRfqNumber` injected into
      `PurchaseRequisitionsService`.
- [x] `MrpService.runMrp` and `explodeFromMos` wrap their line-creates + GN update in
      one `$transaction` each.
- [x] All number-generation race paths map `P2002 → 409` with a retry message.

### Number generators (pre-approved migration)
- [x] All four generators (`PO-`, `PR-`, `RFQ-`, `GN-` `YYYY-NNNN`) migrate from
      lexicographic `findFirst+orderBy` to `findMany` + numeric max (spec-013
      pattern), tenant-scoped, spanning soft-deleted rows; each lives in its owning
      service as a public tx-aware method (signature per spec-017's
      `generateMovementNumber`).

### State machines (single status authority)
- [x] **RFQ gains a transition map**: `draft → sent | cancelled`;
      `sent → partial_response | cancelled`; `partial_response → fully_responded |
      awarded | cancelled`; `fully_responded → awarded | cancelled`; `awarded` and
      `cancelled` terminal. All internal flows (`send`, `submitResponse`, `award`,
      `cancel`) move along map edges only.
- [x] **PO map completed** so `receive` is no longer a second authority:
      add `confirmed → partially_received | received` and
      `partially_received → received | partially_received` edges; `receive` routes
      its status writes through the same map constants.
- [x] **PR**: `convertToRfq`'s forced `in_progress` uses the existing
      `approved → in_progress` edge explicitly (assert current status first) instead
      of bypassing the map.
- [x] GN's transition map preserved (`draft→in_progress|cancelled`,
      `in_progress→completed|cancelled`); internal flows (`convertToPr`, `runMrp`)
      set `in_progress` along the existing edge.

### RFQ response/award flow correctness
- [x] `submitResponse` accepted while RFQ status ∈ {`sent`, `partial_response`} (the
      current `sent`-only guard locks out every supplier after the first response);
      the responding `rfqSupplier` must be in {`invited`, `sent`, `responded`}
      (re-submit allowed, but not after `awarded`/`declined`).
- [x] `award` guards: each awarded response line belongs to a supplier whose status
      is `responded`; an `rfqLine` already `awarded` → `409` (no re-award).
- [x] `AwardRfqDto.warehouseId` removed (accepted but never used — contract lie).

### DTO validation (pre-approved patterns)
- [x] `@Max` caps per Decimal column capacity on every quantity/price/amount across
      the cluster (qty `Decimal(15,3)` → 999999999999; price/cost `Decimal(15,4)` →
      99999999999; `discountPercent` → `@Max(100)`).
- [x] `expectedDate` fields validated `@IsDateString` (PO header + line — currently
      `@IsString`).
- [x] The 3 inline `@Body()` objects become DTOs: `ConvertToRfqDto`
      (`lineIds` `@IsUUID each`, `rfqTitle`, `supplierIds` `@IsUUID('4') each`,
      `currency?`, `responseDeadline?` `@IsDateString`), `ConvertToPrDto`
      (`lineIds`, `prTitle`, `priority?` `@IsIn`), `ExplodeMosDto` (`moIds`
      `@IsUUID each`); PR `updateStatus`'s `{reason?}` becomes `StatusReasonDto`.
- [x] Query DTOs with `@IsIn` whitelists on all four `findAll`s (`status` per
      module's state set; PR also `priority`); `sourceType` on GN lines gets
      `@IsIn(['mo','manual'])`; `supplierIds` `@IsUUID('all')` → `('4')`.
- [x] Everything else already validated (nested `@ValidateNested` lines, `@IsEnum`
      on PR priority/source and GN source, `RunMrpDto` fully validated).

### Logic fixes
- [x] `explodeFromMos`'s preferred-supplier lookup filters by the component's item
      (`supplierItem.findFirst({tenantId, itemId, isPreferred: true, deletedAt: null})`).
- [x] Over-receive guard, comparison matrix, MRP UOM aggregation, PR approval audit
      fields (approvedBy/At, rejectedBy/At/reason required on reject) — preserved.
- [x] `runMrp` vs `explodeFromMos` MO-status whitelist divergence documented in code
      comments (unifying the semantics is out of scope — `explodeFromMos` is legacy).

### Response format
- [x] The four `findAll`s return envelopes `{ purchaseOrders | purchaseRequisitions |
      rfqs | generalNeeds, count }`; the four frontend getters' `extractList`
      (all currently tolerant of array/`{value}` only) extended with the new keys.
- [x] Mutations return entities / `{ message, ... }`; deletes return `{ message, id }`
      (soft deletes throughout — preserved).

---

## Out of scope

- Schema changes — none. (`GoodsReceipt` stays bypassed by `PO.receive`; wiring it
  is the goods-receipts module's spec.)
- Full service-injection refactor of cross-module *writes*: `award`→PO,
  `convertToPr`→PR, `convertToRfq`→RFQ creations stay direct-but-transactional
  within the cluster (the number generators DO move to owning services — that's the
  contract seam); `receive`→stock stays a documented exception per spec-016.
- Cross-module *reads* in MRP (bom/uom/items models) stay direct (read-only,
  documented) — `bomComponent` reads gain `tenantId`.
- Unifying `runMrp`/`explodeFromMos` semantics; pending-item workflows
  (`itemStatus: pending_item → item_created`); RFQ supplier portal/decline flows
  (`declined` is never written today — unchanged).
- Pagination; tax on POs; multi-currency beyond the stored `currency` string.
- Frontend changes beyond the four list getters.

---

## Data model

**No changes.** Owned models (verified): `PurchaseOrder`/`PurchaseOrderLine`
(`@@unique([tenantId, poNumber])`), `ConsolidationConfig`, `PurchaseRequisition`/
`PurchaseRequisitionLine` (`@@unique([tenantId, prNumber])`), `Rfq`/`RfqLine`/
`RfqSupplier`/`RfqResponseLine` (`@@unique([tenantId, rfqNumber])`,
`@@unique([rfqSupplierId, rfqLineId])` on responses), `GeneralNeed`/`GeneralNeedLine`
(`@@unique([tenantId, gnNumber])`). All soft-deletable except `RfqSupplier`/
`RfqResponseLine` (no `deletedAt`).

Key invariants:
- Cycle edges: `GN.line.prLineId` ← convertToPr; `PR.rfqs[]` + `rfqLine.prLineId` ←
  convertToRfq; `PO.rfqId` + `rfqLine.poLineId` ← award. Each edge is written exactly
  once, inside its flow's transaction.
- Status fields move only along their maps; internal flows are not a second authority.
- An RFQ response line belongs to exactly one (supplier, line) pair; awarding is
  idempotent-safe (re-award → 409).
- Numbers (`PO-/PR-/RFQ-/GN-/SM-`) are system-assigned, numeric-max, never reused.

---

## API contracts

34 endpoints preserved as inventoried (routes/permissions unchanged). Deltas only:

- `GET /api/{purchase-orders|purchase-requisitions|rfqs|general-needs}` →
  `{ <resource>: [...], count }`; invalid `?status=`/`?priority=` → `400`.
- `POST /api/purchase-orders/:id/receive` → unchanged shape; now atomic; `409` on
  movement-number race; status transitions via the completed map.
- `PATCH /api/{po|pr}/:id/status/:status` + RFQ flow endpoints → `400` lists allowed
  transitions (RFQ now included); terminals enforced.
- `POST /api/rfqs/:id/response` → also valid while `partial_response`; `404` on
  cross-tenant ids; supplier-status guard.
- `POST /api/rfqs/:id/award` → atomic; `404` cross-tenant/cross-RFQ award ids; `409`
  re-award or PO-number race; `warehouseId` no longer accepted (400 via whitelist).
- `POST /api/purchase-requisitions/:id/convert-to-rfq`,
  `/api/general-needs/:id/convert-to-pr`, `/:id/explode-mos` → validated DTOs
  (unknown/invalid fields → 400); atomic.

---

## Implementation notes

| File | Change |
|---|---|
| `purchase-orders.service.ts` | 5 scoped writes; tx `receive` + shared `SM-` generator (inject `StockTransactionsService`); completed PO map, `receive` routes through it; public tx-aware `generatePoNumber` (numeric max); P2002→409; envelope |
| `purchase-requisitions.service.ts` | 4 scoped writes; tx `convertToRfq` using injected `RfqsService.generateRfqNumber`; map-asserted `in_progress`; public tx-aware `generatePrNumber`; P2002→409; envelope |
| `rfqs.service.ts` | RFQ transition map; award in-tenant validation of all award ids + supplier `deletedAt`; tx `award` using injected `PurchaseOrdersService.generatePoNumber`; tx `submitResponse` + relaxed/correct guards; 11 scoped writes; public tx-aware `generateRfqNumber`; P2002→409; envelope |
| `general-needs.service.ts` + `mrp.service.ts` | 7 scoped writes; tx `convertToPr` (injected `generatePrNumber`) / `runMrp` / `explodeFromMos`; item-filtered preferred supplier; `bomComponent` reads + tenantId; envelope |
| 4 `*.module.ts` | Wire injections: PO→StockTransactions; RFQ→PurchaseOrders; PR→Rfqs; GN→PurchaseRequisitions (acyclic at service level — verified no import cycle) |
| dto/ (all four) | `@Max` caps, `@IsDateString` expectedDate, `ConvertToRfqDto`/`ConvertToPrDto`/`ExplodeMosDto`/`StatusReasonDto`, 4 query DTOs, `@IsIn` whitelists, drop `AwardRfqDto.warehouseId` |
| controllers (all four) | 22 `@ApiResponse`; bind new DTOs |
| `frontend/lib/api/{purchase-orders,purchase-requisitions,rfqs,general-needs}.ts` | `extractList` + the four new envelope keys |

Injection chain is acyclic: GN→PR→RFQ→PO→StockTransactions (no service imports back
up the chain — the cycle exists only at FK level).

---

## Verification checklist

```bash
# Golden path (e2e drives this): PR → approve → convert-to-rfq → send → response ×2
# suppliers → award → PO created with rfqId + poLineId backlinks, all atomic.
# 1. PO: create → confirm → receive partial → status partially_received (via map);
#    receive rest → received; over-receive → 400; receive on draft → 400
# 2. PO receive movement appears in /stock-transactions ledger with SM- number
# 3. RFQ: response while partial_response → 200 (second supplier no longer locked out)
# 4. award with a foreign rfqResponseLineId → 404; re-award same line → 409
# 5. GN: create → convert-to-pr (DTO-validated) → PR created, lines converted,
#    GN in_progress; convert with lineIds:['not-a-uuid'] → 400
# 6. All four GET / → { <resource>, count }; ?status=weird → 400
# 7. discountPercent 200 → 400; expectedDate 'garbage' → 400
# 8. Tenant isolation across all four modules (tenant2admin → 404s, empty lists)
# 9. cd backend && pnpm build && pnpm test purchase-orders && pnpm test rfqs \
#      && pnpm test purchase-requisitions && pnpm test general-needs \
#      && pnpm test:e2e procurement-cluster
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Cluster spec generated (two parallel audits, combined ~316 pts / 100 findings) | Draft — award cross-tenant injection, ~30 unscoped writes, 5 untransacted flows, RFQ map missing + dual status authorities, supplier lock-out bug, item-less preferred-supplier bug, 4 lexicographic generators (2 duplicated cross-module), P2002 ×4, @Max/@IsDateString/inline-body gaps, 22 missing @ApiResponse, 4 bare-array lists captured as unchecked criteria |
| 2026-06-06 | Implemented all 23 open criteria: award in-tenant validation, ~30 scoped writes, 5 transactions (receive/award/convertToRfq/convertToPr/runMrp+explodeFromMos), 4 public tx-aware numeric-max generators on the acyclic injection chain GN→PR→RFQ→PO→StockTransactions, RFQ map + completed PO map + PR map edge, submitResponse/award guards, AwardRfqDto.warehouseId removed, @Max/@IsDateString caps, 4 new DTOs + 4 query DTOs, 22 @ApiResponse, 4 envelopes + frontend getters | 45/45 unit + 9/9 procurement e2e + 32/32 regression e2e green; both builds green |
| 2026-06-06 | Shipped to origin (5cbc315); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
