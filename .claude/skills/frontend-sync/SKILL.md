---
name: frontend-sync
description: Given a backend spec or change that altered an API response/request shape, scan the entire frontend for every consumer of the affected endpoint(s) and produce a precise impact report — file, line, old shape, new shape, exact fix — so nothing breaks silently. Use after shipping a backend spec that changed a contract (e.g. "sync the frontend with spec-016", "what does the {items,count} envelope break?", "find consumers of GET /journal-entries").
---

# Frontend Sync

When the backend changes a contract, the frontend does not fail loudly — it renders
empty tables. This skill turns a backend shape change into a complete, line-precise
list of every frontend touchpoint and the exact fix for each, BEFORE anything ships
or as the cleanup after it did.

## The canonical incident this prevents

**spec-002 (suppliers) / spec-003 (items)** changed their list endpoints from a bare
array to the envelope `{ suppliers: [...], count }` / `{ items: [...], count }`.
The frontend kept doing `setRows(res.data)` — `res.data` was now an object, `.map`
was never called, and every consuming page **silently rendered an empty table**. No
build error, no runtime exception, no failed request: a 200 with the wrong shape is
invisible to TypeScript (the `as Foo[]` casts lie) and to the network tab. It was
caught by eyeballing the UI, not by tooling. Every list-envelope spec since
(013–018) has had to chase its consumers by hand — this skill makes that chase
systematic and exhaustive.

## Input

A reference to what changed, in any of these forms:
- a spec number/file (`spec-016`, `specs/completed/spec-016-stock-transactions.md`) —
  read its `## API contracts` and `## Status log` to extract the changed shapes;
- an endpoint (`GET /api/stock-transactions`) plus a description of old → new;
- a diff/commit that touched a backend controller/service response.

If the old and new shapes are not explicit, derive them: old = what the frontend
code currently assumes (read the consumers), new = what the backend code now returns
(read the service's return statements). Never guess — read both sides.

## Procedure

### 1. Establish the contract delta
For each affected endpoint, write down a precise before/after:
```
GET /api/stock-transactions
  old: StockTransaction[]
  new: { movements: StockTransaction[]; count: number }
```
Include nested deltas too (renamed fields, Decimal→number, removed DTO fields like
spec-015's dropped `referenceType`/`referenceId` — request-shape changes break
writers, not just readers).

### 2. Find every consumer — sweep wide, three layers deep
A consumer is anywhere the response shape is assumed, not just where the URL appears.
Search ALL of these, for EACH endpoint:

1. **API modules** (`frontend/lib/api/*.ts`) — the URL string:
   `grep -rn "'/stock-transactions'" frontend/lib/api/` and template-literal variants
   (`` `/stock-transactions/${id}` ``). Note what each getter returns and casts.
2. **Direct `apiClient` calls in pages/components** — pages sometimes bypass the API
   module (e.g. `app/inventory/stock-reconciliation/page.tsx` calls
   `apiClient.get('/stock-reconciliation')` directly):
   `grep -rn "apiClient.\(get\|post\|patch\|put\|delete\)" frontend/app frontend/components | grep "<route>"`.
3. **Downstream shape assumptions** — for every getter found in (1), find its
   callers (`grep -rn "<getterName>" frontend/`) and inspect how the result is used:
   `.map(`, `.filter(`, `.length`, destructuring, `as Foo[]` casts, `types.ts`
   interfaces. The breakage usually lives here, two hops from the URL.

Also check `frontend/lib/api/types.ts` for interfaces that encode the old shape.

Do not stop at the first match per file — list every line. Silent truncation of the
consumer list recreates the incident.

### 3. Classify each touchpoint
For every (file, line) hit, determine:
- **BREAKS** — the code will misbehave with the new shape (the `.map` on an object,
  the cast that lies, the POST body with a removed field).
- **ALREADY-COMPATIBLE** — tolerant code (e.g. `Array.isArray(d) ? d : d.items ?? []`)
  or already updated.
- **UNAFFECTED** — touches the endpoint but not the changed part (e.g. only uses `id`).

### 4. Produce the report

```
# Frontend sync report — <spec/endpoint>

Contract delta:
  <endpoint>: <old shape> → <new shape>

| # | File:line | Status | What it does today | Fix |
|---|-----------|--------|--------------------|-----|
| 1 | lib/api/stock-transactions.ts:18 | BREAKS | `return res.data` (assumes array) | `return (res.data as { movements: StockTransaction[] }).movements` |
| 2 | app/.../page.tsx:239 | BREAKS | `setSessions(sess.data as CountSession[])` | unwrap `.sessions` |
| 3 | lib/api/types.ts:84 | BREAKS | interface still models old field | update/remove field |
...

Unaffected consumers checked: <list, so coverage is auditable>
Verification: cd frontend && pnpm build   # then load the affected pages — a 200
              with the wrong shape produces an EMPTY TABLE, not an error.
```

Every BREAKS row must carry a concrete, paste-able fix following the established
local idiom (e.g. unwrap inside the API-module getter so pages keep receiving plain
arrays — the pattern used by `lib/api/suppliers.ts:9-11` and every envelope fix
since).

### 5. Optionally apply
If the user asked for the fix (not just the report), apply each BREAKS fix, then run
`cd frontend && pnpm build` and report the result. Type-level lies (`as Foo[]`) make
the build pass even when broken — say explicitly that build-green is necessary but
NOT sufficient, and list which pages need a visual check (or a browser-qa-agent run).

## Rules

- Evidence per row: real `file:line`, the actual code snippet, never inferred.
- Search by URL **and** by getter name **and** by type name — three different ways a
  consumer can depend on the shape.
- Request-shape changes (DTO fields added/removed/whitelisted) are in scope, not just
  responses — a `forbidNonWhitelisted` backend turns a stale extra field into a 400.
- If zero consumers are found for a changed endpoint, say so explicitly and name the
  searches performed — absence of consumers is a finding, not a gap in the report.
