# spec-012 — Unified Auto-Generated Codes (Cross-Cutting Policy)

Status: **Complete**  
Owner: Platform  
Sprint: 19  
Module(s): `macro-categories`, `categories`, `work-centers`, `customers`, `items`, `suppliers`, `warehouses`, `bom` (+ 7 frontend create forms). Exempt: `chart-of-accounts`. Exception: `bulk-import`.  
Last updated: 2026-06-04  

---

## Purpose

- **Who uses this module?** Everyone, indirectly — it is a cross-cutting platform policy
  that runs on behalf of every user who creates a record, so no role ever has to invent a
  code.
- **What business problem does it solve?** It makes every business record code (suppliers,
  items, customers, BOMs, categories, work centers, warehouses) auto-generated and
  immutable in a consistent `PREFIX-YYYY-NNNN` style, removing a manual, error-prone field
  from every create form.
- **What can the business NOT do without this module?** It cannot guarantee unique,
  consistent, collision-free record codes — users would type their own, producing
  duplicates, gaps, and inconsistent formats that break lookups and reporting.

## Business value

Codes are bookkeeping, not judgment — every code a person has to type is a chance to create
a duplicate, a typo, or an inconsistent format that later breaks a search or a report. By
generating and locking codes automatically, the system removes that friction from every
create screen and guarantees clean, sortable, unique identifiers across the whole platform.
This embodies the product philosophy directly: the machine absorbs the complexity so the
user never decides something the system can decide for them.

---

## Problem

User-facing record codes are governed by three coexisting policies (audit 2026-06-04):

| Policy | Modules |
|---|---|
| Auto-generated, never accepted from the client | `consumption-groups` (`CG-YYYY-NNNN`) — the only one |
| Optional: auto when omitted, but the client MAY supply/override | `items` (`ITEM-NNNN`), `suppliers` (`SUP-YYYY-NNNN`), `warehouses` (`WH-{TYPE}-NNN`), `bom` (`BOM-YYYY-NNNN`) |
| **Required from the user** (no generator at all) | `macro-categories`, `categories`, `work-centers`, `customers`, `chart-of-accounts` |

Per the product philosophy (CLAUDE.md / Axiom: *"every field we push to the user is an
engineering failure — we automate the decision"*), codes are system bookkeeping, not user
judgment. Decision (owner, 2026-06-04): **every business record code is auto-generated and
immutable**, with two rulings:

1. **`chart-of-accounts` is exempt** — `accountNumber` is semantic accounting numbering
   (1=assets, 4=revenue…) chosen by the accountant; "hay múltiples estrategias para que
   esto se organice", so it stays manual.
2. **`bulk-import` is the documented exception** — it accepts external codes as the
   system-to-system migration path (upsert by natural key).

Format ruling: `PREFIX-YYYY-NNNN` for the newly-automated modules; modules that already
generate (`items` `ITEM-NNNN`, `warehouses` `WH-{TYPE}-NNN`) keep their established
formats — the policy is about *who* assigns codes, not re-formatting existing data.

---

## Acceptance criteria

### Policy (applies to every module in the matrix below)
- [x] `POST` auto-generates the code server-side; the create DTO has **no** code field, so
      a client-sent code is rejected `400` by `forbidNonWhitelisted`.
- [x] Codes are **immutable**: no code field in the update DTO; the service's code-rename
      and code-conflict (409) paths are removed; Swagger no longer documents code-409s on
      these endpoints.
- [x] Generators follow the house convention: tenant-scoped, **numeric max** (never
      lexicographic `orderBy` — the warehouses lesson, `390a4e2`), NaN-guarded,
      **spanning soft-deleted rows** (`@@unique([tenantId, code])` spans them), zero-padded.
- [x] Existing rows keep their codes (no data migration; mnemonic codes like `PROTEIN` or
      `WC-PREP-01` remain valid history).

### Module matrix
- [x] `macro-categories` — new generator `MC-YYYY-NNNN`; `code` removed from
      `CreateMacroCategoryDto` (Update inherits via `PartialType`); create dup-check and
      update conflict-check removed.
- [x] `categories` — new generator `CAT-YYYY-NNNN`; same treatment.
- [x] `work-centers` — new generator `WC-YYYY-NNNN`; same treatment (legacy `WC-PREP-01`
      style rows untouched; the numeric-max generator ignores non-matching suffixes).
- [x] `customers` — new generator `CL-YYYY-NNNN`; same treatment. *(Module is otherwise
      unspecced; only the code policy lands here — full spec follows the cascade.)*
- [x] `items` — `code?` override removed from `CreateItemDto`; existing `ITEM-NNNN`
      generator becomes the only path; `code` rename removed from update.
- [x] `suppliers` — `code?` override removed; `SUP-YYYY-NNNN` generator only path; rename
      removed from update.
- [x] `warehouses` — `code?` override removed; `WH-{TYPE}-NNN` generator only path; rename
      removed from update.
- [x] `bom` — `bomCode?` removed from `CreateBomDto` (and thus from `UpdateBomDto`);
      `BOM-YYYY-NNNN` generator only path; `bomNumber` rename + 409 removed from update.
- [x] `consumption-groups` — already compliant (reference implementation).
- [x] `chart-of-accounts` — exempt by ruling #1 (manual semantic numbering; unchanged).
- [x] `bulk-import` — exception by ruling #2 (its own Prisma writes accept external codes;
      unchanged).

### Frontend (create/edit forms stop sending codes)
- [x] The 7 forms that send `code` on create drop the input and the payload field:
      `inventory/macro-categories`, `inventory/categories`, `manufacturing/work-centers`,
      `sales/customers`, `inventory/items`, `procurement/suppliers`,
      `inventory/warehouses` (and `bom` pages for `bomCode` if present). Edit modals show
      the code read-only and never send it on PATCH.

### Tests
- [x] Every affected suite (unit + e2e) updated: creates send no code; new asserts —
      generated code matches the module's pattern, sequence increments, client-sent code →
      `400`, PATCH with code → `400`; obsolete duplicate-code 409 tests removed.
- [x] Full e2e suite green.

---

## Out of scope

- Re-coding existing rows (no migration; old mnemonic codes remain).
- `chart-of-accounts` numbering strategies (manual by ruling; future spec may add
  assisted numbering).
- Changing `bulk-import` upsert keys.
- Document-number modules already auto-only (SO/PO/JE/GRN generators — untouched).
- Customers module full spec (CRUD contract, validation audit) — follows the cascade.
- Seeds: they write codes via Prisma directly (system path), unaffected by DTO changes.

---

## Data model

**No changes.** All `@@unique([tenantId, code])` constraints already support the policy.

---

## API contracts (delta only)

For each module in the matrix: the create request loses its code field; responses are
unchanged (the generated code comes back in the entity). Example (macro-categories):

```json
// POST /api/macro-categories — request (code now FORBIDDEN, 400 if sent)
{ "name": "Proteínas", "description": "…", "isActive": true }

// Response 201
{ "id": "…", "code": "MC-2026-0001", "name": "Proteínas", "...": "unchanged" }

// PATCH — code immutable: sending it → 400 (forbidNonWhitelisted); 409 paths removed
```

---

## Implementation notes

- Generator template (per module, replicating `consumption-groups` + the numeric-max fix):
  `findMany({ where: { tenantId, code: { startsWith: PREFIX } }, select: { code } })` →
  numeric max over the trailing segment → `PREFIX-YYYY-{max+1, pad 4}`.
- Removing `code` from a Create DTO automatically removes it from `PartialType` updates;
  services must also drop their `dto.code` field-mappings and conflict checks.
- `bom` update keeps `version`/`isActive`/`itemId` handling; only `bomCode` mapping goes.
- Frontend: where the edit modal previously allowed typing the code, render it as a
  read-only label; create modals lose the field entirely.
- The e2e fixture helpers that create records with explicit codes (categories' macro
  fixture, bom's work-center fixture, etc.) switch to name-only payloads.

---

## Verification checklist

```bash
# Per newly-automated module (example: macro-categories)
# 1. POST {name} → 201, code matches ^MC-\d{4}-\d{4}$; second POST increments
# 2. POST {name, code:'HACK'} → 400
# 3. PATCH {code:'HACK'} → 400; PATCH {name} → 200, code unchanged
# Override-removal modules (items/suppliers/warehouses/bom): same #2/#3 asserts
# 4. Chart of accounts: POST with accountNumber still required/accepted (exempt)
# 5. cd backend && pnpm build && pnpm test && pnpm test:e2e  → all green
```

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-04 | Policy decided by owner (all codes auto + immutable; COA exempt; bulk-import exception; PREFIX-YYYY-NNNN) after cross-module audit | Draft — 8 backend modules + 7 frontend forms captured as unchecked criteria |
| 2026-06-04 | Shipped to origin (9f58214); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) — 8 backend modules + 7 frontend forms; unit 172/172, e2e 159/159, both builds green |
