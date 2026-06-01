---
name: spec-generator
description: Generate a complete SDD spec for a NestJS backend module by reading its controller, service, DTOs, and Prisma models. Use when the user wants to create a new spec for an existing module (e.g. "generate a spec for the suppliers module", "/new-spec items"). Produces a spec in specs/active/ that matches the spec-001 gold-standard format.
---

# Spec Generator

Generate a complete Spec-Driven-Development (SDD) spec for one backend module by
reverse-engineering its actual code. The output MUST match the structure and depth of
the gold-standard spec at `specs/completed/spec-001-foundation-auth.md`. Read that file
first every time — it is the authoritative template.

## Input

A single module name matching a directory under `backend/src/modules/<module>/`
(e.g. `suppliers`, `items`, `purchase-orders`). If the user gives a fuzzy name, list
`backend/src/modules/` and pick the closest match; if ambiguous, ask.

## Procedure

### 1. Read the gold standard
Read `specs/completed/spec-001-foundation-auth.md` in full. Every section below maps to a
section there. Match its tone: concrete, testable, no fluff.

### 2. Read project conventions
Read `CLAUDE.md` (repo root). The spec must reflect these invariants:
- Multi-tenancy: every tenant-owned query scoped `where: { tenantId, deletedAt: null }`,
  `tenantId` from `req.user.tenantId`.
- Auth: `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions('MODULE:ACTION')`.
- Swagger `@ApiOperation` + `@ApiResponse` on every endpoint.
- DTOs use `class-validator` decorators.
- Thin controllers; all logic in services depending only on `PrismaService`.
- Document numbers via `SuppliersService.generateCode` pattern (e.g. `SUP-2026-0001`).

### 3. Read the module's code
For `backend/src/modules/<module>/`:
- `*.controller.ts` — extract every route: HTTP method, path, guards, `@RequirePermissions`,
  Swagger annotations, request DTO, what it returns.
- `*.service.ts` — extract every public method: signature, business rules, the Prisma
  models it touches, cross-module service dependencies, document-number generation, error
  paths (which exceptions thrown when).
- `dto/*.ts` — extract each DTO's fields, types, and `class-validator` decorators.
- `*.module.ts` — imports (cross-module dependencies), providers, exports.

### 4. Read the data model
In `backend/prisma/schema.prisma`, find the Prisma models this module owns or reads.
Record table name (`@@map`), key fields, unique constraints, indexes, soft-delete
(`deletedAt`), and audit columns. The spec preserves the existing schema — describe it,
do not propose changes unless the code is clearly broken (note those separately).

### 5. Determine the spec number
Scan `specs/active/` and `specs/completed/` for the highest `spec-NNN-*` number; use the
next integer, zero-padded to 3 digits. Filename: `spec-NNN-<module>.md`.

## Output structure (mirror spec-001 exactly)

Produce a single markdown file with these sections, in this order:

1. **Title + header block** — `# spec-NNN — <Module> <Domain>`, then a block of
   `Status: **Draft**`, `Owner:`, `Sprint:`, `Module(s):`, `Last updated: <today>`.
2. **`## Problem`** — what the module does, why it matters, and the concrete gaps found in
   the code (be specific — cite real issues, e.g. "list endpoint omits `deletedAt: null`").
3. **`## Acceptance criteria`** — grouped by sub-area with `### ` headers, each a checklist
   of `- [ ]` concrete, testable statements derived from the code. Cover at minimum:
   endpoints, data model/tenant scoping, DTO validation, RBAC/permissions, error handling,
   response format. Use `- [x]` only for behavior the code already satisfies; `- [ ]` for
   anything missing or unverified.
4. **`## Out of scope`** — what this spec deliberately excludes.
5. **`## Data model`** — a table of the module's Prisma models (model | table | key fields)
   plus key invariants. State "No changes" if preserving schema.
6. **`## API contracts`** — one `### METHOD /api/<path>` subsection per endpoint, each with
   a fenced JSON block showing request + response shapes and the error codes
   (`// Errors: 4xx ...`). Mirror the spec-001 endpoint blocks.
7. **`## Implementation notes`** — a "Files changed / involved" table, any cross-module
   dependencies, and relevant global infra.
8. **`## Verification checklist`** — a fenced `bash` block of `curl`/`pnpm` steps with
   `# Expected: ...` comments that prove each acceptance criterion, exactly like spec-001.
9. **`## Status log`** — a table seeded with one row: today's date, "Spec generated from
   code by spec-generator", result.

## Rules

- Derive everything from the ACTUAL code. Never invent endpoints, fields, or permissions
  that do not exist. If something is unclear, read more — do not guess.
- Quote real identifiers: actual route paths, DTO field names, permission codes
  (`grep -rn "@RequirePermissions" backend/src/modules/<module>`), Prisma model names.
- Where the code violates a CLAUDE.md invariant, capture it as an unchecked acceptance
  criterion (the fix becomes the spec's purpose), not as already-done.
- Keep `## Out of scope` honest — exclude refactors not driven by this module.
- UI/English only, no emojis in the spec body beyond the status-log/structure already used
  by spec-001 (match its style).

## Save

Write the spec to `specs/active/spec-NNN-<module>.md`. Then print a short summary:
the path, the spec number, endpoint count, and how many acceptance criteria are already
`[x]` vs `[ ]`.
