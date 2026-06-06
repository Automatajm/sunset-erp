---
description: Safe Prisma schema-change pipeline — create the migration with a descriptive name, regenerate the client, confirm the backend still builds, and detect e2e tests broken by the schema change.
argument-hint: <descriptive-migration-name>
---

Run the Prisma schema-change pipeline for migration name: **$ARGUMENTS**.
Stop at the first failed step and report it — a half-applied schema change is worse
than none. All commands run from `backend/`.

## Step 0 — preflight
- The name must be descriptive kebab/snake case (e.g. `add-lot-tracking-to-stock`,
  not `fix` or `wip`). If `$ARGUMENTS` is empty or vague, derive a descriptive name
  from the actual schema diff (`git diff prisma/schema.prisma`) and confirm it with
  the user before proceeding.
- Confirm there IS a schema change: `git diff --stat prisma/schema.prisma`. If the
  schema is untouched, stop — nothing to migrate.
- Confirm Postgres is reachable (`DATABASE_URL` in `backend/.env`); `migrate dev`
  needs the dev database up.
- Remind: per CLAUDE.md, schema changes belong to an approved spec. If no active
  spec covers this change, say so before continuing.

## Step 1 — create + apply the migration
```bash
cd backend && npx prisma migrate dev --name $ARGUMENTS
```
- This applies to the dev DB and regenerates the client as a side effect. If Prisma
  reports drift or asks to reset, STOP and surface the prompt to the user — never
  auto-confirm a reset (it drops data, including the BURGER demo seed).

## Step 2 — verify the migration artifact
- A new folder exists under `prisma/migrations/<timestamp>_$ARGUMENTS/` containing
  `migration.sql`. Read the SQL and sanity-check it matches the intended change
  (no surprise `DROP TABLE`/`DROP COLUMN` you didn't expect — destructive statements
  get called out to the user explicitly).
- `npx prisma migrate status` reports the database is up to date.

## Step 3 — regenerate the client (explicitly)
```bash
npx prisma generate
```
(Even though migrate dev usually does this, run it explicitly — stale clients cause
phantom type errors.)

## Step 4 — backend still builds
```bash
pnpm build
```
A type error here usually means service code references a renamed/removed field —
list each error with its `file:line` and whether it belongs to the spec being
implemented or is collateral.

## Step 5 — e2e blast-radius check
Schema changes silently break e2e suites (new required columns, changed uniques,
renamed fields). Detect, don't assume:
1. Map the changed models to their owning modules (grep `@@map` of the touched
   models → `backend/src/modules/<module>/`).
2. Run the unit + e2e suites for those modules first:
   `pnpm test <module>` and `pnpm test:e2e <module>`.
3. Then the full e2e suite (`pnpm test:e2e`) if Postgres/Redis/seed are available —
   cross-module FKs mean the blast radius is often wider than the touched models
   (e.g. a `Stock` change breaks reconciliation and supplier-items suites).
4. Report every red test with: suite, test name, and whether the failure is the
   schema change (fix the test/code) or a pre-existing issue (say so explicitly).

## Report
```
# Migration: <timestamp>_$ARGUMENTS

- Schema delta: <models touched, +cols/−cols/uniques>
- migration.sql: <N statements, destructive: none|LISTED>
- prisma generate: OK
- Backend build: OK | N errors (listed)
- Tests: <module suites run + full e2e result>; broken by this change: <list or none>
- Follow-ups: <spec checkbox to flip, seed updates needed, frontend-sync if any
  response shape changed>
```
Never declare the migration done with red tests left unexplained.
