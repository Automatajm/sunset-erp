---
name: browser-qa-agent
description: Drive systematic QA of Sunset ERP through a real browser (Claude for Chrome) — login, navigate every module, verify themed demo-seed data appears correctly (quantities, prices, BOM, margins), run CRUD + error-path functional scripts per module, watch the console/network for JS errors and failed API calls, and produce a structured PASS/FAIL/WARNING/UNVERIFIABLE report. Use when the user wants browser-level QA, UI smoke testing, demo-data visual verification, or pre-demo signoff (e.g. "QA the app", "verify the Burger Borinquen seed in the UI", "test all modules in the browser").
---

# Browser QA Agent

Systematic, evidence-based QA of Sunset ERP through a real Chrome session. Two modes —
**themed data verification** (does the seeded business story render correctly?) and
**functional CRUD testing** (does every module work?). Both end in one structured report.

The Axiom rule governs every check: **report what is broken with precision, never
guess.** A value you could not visually confirm is `UNVERIFIABLE`, never an assumed
`PASS`. A page that "looks fine" but logged a console error is a `WARNING`, not a pass.

## Prerequisites (check ALL before starting; stop and report any missing)

1. **Claude for Chrome** extension available (browser tools respond). If not, stop:
   this skill cannot degrade to curl — it tests the UI, not the API.
2. **Backend** on `http://localhost:3000` — `curl -s localhost:3000/api/docs` responds.
3. **Frontend** on `http://localhost:3001` — `curl -s -o /dev/null -w "%{http_code}" localhost:3001` → 200.
4. **Demo seed loaded** — if running themed mode, the theme's seed
   (`backend/prisma/seeds/NN-demo-<theme>.seed.ts`) must have been run. Verify via API:
   login and `GET /api/items` for a known seeded code before burning browser time.
5. **Both tenants seeded** — `DEMO` and `TENANT2` (cross-tenant spot checks).
6. Credentials: default `admin@demo.com` / `Admin123!` (tenant `DEMO`); themed tenants
   use their own admin (e.g. `admin@burger.do`). Ask the user if the theme implies a
   different login.

## Phase 0 — Setup & baseline

1. Open `http://localhost:3001/login`, log in with the provided credentials.
2. Verify the dashboard (`/`) loads: KPI cards render with numbers (not `NaN`, not
   skeletons stuck forever, not blank).
3. **Capture the console baseline BEFORE testing**: read the browser console now.
   Pre-existing errors at login are recorded separately so they are not mis-attributed
   to a module navigated later.
4. Record: app version (git SHA if shown), tenant, user, timestamp.

## Phase 1 — Themed data verification mode

Given a theme (e.g. **Burger Borinquen**), read its seed file first —
`backend/prisma/seeds/NN-demo-<theme>.seed.ts` — and extract the `SCENARIO` block plus
the verification numbers printed at the end. Those are the expected values; the UI is
the actual. Never re-derive expectations from memory.

Walk these pages (real routes):

| Page | Verify |
|---|---|
| `/inventory/macro-categories`, `/inventory/categories`, `/inventory/consumption-groups` | every seeded classification row appears, counts match |
| `/settings/uom` | recipe units exist with correct conversion factors |
| `/inventory/items` | search **each ingredient by code**: quantity fields, 3-UOM setup (purchase/storage/consumption), category assignment. Search each finished SKU: sales price (Classic RD$185 …) |
| `/procurement/suppliers` | every seeded supplier listed; open one → its price list (supplier-items) loads with RD$ prices |
| `/inventory/warehouses`, `/inventory/stock-balance` | stock levels match expected seed quantities |
| `/manufacturing/bom` + `/manufacturing/boms` | per SKU: component list and gram quantities match the recipe exactly (85 g bun, 150 g patty, …), scrap % present |
| `/sales/customers` | seeded customers with credit terms |
| `/sales/sales-orders` | spot-check 3 orders: line totals = qty × unit price; order total = Σ lines |
| `/accounting/journal-entries` | sales/purchase entries exist and balance |
| `/accounting/reports` | **P&L gross margin within 1 percentage point of expected** (e.g. ~35%); revenue ≈ units × price mix |
| `/accounting/budgets` | budget rows align with the production plan (+20%/+20% years) |

For every numeric check, record `expected | actual | verdict`. If the UI truncates,
paginates past, or formats a value so it cannot be read precisely → `UNVERIFIABLE`
with the reason ("list paginates at 50, item not on visible pages").

## Phase 2 — Functional test mode (CRUD per module)

For each module the user scopes (default: items, suppliers, customers,
macro-categories, categories, warehouses, sales-orders, purchase-orders,
journal-entries), execute the standard script. Use a `QA-` prefix on every code/name
you create so test residue is identifiable and cleanable.

1. **CREATE** — open the create modal/form, fill valid data, submit. Verify: success
   feedback appears, the network call returned **201**, no console error.
2. **READ** — the new record appears in the list (search by its `QA-` code).
3. **UPDATE** — edit one field, save. Re-open the record: the change persisted
   (re-read from the list/detail, not from the still-open form).
4. **DELETE** — soft-delete it. Verify it disappears from the list AND a direct
   re-search does not find it.
5. **ERROR PATH** — submit the empty form. Verify validation errors render in-place
   (field messages or error state) and the app does **not** crash, blank, or
   `alert()`. A raw 400 with no UI feedback is a FAIL of the error path.

Module-specific extras when in scope:
- **items**: create with duplicate code → expect a visible 409/conflict message.
- **macro-categories**: delete one that has child categories → expect the blocked
  message ("Cannot delete: N categories…"), not a silent failure.
- **sales-orders**: line math re-checks after edit (qty change updates totals live).

## Phase 3 — Error detection (continuous, after EVERY navigation)

After each page load or major action:
1. **Console** — new `TypeError`, `ReferenceError`, unhandled rejections, React
   hydration warnings. Record file, line, message. Diff against the Phase-0 baseline.
2. **Network** — any 4xx/5xx API response. Record method, endpoint, status. A 401
   that bounces to login mid-session is a FAIL (token handling).
3. **Blank-content detection** — the page rendered chrome (sidebar/header via
   `ERPShell`) but the data area is empty with NO empty-state message → FAIL
   ("blank instead of data or empty state"). An intentional empty state with copy is a
   PASS.
4. Screenshot anything anomalous immediately (state is transient); reference the
   screenshot in the finding.

## Phase 4 — Report

Produce one structured report:

```markdown
# Browser QA report — <date> <theme/mode> (tenant <X>, <git sha>)

## Summary
| Module | Verdict | Notes |
|---|---|---|
| Items | PASS | 24/24 ingredients verified |
| BOM | FAIL | BBQ Bacon missing bacon component (expected 30 g) |
| Reports | WARNING | margin 34.2% (expected 35% ±1pp) but console TypeError on tab switch |
| Stock balance | UNVERIFIABLE | valuation column renders "—" for all rows |

## Bugs found
### BUG-1 — <one-line title>
- Page: /manufacturing/bom · Action: opened BBQ Bacon SKU
- Expected: 9 components incl. bacon 30 g · Actual: 8 components, no bacon
- Evidence: screenshot <desc>, network GET /api/bom/<id> → 200 (so data, not UI)

## Console errors (new vs baseline)
| Page | File:line | Message |

## Failed API calls
| Page | Method + endpoint | Status |

## Data consistency
| Check | Expected | Actual | Verdict |
| Daily revenue Y1 | RD$36,470 (175 × RD$208.4 mix) | RD$36,470 | PASS |

## Pre-existing (baseline) issues
<console errors present at login, before any test>
```

Verdict rules:
- **PASS** — visually confirmed, zero new console/network errors on that page.
- **WARNING** — works but with non-blocking anomalies (console noise, slow load,
  cosmetic mismatch).
- **FAIL** — wrong data, broken action, crash, blank content, or unhandled error.
- **UNVERIFIABLE** — could not confirm; always state WHY and what would make it
  verifiable. Never silently upgrade to PASS.

## Rules

- Evidence per claim: every FAIL cites what was seen (screenshot description, console
  text, network status). Every data verdict cites expected vs actual.
- Distinguish data bugs from UI bugs: if the UI shows wrong data, check the network
  response — payload wrong → backend/seed bug; payload right → frontend bug. Say which.
- Do not fix anything mid-run; this skill observes and reports. Offer the fix list at
  the end (bugs feed `/new-spec` or direct fixes as the user chooses).
- Do not delete or edit seeded records — functional tests operate only on `QA-`-prefixed
  records created during the run. Note any `QA-` residue left behind (failed deletes).
- Tenant discipline: run in the tenant the user names. If a record from another tenant
  ever appears in a list, that is a CRITICAL finding — report immediately and stop the
  run (data-leak evidence preservation).
- English in the report; cite routes exactly as listed above.
