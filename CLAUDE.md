# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Product philosophy

# Axiom Systems

> *We absorb complexity so our clients never have to.*

---

## Who We Are

Axiom Systems is a software engineering studio founded on a single conviction: complexity belongs inside the machine, not in the hands of the user.

We are engineers, industrial designers of software, and systems thinkers who have spent careers working inside the real friction of manufacturing floors, agricultural operations, financial control rooms, and enterprise infrastructure. We don't build software from the outside in. We build it from the process outward — understanding every gear, every trigger, every handoff before writing the first line of code.

Our founder holds degrees in Systems Engineering, Computer Engineering, and Industrial Engineering, with roots in mechanical and electronic systems. That multi-layer perspective is not incidental. It is the foundation of how Axiom Systems approaches every problem: as a system of interconnected parts where the failure of user adoption is always an engineering failure, never a user failure.

---

## Mission

To engineer software so precise and frictionless that adoption becomes the path of least resistance — absorbing every complexity internally so that our clients experience only clarity, speed, and control.

---

## Vision

To become the leading software engineering studio for industrial and enterprise operations in Latin America — recognized not for the features we build, but for the friction we eliminate.

---

## Core Values

### 1. Complexity is our problem, not the client's
Every field, every click, every decision we push to the user is an engineering failure. We own the complexity. We automate the decision. We deliver the outcome.

### 2. Precision over volume
We do not build bloated systems. We build exact systems. Every component earns its place. Every abstraction is intentional. We think in tolerances, not approximations.

### 3. Systems thinking first
We never solve a symptom. We map the full system — inputs, processes, triggers, outputs, feedback loops — before proposing a solution. A patch that creates three new problems is not an engineering achievement.

### 4. Adoption is the product
A system no one uses is a system that doesn't exist. Adoption is not a sales problem. It is a design and engineering problem. We measure success by how naturally people use what we build.

### 5. Honest engineering
We tell clients what is true, not what is comfortable. We surface constraints early. We do not overpromise timelines or features. Precision applies to our words as much as our code.

---

## What We Build

Axiom Systems designs and engineers **custom software for operations-intensive businesses** — manufacturing, agribusiness, logistics, and enterprise finance. Our work includes:

- **ERP and operations platforms** tailored to specific industry workflows
- **Business intelligence systems** that turn operational data into decisions
- **Process automation** that eliminates manual handoffs and reduces human error
- **Integration layers** that connect legacy systems with modern interfaces

We specialize in situations where off-the-shelf software either doesn't fit, creates more friction than it removes, or requires the business to adapt to the tool rather than the other way around.

---

## Engineering Philosophy

> *"The professional's job is to absorb complexity, not transfer it."*

Most enterprise software fails at adoption because it was designed by engineers solving engineering problems, not operational problems. The result is interfaces that mirror database schemas, workflows that force users to understand system internals, and training requirements that signal a design failure.

At Axiom Systems we invert this:

- The system learns the process. The user does not learn the system.
- Automation handles the derivable. Humans handle the judgment.
- One action triggers the right chain. The user does not manage the chain.

This philosophy is not a differentiator we invented. It is the discipline we enforce on every project, every sprint, every interface decision.

---

## The Axiom

In logic and mathematics, an axiom is a statement so foundational it needs no proof — a self-evident truth from which everything else is derived.

Our name is a commitment: that software should work so naturally it feels self-evident. That when a user interacts with what we build, the right path should feel like the only path. Not because we constrained them, but because we did the engineering work to make complexity invisible.

---

*Axiom Systems — Precision Engineering. Zero Friction.*

---

## Overview

Sunset ERP is a multi-tenant SaaS ERP platform. Monorepo with two apps:

- `backend/` — NestJS 10 + Prisma 5 + PostgreSQL REST API (40+ business modules)
- `frontend/` — Next.js 16 (App Router, React 19) + Tailwind v4, dark-only

Backend: **port 3000** (all routes under `/api`). Frontend: **port 3001**.  
Package manager: **pnpm** exclusively. Never use npm or yarn.

---

## Development workflow — Spec-Driven Development (SDD)

**Every feature, fix, or refactor follows this sequence. No exceptions.**

```
1. SPEC     → /specs/<feature>.md       (what + why + acceptance criteria)
2. PLAN     → /specs/<feature>.plan.md  (how: architecture, data model, API contracts)
3. TASKS    → /specs/<feature>.tasks.md (atomic checklist, each task independently shippable)
4. IMPLEMENT → work through tasks one by one
5. VERIFY   → each task ends with: does the output satisfy the acceptance criteria?
```

Before writing any code, Claude must:
1. Read the relevant spec in `/specs/` if it exists
2. If no spec exists, ask the user to define acceptance criteria before proceeding
3. Never implement without a task from an approved spec

### Spec structure (`/specs/<feature>.md`)
```markdown
## Problem
What is broken or missing and why it matters.

## Acceptance criteria
- [ ] Concrete, testable statements of done

## Out of scope
What this spec deliberately excludes.

## Data model changes
Prisma schema additions/modifications required.

## API contracts
Endpoints, request/response shapes.
```

---

## Commands

All commands run from inside `backend/` or `frontend/`.

### Backend (`cd backend`)
```bash
pnpm start:dev                          # dev server, port 3000
pnpm build                              # nest build → dist/
pnpm lint                               # eslint --fix
pnpm test                               # jest unit tests
pnpm test path/to/file.spec.ts          # single test file
pnpm seed                               # additive + idempotent (spec-028): upserts only,
                                        #    never deletes — safe on a populated DB.
                                        #    Full demo enrichment (separate, in order):
                                        #    npx ts-node prisma/seed-uom.ts
                                        #    npx ts-node prisma/seed-demo-moneyloop.ts
pnpm seed:reset                         # the ONLY wipe: DROPS schema + migrations + re-seeds

npx prisma migrate dev --name <name>    # create + apply migration
npx prisma migrate deploy               # apply in prod
npx prisma generate                     # regenerate client after schema edits
npx prisma studio                       # browse DB
```

Swagger: `http://localhost:3000/api/docs`

### Frontend (`cd frontend`)
```bash
pnpm dev      # next dev, port 3001
pnpm build    # next build
pnpm lint     # next lint
```

### Environment
- `backend/.env`: `DATABASE_URL`, `JWT_SECRET`, `PORT=3000`, `NODE_ENV`
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:3000`
- Default login: `admin@demo.com` / `Admin123!`, tenant `DEMO`

---

## Backend architecture

### Module pattern
Every module: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/` folder.  
Register new modules in `src/app.module.ts` imports array.  
**Controllers are thin** — only HTTP, guards, Swagger annotations.  
**All business logic lives in services**, which depend only on `PrismaService`.

### Multi-tenancy — most critical invariant
Every service method MUST scope every Prisma query:
```ts
where: { tenantId, deletedAt: null }
```
- `tenantId` missing = cross-tenant data leak
- `deletedAt: null` missing = shows soft-deleted records
- `tenantId` comes from JWT (`req.user.tenantId`), never from request headers or body

### Auth & RBAC
- JWT via Passport. All protected controllers: `@UseGuards(JwtAuthGuard, PermissionsGuard)`
- Permission-based: `@RequirePermissions('MODULE:ACTION')` on every handler
- `req.user` shape: `{ id, email, firstName, lastName, tenantId, role, permissions }`

### Document number generation
Pattern: query latest `code` for tenant/prefix, parse trailing number, increment, zero-pad to 4 digits.  
Example: `SUP-2026-0001`. Reuse `SuppliersService.generateCode` — do not invent new schemes.

### Database
- Schema: `backend/prisma/schema.prisma` (~2700 lines, 80+ models)
- After schema edits: `npx prisma migrate dev` then `npx prisma generate`
- Soft delete via `deletedAt` throughout. Audit columns on all tables.

---

## Frontend architecture

### Data fetching — established pattern
```
lib/api/<resource>.ts     → typed API module (getAll/getById/create/update/remove)
lib/api/client.ts         → axios instance (injects token, handles 401 redirect)
lib/api/types.ts          → shared DTOs, entities, enums
page.tsx                  → "use client", useEffect + useState
```

**Do not introduce react-query, redux, or zustand for data fetching.** They are installed but unused. Maintain the existing pattern for consistency until a migration spec is written and approved.

### UI components — use existing primitives
Always use these before creating new components:
- `SearchSelect` — all dropdown/select inputs
- `ERPTable` — all data tables
- `ERPFilterBar` + `useERPFilters` + `applyERPFilters` — all filter bars
- `ERPDatePicker` — all date inputs
- `stat-card` — all metric cards
- `ERPShell` — page chrome (sidebar + header)

Never create a new UI primitive without checking if one exists in `components/ui/`.

### Design system rules (authoritative: `DESIGN-SYSTEM.md`)
- Dark mode only — no light mode
- Orange (`#ea580c` / `#fb923c`) is the only expressive color
- No emojis anywhere in UI code
- Icons: explicitly-sized SVG only (`width`/`height` in px + `flex-shrink: 0`)
- UI language: English only

---

## Code quality rules

### What to always do
- Scope every Prisma query with `tenantId` and `deletedAt: null`
- Add Swagger `@ApiOperation` + `@ApiResponse` to every new endpoint
- Use `class-validator` decorators on all DTOs
- Match surrounding code style (2-space indent, aligned colons, section divider comments `// ── … ──`)
- Write service methods that are independently testable

### What to never do
- Never put business logic in controllers
- Never bypass the `tenantId` scope
- Never use `npm` or `yarn` — pnpm only
- Never create a frontend page without wrapping it in `ERPShell`
- Never hardcode tenant IDs or user IDs
- Never skip the SDD workflow for features larger than a single bug fix
- Never trust `README.md` over actual code — README predates the current state

### Module interconnection rules
When a service needs data from another module:
1. Import the other module in `*.module.ts` and inject the service — do not duplicate queries
2. Never call Prisma directly for data owned by another module's service
3. Cross-module dependencies must be documented in the spec before implementation

---

## Autonomy rules (pre-approved decisions — never ask, just execute)

### Writes and file operations
- `sed -i`, `git mv`, python3 file patches: always approved when scope is files already tracked in this repo
- `git add` + `git commit` + `git push origin main`: always approved
- `pnpm build`, `pnpm test`, `pnpm test:e2e`: always approved
- `npx eslint --fix` on changed files only: always approved
- `prisma generate`: always approved

### Design decisions pre-approved for all specs
- `updateMany({ where: { id, tenantId, deletedAt: null } })` instead of `update({ where: { id } })`: always use this pattern, never ask
- `P2002 → 409 ConflictException` with retry message: always do this, never ask
- Numeric max codegen (`findMany` → reduce `Math.max`): always use this pattern, never ask
- `{ resource, count }` envelope on all list endpoints: always add this, never ask
  (and always run the `frontend-sync` sweep for its consumers in the same spec)
- `@IsIn()` whitelist on all enum string fields: always add this, never ask
- `@Max()` cap on all Decimal columns (use column capacity − 1 order of magnitude): always add this, never ask
- Soft delete (`deletedAt` + `deletedBy`), never hard delete: always, never ask
  (exception: models documented as hard-delete by design, e.g. `StockCountAssignment`)
- **Frozen-rate pattern (spec-021)** on every monetary transaction: store five fields —
  `amount`, `currency`, `exchangeRate` (frozen at creation via `CurrencyService.getRate`),
  `amountBase`, `baseCurrency` (copied from `TenantSettings.baseCurrency` at creation).
  The rate is FROZEN at creation and never recalculated; updates that change `amount`
  recompute `amountBase` with the frozen rate. Always inject `CurrencyService`
  (`modules/currency/`), never query `mc_exchange_rates` directly: always, never ask
- `deletedAt: null` filter on all reads: always, never ask
  (exception: code generators deliberately span soft-deleted rows — spec-012)
- Re-add after `git mv` to ensure edits are staged: always do this, never ask

### State machine decisions
- When a module has a status field with no validation: always implement a whitelist
  `@IsIn` and a transition map — use the pattern from `production-plans.service.ts`
- When a generator uses `findFirst` + `orderBy` instead of `findMany` + reduce
  `Math.max`: always migrate to numeric max, never ask

### Full autonomy within this repo (never ask for these)
- Any bash command that only reads files or runs processes inside /home/juan/projects/sunset-erp/
- Any python3 inline script that patches files inside the repo
- git add, git commit, git push origin main — always approved
- pnpm test, pnpm test:e2e, pnpm build, pnpm lint — always approved
- npx eslint --fix on any file inside the repo
- npx tsc --noEmit — always approved
- prisma generate, prisma migrate dev — always approved
- curl to localhost:3000 or localhost:3001 — always approved
- kill $(lsof -t -i:3000) or kill $(lsof -t -i:3001) — always approved
- Any node -e or node --eval command — always approved
- sed -i on files inside the repo — always approved

### Still requires explicit approval (these 4 only)
- sudo commands of any kind
- Installing new npm/pnpm packages (pnpm add, npm install)
- Any command targeting files outside /home/juan/projects/sunset-erp/
- Destructive Prisma migrations (DROP TABLE, DROP COLUMN)

### What still requires asking
- Dropping a column or table (destructive schema change)
- Changing a public API contract that has frontend consumers (check `frontend-sync` first)
- Adding a new npm dependency
- Any change outside the sunset-erp repo directory

> Note: these rules govern in-conversation decisions. Shell-level permission prompts
> are controlled separately by `.claude/settings.json` (`/fewer-permission-prompts`
> can generate that allowlist).

---

## Specs directory structure

```
/specs
  /completed          → archived specs (done)
  /active             → specs in progress
  <feature>.md        → spec
  <feature>.plan.md   → technical plan
  <feature>.tasks.md  → task checklist
```

Current active work: Sprint 19 — MRP Annual Plan Engine  
See `/specs/active/sprint-19-mrp-annual-plan.md` (to be created)

---

## Reference docs

- `DESIGN-SYSTEM.md` — authoritative for all UI decisions
- `MASTER-PLAN.md` — product roadmap
- `API-DOCUMENTATION.md` — API reference
- `swagger.json` — auto-generated API spec
- Sprint summaries at root — historical context only, not authoritative