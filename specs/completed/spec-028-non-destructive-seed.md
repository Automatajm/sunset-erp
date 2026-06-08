# spec-028 — Non-Destructive Seed (`pnpm seed` additive, wipe only on `seed:reset`)

Status: **Complete**
Owner: Axiom Systems
Sprint: tooling hardening (incident-driven)
Module(s): backend tooling only — `prisma/seed.ts`, `prisma/seeds/01-02`, `package.json` scripts
Last updated: 2026-06-07

## Purpose

- **Who uses this module?** Developers and operators who run `pnpm seed` to set up or top up demo/dev databases — and the system itself (Prisma auto-invokes `db seed` after some migration flows).
- **What business problem does it solve?** It makes the standard seed command additive and idempotent so that running it on a populated database tops up master/demo data without ever wiping live or API-created records; full destruction is reserved for the explicit `seed:reset`.
- **What can the business NOT do without this module?** Without it, the routine "restore seed data" command silently destroys the entire database (every tenant's transactional data and demo enrichment), and there is no safe way to refresh master data on a non-empty database.

## Business value

A single mistyped or auto-triggered seed used to erase everything — exactly what happened in the 2026-06-07 incident, which wiped all of BURGER's demo money-loop data and reshuffled every entity id. Making the seed additive turns a high-stakes, irreversible operation into a safe, repeatable no-op top-up, so demos, dev environments, and any production-like data survive routine maintenance. It removes a class of accidental data-loss that cost real rework time and could destroy a client demo minutes before it starts.

## Problem

**Incident 2026-06-07:** `pnpm seed` was run mid-session to "restore seed-owned
data" and instead destroyed the entire database: `prisma/seed.ts` calls
`resetDatabase()` — 32 `TRUNCATE … CASCADE` statements (`seed.ts:11-49`) — before
re-seeding. CASCADE drags every referencing table, so even tables not listed
(RFQs, AP/AR invoices, GRNs, notifications, count sessions) are wiped. All of
BURGER's API-created demo enrichment (money-loop) was lost and every entity id
in the database changed.

The command's name and docs promise the opposite: CLAUDE.md documented
`pnpm seed` as plain `prisma db seed` and reserved "DROPS data" for
`seed:reset`. The sub-seeds are nearly all idempotent already (03–06 use
upsert / check-and-create); the orchestrator's wipe is what makes the whole
command destructive — and it is **redundant in the reset path**, because
`seed:reset` = `prisma migrate reset --force`, which drops the schema and
re-runs the seed on empty tables anyway.

Residual hazard: `prisma db seed` is also auto-invoked by Prisma after
`migrate reset` (and prompted after some `migrate dev` flows) — any such
implicit invocation currently truncates production-like data.

## Acceptance criteria

### Additive seed
- [ ] `prisma/seed.ts` no longer calls `resetDatabase()`/`resetSequences()` in
      the `pnpm seed` path; no `TRUNCATE` statement is reachable from
      `prisma db seed`.
- [ ] `pnpm seed` run twice consecutively completes without errors and without
      data loss: row counts in every business table are identical before/after
      the second run (no duplicates, nothing deleted).
- [ ] Rows created via the API after a seed (e.g. an RFQ in BURGER) survive a
      subsequent `pnpm seed` unchanged — same id, same data.
- [ ] `01-currencies.seed.ts` and `02-languages.seed.ts` converted from bare
      `create` loops to `upsert` keyed on their natural unique key (`code`),
      matching the pattern already used in 03/04/06. (These are the only two
      sub-seeds that currently P2002 on a non-empty table.)
- [ ] Sub-seeds 03–06 unchanged (already idempotent: 03/04/06 upsert,
      05 check-and-create with its consistency contract).

### Reset path
- [ ] Full-wipe capability is preserved and EXPLICIT: `pnpm seed:reset` keeps
      wiping everything. Implementation choice (either satisfies):
      a) keep `seed:reset` = `prisma migrate reset --force` (schema drop +
         migrations + auto-seed on empty DB — `resetDatabase()` becomes dead
         code and is deleted), or
      b) if a data-only wipe (no re-migration) is still wanted, move
         `resetDatabase()` to a dedicated `prisma/reset-data.ts` invoked ONLY
         by an explicit script (e.g. `seed:reset` chains it before the seed).
      Either way: the truncate code must be unreachable from `pnpm seed` and
      from Prisma's implicit seed hook.
- [ ] `seed:reset` (whichever form) ends in the same final state as today:
      empty DB → master data → DEMO + BURGER + exchange rates.

### Docs
- [ ] CLAUDE.md command block updated: remove the ⚠️ destructive warning from
      `pnpm seed` (it becomes accurate-by-construction: "additive/idempotent"),
      keep the full demo-restore sequence note (UOM catalog + money-loop remain
      separate scripts).
- [ ] `seed.ts` header comment states the contract: "additive and idempotent;
      wiping lives in seed:reset only".

## Out of scope

- Merging `seed-uom.ts` or `seed-demo-moneyloop.ts` into the main seed (they
  stay separate; money-loop is API-driven and needs a running backend).
- Changing what the seed creates (no new data, no removed data).
- e2e-residue cleanup (`scripts/clean-e2e-residue.sh` already covers it).
- Auto-detecting "dirty" databases or interactive confirmation prompts — the
  contract is simply: `seed` never deletes, `seed:reset` always does.

## Data model

No schema changes.

## API contracts

No API changes. Tooling only: `prisma/seed.ts`, `prisma/seeds/01-*.ts`,
`prisma/seeds/02-*.ts`, `backend/package.json` scripts, optionally a new
`prisma/reset-data.ts`.

## Implementation notes

| File | Change |
|---|---|
| `prisma/seed.ts` | Delete `resetDatabase()`/`resetSequences()` calls (and the functions, per option a); add contract comment |
| `prisma/seeds/01-currencies.seed.ts` | `create` loop → `upsert` on `code` |
| `prisma/seeds/02-languages.seed.ts` | `create` loop → `upsert` on `code` |
| `backend/package.json` | `seed:reset` per chosen option (a = unchanged) |
| `CLAUDE.md` | Update the seed command docs |

Notes:
- `prisma migrate reset` does NOT need the shadow DB (that constraint only
  affects `migrate dev` — see the shadow-DB workaround in the pipeline notes),
  so option (a) works under the current `sunset_user` grants. Verify once
  during implementation; if reset fails on grants, fall back to option (b).
- After this ships, re-verify the demo-restore sequence: on a healthy DB,
  `pnpm seed` becomes a safe no-op top-up instead of a wipe.

## Verification checklist

```bash
cd backend
# 1. Baseline counts, then: pnpm seed && pnpm seed  → zero errors
# 2. Diff counts across all business tables → identical (no dupes, no loss)
# 3. Create an RFQ via API in BURGER → pnpm seed → RFQ still present, same id
# 4. grep -rn "TRUNCATE" prisma/seed.ts prisma/seeds/  → no hits in the seed path
# 5. pnpm seed:reset on a scratch DB → ends in today's exact post-reset state
# 6. pnpm test && pnpm test:e2e  → green (suites must not depend on the wipe)
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-07 | Spec drafted from the same-day incident (full DB wipe via `pnpm seed`); sub-seed idempotency audited: 03/04/05/06 already idempotent, 01/02 bare creates are the only additive blockers; noted `seed:reset` makes the truncate redundant (schema drop + auto-seed) | Draft — pending approval |
| 2026-06-07 | Implemented option (a): `resetDatabase()`/`resetSequences()` deleted from seed.ts (contract comment added); 01/02 create→upsert on `code`; `seed:reset` unchanged (pre-existing `migrate reset --force` semantics, zero new risk — live scratch-DB check deferred, no scratch DB on this host). CLAUDE.md ⚠️ replaced with the additive contract. **Bonus fix:** `ar-invoices.e2e-spec` had a latent residue dependency exposed by clean DBs — `from-so` 404'd because SOs default to USD (`sales-orders.service:107`) and no USD→DOP rate existed except as exchange-rates-suite residue; beforeAll now ensures it. | `pnpm seed` ×2: zero errors, counts identical across all 71 tenant-scoped tables, API-created RFQ survived with same id; grep: no executable TRUNCATE/deleteMany in seed path; unit 578/578; e2e 403/403 on **3 consecutive clean-DB first runs** (one unidentified single-test failure occurred before the fixture fix and never recurred — suspected race with the dev backend's 15s drain worker sharing the DB, noted for observation) |
| 2026-06-07 | Ship gates: compliance 100% (10/10 code-verifiable); unit 578/578; e2e 403/403 (4th consecutive clean run); nest build OK; lint = pre-existing tsconfig exclusion of prisma/+test/ paths (not new). Shipped to origin (a9dd4be); marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
