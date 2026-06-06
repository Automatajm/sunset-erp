---
description: Evaluate readiness for a client demo or production release — spec coverage, full e2e suite, both builds, git hygiene, demo seed — and emit a GO / NO-GO verdict with specific blockers.
argument-hint: [demo|production]
---

Run a release-readiness evaluation for Sunset ERP. Target: **$ARGUMENTS** (default:
demo). Run EVERY check even after one fails — the verdict needs the complete blocker
list, not the first failure. Nothing here modifies code or data (read-only + test
runs). Collect evidence as you go and emit the verdict at the end.

## Check 1 — Spec coverage
- Count `ls specs/completed/spec-*.md` vs the module totals in
  `specs/MODULE-CASCADE.md` (Coverage summary table).
- Report: N/38 backend modules specced, which tiers are complete, what is pending,
  and whether anything in `specs/active/` is a backend spec stuck mid-flight
  (a Draft backend spec in active/ = work in progress = flag it).
- Demo target: coverage is informational. Production target: any pending module that
  the demo flows touch (procurement cluster, invoices) is a BLOCKER.

## Check 2 — Full e2e suite
- Preconditions first: Postgres + Redis reachable, `pnpm seed` data present, UOM
  catalog seeded (`cfg_uom_units` non-empty — run a count via a quick script or note
  `npx ts-node prisma/seed-uom.ts` as the fix). If preconditions fail, mark this
  check BLOCKED (not skipped) and continue.
- `cd backend && pnpm test:e2e` — the WHOLE suite, not per-module. Capture
  suites/tests passed/failed. Any red test = BLOCKER (name the test and suite).
- Also run the unit suites: `pnpm test`. Red unit test = BLOCKER.

## Check 3 — Builds
- `cd backend && pnpm build` — must succeed.
- `cd frontend && pnpm build` — must succeed.
- Remember: a green frontend build does NOT prove pages render data (shape bugs are
  invisible to tsc). If any backend spec shipped since the last `frontend-sync`
  sweep changed a response shape, flag a WARN to run the `frontend-sync` skill.

## Check 4 — Git hygiene
- `git status --porcelain` must be empty (uncommitted work = BLOCKER for release,
  WARN for demo) and `git status -sb` must show no ahead/behind vs origin
  (unpushed commits = BLOCKER).

## Check 5 — Demo seed
- Verify the BURGER tenant demo data is live: the cleanest probe is a real login —
  `curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@burger.do","password":"Admin123!"}'`
  must return an `access_token` (if the backend is not running, start it or verify
  via DB: `auth_users` has admin@burger.do and the BURGER tenant has items/BOMs).
- With that token, spot-check the data is themed and non-empty:
  `GET /api/items` → `items.length > 0`; `GET /api/bom` → at least one BOM.
  Empty demo tenant = BLOCKER for a demo.
- If the seed is missing, the fix is the idempotent
  `prisma/seeds/05-demo-burger-borinquen` seed — name it, do not run it without
  asking (it writes data).

## Verdict

Output exactly this structure:

```
# Release check — <demo|production> — <date>

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Spec coverage | 18/38 (info) | tiers 0–4 singles complete; clusters pending |
| 2 | E2e suite | PASS 12/12 suites, N tests | — |
| 3 | Builds | PASS backend + frontend | — |
| 4 | Git | PASS clean + synced | — |
| 5 | Demo seed | PASS admin@burger.do, 34 items | — |

## Verdict: GO | NO-GO

Blockers (must fix before GO):
1. <specific, actionable, with the exact command or file>

Warnings (GO permitted, schedule these):
1. <...>
```

Rules: a NO-GO must list at least one concrete blocker with its fix; never emit GO
with an empty evidence column; if a check could not run (service down), the verdict
is NO-GO with "could not verify X" as the blocker — unverified ≠ passing.
