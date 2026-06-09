# spec-018 — Supplier Items (Supplier↔Item Catalog Links)

Status: **Complete** (v2 — commercial fields, price history & expiry alerts)  
Owner: Platform  
Sprint: 19 (v1) · recovery branch (v2, 2026-06-09)  
Module(s): `supplier-items` (+ `SupplierItemPriceHistory` model; touches `frontend/app/procurement/supplier-items/page.tsx` and the list-envelope getters)  
Last updated: 2026-06-09  

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

### v2 problem (2026-06-09) — commercial terms, price history & expiry alerts

v1 stored only `lastPrice`. A recovered frontend page (`procurement/supplier-items`)
needs the catalog to also carry **commercial terms** (currency, Incoterm, payment
terms), **quality rating**, a **block flag** (stop sourcing from a supplier for an
item, with a reason), and **price validity dates** with an **alert window** — plus a
**price-history timeline** so buyers can see how a supplier's price moved and renew it.
The schema migration (`20260608120000_supplier_item_v2_and_bom_yield`) added 9 fields to
`in_supplier_items` and a new `po_supplier_item_price_history` table; this v2 wires the
service/controller surface the page calls. The page consumed five endpoints that did not
exist, and `forbidNonWhitelisted` made the new inline-edit fields hard-fail `400` until
the DTO carried them.

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

### v2 — Commercial fields, price history & expiry alerts (2026-06-09)

#### New endpoints (5 — surface now 12 handlers)
- [x] `GET /expiring-prices?daysAhead=N` *(INVENTORY:VIEW)* — supplier-items whose
      `priceValidUntil` falls within `N` days (already-expired included); no window →
      every priced row that has an expiry date. Accepts **`daysAhead`** and the alias
      **`days`** (the page sends `days`). Each row carries `expiryStatus` +
      `daysUntilExpiry`. Declared **before** `GET /:id` so it is not captured as an id.
- [x] `GET /counts-by-supplier` *(INVENTORY:VIEW)* — `groupBy supplierId` →
      `{ [supplierId]: count }` of non-deleted entries (tenant-scoped).
- [x] `GET /counts-by-item` *(INVENTORY:VIEW)* — `groupBy itemId` →
      `{ [itemId]: count }` (tenant-scoped).
- [x] `GET /:id/price-history` *(INVENTORY:VIEW)* — `SupplierItemPriceHistory` rows for
      the supplier-item, newest first (`validFrom desc, createdAt desc`); `findOne`
      enforces tenant scope + `404` before any history is exposed.
- [x] `PATCH /:id/price` *(INVENTORY:EDIT)* — writes `lastPrice`/`currency`/
      `priceValidFrom`/`priceValidUntil` (tenant-scoped `updateMany`) **and** appends a
      `SupplierItemPriceHistory` row in one call; returns the enriched entity.

#### Commercial / pricing fields
- [x] `CreateSupplierItemDto` (and `UpdateSupplierItemDto` via `PartialType`) carry the
      9 v2 fields — required because `forbidNonWhitelisted: true` would otherwise `400`
      the page's inline edits: `currency @MaxLength(3)`, `incoterm @IsIn(INCOTERMS)`
      (11 ICC terms), `paymentTerms @MaxLength(50)`, `priceValidFrom/Until @IsDateString`,
      `priceAlertDays @IsInt @Min(0) @Max(365)`, `qualityRating @IsNumber @Min(0) @Max(5)`,
      `isBlocked @IsBoolean`, `blockedReason @MaxLength(255)`.
- [x] `create` persists the 9 fields (date strings coerced to `Date`; `currency` defaults
      `'USD'`, `priceAlertDays` defaults `30`, `isBlocked` defaults `false`).
- [x] `update` coerces `priceValidFrom`/`priceValidUntil` date strings to `Date` before
      the tenant-scoped `updateMany`.

#### Price-expiry derivation (enrich)
- [x] `enrich` adds `priceExpiryStatus` + `priceExpiryDaysLeft` from `lastPrice`,
      `priceValidUntil`, `priceAlertDays`: `no_price` (no price) · `no_expiry` (no end
      date) · `expired` (<0d) · `expires_today` (0d) · `critical` (≤7d) · `warning`
      (≤`priceAlertDays`) · `ok`. `expiring-prices` aliases these as
      `expiryStatus`/`daysUntilExpiry` for the alerts tab.

#### Price-history write integrity
- [x] `updatePrice` validates a supplied `rfqId` as an in-tenant, non-deleted RFQ before
      writing → `404` otherwise (no cross-tenant FK on the history row); the history row
      is tenant-scoped (`tenantId` + `supplierItemId`) with `source` defaulting `'manual'`.

#### RBAC (v2)
- [x] All five new reads/writes guarded: the 4 GETs `INVENTORY:VIEW`, `PATCH /:id/price`
      `INVENTORY:EDIT`; every handler `@ApiOperation` + `@ApiResponse`; logic stays in the
      service.

---

## Out of scope

- ~~Any change to `prisma/schema.prisma`~~ — **v2 adds** 9 columns to `in_supplier_items`
  and the `po_supplier_item_price_history` table (migration
  `20260608120000_supplier_item_v2_and_bom_yield`).
- ~~Price history / price lists~~ — **now in scope** (`SupplierItemPriceHistory` +
  `:id/price-history` + `:id/price`).
- The cross-module `Item.defaultSupplierId` write stays a direct Prisma write
  (documented exception — `items` has no service API for it; it becomes tenant-scoped
  but not service-routed).
- Supplier scoring interplay (`SupplierScore` belongs to spec-002).
- Pagination; bulk import of supplier catalogs.
- **Frozen-rate pattern (spec-021) does NOT apply here (documented decision):** a
  supplier-item price is catalog *reference data*, not a posted monetary transaction, so
  the history row stores `price` + `currency` only — no `exchangeRate`/`amountBase`/
  `baseCurrency`. Rate freezing happens downstream when the price lands on a PO/AP
  document.
- Auto-ingesting price history from RFQ awards / GRN receipts (the `source`,`rfqId`,
  `grnId` columns exist for it, but only `manual` is written today).

---

## Data model

**v2 adds 9 columns + 1 table** (migration `20260608120000_supplier_item_v2_and_bom_yield`):

| Model | Table | Key fields |
|---|---|---|
| `SupplierItem` | `in_supplier_items` | v1: `tenantId`, `supplierId` FK, `itemId` FK, `supplierItemCode/Name`, `purchaseUomId` FK → `UomUnit`, `packSize Decimal(15,4)`, `conversionFactor Decimal(18,8)`, `lastPrice Decimal(15,4)?`, `leadTimeDays`, `moq Decimal(15,3)`, `isPreferred`, `isActive`, audit + soft-delete; `@@unique([tenantId, supplierId, itemId])`. **v2 +:** `currency VarChar(3) ='USD'`, `incoterm VarChar(20)?`, `paymentTerms VarChar(50)?`, `priceValidFrom Date?`, `priceValidUntil Date?`, `priceAlertDays Int =30`, `qualityRating Decimal(3,2)?`, `isBlocked Bool =false`, `blockedReason VarChar(255)?`; indexes on `isBlocked`, `priceValidUntil` |
| `SupplierItemPriceHistory` **(new)** | `po_supplier_item_price_history` | `tenantId` FK, `supplierItemId` FK (onDelete Cascade), `price Decimal(15,4)`, `currency VarChar(3) ='USD'`, `validFrom Date`, `validUntil Date?`, `source VarChar(20)` (`manual\|rfq\|grn\|import`), `rfqId` FK→`po_rfqs` (SET NULL)?, `grnId Uuid?` (no FK), `notes Text?`, `createdAt`, `createdBy`; indexes on tenant, supplierItem, validFrom, validUntil, source |
| Read-only / touched | — | `Item` (UOM rule source + `defaultSupplierId` mirror), `Supplier` (existence check), `Rfq` (in-tenant check for `price-history` source), `UomUnit` (global catalog, display) |

New invariant: every `PATCH /:id/price` writes the current price onto `SupplierItem` **and**
appends a `SupplierItemPriceHistory` row — the history is append-only and tenant-scoped.

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

### GET /api/supplier-items/expiring-prices?daysAhead=&days= *(INVENTORY:VIEW)*
```json
// Response 200 — priced rows with an expiry date, soonest first
[ { "id": "...", "item": { "code": "..." }, "supplier": { "name": "..." },
    "lastPrice": 52.75, "currency": "USD", "priceValidUntil": "2026-06-19",
    "expiryStatus": "warning", "daysUntilExpiry": 10 } ]
// daysAhead/days omitted → all with an expiry; given → within N days (expired included)
```

### GET /api/supplier-items/counts-by-supplier *(INVENTORY:VIEW)*
```json
{ "<supplierId>": 3, "<supplierId>": 1 }
```

### GET /api/supplier-items/counts-by-item *(INVENTORY:VIEW)*
```json
{ "<itemId>": 2 }
```

### GET /api/supplier-items/:id/price-history *(INVENTORY:VIEW)*
```json
// Response 200 — newest first | Errors: 404 unknown / other-tenant id | 403
[ { "id": "...", "price": 52.75, "currency": "USD", "validFrom": "2026-06-08",
    "validUntil": "2026-12-08", "source": "manual", "rfqId": null, "notes": "...",
    "createdAt": "..." } ]
```

### PATCH /api/supplier-items/:id/price *(INVENTORY:EDIT)*
```json
// Request
{ "price": 52.75, "currency": "USD", "validFrom": "2026-06-08",
  "validUntil": "2026-12-08", "source": "manual", "notes": "Q3 quote" }
// Response 200 — enriched entry with the new lastPrice + a fresh history row appended
// Errors: 404 supplier-item / referenced rfqId not in tenant | 400 missing price/validFrom | 403
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
| **v2:** `supplier-items.service.ts` | +`expiringPrices`/`countsBySupplier`/`countsByItem`/`priceHistory`/`updatePrice`; `computeExpiry` helper; `enrich` adds expiry fields; `create`/`update` persist + date-coerce the 9 fields; in-tenant `rfqId` guard |
| **v2:** `supplier-items.controller.ts` | +5 handlers (static GETs before `:id`); `daysAhead`/`days` query aliasing |
| **v2:** `dto/create-supplier-item.dto.ts` | +9 commercial fields (`@IsIn(INCOTERMS)`, `@Max(5)` rating, `@Max(365)` alert-days, …) |
| **v2:** `dto/update-price.dto.ts` | **New (recovered)** — `UpdateSupplierItemPriceDto` wired into `PATCH /:id/price` |
| **v2:** `prisma/schema.prisma` + migration `20260608120000_…` | 9 columns + `SupplierItemPriceHistory` model |
| **v2:** `frontend/app/procurement/supplier-items/page.tsx` | recovered page consuming all 12 endpoints |

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

# ── v2 smoke (verified live 2026-06-09 against DEMO) ──
# 11. PATCH /:id/price {price,validFrom,validUntil} → 200; lastPrice + a history row written
# 12. GET /:id/price-history → newest-first; before any write → []
# 13. GET /expiring-prices → [] when no expiry; after a near-future validUntil → 1 row,
#     expiryStatus warning, daysUntilExpiry≈10; ?days=5 excludes a 10-day row; ?daysAhead=30 includes it
# 14. GET /counts-by-supplier, /counts-by-item → { id: n } maps
# 15. Errors: bogus id price-history/price → 404; cross-tenant rfqId → 404;
#     missing price → 400; no token → 401
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 50) | Draft — unvalidated supplierId (cross-tenant linkage), 5 unscoped writes, item read missing deletedAt, P2002 mapping, dangling defaultSupplierId on preferred removal, @Max caps, query DTO, list envelopes captured as unchecked criteria |
| 2026-06-06 | Test scaffolding written (19 unit / 15 e2e, tagged [GAP]) | Red as expected on all gaps |
| 2026-06-06 | All 9 gaps implemented: in-tenant supplier check (404), 5 writes tenant-scoped (updateMany + refetch), deletedAt on UOM-rule read, P2002->409, defaultSupplierId cleared on preferred removal, per-column @Max caps (corrected from draft to actual Decimal capacities), conversionFactor description fixed, query DTO, { supplierItems, count } envelopes + 3 frontend getters | Unit 19/19, e2e 15/15 (incl. same-id reactivation + preferred lifecycle), backend + frontend builds OK, lint clean |
| 2026-06-06 | Shipped to origin (`80e90a2`); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
| 2026-06-08 | **v2** schema migration `20260608120000_…` — 9 commercial fields + `SupplierItemPriceHistory` (recovered from older branch) | Migrated, `prisma generate`, build OK (`acbbfd8`) |
| 2026-06-09 | **v2** service/controller/DTO — 5 endpoints (expiring-prices, counts-by-supplier/item, price-history, update-price), expiry derivation in `enrich`, in-tenant `rfqId` guard, 9 DTO fields | Unit 30/30 (20 v1 + 10 v2), build + lint clean (`9753ac6`) |
| 2026-06-09 | **v2** live smoke vs DEMO — all 5 endpoints 200, window filter + expiry status correct, error paths 404/400/401 green | All v2 acceptance criteria met (100%) |
