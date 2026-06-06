# AGENTS.md — Sunset ERP, 2-minute orientation

> For any new Claude Code session (or human) landing in this repo. Deeper rules live in
> `CLAUDE.md` (binding conventions) and `DESIGN-SYSTEM.md` (binding UI rules) — this file
> is the map. Last updated: 2026-06-06.

## What this is

**Sunset ERP** — a multi-tenant SaaS ERP for operations-intensive businesses
(manufacturing, agribusiness, logistics, finance), built by **Axiom Systems**
("complexity belongs inside the machine, not in the hands of the user" — every field,
click, or decision pushed to the user is an engineering failure; read the philosophy
header in `CLAUDE.md`). Monorepo:

- `backend/` — NestJS 10 + Prisma 5 + PostgreSQL. ~38 business modules under
  `src/modules/`, schema at `prisma/schema.prisma` (~2700 lines, 80+ models).
- `frontend/` — Next.js 16 (App Router, React 19) + Tailwind v4, dark-only, 49 pages.

## Stack & ports

| Thing | Where |
|---|---|
| Backend API | `:3000`, all routes under `/api`, Swagger at `/api/docs` |
| Frontend | `:3001` |
| PostgreSQL | `:5432` (`backend/.env` → `DATABASE_URL`) |
| Redis | `:6379` (permission cache, fail-open — auth works without it) |
| Package manager | **pnpm only** — never npm/yarn |

## Start everything

```bash
sudo service postgresql start && sudo service redis-server start   # (or your equivalents)
cd backend  && pnpm start:dev      # :3000
cd frontend && pnpm dev            # :3001
```

First-time / reset data:
```bash
cd backend
pnpm seed                          # base seed (tenants, admin, permissions)
npx ts-node prisma/seed-uom.ts     # UOM catalog (NOT in pnpm seed — uom e2e 404s without it)
```

## Logins

- **Demo data lives in the BURGER tenant**: `admin@burger.do` / `Admin123!`
  (Burger Borinquen themed seed; the DEMO tenant is empty by design).
- `admin@demo.com` / `Admin123!` is **multi-tenant** — login returns
  `requiresTenantSelection: true`, then `POST /api/auth/select-tenant`.
- E2e suites also need `tenant2admin@demo.com` (TENANT2) for cross-tenant isolation
  tests, and they leave `E2E`-prefixed residue in the DB (harmless).

## The SDD pipeline (no code without a spec — CLAUDE.md is strict about this)

```
/new-spec <module>     → opportunity-finder audit → spec-generator → test-writer
                         (spec lands in specs/active/, tests are RED [GAP] scaffolding)
implement the [ ] gaps → make the GAP tests green, flip the spec checkboxes
/ship-spec <NNN>       → spec-reviewer (must be 100%) → tests → build → lint →
                         commit → push → archive to specs/completed/ + update cascade
```

**Spec order is dictated by `specs/MODULE-CASCADE.md`** (topological: dependencies
first; the "Recommended spec order" list at the bottom marks `← next`). Never spec a
module before its dependencies.

## Progress: 18/38 backend modules specced (specs 001–018, all shipped at 100%)

`auth` (001) · `suppliers` (002) · `items` (003) · `warehouses` (004) · `uom` (005) ·
`macro-categories` (006) · `chart-of-accounts` (007) · `consumption-groups` (008) ·
`categories` (009) · `work-centers` (010) · `bom` (011) · auto-codes cross-cutting
(012) · `customers` (013) · `warehouse-locations` (014) · `journal-entries` (015) ·
`stock-transactions` (016) · `stock-reconciliation` (017) · `supplier-items` (018)

**Next:** the **Production cluster** — `sales-orders` ↔ `production-plans` (cyclic,
spec as ONE unit; `/new-spec` is single-module, adapt). Then: procurement cluster
(`purchase-orders ↔ rfqs ↔ purchase-requisitions ↔ general-needs`), `goods-receipts`,
`production-orders`, `ar-invoices`, `ap-invoices`, and the admin Tier 0s
(`tenants`/`users`/`roles`/`automation`/`fiscal-periods`/`bulk-import`).

Frontend: `specs/active/spec-frontend-001..003` — 003 is the 49-page audit matrix and
the P0–P4 roadmap for 002 (data components + modal system). **Backend specs come first**
(user decision 2026-06-06); frontend P1 starts only when the user says so.

## Conventions every spec since 013 enforces (copy them forward)

- **Tenant scoping**: every read `where: { tenantId, deletedAt: null }`; every write
  **tenant-scoped at the write itself** — `updateMany({ where: { id, tenantId, deletedAt: null } })`
  + re-fetch, never `update({ where: { id } })` after a scoped read.
- **List envelopes**: list endpoints return `{ <resource>: [...], count }` — and every
  envelope change MUST be chased into the frontend (run the `frontend-sync` skill; the
  suppliers/items incident silently emptied tables on 200s).
- **Codes are system-assigned and immutable** (spec-012): `PREFIX-YYYY-NNNN` via
  numeric-max scan that deliberately **spans soft-deleted rows**; client-supplied codes → 400.
- **P2002 → 409**: unique-index races map to `ConflictException`, never a 500.
- **Soft deletes** everywhere (`deletedAt`/`deletedBy`); ledger models (`StockMovement`,
  `Stock`) have NO `deletedAt` by design (immutable).
- **DTO caps**: `@Max` per actual Decimal column capacity (e.g. `Decimal(15,4)` < 1e11);
  `@IsIn` whitelists for every closed string set; query DTOs on GET filters.
- **Tests**: `[GAP]`-tagged tests encode unchecked criteria (red → green);
  unit = mocked Prisma in `src/modules/<m>/<m>.service.spec.ts`,
  e2e = real DB in `test/<m>.e2e-spec.ts`.
- Gotcha: in this environment, *edit file → `git mv` → commit* stages the **pre-edit**
  blob (100% rename) — after `git mv`, re-`git add` the new path (bit ship-spec twice).

## Skills (`.claude/skills/`) and commands (`.claude/commands/`)

| Skill | Does |
|---|---|
| `opportunity-finder` | Scores unspecced modules by tenant-scoping/DTO/error gaps with file:line evidence |
| `spec-generator` | Reverse-engineers a module into a gold-standard spec (mirrors spec-001) |
| `test-writer` | Writes the unit + e2e suites from a spec ([GAP] = red until implemented) |
| `spec-reviewer` | Audits code vs spec → compliance % with file:line (ship gate) |
| `frontend-component-builder` | Builds React components per project conventions (inline hex styles, ERP primitives, apiClient) |
| `frontend-sync` | After a contract change: finds every frontend consumer, old/new shape, exact fix |
| `ux-reviewer` | Audits a page against the Axiom philosophy → friction score 0–10 |
| `browser-qa-agent` | Real-browser QA of all modules (needs Claude for Chrome) |
| `demo-seed-generator` | Themed, numerically-coherent demo seeds (e.g. Burger Borinquen) |

| Command | Does |
|---|---|
| `/new-spec <module>` | Full spec-creation pipeline (audit → spec → tests) |
| `/ship-spec <NNN>` | Gated ship pipeline (compliance → tests → build → commit → archive) |
| `/release-check` | GO / NO-GO readiness verdict for a demo or release |
| `/new-migration <name>` | Safe Prisma schema-change pipeline |

## Key files

- `CLAUDE.md` — binding conventions (read it; it overrides defaults)
- `specs/MODULE-CASCADE.md` — what to spec next, single source of truth
- `specs/completed/spec-001-foundation-auth.md` — the gold-standard spec format
- `DESIGN-SYSTEM.md` — binding UI rules (dark-only, orange-only accent, no emojis)
- `specs/active/spec-frontend-003-page-inventory.md` — frontend state of the world
