# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

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
pnpm seed                               # prisma db seed
pnpm seed:reset                         # DROPS data + re-seeds

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