---
name: spec-reviewer
description: Audit a backend module's actual code against an existing SDD spec, reporting PASS/FAIL per acceptance criterion, an overall compliance percentage, and the specific file:line locations that violate the spec. Use when the user wants to verify a spec is implemented, check compliance, or audit code against a spec (e.g. "review spec-002", "audit the items module against its spec").
---

# Spec Reviewer

Audit a module's real implementation against its SDD spec. The deliverable is a precise,
evidence-backed compliance report: every acceptance criterion marked PASS / FAIL / PARTIAL,
an overall percentage, and exact `file:line` citations for each violation.

## Input

A spec reference — either a path (`specs/active/spec-002-suppliers.md`), a spec number
(`spec-002`), or a module name (resolve to its spec in `specs/active/` then
`specs/completed/`). If no spec exists for the target, stop and say so — suggest running
`spec-generator` first.

## Procedure

### 1. Read the spec
Read the target spec fully. Extract every acceptance criterion — the `- [ ]` / `- [x]`
lines under `## Acceptance criteria`, preserving their sub-section grouping. Each checkbox
is one criterion to verify. Also note the `## API contracts`, `## Data model`, and
`## Response format` expectations — these are testable assertions too.

### 2. Read project conventions
Read `CLAUDE.md` for the invariants the spec relies on (tenant scoping
`where: { tenantId, deletedAt: null }`, `@UseGuards(JwtAuthGuard, PermissionsGuard)`,
`@RequirePermissions`, Swagger on every endpoint, DTO validation, thin controllers).

### 3. Verify each criterion against the code
For the module under `backend/src/modules/<module>/` (and `prisma/schema.prisma` for data
model), confirm each criterion by reading the relevant code — do not trust the checkbox
state in the spec; re-verify from source. Useful checks:
- **Endpoints exist** with the stated method/path/guards/permissions:
  `grep -n "@Get\|@Post\|@Patch\|@Put\|@Delete\|@RequirePermissions" *.controller.ts`.
- **Tenant scoping**: read each `this.prisma.<model>.<op>` call in the service; FAIL any
  tenant-owned query whose `where` omits `tenantId` or `deletedAt: null`.
- **Swagger**: every handler has `@ApiOperation` + at least one `@ApiResponse`.
- **DTO validation**: every request body maps to a DTO whose fields carry `class-validator`
  decorators; FAIL untyped/`any` bodies or missing validators.
- **Thin controllers**: FAIL controllers containing business logic (DB calls, branching
  beyond delegation) instead of calling the service.
- **Error handling**: the documented error codes are actually thrown
  (`grep -n "Exception(" *.service.ts`).
- **Response format**: list endpoints return the documented envelope (e.g. `{ x, count }`);
  no secret fields leaked.

### 4. Classify and cite
For each criterion assign:
- **PASS** — code satisfies it. Cite the proving `file:line`.
- **FAIL** — code violates or omits it. Cite the exact violating `file:line` and state the
  rule broken and the minimal fix.
- **PARTIAL** — satisfied in some paths but not others (cite both). Counts as 0.5 in the
  percentage and is called out explicitly.
- **N/A** — criterion is non-code (e.g. doc note); exclude from the percentage and label it.

### 5. Compute compliance
`compliance % = (PASS + 0.5×PARTIAL) / (total criteria − N/A) × 100`, rounded to a whole
number.

## Report format

Output exactly this structure:

```
# Spec compliance: spec-NNN-<module>

Overall: <NN>%  (<PASS> pass, <PARTIAL> partial, <FAIL> fail, <NA> n/a of <total>)

## <Acceptance sub-section>
- [PASS] <criterion>  — <file>:<line>
- [FAIL] <criterion>  — <file>:<line> — <rule broken>; fix: <one line>
- [PARTIAL] <criterion> — ok at <file>:<line>, missing at <file>:<line>
...

## Violations (actionable, ordered by severity)
1. <SEVERITY> <file>:<line> — <what's wrong> → <fix>
...

## Summary
<2-3 sentences: where it stands, the biggest gaps, recommended next action>
```

Severity order for the violations list: security/tenant-leak > correctness > missing
validation > missing Swagger/docs > style.

## Rules

- Every PASS and FAIL MUST carry a real `file:line`. No claim without evidence — read the
  code; never infer from the spec's own checkboxes.
- Be adversarial on tenant scoping and auth: a single unscoped query or a route missing
  `@RequirePermissions` is a FAIL, not a nit.
- Do not edit code. Do not silently tick the spec's checkboxes. If the user asks, you may
  afterward offer to update the spec's `- [ ]`/`- [x]` to match reality.
- If a criterion can't be verified from code alone (needs a running request), mark it
  PARTIAL and include the exact `curl` to confirm it.
