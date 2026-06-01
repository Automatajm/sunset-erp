# spec-002 — Suppliers (Procurement Master Data)

Status: **Complete**  
Owner: Procurement  
Sprint: TBD  
Module(s): `suppliers`  
Last updated: 2026-05-31  

> Generated from code by the `spec-generator` skill (`/new-spec suppliers`). Acceptance
> criteria reflect the current implementation; `- [ ]` items are gaps to close before this
> spec is approved and shipped.

---

## Problem

The `suppliers` module is the procurement master-data CRUD for vendor records (`po_suppliers`)
— consumed downstream by purchase orders, RFQs, goods receipts, AP invoices, supplier items,
and the MRP consolidation engine. It is largely solid (full RBAC, tenant scoping on reads,
soft delete, auto-generated `SUP-YYYY-NNNN` codes, error handling), but a code audit surfaced
a few gaps that this spec exists to close:

1. **List endpoint breaks the response-format convention.** `findAll` returns a bare array,
   not the `{ suppliers, count }` envelope every other list endpoint uses
   (`suppliers.service.ts:81`).
2. **Validation weaker than declared.** `email`/`contactEmail` are validated only as
   `@IsString` (not `@IsEmail`) and `website` only as `@IsString` (not `@IsUrl`), even though
   `IsEmail`/`IsUrl` are imported — leaving them as dead imports and lint errors
   (`create-supplier.dto.ts:59,65,84`).
3. **Writes scoped by `id` alone.** `update`/`remove` call `prisma.supplier.update({ where: { id } })`
   without `tenantId` (`suppliers.service.ts:109,119`). It is currently safe because each is
   preceded by `findOne(tenantId, id)`, but the write itself is not tenant-scoped — a latent
   cross-tenant risk if the guard is ever refactored away.
4. **Sensitive fields returned wholesale.** Every endpoint returns the full row including
   `bankAccount`/`bankRouting`; no field selection.

This spec codifies the intended contract and tracks these fixes.

---

## Acceptance criteria

### Endpoints (RBAC + Swagger)
- [x] `POST /api/suppliers` — `@RequirePermissions('PROCUREMENT:CREATE')`, returns 201.
- [x] `GET /api/suppliers` — `@RequirePermissions('PROCUREMENT:VIEW')`.
- [x] `GET /api/suppliers/:id` — `@RequirePermissions('PROCUREMENT:VIEW')`.
- [x] `PATCH /api/suppliers/:id` — `@RequirePermissions('PROCUREMENT:EDIT')`.
- [x] `DELETE /api/suppliers/:id` — `@RequirePermissions('PROCUREMENT:DELETE')`, soft delete, 200.
- [x] Controller is class-guarded `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@ApiBearerAuth`.
- [x] Every handler has `@ApiOperation` + `@ApiResponse` (and `@ApiParam` on `:id` routes).
- [x] Controller is thin — every handler delegates to `SuppliersService`, no business logic.

### Data model & tenant scoping
- [x] `findAll` / `findOne` scope `where: { tenantId, deletedAt: null }`.
- [x] `create` checks for a duplicate `code` scoped to `{ tenantId, code, deletedAt: null }`.
- [x] `update` duplicate check scoped to `{ tenantId, code, id: { not: id }, deletedAt: null }`.
- [x] `remove` is a soft delete (`deletedAt`, `deletedBy`), never a hard delete.
- [x] `update`/`remove` writes are tenant-scoped — use `updateMany({ where: { id, tenantId, deletedAt: null } })`
      or equivalent, not `update({ where: { id } })`, so the write itself enforces tenancy.
- [x] `generateCode` query includes `deletedAt: null` (or a documented reason it intentionally
      considers soft-deleted codes to avoid reuse). *Decision: NOT scoped to `deletedAt: null` —
      `@@unique([tenantId, code])` spans soft-deleted rows, so considering all codes prevents
      regenerating one that would collide on the constraint (documented in `generateCode`).*

### DTO validation
- [x] `CreateSupplierDto` carries `class-validator` decorators on every field; `UpdateSupplierDto`
      is `PartialType(CreateSupplierDto)`.
- [x] `incoterms` constrained via `@IsIn(INCOTERMS)`; numeric fields `@Min`/`@Max` + `@Type(() => Number)`.
- [x] `email` and `contactEmail` validated with `@IsEmail`; `website` with `@IsUrl`
      (removes the dead `IsEmail`/`IsUrl` imports and the associated lint errors).

### Error handling
- [x] Duplicate `code` on create/update → `409 ConflictException`.
- [x] Missing/other-tenant id on findOne/update/remove → `404 NotFoundException`.
- [x] Invalid DTO → `400` via the global `ValidationPipe`.
- [x] Missing permission → `403`; no token → `401`.

### Response format
- [x] `GET /api/suppliers` returns `{ suppliers: [...], count: <n> }`, not a bare array.
- [x] Single-resource endpoints return the supplier object; `remove` returns `{ message, id }`.
- [x] Sensitive banking fields (`bankAccount`, `bankRouting`) are excluded from list responses
      (decision: list = summary projection; detail endpoint may include them).

### Tenant isolation
- [x] A supplier created under tenant A is not returned by `findAll`/`findOne` for tenant B.
- [x] Covered by an e2e test that creates under tenant A (DEMO) and asserts 404/absence for
      tenant B (TENANT2) — `test/suppliers.e2e-spec.ts`.

---

## Out of scope

- Schema changes to `po_suppliers` (no migration).
- Supplier scoring (`SupplierScore`), supplier items, RFQ/PO/GRN relationships — owned by
  their own modules.
- Bulk import/export of suppliers (owned by `bulk-import`).
- Pagination/filtering of the list endpoint (track as a follow-up spec if needed).
- Supplier merge/dedup tooling.

---

## Data model

**No changes.** Reference only:

| Model | Table | Key fields |
|---|---|---|
| `Supplier` | `po_suppliers` | `tenantId`, `code`, `name`, `legalName`, `taxId`/`taxType`, contact + operational-contact fields, `address`/`city`/`country`, `paymentTerms`/`currency`/`incoterms`/`creditLimit`, `minimumOrderAmount`/`minimumOrderCurrency`, `deliveryLeadDays`, `category`, `isPreferred`, `qualityRating`, banking fields, `isActive`, `notes`, audit + soft-delete columns |

Invariants:
- `@@unique([tenantId, code])`; indexes on `tenantId`, `[tenantId, code]`, `[tenantId, name]`.
- Soft delete via `deletedAt`; audit via `createdBy`/`updatedBy`/`deletedBy`.
- Codes follow `SUP-YYYY-NNNN`, generated by `SuppliersService.generateCode` (reuse — do not
  invent a new scheme).

---

## API contracts

All routes prefixed `/api`, all guarded (`Authorization: Bearer <jwt>` + permission).

### POST /api/suppliers
```json
// Request (code optional — auto-generated if omitted; name required)
{ "name": "Acme Corporation", "email": "contact@acme.com", "incoterms": "FOB", "creditLimit": 10000 }

// Response 201 — created supplier (full row)
{ "id": "...", "code": "SUP-2026-0001", "name": "Acme Corporation", "isActive": true, "...": "..." }

// Errors: 409 duplicate code | 400 validation | 403 missing PROCUREMENT:CREATE | 401
```

### GET /api/suppliers
```json
// Response 200 — TARGET envelope (currently a bare array — see acceptance criteria)
{ "suppliers": [ { "id": "...", "code": "SUP-2026-0001", "name": "..." } ], "count": 1 }

// Errors: 403 missing PROCUREMENT:VIEW | 401
```

### GET /api/suppliers/:id
```json
// Response 200 — full supplier row
{ "id": "...", "code": "...", "name": "...", "...": "..." }

// Errors: 404 not found / other tenant | 403 | 401
```

### PATCH /api/suppliers/:id
```json
// Request — any subset of CreateSupplierDto fields
{ "paymentTerms": "Net 45", "isPreferred": true }

// Response 200 — updated supplier
{ "id": "...", "...": "..." }

// Errors: 404 | 409 duplicate code | 400 | 403 missing PROCUREMENT:EDIT | 401
```

### DELETE /api/suppliers/:id
```json
// Response 200
{ "message": "Supplier deleted successfully", "id": "..." }

// Errors: 404 | 403 missing PROCUREMENT:DELETE | 401
```

---

## Implementation notes

### Files involved
| File | Role |
|---|---|
| `src/modules/suppliers/suppliers.controller.ts` | 5 thin routes, RBAC + Swagger |
| `src/modules/suppliers/suppliers.service.ts` | CRUD + `generateCode`; depends only on `PrismaService` |
| `src/modules/suppliers/dto/create-supplier.dto.ts` | full `class-validator` DTO |
| `src/modules/suppliers/dto/update-supplier.dto.ts` | `PartialType(CreateSupplierDto)` |
| `prisma/schema.prisma` → `Supplier` | `po_suppliers` table |

### Cross-module note
`SuppliersService.generateCode` is the canonical document-number generator referenced by
`CLAUDE.md`; other modules model their code generation on it. Changes here should preserve the
`PREFIX-YYYY-NNNN` contract.

---

## Verification checklist

```bash
# Auth
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}' | jq -r .access_token)

# 1. List → { suppliers, count }
curl -s http://localhost:3000/api/suppliers -H "Authorization: Bearer $TOKEN" | jq 'has("suppliers") and has("count")'
# Expected: true

# 2. Create (auto-code) → 201 with SUP-YYYY-NNNN
curl -s -X POST http://localhost:3000/api/suppliers -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Test Vendor"}' | jq .code
# Expected: "SUP-2026-0001" (or next sequence)

# 3. Duplicate code → 409
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/suppliers \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Dup","code":"SUP-2026-0001"}'
# Expected: 409

# 4. Invalid email → 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/suppliers \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Bad","email":"not-an-email"}'
# Expected: 400  (after @IsEmail is added)

# 5. Unknown id → 404
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/suppliers/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer $TOKEN"
# Expected: 404

# 6. No token → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/suppliers
# Expected: 401
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-05-31 | Spec generated from code by `spec-generator` (`/new-spec suppliers`) | 5 endpoints; 18 [x] / 6 [ ] acceptance criteria; tests scaffolded |
| 2026-05-31 | Shipped to origin (`b8080a2`); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%); unit 9/9, e2e 11/11 |
