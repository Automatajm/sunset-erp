# spec-011 — Bill of Materials (Recipes + Routing)

Status: **Complete**  
Owner: Manufacturing  
Sprint: 19  
Module(s): `bom` (touches `items`, `consumption-groups`, `work-centers` for injected validations; `frontend/lib/api/bom.ts` + `frontend/app/settings/bulk-import/page.tsx` for the list envelope)  
Last updated: 2026-06-04  

---

## Purpose

- **Who uses this module?** Manufacturing engineers and product/recipe owners who define
  what a finished product is made of and the steps to build it.
- **What business problem does it solve?** It records each product's recipe (component
  consumption groups with quantity-per and scrap) and its routing (which work centers, with
  setup and run times), turning a product into a precise, repeatable build definition that
  drives material requirements and labor estimates.
- **What can the business NOT do without this module?** It cannot calculate how much
  material a production run needs, estimate labor cost and time, plan purchasing against
  production, or auto-generate budgets — there is no link between a finished good and the
  inputs and work required to make it.

## Business value

The BOM is the single source of truth for what it takes to make a product. Without it,
nobody can answer "how much of each ingredient do we need to make N units?" or "what will
the labor cost be?" — so purchasing over- or under-buys, production guesses, and costing is
unreliable. Filtering out soft-deleted components and validating re-parenting matters
because a wrong recipe directly produces wrong purchase quantities and wrong cost, which is
real money lost on every run. It is the backbone the whole production and demo-seed chain
is built on.

---

## Problem

BOMs are the technical heart of manufacturing: each BOM ties a finished item to its
component consumption groups (`quantityPer` + scrap in a free formulator UOM, with a
system consumption UOM for MRP) and to its routing steps (work center + setup/run times,
feeding labor estimates and budget auto-generation). The module is the largest in the
chain (12 endpoints, 456-line service) and the final prerequisite of the production
cluster and the themed demo seed. A code audit (2026-06-04, opportunity-finder score 61 —
the highest recorded) found:

1. **Four unscoped writes** — `bom.update` in `update()` (`bom.service.ts:173-177`) and
   `remove()` (`:186-189`); `bomRouting.update` in `updateRoutingStep()` (`:334-338`) and
   `removeRoutingStep()` (`:353-356`). Convention (spec-006…010): scope at the write via
   `updateMany`.
2. **Soft-deleted components contaminate MRP** — `BOM_FULL_INCLUDE.components`
   (`bom.service.ts:41-44`) has no `deletedAt: null` filter (routings does, `:46`), so
   deleted components show up in `findOne` and inflate `calculateMaterialRequirements` /
   `getMaterialSuggestions` — wrong purchase quantities.
3. **Unvalidated re-parenting** — `update()` writes `parentItemId` unchecked (`:171`):
   nonexistent → FK 500; another tenant's item → silent cross-tenant pointer.
4. **Guaranteed 500 on PATCH with `description`** — `update()` maps `description`
   (`:168`) but the `Bom` model has **no such column** → Prisma unknown-argument error.
   `CreateBomDto.description` is a phantom (silently dropped on create).
5. **Untenanted step-number checks** — the routing dup-checks (`:259-261`, `:319-321`)
   filter by `bomId` only, no `tenantId`.
6. **Cross-module Prisma access** — direct queries on `Item` (`:65-67`),
   `ConsumptionGroup` (`:72-77`, `:103-105` — the latter also missing `deletedAt: null`),
   and `WorkCenter` (`:254-257`, `:312-315`). All three owning modules export scoped
   services with throwing lookups; no cycle risk.
7. **Weak DTO edges** — `version` is a free string fed to `parseInt` (`'abc'` → NaN →
   500; `'1.9'` → silent 1); `scrapPercent` lacks `@Max(100)` (its own description says
   0-100); `CreateBomComponentDto.notes` is a phantom field (no column).
8. **Unvalidated numeric path params** — `parseFloat(quantity)` in the controller
   (`bom.controller.ts:78`, `:168`, `:188`): `/calculate/abc` returns 200 full of NaNs.
9. **Lexicographic code max** — `generateBomNumber` (`:426-435`) repeats the warehouses
   bug fixed in `390a4e2` (lexicographic `orderBy` + unguarded `parseInt`).
10. **No referential guard on delete** — a BOM referenced by `ProductionPlanLine` rows
    can be soft-deleted, orphaning plans.
11. **Swagger** — 8 of 12 handlers have `@ApiOperation` but zero `@ApiResponse`.

Additionally `GET /api/bom` returns a **bare array** instead of `{ boms, count }`; the
only consumers are `extractList` in `frontend/lib/api/bom.ts` and bulk-import's export.

This spec codifies existing behavior as the contract and closes the gaps — with **no
schema changes**.

---

## Acceptance criteria

### Endpoints — BOM CRUD
- [x] `POST /api/bom` — creates a BOM with nested components; validates parent item and
      every component's consumption group in-tenant (404); auto-generates `bomNumber`
      (`BOM-YYYY-NNNN`) when `bomCode` omitted; `409` on duplicate active `bomNumber`;
      auto-fills `consumptionUomId` from the group when omitted; `lineNumber` assigned
      sequentially; Decimal fields returned as numbers.
- [x] `GET /api/bom` — lists the tenant's active BOMs ordered by `bomNumber`, with
      `parentItem` and `_count`; optional `?itemId=` filter.
- [x] `GET /api/bom` returns the list envelope `{ boms: [...], count }`; `extractList` in
      `frontend/lib/api/bom.ts` and bulk-import's `handleExport` updated in the same
      change.
- [x] `GET /api/bom/:id` — full BOM (components with consumption groups/UOMs ordered by
      `lineNumber`, active routings ordered by `stepNumber`); `404` in-tenant.
- [x] `GET /api/bom/:id` (and every consumer of `BOM_FULL_INCLUDE`) excludes
      **soft-deleted components** (`where: { deletedAt: null }` on the components
      include, matching the routings include).
- [x] `PATCH /api/bom/:id` — header update (`bomCode`→`bomNumber`, `version`,
      `isActive`, `itemId`→`parentItemId`); `404`; `409` on number collision (self
      excluded).
- [x] `PATCH /api/bom/:id` no longer maps the nonexistent `description` column (currently
      a guaranteed Prisma 500); the phantom `description` field is removed from
      `CreateBomDto`/`UpdateBomDto`.
- [x] `PATCH /api/bom/:id` validates `itemId` re-parenting in-tenant via the injected
      `ItemsService` → `404` (closes the cross-tenant vector).
- [x] `DELETE /api/bom/:id` — soft delete; `404`; `{ message, id }`.
- [x] `DELETE /api/bom/:id` is blocked with `400` (live count) while `ProductionPlanLine`
      rows reference the BOM (own-relation count).

### Endpoints — calculations
- [x] `GET /api/bom/:id/calculate/:quantity` — per-component `requiredQuantity`,
      `scrapQuantity` (`required × scrap% / 100`), `totalQuantity`, with formulator and
      consumption UOMs.
- [x] `GET /api/bom/:id/material-suggestions/:quantity` — MO pre-fill rows with
      `qtyPlanned` (scrap included, ceil to 3 decimals).
- [x] `GET /api/bom/:id/routing/labor-estimate/:quantity` — per-step setup/run hours and
      cost from work-center rates; empty-steps shape with `message`.
- [x] The three `:quantity` path params are validated (`ParseFloatPipe`) → `400` on
      non-numeric input (currently NaN propagates into a 200).

### Endpoints — routing steps
- [x] `POST /api/bom/:id/routing` — adds a step; validates the work center in-tenant
      (404); `409` on duplicate active `stepNumber` for the BOM; Decimals as numbers.
- [x] `GET /api/bom/:id/routing` — active steps ordered by `stepNumber`.
- [x] `PATCH /api/bom/:id/routing/:stepId` — partial update; validates new work center;
      `409` on step-number collision (self excluded); `404` on missing step.
- [x] `DELETE /api/bom/:id/routing/:stepId` — soft delete; `404`; `{ message, id }`.

### Tenant scoping (CLAUDE.md invariant)
- [x] All primary reads scoped `{ tenantId, deletedAt: null }` (`findAll`, `findOne`,
      BOM dup-checks, routing step lookups `:307`, `:349`, `getRoutingSteps :288`,
      labor-estimate steps `:367`).
- [x] `update()` and `remove()` writes tenant-scoped at the write via `updateMany` +
      re-fetch (`bom.service.ts:173-177`, `:186-189`).
- [x] `updateRoutingStep()` and `removeRoutingStep()` writes tenant-scoped at the write
      (`:334-338`, `:353-356`).
- [x] The routing step-number dup-checks include `tenantId` (`:259-261`, `:319-321`).
- [x] The component auto-fill group lookup includes `deletedAt: null` (`:103-105`).
- [x] `create` writes `tenantId` from the JWT on `Bom`, components, and routing steps.

### Module interconnection
- [x] `BomModule` imports `ItemsModule`, `ConsumptionGroupsModule`, `WorkCentersModule`
      and injects their services for all foreign validations — no direct
      `prisma.item/consumptionGroup/workCenter` queries remain in this module (their
      scoped `findOne`s throw the 404s). `BomRouting`/`BomComponent` stay owned here.

### Business rules
- [x] `bomNumber` auto-generation `BOM-YYYY-NNNN`; client-supplied `bomCode` wins.
- [x] `generateBomNumber` computes the **numeric** max (not lexicographic `orderBy`) with
      a NaN guard, per the warehouses fix (`390a4e2`); it continues to span soft-deleted
      rows (`@@unique([tenantId, bomNumber, version])` spans them).
- [x] Scrap math: `scrapQty = requiredQty × scrapPercent / 100`; suggestions ceil to 3
      decimals.
- [x] Labor estimate: `setup + runTimePerUnit × qty` per step × work-center
      `costPerHour`.

### DTO validation
- [x] `CreateBomDto`: `itemId` (`@IsUUID`), `bomCode?` (`@MaxLength(50)`), nested
      `components` (`@ValidateNested @Type`); `CreateBomComponentDto`:
      `consumptionGroupId` (`@IsUUID`), `quantity` (`@IsNumber @Min(0.001)`), `uom`
      (`@MaxLength(20)`), `consumptionUomId?` (`@IsUUID`); routing DTOs:
      `stepNumber` (`@Min(1)`), `workCenterId` (`@IsUUID`), times (`@Min(0)`).
- [x] `version` is a digit-string (`@Matches(/^\d+$/)`) so `parseInt` can never yield
      NaN or silently truncate.
- [x] `scrapPercent` gains `@Max(100)`; `quantity` gains `@Max(999999999)` (Decimal(15,6))
      and `setupTime`/`runTimePerUnit` gain `@Max(99999999.99)`-class bounds matching
      their columns.
- [x] Phantom fields removed: `description` (Create/Update BOM — no column) and `notes`
      on `CreateBomComponentDto` (no column). `forbidNonWhitelisted` then rejects them
      with `400`.
- [x] Global `ValidationPipe` (`whitelist, forbidNonWhitelisted, transform`).

### RBAC
- [x] `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth('JWT-auth')`;
      create → `INVENTORY:CREATE`; reads → `INVENTORY:VIEW`; update/routing mutations →
      `INVENTORY:EDIT`; delete → `INVENTORY:DELETE`.

### Error handling
- [x] `404` — parent item / consumption group / work center / BOM / step not found
      in-tenant; `409` — duplicate `bomNumber`, duplicate `stepNumber`.
- [x] `404` — `itemId` re-parent validation on PATCH (currently unchecked).
- [x] `400` — delete blocked by production-plan references; non-numeric `:quantity`.

### Swagger
- [x] Every handler has `@ApiOperation` (+ `@ApiParam`/`@ApiQuery` where applicable).
- [x] Every handler has at least one `@ApiResponse` (8 of 12 currently have none) and the
      new `400`/`404` codes are documented.

---

## Out of scope

- Any change to `prisma/schema.prisma` — no migrations (phantom DTO fields are removed
  instead of adding columns; `effectiveFrom`/`effectiveTo` stay dormant).
- Component CRUD after creation (components are set at create; a component-editing
  endpoint is a future spec).
- BOM versioning workflows (the `version` int and `@@unique` triple exist; version
  bumping/cloning is future work).
- UOM conversion between formulator UOM and consumption UOM (MRP engine scope —
  Sprint 19 master plan).
- `isPhantom` component semantics (column exists, unused).
- Production-plan side of the BOM↔plan relation (production cluster spec).
- Frontend changes beyond the two envelope consumers.

---

## Data model

**No changes.** Schema preserved exactly. Reference only:

| Model | Table | Key fields |
|---|---|---|
| `Bom` | `mfg_boms` | `tenantId`, `parentItemId` (FK Item), `bomNumber`, `version` Int, `isActive`, `effectiveFrom/To?`, audit + soft-delete; `@@unique([tenantId, bomNumber, version])` |
| `BomComponent` | — | `tenantId`, `bomId` (Cascade), `lineNumber`, `consumptionGroupId` (FK), `quantityPer` Decimal(15,6), `uom` (free), `scrapPercent` Decimal(5,2), `consumptionUomId?`, `isPhantom`, audit + soft-delete |
| `BomRouting` | — | `tenantId`, `bomId`, `stepNumber`, `workCenterId` (FK), `setupTime`/`runTimePerUnit` Decimals, `isActive`, `notes?`, audit + soft-delete |

Key invariants:
- `bomNumber` unique per tenant **per version** (DB); service enforces uniqueness of the
  number alone among active rows (stricter, the contract).
- Components reference consumption groups (generic needs), never items directly.
- `stepNumber` unique per BOM among active steps (service guard).
- Soft delete throughout; component include must filter it (this spec).

---

## API contracts

All routes prefixed `/api`, JWT-guarded. Abbreviated — shapes preserved from code:

### POST /api/bom
```json
// Request
{ "itemId": "<uuid>", "bomCode": "BOM-CLASSIC", "version": "1", "isActive": true,
  "components": [ { "consumptionGroupId": "<uuid>", "quantity": 0.15, "uom": "KG",
      "scrapPercent": 3 } ] }

// Response 201 — full BOM: parentItem, components[] (consumptionGroup + UOMs,
// quantityPer/scrapPercent as numbers, lineNumber 1..N), routings[]
// Errors: 404 item/group not found (in tenant) | 409 bomNumber exists | 400 validation | 401 | 403
```

### GET /api/bom?itemId=
```json
// Response 200 (target envelope)
{ "boms": [ { "id": "...", "bomNumber": "BOM-2026-0001", "version": 1,
    "parentItem": { "...": "..." }, "_count": { "components": 8, "routings": 3 } } ],
  "count": 1 }
```

### GET /api/bom/:id → 200 full BOM (active components + routings) | 404
### PATCH /api/bom/:id → 200 | 404 (incl. itemId re-parent) | 409 | 400
### DELETE /api/bom/:id → 200 { message, id } | 400 plan references | 404

### GET /api/bom/:id/calculate/:quantity
```json
// 200: { bom, productionQuantity, requirements: [ { consumptionGroup, quantityPerUnit,
//   requiredQuantity, scrapQuantity, totalQuantity, uom, consumptionUom } ], totalComponents }
// Errors: 400 non-numeric quantity | 404 | 401 | 403
```

### GET /api/bom/:id/material-suggestions/:quantity → 200 rows with qtyPlanned (scrap incl.)
### GET /api/bom/:id/routing/labor-estimate/:quantity → 200 step breakdown + totals

### POST /api/bom/:id/routing
```json
// Request
{ "stepNumber": 10, "workCenterId": "<uuid>", "description": "Grill patties",
  "setupTime": 0.5, "runTimePerUnit": 0.004, "notes": "..." }
// 201 step with workCenter + numeric times | 404 BOM/WC | 409 step exists | 400
```

### GET /api/bom/:id/routing → 200 active steps asc
### PATCH /api/bom/:id/routing/:stepId → 200 | 404 | 409
### DELETE /api/bom/:id/routing/:stepId → 200 { message, id } | 404

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/bom/bom.service.ts` | Scope the 4 writes via `updateMany` + re-fetch; filter soft-deleted components in `BOM_FULL_INCLUDE`; inject `ItemsService`/`ConsumptionGroupsService`/`WorkCentersService` and delegate validations; validate `itemId` on update; drop the `description` mapping; tenant the step dup-checks; numeric-max `generateBomNumber`; production-plan delete guard (own-relation `_count`) |
| `src/modules/bom/bom.module.ts` | Import `ItemsModule`, `ConsumptionGroupsModule`, `WorkCentersModule` |
| `src/modules/bom/bom.controller.ts` | `ParseFloatPipe` on `:quantity` params; `@ApiResponse` on all 12 handlers |
| `src/modules/bom/dto/create-bom.dto.ts` | drop `description`; `version` → `@Matches(/^\d+$/)` |
| `src/modules/bom/dto/create-bom-component.dto.ts` | drop `notes`; `@Max` bounds |
| `src/modules/bom/dto/bom-routing.dto.ts` | `@Max` bounds on times |
| `frontend/lib/api/bom.ts` | `extractList` handles `data.boms` |
| `frontend/app/settings/bulk-import/page.tsx` | export extraction adds `res.data?.boms` |

### Cross-module dependencies
- `bom` → `items` / `consumption-groups` / `work-centers` (new, this spec): their scoped
  `findOne`s for FK validation. All three export their services; none imports `bom` —
  no cycles. NOTE: `ConsumptionGroupsService.findOne` returns the group **with**
  `consumptionUomId` (needed for the auto-fill) and throws the 404 itself.
- `ProductionPlanLine` guard uses the BOM's own relation count (`productionPlanLines` —
  model has no `deletedAt`, so the count is unfiltered).

### Behavioral notes
- `updateMany` + re-fetch with `BOM_FULL_INCLUDE`/`ROUTING_INCLUDE` keeps shapes.
- Validation order in `update()`: findOne (404) → number conflict (409) → item (404) →
  write.
- The component auto-fill keeps one lookup per component but now goes through
  `ConsumptionGroupsService.findOne` (which already loads the group) — reuse the result
  of the existence validation instead of querying twice.
- `parseFloat` → `ParseFloatPipe` returns 400 with a standard Nest message.

### Global infrastructure (unchanged)
- Global prefix `api`; `ValidationPipe`; Swagger at `/api/docs`.

---

## Verification checklist

```bash
# 0. Tenant-scoped token (login → select-tenant). Fixtures: an item, a consumption
#    group (needs a UOM), a work center — create via their APIs.

# 1. Create BOM with components → 201, lineNumbers 1..N, numeric Decimals
# 2. PATCH with description → 400 (forbidNonWhitelisted; previously a Prisma 500)
# 3. PATCH re-parent to TENANT2's item id → 404 (cross-tenant vector closed)
# 4. GET /bom → { boms, count } envelope
# 5. /calculate/abc → 400 (ParseFloatPipe; previously NaN 200)
# 6. /calculate/100 → requirements math: required = qtyPer×100; scrap = required×pct/100
# 7. Routing: add step 10 → 201; duplicate step 10 → 409; bad WC id → 404
# 8. Soft-delete a component row directly in DB, re-GET the BOM → component absent,
#    /calculate excludes it (the MRP-contamination fix)
# 9. DELETE BOM referenced by a production plan line → 400 (unit-tested; e2e TODO until
#    production cluster spec)
# 10. cd backend && pnpm build && pnpm test bom.service && pnpm test:e2e bom.e2e
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-04 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 61 — highest recorded) | Draft — 4 unscoped writes, MRP contamination by soft-deleted components, cross-tenant re-parent, PATCH-description 500, phantom DTO fields, NaN path params, lexicographic codegen, missing delete guard, 8 handlers without @ApiResponse + list envelope — captured as unchecked criteria |
| 2026-06-04 | Shipped to origin (0462c50); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) — unit 24/24, e2e 22/22 (full suite 158/158), build + lint green |
