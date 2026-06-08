# spec-018 — Supplier Items (Supplier↔Item Catalog Links)

Status: **Complete**  
Owner: Platform  
Sprint: 19  
Module(s): `supplier-items` (touches `frontend/lib/api/supplier-items.ts` for the list envelopes)  
Last updated: 2026-06-06  

---

## Purpose

- **Who uses this module?** Procurement and purchasing staff who maintain the sourcing
  catalog — which suppliers sell which items, at what price and terms.
- **What business problem does it solve?** It links suppliers to items with last price,
  minimum order quantity, lead time, and pack size, enforces that a supplier's purchase
  unit matches the item's, and tracks the preferred supplier per item (mirrored onto the
  item's default supplier).
- **What can the business NOT do without this module?** It cannot know who to buy each item
  from, at what price, or with what lead time — so purchase orders, RFQs, and demand
  planning have no sourcing data to work from.

## Business value

This module answers the buyer's first question on every item: who do we buy this from, and
on what terms? Without it, purchasing has no price, no lead time, and no minimum-order
information, so every order becomes a manual research task and demand planning has nothing to
plan against. The preferred-supplier logic ensures each item has one clear default source,
and the strict purchase-unit rule prevents a class of costly errors where the same item is
ordered in mismatched units. It is the sourcing foundation the entire procurement cluster is
built on.

---

## Problem

`supplier-items` owns the supplier↔item sourcing catalog: which suppliers sell which
items, at what last price, MOQ, lead time and pack size, with a **strict purchase-UOM
rule** (a supplier-item's `purchaseUomId` must equal the item's — a different unit means
a different item) and **preferred-supplier** management that keeps exactly one preferred
entry per item and mirrors it onto `Item.defaultSupplierId`. The procurement cluster
(purchase-orders, rfqs, general-needs — next in the cascade) builds on these links.

The module is in good shape — 7/7 Swagger-annotated handlers, thin controller, the UOM
rule well-engineered with actionable messages, soft-delete **reactivation** that
correctly spans deleted rows, and an `UpdateSupplierItemDto` that properly omits the
immutable `supplierId`/`itemId`. The audit (opportunity-finder, score 50) found:

1. **`supplierId` is never validated in-tenant** (`supplier-items.service.ts:81-159`):
   `create` validates the item (via the UOM rule) but not the supplier. Since the FK is
   a global id, a supplier-item can be linked to **another tenant's supplier** — a
   cross-tenant linkage hole — and a bogus id surfaces as a Prisma FK 500.
2. **5 unscoped writes** (`where: { id }` after scoped fetch — the class specs 015–017
   eliminated): the reactivation update (`:93`), `item.update` in the create path
   (`:152`), `item.update` in the update path (`:218`), the main update (`:224`), and
   the soft-delete (`:236`). Plus the `validatePurchaseUom` item read omits
   `deletedAt: null` (`:46-47`).
3. **Consistency and convention gaps.** Removing the *preferred* supplier-item leaves
   `Item.defaultSupplierId` dangling at the removed supplier (`:234-241`); concurrent
   creates race `@@unique([tenantId, supplierId, itemId])` → unhandled P2002 → 500;
   numeric DTO fields have `@Min(0)` but no `@Max` caps; `GET /` query params are free
   strings; the three list endpoints return bare arrays instead of the
   `{ supplierItems, count }` envelope.

Notes (not violations): `UomUnit` is a global catalog (`@@unique([code])`, no
`tenantId`) — its display lookup at `:67` is legitimately unscoped. The
`conversionFactor` DTO description claims catalog auto-calculation; the code defaults to
1, which is correct *because* the UOM rule forces unit equality — the description is
fixed, not the behavior.

---

## Acceptance criteria

### Endpoints (existing surface — preserved)
- [x] 7 endpoints under `/api/supplier-items`: `POST /`, `GET /`, `GET /by-item/:itemId`,
      `GET /by-supplier/:supplierId`, `GET /:id`, `PATCH /:id`, `DELETE /:id`.
- [x] Controller-level `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth`;
      every handler has `@ApiOperation` + `@ApiResponse`.
- [x] Controller is thin — all logic in `SupplierItemsService`.

### Tenant scoping
- [x] Reads scoped: `findAll`/`findOne` `{ tenantId, deletedAt: null }`; the duplicate
      check deliberately spans soft-deleted rows (reactivation contract); the
      preferred-flag `updateMany` calls carry `tenantId` (`:123-126`, `:208-217`).
- [x] **`supplierId` validated as an in-tenant, non-deleted supplier on create** →
      `404 'Supplier not found'` otherwise (closes the cross-tenant linkage hole and
      the FK 500).
- [x] The 5 writes are tenant-scoped at the write itself (`updateMany` + re-fetch or
      equivalent): reactivation, both `item.update` calls (`{ id, tenantId }`), the
      main update, and the soft-delete.
- [x] `validatePurchaseUom`'s item read includes `deletedAt: null`.
- [x] `UomUnit` lookups are global-catalog reads (no `tenantId` by design — documented).

### Purchase-UOM rule (core invariant — preserved)
- [x] A supplier-item's `purchaseUomId` MUST equal `Item.purchaseUomId`; item without a
      configured purchase UOM → `400` telling the user to set it first; mismatch → `400`
      naming both UOM codes and advising a separate item.
- [x] The rule re-runs on update whenever `purchaseUomId` is supplied.

### Preferred-supplier management (preserved)
- [x] Setting `isPreferred: true` (create or update) clears the flag on every other
      active entry for the item (tenant-scoped) and mirrors
      `Item.defaultSupplierId = supplierId`.
- [x] `remove` of the **preferred** entry also clears `Item.defaultSupplierId`
      (no dangling default after deletion).

### Create & reactivation (preserved + hardened)
- [x] Duplicate active entry → `409`; a soft-deleted entry for the same
      (supplier, item) is **reactivated** in place, merging provided fields over the
      old values and re-validating the UOM rule.
- [x] Concurrent-create race on `@@unique([tenantId, supplierId, itemId])` maps Prisma
      `P2002` to `409 ConflictException` — never a 500.
- [x] Defaults applied: `packSize 1`, `conversionFactor 1`, `leadTimeDays 0`, `moq 1`,
      `isPreferred false`, `isActive true`.

### DTO validation
- [x] All body fields validated (`@IsUUID` FKs, `@Min(0)` numerics, length caps);
      `UpdateSupplierItemDto = PartialType(Omit(supplierId, itemId))` keeps the link
      immutable.
- [x] Numeric fields capped per column capacity: `packSize`/`lastPrice`
      `@Max(99999999999)` (`Decimal(15,4)`), `moq` `@Max(999999999999)`
      (`Decimal(15,3)`), `conversionFactor` `@Max(9999999999)` (`Decimal(18,8)`),
      `leadTimeDays` `@Max(3650)` — overflow fails `400`, never a Decimal 500.
- [x] `conversionFactor` description corrected (defaults to 1 — same-unit by the UOM
      rule; not "auto-calculated from catalog").
- [x] `GET /` query validated via a query DTO: `itemId`/`supplierId` `@IsUUID`,
      `isPreferred` `@IsIn(['true','false'])`; invalid → `400`.

### RBAC
- [x] `POST` → `INVENTORY:CREATE`, `GET` → `INVENTORY:VIEW`, `PATCH` →
      `INVENTORY:EDIT`, `DELETE` → `INVENTORY:DELETE`.

### Response format
- [x] The three list endpoints (`GET /`, `by-item`, `by-supplier`) return
      `{ supplierItems: [...], count }`; the three frontend getters in
      `frontend/lib/api/supplier-items.ts` unwrap it.
- [x] Every entry is enriched with `conversionPreview`
      (`"1 <purchaseUom> = <factor> <baseUom>"`); mutations return the enriched entity;
      delete returns `{ message, id }`.

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations.
- The cross-module `Item.defaultSupplierId` write stays a direct Prisma write
  (documented exception — `items` has no service API for it; it becomes tenant-scoped
  but not service-routed).
- Price history / price lists (only `lastPrice` is stored here).
- Supplier scoring interplay (`SupplierScore` belongs to spec-002).
- Pagination; bulk import of supplier catalogs.
- Frontend changes beyond the three envelope getters.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `SupplierItem` | `in_supplier_items` | `tenantId`, `supplierId` FK, `itemId` FK, `supplierItemCode/Name`, `purchaseUomId` FK → `UomUnit`, `packSize Decimal(15,4)`, `conversionFactor Decimal(18,8)`, `lastPrice Decimal(15,4)?`, `leadTimeDays`, `moq Decimal(15,3)`, `isPreferred`, `isActive`, audit + soft-delete; `@@unique([tenantId, supplierId, itemId])` |
| Read-only / touched | — | `Item` (UOM rule source + `defaultSupplierId` mirror), `Supplier` (existence check), `UomUnit` (global catalog, display) |

Key invariants:
- `purchaseUomId === Item.purchaseUomId` — always (the "different unit = different
  item" rule).
- At most one `isPreferred` entry per (tenant, item); `Item.defaultSupplierId` always
  points at the preferred entry's supplier or is null.
- One row per (tenant, supplier, item) — soft-deleted rows are reactivated, never
  duplicated.

---

## API contracts

All routes prefixed `/api/supplier-items`, JWT + permissions guarded.

### POST /api/supplier-items *(INVENTORY:CREATE)*
```json
// Request
{ "supplierId": "<uuid>", "itemId": "<uuid>", "purchaseUomId": "<uuid>",
  "supplierItemCode": "LOC-GAL-001", "lastPrice": 45.99, "moq": 1,
  "leadTimeDays": 7, "isPreferred": true }

// Response 201 — enriched entry (reactivated transparently if a soft-deleted row existed)
{ "id": "...", "supplier": { "code": "SUP-2026-0001" }, "item": { "code": "..." },
  "purchaseUom": { "code": "GAL" }, "isPreferred": true,
  "conversionPreview": "1 GAL = 1 PCS" }

// Errors: 404 supplier or item not in tenant | 400 item has no purchase UOM /
//         UOM mismatch / numeric over cap | 409 active duplicate or P2002 race | 403
```

### GET /api/supplier-items?itemId=&supplierId=&isPreferred= *(INVENTORY:VIEW)*
```json
// Response 200 (target envelope; ordered preferred-first, then supplier name)
{ "supplierItems": [ { "id": "...", "isPreferred": true, "lastPrice": 45.99,
    "conversionPreview": "1 GAL = 1 PCS" } ], "count": 1 }
// Errors: 400 invalid query param | 403
```

### GET /api/supplier-items/by-item/:itemId *(INVENTORY:VIEW)*
```json
{ "supplierItems": [ { "supplier": { "name": "..." }, "...": "..." } ], "count": 1 }
```

### GET /api/supplier-items/by-supplier/:supplierId *(INVENTORY:VIEW)*
```json
{ "supplierItems": [ { "item": { "code": "..." }, "...": "..." } ], "count": 1 }
```

### GET /api/supplier-items/:id *(INVENTORY:VIEW)*
```json
// Response 200 — enriched entry | Errors: 404 unknown / other-tenant id | 403
```

### PATCH /api/supplier-items/:id *(INVENTORY:EDIT)*
```json
// Request (supplierId/itemId immutable — not in the DTO)
{ "lastPrice": 47.5, "isPreferred": true }
// Response 200 — isPreferred true clears competitors + mirrors defaultSupplierId
// Errors: 404 | 400 UOM mismatch on purchaseUomId change / over cap | 403
```

### DELETE /api/supplier-items/:id *(INVENTORY:DELETE)*
```json
// Response 200
{ "message": "Supplier item deleted successfully", "id": "..." }
// Errors: 404 | 403
// Removing the preferred entry also clears Item.defaultSupplierId.
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/supplier-items/supplier-items.service.ts` | Validate `supplierId` in-tenant on create; tenant-scope the 5 writes (`updateMany` + re-fetch); `deletedAt: null` on the UOM-rule item read; `P2002 → 409` on create; clear `Item.defaultSupplierId` when removing the preferred entry; wrap the 3 lists in `{ supplierItems, count }` |
| `src/modules/supplier-items/supplier-items.controller.ts` | Bind `GET /` query DTO; envelope descriptions |
| `src/modules/supplier-items/dto/create-supplier-item.dto.ts` | `@Max` caps; corrected `conversionFactor` description |
| `src/modules/supplier-items/dto/find-supplier-items-query.dto.ts` | **New** — `itemId`/`supplierId` `@IsUUID`, `isPreferred` `@IsIn` |
| `frontend/lib/api/supplier-items.ts` | 3 getters unwrap `{ supplierItems, count }` |

### Cross-module dependencies
- **`items` (spec-003)** — UOM-rule read + `defaultSupplierId` mirror write (direct
  Prisma, documented exception; becomes tenant-scoped).
- **`suppliers` (spec-002)** — existence check (read-only).
- **`uom` (spec-005)** — `UomModule` imported; `UomUnit` global-catalog display reads.
- Consumed by: procurement cluster (purchase-orders, rfqs, general-needs — unspecced).

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe`; Swagger at `/api/docs`; module registered in
  `app.module.ts`.

---

## Verification checklist

```bash
# 0. Login (spec-001) → $TOKEN; an item with purchase UOM → $ITEM + $UOM; a supplier → $SUP
BASE=http://localhost:3000/api/supplier-items
AUTH="Authorization: Bearer $TOKEN"

# 1. Create → 201 with conversionPreview; duplicate → 409
# 2. Create with another tenant's / bogus supplierId → 404 (not 500, no cross-tenant link)
# 3. Create with mismatched purchaseUomId → 400 naming both UOM codes
# 4. Create with item lacking purchase UOM → 400 "Set the item's Purchase UOM"
# 5. isPreferred: create A preferred, create B preferred → A's flag cleared,
#    item.defaultSupplierId = B's supplier; DELETE B → defaultSupplierId cleared
# 6. DELETE then re-POST same (supplier,item) → 201 reactivated (same id, merged fields)
# 7. GET / → { supplierItems, count }; ?isPreferred=banana → 400; ?itemId=not-a-uuid → 400
# 8. lastPrice 1e15 → 400 (cap), not 500
# 9. Tenant isolation (tenant2admin): entries invisible; PATCH/DELETE → 404
# 10. Build + lint + tests
cd backend && pnpm build && pnpm test supplier-items.service && pnpm test:e2e supplier-items
# Expected: all pass
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 50) | Draft — unvalidated supplierId (cross-tenant linkage), 5 unscoped writes, item read missing deletedAt, P2002 mapping, dangling defaultSupplierId on preferred removal, @Max caps, query DTO, list envelopes captured as unchecked criteria |
| 2026-06-06 | Test scaffolding written (19 unit / 15 e2e, tagged [GAP]) | Red as expected on all gaps |
| 2026-06-06 | All 9 gaps implemented: in-tenant supplier check (404), 5 writes tenant-scoped (updateMany + refetch), deletedAt on UOM-rule read, P2002->409, defaultSupplierId cleared on preferred removal, per-column @Max caps (corrected from draft to actual Decimal capacities), conversionFactor description fixed, query DTO, { supplierItems, count } envelopes + 3 frontend getters | Unit 19/19, e2e 15/15 (incl. same-id reactivation + preferred lifecycle), backend + frontend builds OK, lint clean |
| 2026-06-06 | Shipped to origin (`80e90a2`); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
