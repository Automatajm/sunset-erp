---
description: Seal and ship an implemented spec — verifies compliance, runs tests/build/lint, commits with a conventional message, pushes, and archives the spec to specs/completed/.
argument-hint: <spec-number>
---

Seal and ship the spec: **$ARGUMENTS** (accept `spec-002`, `002`, or a module name —
resolve to the matching file in `specs/active/`).

This is a gated pipeline. **Run the gates in order and STOP at the first failure** —
report what failed with evidence and do NOT commit, push, or move anything. Only proceed to
commit once every gate is green. Nothing here is destructive until Gate 5.

## Gate 1 — locate the spec
Find `specs/active/spec-NNN-*.md` matching `$ARGUMENTS`. If it is already in
`specs/completed/`, stop: it is already shipped. Extract the spec number, the module
name(s), and a one-line title for the commit message.

## Gate 2 — compliance (run the `spec-reviewer` skill)
Run **spec-reviewer** against the spec. Read the overall compliance %.
- **100%** of code-verifiable criteria → pass.
- **< 100%** → STOP. List the FAIL/PARTIAL criteria with `file:line`. Do not ship a spec
  whose code does not satisfy it. (If the user explicitly tells you to ship anyway at a
  lower bar, record the accepted gaps in the commit body and the status log.)

## Gate 3 — tests
Run the suite for the module:
- Unit: `cd backend && pnpm test <module>.service`
- E2e: `cd backend && pnpm test:e2e` (needs Postgres + Redis up and `pnpm seed` run; if the
  harness/deps are missing, the spec was never test-scaffolded — run **test-writer** first,
  or stop and say so).
All tests must pass. On any red test, STOP and show the failing test output.

## Gate 4 — build + lint
- Build: `cd backend && pnpm build` — must succeed.
- Lint: do **NOT** run repo-wide `pnpm lint` (it is `eslint --fix` and reformats the entire
  codebase, creating a huge unrelated diff). Instead lint ONLY this spec's changed files in
  check mode:
  `cd backend && npx eslint $(git diff --name-only origin/main...HEAD -- 'backend/src/**/*.ts'; git diff --name-only -- 'backend/src/**/*.ts')`
  Pre-existing repo-wide lint debt (e.g. the `passwordHash` destructure idiom) is NOT a
  ship blocker — only NEW errors introduced by this spec's files are. If a changed file has
  a fixable formatting error, fix just that file (`npx eslint --fix <file>`), not the repo.

## Gate 5 — commit (only after Gates 1–4 are green)
- Review what will be committed: `git status --short` and `git diff --stat`. Stage ONLY the
  files belonging to this spec (the module's `src` files, its two test files, the spec, and
  `package.json`/lockfile if deps changed). Do not sweep unrelated modified files into the
  commit — if the working tree contains unrelated changes (e.g. formatting churn), stop and
  ask the user how to handle them.
- Commit with a Conventional Commit message derived from the spec:
  ```
  feat(spec-NNN): <spec title>

  <1-3 lines: what shipped, key acceptance criteria met, compliance 100%>

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
  Use the type matching the work (`feat` for new capability, `fix` for a bug spec, `refactor`
  for a refactor spec). `.env` is git-ignored — never stage secrets.

## Gate 6 — push
`git push origin <current-branch>`. Confirm the working tree is in sync with the remote
afterward (`git status -sb`). If on the default branch `main`, that matches this repo's
established workflow; if the user prefers a branch/PR, ask before pushing.

## Gate 7 — archive the spec
- Set the spec's `Status:` field to `**Complete**`.
- Add a final `## Status log` row: today's date, "Shipped to origin (<commit-sha>); marked
  Complete and moved to specs/completed/", result "All acceptance criteria met (100%)".
- Move it: `git mv specs/active/spec-NNN-*.md specs/completed/`.
- Commit the move (`docs(spec-NNN): mark Complete and move to specs/completed/`) and push.

## Final report
Print:
- Compliance % (from Gate 2) and test results (counts, unit + e2e).
- Build/lint status.
- The commit SHA(s) and that they are pushed.
- New spec location in `specs/completed/`.
- Anything left for the user (e.g. accepted gaps, a follow-up).
