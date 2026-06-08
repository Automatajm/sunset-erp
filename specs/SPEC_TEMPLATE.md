# spec-NNN — <Module> <Domain>

<!--
  THE single reference for writing a Sunset ERP backend spec from scratch.
  Copy this file to specs/active/spec-NNN-<module>.md and fill every section.
  A correct spec needs NOTHING beyond this template + the module's code +
  CLAUDE.md. Sections marked (mandatory) must never be omitted. Delete these
  HTML comments in the real spec.

  Conventions this template encodes (from specs 001–034):
  - SDD flow: SPEC → PLAN → TASKS → IMPLEMENT → VERIFY. The spec is the contract.
  - Status values: Draft → Implemented — pending ship → Complete.
  - Acceptance criteria use - [ ] (unmet / to build) and - [x] (already true in
    code). Every criterion is concrete and testable. Cite real file:line.
  - Spec number = next integer after the highest in specs/active + specs/completed,
    zero-padded to 3 digits. Filename spec-NNN-<module>.md.
-->

Status: **Draft**
Owner: <team or Axiom Systems>
Sprint: <sprint / batch / "finance hardening (N of M)">
Module(s): <module dir name(s) under backend/src/modules/>
Last updated: <YYYY-MM-DD>

---

## Purpose  (mandatory)

<!-- Who and why, in concrete operational terms. Three questions, answered plainly. -->

- **Who uses this module?** <role/persona — e.g. "warehouse clerk", "accountant",
  "procurement officer", "tenant admin", "the system itself (internal service)">.
- **What business problem does it solve?** <the real-world job this module does —
  e.g. "records what physically arrived against a purchase order so the ledger and
  inventory agree">.
- **What can the business NOT do without this module?** <the capability that is
  simply absent without it — e.g. "cannot invoice a customer", "cannot close the
  books for a period", "cannot tell what stock is on hand">.

---

## Business value  (mandatory)

<!--
  Plain language, no jargon. NOT "the list endpoint lacks a count envelope" —
  that's a technical gap (those go under ## Problem). Here: what operationally
  breaks or hurts WITHOUT this module working correctly. Imagine explaining to a
  non-technical owner why this work is worth paying for. 2–5 sentences.
-->

<Why this exists in operational terms. What goes wrong, gets slow, costs money,
or becomes impossible without it. The downstream impact on real work.>

---

## Problem  (mandatory)

<!--
  The technical state of the world. What the module does today, and the concrete
  gaps found in the code that this spec closes. Be specific — cite real issues
  with file:line (e.g. "list endpoint omits deletedAt: null (service:54)",
  "writes key off id alone — cross-tenant leak (service:100)"). For a greenfield
  module, describe what must exist. Name the convention(s) being enforced.
-->

<What exists, what's broken/missing, why it matters. Numbered list of concrete
findings is encouraged. End with one line stating the spec's purpose.>

---

## Acceptance criteria  (mandatory)

<!--
  Grouped by sub-area with ### headers. Each item is a concrete, testable - [ ]
  (to build) or - [x] (already satisfied — cite file:line proving it). Cover, at
  minimum, the groups below; add/rename to fit the module. These map 1:1 to the
  CLAUDE.md invariants and to the verification checklist.
-->

### Tenant scoping & soft delete
- [ ] Every tenant-owned read scopes `where: { tenantId, deletedAt: null }`
      (`tenantId` from `req.user.tenantId`).
- [ ] Every write scopes `tenantId` — `updateMany({ where: { id, tenantId,
      deletedAt: null } })` + refetch, never `where: { id }` alone.
- [ ] Soft delete via `deletedAt` + `deletedBy` (never hard delete, unless the
      model is documented hard-delete by design).

### Endpoints & RBAC
- [ ] Every route guarded `@UseGuards(JwtAuthGuard, PermissionsGuard)` +
      `@RequirePermissions('<MODULE>:<ACTION>')` (cite the real permission codes).
- [ ] List endpoints return the `{ <resource>, count }` envelope.

### DTO validation
- [ ] Every `@Body()`/`@Query()` binds a DTO class with `class-validator`
      decorators (no `any`, no inline types, no `Partial<>` as a body type).
- [ ] Enum/string-status fields carry `@IsIn([...])`; UUIDs `@IsUUID`; Decimal
      columns carry a `@Max()` cap (column capacity − 1 order of magnitude) and
      `@Min(0)` where non-negative.

### State machine & error handling  (if applicable)
- [ ] Status transitions validated against a whitelist + transition map.
- [ ] Not-found → `NotFoundException`; duplicate unique → `ConflictException`
      (plus a `P2002 → 409` catch around the create); invalid state →
      `BadRequestException`.

### Monetary fields  (if the module stores money — spec-021)
- [ ] Frozen-rate trio: store `amount`, `currency`, `exchangeRate` (frozen at
      creation via `CurrencyService.getRate`), `amountBase`, `baseCurrency`
      (from `TenantSettings.baseCurrency`). Rate never recalculated; updates that
      change `amount` recompute `amountBase` with the frozen rate. Inject
      `CurrencyService` — never query `mc_exchange_rates` directly.

### Response format & Swagger
- [ ] Every handler has `@ApiOperation` + at least one `@ApiResponse`.
- [ ] No endpoint leaks secret fields (`passwordHash`, raw tokens, etc.).

---

## Out of scope  (mandatory)

<!-- What this spec deliberately excludes, so reviewers don't expect it. Exclude
     refactors not driven by this module; name future/companion specs. -->

- <excluded item — why / which future spec owns it>

---

## Data model  (mandatory)

<!-- "No changes." if preserving schema. Otherwise a table of owned models +
     invariants. Schema changes are additive migrations via the shadow-DB
     workaround (migrate diff --script + migrate deploy — sunset_user lacks
     CREATEDB). Destructive changes (DROP) require explicit approval. -->

No changes.  <!-- or: -->

| Model | Table (`@@map`) | Key fields | Constraints |
|---|---|---|---|
| `<Model>` | `<table>` | <fields> | <`@@unique`, soft delete, audit cols> |

Invariants: <unique keys, FKs, non-negative columns, document-number format, etc.>

---

## API contracts  (mandatory)

<!-- One subsection per endpoint: METHOD /api/<path> — PERMISSION. A fenced jsonc
     block with request + response shapes and `// Errors: 4xx ...`. List
     endpoints show the { resource, count } envelope. Document-number format
     where relevant (e.g. SUP-2026-0001 via SuppliersService.generateCode). -->

### METHOD /api/<path>  — `<MODULE>:<ACTION>`
```jsonc
// Request: <Dto> { ... }
// Response 200/201: { ... }
// Errors: 400 <validation> | 401 <no token> | 403 <missing perm> | 404 <not found> | 409 <duplicate>
```

---

## Implementation notes  (mandatory)

<!-- A "Files changed / involved" table + cross-module dependencies + any global
     infra touched. Cross-module data access goes through the owning module's
     service (injected), never a duplicate Prisma query — document the dependency
     here. Note any frontend-sync needed when a response shape changes. -->

| File | Change |
|---|---|
| `backend/src/modules/<module>/<module>.service.ts` | <change> |
| `backend/src/modules/<module>/<module>.controller.ts` | <change> |
| `backend/src/modules/<module>/dto/*.ts` | <change> |
| frontend | `frontend-sync` sweep for `GET /<route>` consumers if the response shape changed |

Cross-module dependencies: <which services are injected and why>.

---

## Verification checklist  (mandatory)

<!-- A runnable bash block of curl/pnpm steps with `# Expected: ...` comments,
     one per acceptance criterion. End with build + unit + e2e. Tenant isolation
     (tenant B gets 404 on tenant A's record) is the highest-value e2e. -->

```bash
# 1. Tenant isolation: tenant B cannot read/update/delete tenant A's record → 404
# 2. Envelope: GET /api/<route> → { <resource>: [...], count: N }
# 3. DTO: POST/PATCH with a junk field or out-of-range value → 400
# 4. State machine / error paths → correct 4xx
# 5. cd backend && pnpm build && pnpm test <module>.service && pnpm test:e2e
```

---

## Status log  (mandatory)

<!-- One row per milestone. Seed with the generation row. Ship adds the final
     "Shipped to origin (<sha>); marked Complete and moved to specs/completed/". -->

| Date | Action | Result |
|---|---|---|
| <YYYY-MM-DD> | Spec generated from code / drafted | Draft — pending review |
