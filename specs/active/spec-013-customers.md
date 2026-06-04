# spec-013 — Customers (Sales Master Data)

Status: **Draft**  
Owner: Sales  
Sprint: 19  
Module(s): `customers` (touches `frontend/lib/api/customers.ts` + `frontend/app/settings/bulk-import/page.tsx` for the list envelope)  
Last updated: 2026-06-04  

---

## Problem

Customers anchor the sales side: `SalesOrder` and `ArInvoice` hold FKs into
`so_customers`, and credit terms/limits drive order acceptance. The module got its
`CL-YYYY-NNNN` auto-code in spec-012 but is otherwise unspecced. A code audit
(2026-06-04, opportunity-finder score 19) found five deviations:

1. **Unscoped write in `update()`** — `customer.update({ where: { id } })`; convention
   (spec-006…012): `updateMany({ where: { id, tenantId, deletedAt: null } })` at the write.
2. **Unscoped soft-delete write in `remove()`** — same pattern.
3. **No referential guard on delete** — a customer with active sales orders soft-deletes
   silently, orphaning the orders (compare spec-006/007/008/010/011 guards).
4. **Weak DTO edges** — `creditStatus` is a free string whose own description declares the
   enum (`good, watch, hold`) → needs `@IsIn`; `creditLimit` has `@Min(0)` but no upper
   bound while the column is `Decimal(15,2)` → oversized values crash 500.
5. **`isActive` missing from the DTOs** — create hardcodes `true` and `PartialType`
   cannot inherit what does not exist: customers cannot be deactivated through the API,
   unlike every other master-data module.

Additionally `GET /api/customers` returns a **bare array** instead of the spec-001
`{ customers, count }` envelope; consumers are `customersApi.getAll`
(`frontend/lib/api/customers.ts:9` — also feeds the sales-orders page) and bulk-import's
generic export extraction.

This spec codifies existing behavior as the contract and closes the gaps — with **no
schema changes**.

---

## Acceptance criteria

### Endpoints
- [x] `POST /api/customers` — creates a customer with auto code `CL-YYYY-NNNN`
      (spec-012: numeric max, spans soft-deleted, immutable; client-sent `code` → `400`);
      defaults `creditLimit: 0`, `creditStatus: 'good'`, `isActive: true`.
- [x] `GET /api/customers` — lists the tenant's active customers ordered by `code` asc.
- [ ] `GET /api/customers` returns the list envelope `{ customers: [...], count }`;
      `customersApi.getAll` destructures `res.data.customers ?? []` and bulk-import's
      export extraction adds `res.data?.customers` in the same change.
- [x] `GET /api/customers/:id` — returns the customer; `404` when not found in-tenant.
- [x] `PATCH /api/customers/:id` — partial update; `404` when not found.
- [ ] `PATCH` can deactivate/reactivate: `isActive` added to `CreateCustomerDto`
      (`@IsOptional @IsBoolean`) and therefore to the `PartialType` update.
- [x] `DELETE /api/customers/:id` — soft delete; `404`; returns `{ message, id }`.
- [ ] `DELETE` is blocked with `400` (live count) while active sales orders reference the
      customer (own-relation filtered `_count` — no sales-orders module dependency).

### Tenant scoping (CLAUDE.md invariant)
- [x] All reads scoped `{ tenantId, deletedAt: null }` (`findAll`, `findOne`,
      `generateCode` spans soft-deleted by documented design).
- [ ] `update()` write tenant-scoped at the write via `updateMany` + re-fetch.
- [ ] `remove()` soft-delete write tenant-scoped at the write.
- [x] `create` writes `tenantId` from the JWT.

### DTO validation
- [x] Base validators (`@IsEmail`, `@MaxLength`, `@Min(0)` on creditLimit, currency ≤ 3).
- [ ] `creditStatus` validated with `@IsIn(['good', 'watch', 'hold'])`.
- [ ] `creditLimit` gains `@Max(9999999999999.99)` (Decimal(15,2)) — overflow becomes
      `400`, not `500`.
- [x] `UpdateCustomerDto extends PartialType(CreateCustomerDto)`; global `ValidationPipe`.

### RBAC
- [x] `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth`; permissions
      `SALES:CREATE/VIEW/EDIT/DELETE` per handler.

### Error handling
- [x] `404 NotFoundException` — `findOne`/`update`/`remove` on missing/other-tenant id.
- [ ] `400 BadRequestException` — delete blocked while active sales orders exist.

### Swagger
- [x] Every handler has `@ApiOperation` + `@ApiResponse` (+ `@ApiParam` on `:id`).
- [ ] DELETE documents the new `400` (sales orders still reference the customer).

---

## Out of scope

- Schema changes — none (`so_customers` preserved; `ArInvoice` guard belongs to the
  ar-invoices spec, which owns that model).
- Credit-limit enforcement on order acceptance (sales-orders / production cluster spec).
- Customer addresses/contacts sub-entities (no models exist).
- Customer statements / AR aging (accounting specs).
- Frontend changes beyond the two envelope consumers (the customers page form already
  ships code read-only since spec-012).

---

## Data model

**No changes.** Reference only:

| Model | Table | Key fields |
|---|---|---|
| `Customer` | `so_customers` | `tenantId`, `code`, `name`, `legalName?`, `taxId?`, contact fields, `creditLimit` Decimal(15,2) default 0, `creditStatus` default 'good', `paymentTerms?`, `currency?`, `isActive`, `notes?`, audit + soft-delete; `@@unique([tenantId, code])` |
| `SalesOrder` *(relation count only)* | — | `customerId` FK, has `deletedAt` |

Key invariants:
- `code` system-assigned `CL-YYYY-NNNN`, immutable (spec-012).
- `creditStatus` ∈ `good | watch | hold` (DTO-enforced, this spec).
- A customer with active sales orders cannot be deleted (service guard, this spec).
- Soft delete only.

---

## API contracts

### POST /api/customers
```json
// Request (code NOT accepted — auto-generated, spec-012)
{ "name": "Restaurante El Conuco", "legalName": "...", "taxId": "1-31-...", "email": "...",
  "creditLimit": 150000, "creditStatus": "good", "paymentTerms": "NET15",
  "currency": "DOP", "isActive": true, "notes": "..." }

// Response 201 — entity with code "CL-2026-NNNN"
// Errors: 400 validation (incl. client code, bad creditStatus, oversized creditLimit)
//         401 | 403 missing SALES:CREATE
```

### GET /api/customers
```json
// Response 200 (target envelope)
{ "customers": [ { "id": "...", "code": "CL-2026-0001", "name": "...",
    "creditStatus": "good", "isActive": true } ], "count": 1 }
```

### GET /api/customers/:id → 200 | 404
### PATCH /api/customers/:id → 200 (incl. { "isActive": false } to deactivate) | 404 | 400
### DELETE /api/customers/:id
```json
// 200: { "message": "Customer deleted successfully", "id": "<uuid>" }
// Errors: 400 has orders ("Cannot delete: N sales orders still reference this customer")
//         404 | 401 | 403 missing SALES:DELETE
```

---

## Implementation notes

### Files changed / involved
| File | Change |
|---|---|
| `src/modules/customers/customers.service.ts` | Scope `update()`/`remove()` writes via `updateMany` + re-fetch; add active-sales-orders delete guard (own-relation filtered `_count`); wrap `findAll` in `{ customers, count }` |
| `src/modules/customers/dto/create-customer.dto.ts` | `creditStatus` → `@IsIn`; `creditLimit` → `@Max`; add `isActive?` (`@IsBoolean`) |
| `src/modules/customers/customers.controller.ts` | DELETE: document the new 400 |
| `frontend/lib/api/customers.ts` | `getAll` destructures `res.data.customers ?? []` |
| `frontend/app/settings/bulk-import/page.tsx` | export extraction adds `res.data?.customers` |

### Cross-module dependencies
- None added: the delete guard reads the customer's own `salesOrders` relation count
  (filtered `deletedAt: null`); the `ArInvoice` guard is deferred to the ar-invoices spec.

### Behavioral notes
- `updateMany` + re-fetch keeps the response shape (house convention).
- `create` keeps its explicit field-map (no `...dto` spread); `isActive` maps as
  `dto.isActive ?? true`.

---

## Verification checklist

```bash
# Tenant-scoped token (login → select-tenant)
# 1. POST {name} → 201, code CL-YYYY-NNNN; POST {name, code:'X'} → 400 (spec-012)
# 2. POST {name, creditStatus:'banana'} → 400; {name, creditLimit:1e15} → 400
# 3. GET / → { customers, count }
# 4. PATCH {isActive:false} → 200 with isActive false (deactivation now possible)
# 5. Create SO referencing the customer → DELETE → 400 with live count;
#    delete the SO → DELETE → 200 → GET → 404
# 6. TENANT2 token: GET/PATCH/DELETE A's customer → 404 (scoped writes)
# 7. cd backend && pnpm build && pnpm test customers.service && pnpm test:e2e customers
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-04 | Spec generated from code by spec-generator (seeded by opportunity-finder audit, score 19) | Draft — 2 unscoped writes, missing SO delete guard, creditStatus/creditLimit validation, isActive missing from DTOs + list envelope captured as unchecked criteria |
