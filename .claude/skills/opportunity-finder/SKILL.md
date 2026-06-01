---
name: opportunity-finder
description: Scan backend modules that have no active or completed spec, analyze them for code-quality issues (missing tenantId scoping, missing Swagger, business logic in controllers, missing/weak DTOs, missing error handling), and produce a prioritized opportunity report ranking which modules most need an SDD spec. Use when the user wants to find work, triage technical debt, or decide what to spec next (e.g. "what should we spec next", "find opportunities", "/new-spec <module>" orchestration).
---

# Opportunity Finder

Find which backend modules most need an SDD spec, by scanning every module that does NOT
already have one and scoring it on concrete code-quality issues. Output is a prioritized
report. This skill is read-only analysis — it never edits code.

## Scope: modules without a spec

1. List modules: `ls backend/src/modules/`.
2. List existing specs: `ls specs/active/ specs/completed/` and read each spec's
   `Module(s):` header line to map specs → modules. A module is "covered" if a spec names
   it (by filename `spec-NNN-<module>.md` or in its `Module(s):` field).
3. The target set = modules with NO covering spec. If the user named a single module
   (orchestration mode from `/new-spec`), analyze only that one and still emit the report
   for it.

## Per-module analysis

For each target module, read `*.controller.ts`, `*.service.ts`, `dto/*.ts`, `*.module.ts`
and check these five issue categories. Read and reason — grep is a starting point, not the
verdict.

### 1. Missing tenantId / soft-delete scoping  (severity: CRITICAL — data leak)
For every `this.prisma.<model>.findMany|findFirst|findUnique|update|updateMany|delete|deleteMany|count`
on a tenant-owned model, the `where` must include `tenantId` AND `deletedAt: null`
(writes at least `tenantId`). Flag each call that omits either.
- Start: `grep -n "this.prisma." backend/src/modules/<module>/*.service.ts`
- Confirm by reading the `where` of each call.

### 2. Missing Swagger annotations  (severity: LOW — docs)
Every controller handler must have `@ApiOperation` and at least one `@ApiResponse`
(and `@ApiBearerAuth('JWT-auth')` on guarded routes). Flag handlers missing them.
- Start: compare counts of `@Get|@Post|@Patch|@Put|@Delete` vs `@ApiOperation`.

### 3. Business logic in controllers  (severity: MEDIUM — architecture)
Controllers must be thin: route → guard → delegate to service. Flag any controller method
that does DB access (`this.prisma`), non-trivial branching, mapping/calculation, or
anything beyond calling the service and returning.

### 4. Missing or weak DTOs  (severity: MEDIUM — validation gap)
Every `@Body()` must bind to a DTO class whose fields carry `class-validator` decorators
(`@IsString`, `@IsUUID`, `@IsNumber`, `@IsOptional`, etc.). Flag `@Body()` typed as `any`/
inline objects, DTOs with no validators, or create/update endpoints lacking a DTO.

### 5. Missing error handling  (severity: MEDIUM — correctness)
Service methods that fetch-then-act must throw the right exception on the not-found / bad
path (`NotFoundException`, `ConflictException`, `BadRequestException`, etc.). Flag
methods that return `null`/`undefined` or proceed silently where the spec convention would
throw, and duplicate-create paths with no `ConflictException`.

## Scoring

For each module compute a weighted issue score:

```
score = 5×(tenant-scoping issues)
      + 3×(controller-logic issues)
      + 3×(missing-DTO issues)
      + 3×(missing-error-handling issues)
      + 1×(missing-Swagger issues)
```

Higher score = higher priority. Tenant-scoping issues alone push a module to the top of the
list regardless of total (they are data-leak risks).

## Report format

```
# Opportunity report — <N> modules without a spec

## Priority ranking
| Rank | Module | Score | Critical | Med | Low | Top issue |
|------|--------|-------|----------|-----|-----|-----------|
| 1    | <mod>  | <n>   | <count>  | ... | ... | <one-line>|
...

## <module>  (score <n>)
- [CRITICAL] tenant scoping: <file>:<line> — <model>.<op> where clause missing `deletedAt: null`
- [MEDIUM] controller logic: <file>:<line> — <what>
- [MEDIUM] missing DTO: <file>:<line> — `@Body()` is `any`
- [MEDIUM] error handling: <file>:<line> — <method> returns null on not-found
- [LOW] swagger: <file>:<line> — <handler> missing @ApiResponse
(repeat per module, ordered by score)

## Recommendation
Spec next: <module> — <why, 1-2 sentences>. Run `/new-spec <module>`.
```

## Rules

- Cite real `file:line` for every issue. No issue without evidence.
- Count issues per category per module so the score is reproducible.
- A module with zero issues still appears (score 0) — note it is spec-ready/clean.
- Do not modify any file. This is triage only; the fix path is to generate a spec.
- If invoked for a single module (orchestration), skip the ranking table and emit just that
  module's section + a one-line recommendation, so the caller can chain into spec-generator.
