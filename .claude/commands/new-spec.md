---
description: Generate a new SDD spec for a backend module — runs opportunity analysis, then generates the spec from the module's code and saves it to specs/active/.
argument-hint: <module>
---

Orchestrate the SDD spec-creation workflow for the module: **$ARGUMENTS**

Follow these steps in order. Do not skip steps; carry each step's output into the next.

## 1. Validate the module
Confirm `backend/src/modules/$ARGUMENTS/` exists. If not, list `backend/src/modules/` and
either pick the obvious closest match or ask the user which module they meant. Stop if it's
a module that already has a spec in `specs/active/` or `specs/completed/` — tell the user it
already has one and offer to run the **spec-reviewer** skill against it instead.

## 2. Analyze — run the `opportunity-finder` skill
Invoke the **opportunity-finder** skill scoped to `$ARGUMENTS` (single-module mode). It will
read the controller/service/dto/module and surface concrete issues (tenant-scoping gaps,
missing Swagger, controller logic, missing DTOs, missing error handling) with `file:line`
evidence and a score. Keep this issue list — it seeds the spec's Problem and unchecked
acceptance criteria.

## 3. Generate — run the `spec-generator` skill
Invoke the **spec-generator** skill for `$ARGUMENTS`. It reads
`specs/completed/spec-001-foundation-auth.md` (the gold standard) and the module's code, and
produces a full spec. Ensure the issues found in step 2 appear as unchecked `- [ ]`
acceptance criteria and are referenced in `## Problem`. The skill picks the next
`spec-NNN` number and writes `specs/active/spec-NNN-$ARGUMENTS.md`.

## 4. Verify the output
Confirm the file was written to `specs/active/` and that it contains every gold-standard
section: Problem, Acceptance criteria, Out of scope, Data model, API contracts,
Implementation notes, Verification checklist, Status log. If any section is missing or thin,
go back and complete it before reporting.

## 5. Scaffold tests — run the `test-writer` skill
Invoke the **test-writer** skill for `$ARGUMENTS` against the spec just generated. It writes
`backend/src/modules/$ARGUMENTS/$ARGUMENTS.service.spec.ts` (unit) and
`backend/test/$ARGUMENTS.e2e-spec.ts` (e2e), covering every acceptance criterion, the error
paths, tenant isolation, and the spec's verification checklist — and bootstraps the Jest
harness if it is not yet installed. The tests are scaffolding: they encode the spec's
contract so that when the user approves and implements, the tests already exist and define
"done". Do not run them yet (the spec is Draft and unimplemented) — just generate them and
note any acceptance criteria that could not be turned into a test.

## 6. Report summary
Print a concise summary:
- Spec path and number.
- Endpoint count and acceptance-criteria count (`[x]` already-met vs `[ ]` to-do).
- The top 3 issues from opportunity-finder that this spec will fix.
- The two test files written and the criteria-to-test coverage (any gaps).
- Whether the Jest harness was bootstrapped (deps/config added).
- Next action: review acceptance criteria with the user to approve the spec, then implement
  against the waiting tests; seal with `/ship-spec <spec-number>` when green.
