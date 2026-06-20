# spec-ux-foundation — UX Foundation & Frontend Reconstruction Roadmap

> Status: **Draft (awaiting review)**
> Author: audit run 2026-06-20
> Scope: all 52 pages in `frontend/app/`, all 38 components in `frontend/components/`

## Problem

The frontend grew page-by-page without a shared visual foundation. The result is
measurable design debt that blocks adoption (Axiom value #4 — *adoption is the product*):

- **2,568 hardcoded hex color literals** (2,352 in `app/`, 216 in `components/`) and
  **zero** `var(--token)` usages. There is no semantic color layer — every page hardcodes
  the palette inline, so a theme change is a 2,568-site find-and-replace.
- **34 of 52 pages** still use raw `<select>` instead of `SearchSelect`.
- **17 pages** hand-roll their list table instead of using `ERPTable`.
- **31 files** contain pictographic emoji (💰🏭⚙️🔒📷📱👥📋🏆💡⚠★⚖), violating the
  no-emoji design rule.
- **5 pages** do not wrap their content in `ERPShell` (2 of them — `settings/roles`,
  `settings/users` — are core settings pages that should).
- **1 page** (`procurement/purchase-requisitions`) still fires a native `alert()`.

Good news, established by this audit: the **component library already exists and is strong**
(`ERPShell`, `ERPTable`, `ERPFilterBar`, `ERPTreeTable`, `SearchSelect`, the modal system,
`PrintButton`, `ERPDatePicker`). The work is **not** to build primitives — it is to (a) ship
the missing color-token layer and (b) drive consistent adoption of primitives that exist.

## Acceptance criteria

- [ ] A semantic CSS-variable token system exists in `app/globals.css` (`:root` / `.dark`),
      covering background, surface, border, text, and accent roles.
- [ ] `tailwind`/inline usage references tokens; **net-new code adds zero hardcoded hex**.
- [ ] A documented, enforced standard exists for each page type (list / detail / report / settings).
- [ ] Every page wraps in `ERPShell` (except `login` and the mobile count screen, documented exceptions).
- [ ] No raw `<select>` on FK fields — all replaced by `SearchSelect`.
- [ ] No pictographic emoji in any `app/` or `components/` file.
- [ ] No native `confirm()`/`alert()` — all destructive actions use `ConfirmModal`, all
      feedback uses inline `ErrorState`/toast.
- [ ] Every operational module exposes both an **automatic** and a **manual** entry path
      (see §Automation + manual fallback).
- [ ] The reconstruction roadmap (§Roadmap) is executed in operational-flow order.

## Out of scope

- Light mode is **not** shipped now (project is dark-only per `DESIGN-SYSTEM.md`). The token
  system is *structured* to allow a future light theme, but only dark values are populated.
- No data-fetching migration (react-query/redux/zustand stay unused per CLAUDE.md).
- No backend changes — this is a frontend-only foundation spec.
- Replacing Tremor's chart token set (`--tremor-*` in globals.css) — left as-is for charts.

---

## Visual foundation

### De-facto palette (measured from the 25 most-used literals)

| Count | Literal     | Current role                              | → Token                 |
|------:|-------------|-------------------------------------------|-------------------------|
|   313 | `#fb923c`   | orange-400, accent highlight/hover        | `--accent-strong`       |
|   304 | `#4ade80`   | green-400, success                        | `--success`             |
|   263 | `#f87171`   | red-400, danger                           | `--danger`              |
|   246 | `#e2dfd8`   | warm off-white, primary text              | `--text-primary`        |
|   201 | `#f1ede8`   | lighter warm white, headings              | `--text-strong`         |
|   186 | `#60a5fa`   | blue-400, info / links                    | `--accent-blue`         |
|   172 | `#fbbf24`   | amber-400, warning                        | `--warning`             |
|   120 | `#0e0b1a`   | dark purple-black, surface                | `--surface`             |
|   104 | `#fca5a5`   | red-300, danger-subtle text               | `--danger-subtle`       |
|    95 | `#a78bfa`   | violet-400, secondary accent              | `--accent-violet`       |
|    80 | `#c2410c`   | orange-700, accent pressed                | `--accent-pressed`      |
|    78 | `#f97316`   | orange-500, accent                        | `--accent`              |
|    70 | `#ea580c`   | orange-600, **brand primary**             | `--accent` (canonical)  |
|    19 | `#0a0712`   | darkest, page background                  | `--bg`                  |
|    17 | `#6b7280`   | gray-500, secondary text                  | `--text-secondary`      |

### Token system (target — `app/globals.css`)

```css
:root, .dark {
  /* surfaces */
  --bg:               #0a0712;   /* page background          */
  --surface:          #0e0b1a;   /* cards, table, modal body */
  --surface-raised:   #15101f;   /* hover rows, popovers     */
  --border:           #2a2535;   /* hairlines, dividers      */
  --border-strong:    #3a3447;   /* input borders, focus     */

  /* text */
  --text-strong:      #f1ede8;   /* headings                 */
  --text-primary:     #e2dfd8;   /* body                     */
  --text-secondary:   #9b96a3;   /* labels, captions         */
  --text-muted:       #6b7280;   /* disabled, placeholder    */

  /* accent — orange is the ONLY expressive brand color */
  --accent:           #ea580c;
  --accent-strong:    #fb923c;   /* hover / highlight        */
  --accent-pressed:   #c2410c;   /* active                   */

  /* semantic status */
  --success:          #4ade80;
  --warning:          #fbbf24;
  --danger:           #f87171;
  --danger-subtle:    #fca5a5;
  --accent-blue:      #60a5fa;   /* info / neutral data viz  */
  --accent-violet:    #a78bfa;   /* secondary categorical    */
}
```

### Typography scale

| Token            | Size / weight        | Use                          |
|------------------|----------------------|------------------------------|
| `--text-page`    | 20px / 600           | page title (ERPShell header) |
| `--text-section` | 15px / 600           | card / section headings      |
| `--text-body`    | 13px / 400           | table cells, body            |
| `--text-label`   | 12px / 500 / 0.02em  | field labels, captions       |
| `--text-mono`    | 12px ui-monospace    | codes, IDs, amounts          |

Font family: system stack already in `globals.css` — no change.

### Spacing & radius scale

- Spacing: `4 / 8 / 12 / 16 / 24 / 32` (px) — already the de-facto rhythm; tokenize as
  `--space-1..6`.
- Radius: `--radius-sm: 6px` (inputs/buttons), `--radius: 10px` (cards/modals),
  `--radius-lg: 14px` (page panels).

---

## Component standards (what exists + gaps)

All primitives **already exist**. Standard = "use it, don't hand-roll".

| Component               | Status   | Standard / gap                                                        |
|-------------------------|----------|-----------------------------------------------------------------------|
| `ERPShell`              | exists   | **Mandatory wrapper.** 5 pages bypass it; 2 must be fixed (roles, users). |
| `ERPTable`              | exists   | Standard list table. 17 pages hand-roll — migrate.                    |
| `ERPFilterBar` + `useERPFilters` + `applyERPFilters` | exists | Standard filter bar; never pass `filters` to `ERPTable`. |
| `ERPTreeTable`          | exists   | Hierarchies: warehouse locations, BOM, **chart-of-accounts (gap — hand-rolled)**. |
| `FormModal` / `ModalShell` / `DetailModal` + `useModal` | exists | Standard form/wizard/detail. Most CRUD pages hand-roll forms. |
| `ConfirmModal`          | exists   | All destructive actions. 17/17 known guards done (spec-frontend-003); audit found 1 native `alert()` remaining. |
| `SearchSelect`          | exists   | All FK dropdowns. **34 pages still use raw `<select>`** — largest single gap. |
| `PrintButton`           | exists   | All printable documents — coverage good in procurement/sales/manufacturing. |
| `ERPDatePicker`         | exists   | All date inputs. Only 3 pages adopted; others use raw `<input type=date>`. |
| `stat-card`             | exists   | All metric cards.                                                     |
| `ErrorState`            | exists   | Inline error panel (spec-frontend-002 §5). Wire into all list pages.  |

---

## Page patterns (the standard flow per type)

- **List page** — `ERPShell` → `ERPFilterBar` (`useERPFilters`/`applyERPFilters`) →
  `ERPTable` → row actions (`SearchSelect` for inline FKs) → create/edit via `FormModal` →
  delete via `ConfirmModal` → `ErrorState` on fetch failure.
- **Detail page** — `ERPShell` → breadcrumb → `DetailModal`/detail panel → related lists
  (`ERPTable`) → document actions (`PrintButton`, `ConfirmModal`).
- **Report page** — `ERPShell` → `ERPFilterBar` (+ `ERPDatePicker`) → `stat-card` row →
  `ERPTable` or chart. No forms/confirms.
- **Settings page** — `ERPShell` → form sections → `SearchSelect`/inputs → save (inline
  feedback, no native alert).

---

## Automation + manual fallback standard

Every operational flow must offer **both**: an automatic path (system proposes the document)
and a manual path (user creates from scratch). Current state:

| Flow                         | Automatic path                                  | Manual path        | Gap |
|------------------------------|-------------------------------------------------|--------------------|-----|
| Purchase Requisition         | MRP / stock-planning → suggested PR             | manual PR create   | ok  |
| RFQ                          | from PR                                          | manual RFQ         | ok  |
| Purchase Order               | from RFQ / accepted quote                        | manual PO          | ok  |
| Goods Receipt                | from PO                                           | manual GRN         | ok  |
| AP Invoice                   | from GRN/PO (3-way match)                         | manual AP          | ok  |
| Production Plan → Orders     | MRP annual plan → proposed orders                | manual PO create   | ok  |
| Journal Entries              | automation/je-queue (system-proposed)            | manual JE          | ok  |
| Sales Order → AR Invoice     | from SO                                           | manual AR          | ok  |
| Stock reconciliation         | scheduled count → variance JE                    | manual count       | ok  |
| **General needs → PR**       | aggregate needs → PR                              | manual need        | verify aggregation path |
| **Budgets**                  | (none — manual only)                              | manual             | **add: roll-forward from prior period** |
| **Stock planning → PR**      | reorder-point proposal                            | n/a                | verify proposal commits to a real PR |

Action: confirm each "verify" path end-to-end; add the budget roll-forward automation.

---

## Operational flow map (reconstruction order)

Order is driven by **business dependency** (upstream master data before downstream documents):

1. **Foundation** — this spec (tokens, standards).
2. **Master data** — Items → MacroCategories → Categories → ConsumptionGroups → UOM →
   Warehouses → WorkCenters.
3. **Procurement** — Suppliers → SupplierItems → PRs → RFQs → POs → GRNs.
4. **Manufacturing** — BOMs → ProductionPlans → ProductionOrders.
5. **Sales** — Customers → SalesOrders → AR Invoices.
6. **Finance** — ChartOfAccounts → JournalEntries → AP Invoices → Budgets → CashFlow →
   Reports → FiscalPeriods.
7. **Config** — Tenants → Users → Roles → Settings → BulkImport.

---

## Audit results — per-page scores

Scoring (0–5): 5 = full compliance incl. no hardcoded colors; 4 = 1–2 minor gaps;
3 = 3–4 gaps; 2 = 5+ gaps or hand-rolled table/modal; 1 = minimal adoption / no shell;
0 = placeholder or broken.

> **Key finding: no page scores 5.** The universal blocker is the missing color-token layer —
> every page carries hardcoded hex, so all are capped at 4 until §Visual-foundation ships.
> Distribution: **4→7 pages, 3→24, 2→17, 1→4, 0→0.**

### Tier 2 — Master data

| Page | Backend module | Score | Gaps |
|------|----------------|:----:|------|
| inventory/items | items (+8 modules) | 3 | colors; 2 raw `<select>`; emoji (🔒⚠); 77 hex |
| inventory/macro-categories | macro-categories | 2 | colors; hand-rolled table + form |
| inventory/categories | categories | 2 | colors; hand-rolled table + form; 2 raw select |
| inventory/consumption-groups | consumption-groups | 3 | colors; emoji (⚠) — otherwise strong (table+filter+SearchSelect) |
| settings/uom | uom | 2 | colors; hand-rolled table; 4 raw select; emoji |
| inventory/warehouses | warehouses + locations | 3 | colors; 2 raw select; emoji (⚖); TreeTable adopted |
| manufacturing/work-centers | work-centers | 2 | colors; hand-rolled small list; 1 raw select |

### Tier 3 — Procurement

| Page | Backend module | Score | Gaps |
|------|----------------|:----:|------|
| procurement/suppliers | suppliers | 2 | colors; **7 raw select** (most); no SearchSelect/FormModal; emoji |
| procurement/supplier-items | supplier-items | 3 | colors; 3 raw select; emoji (★); all-direct client calls |
| procurement/purchase-requisitions | purchase-requisitions | 2 | colors; **native `alert()`** (line 137); 4 raw select; emoji |
| procurement/rfqs | rfqs | 3 | colors; 4 raw select; emoji (🏆) |
| procurement/purchase-orders | purchase-orders | 3 | colors; 4 raw select |
| procurement/goods-receipts | goods-receipts | 3 | colors; 2 raw select; emoji — very high adoption otherwise |
| procurement/ap-invoices | ap-invoices | 3 | colors; **5 raw select**; emoji (⚠📋); 90 hex |
| procurement/general-needs | general-needs | 3 | colors; 4 raw select; emoji |

### Tier 4 — Manufacturing

| Page | Backend module | Score | Gaps |
|------|----------------|:----:|------|
| manufacturing/bom | bom | 4 | colors; 1 raw select — TreeTable + SearchSelect + Confirm adopted |
| manufacturing/boms | bom | 4 | colors; 1 raw select — strong adoption |
| manufacturing/production-plans | production-plans | 3 | colors; 4 raw select; 82 hex |
| manufacturing/production-orders | production-orders | 2 | colors; hand-rolled table; 3 raw select; emoji; **104 hex (most)** |

### Tier 5 — Sales

| Page | Backend module | Score | Gaps |
|------|----------------|:----:|------|
| sales/customers | customers | 2 | colors; hand-rolled table + form; 2 raw select |
| sales/sales-orders | sales-orders | 2 | colors; hand-rolled table + form; 4 raw select |
| sales/invoices | ar-invoices | 2 | colors; hand-rolled table; 4 raw select; 63 hex |

### Tier 6 — Finance

| Page | Backend module | Score | Gaps |
|------|----------------|:----:|------|
| accounting/chart-of-accounts | chart-of-accounts | 2 | colors; **hierarchy hand-rolled (should be ERPTreeTable)**; 4 raw select |
| accounting/journal-entries | journal-entries | 2 | colors; hand-rolled table + form; 3 raw select; emoji |
| accounting/je-queue | automation | 2 | colors; hand-rolled queue list; emoji; 1 raw select |
| accounting/automation | automation | 3 | colors; emoji — automation hub |
| accounting/ap (see procurement) | — | — | — |
| accounting/budgets | budgets | 2 | colors; hand-rolled table; 3 raw select; no FormModal/SearchSelect |
| accounting/cash-flow | cash-flow | 3 | colors; 2 raw select — viz/report |
| accounting/reports | financial-reports | 3 | colors; emoji — statements legit hand-rolled; 68 hex |
| accounting/fiscal-periods | fiscal-periods | 2 | colors; hand-rolled table; 4 raw select |

### Tier 7 — Config

| Page | Backend module | Score | Gaps |
|------|----------------|:----:|------|
| settings/tenants | tenants/users (direct) | 2 | colors; hand-rolled table; emoji; 1 raw select |
| settings/users | roles/users (direct) | 1 | colors; **no ERPShell**; hand-rolled table |
| settings/roles | roles (direct) | 1 | colors; **no ERPShell**; hand-rolled |
| settings/general | tenant-settings, uom | 3 | colors; emoji — SearchSelect adopted |
| settings/notifications | errors, notifications | 4 | colors only — clean ERPTable + filter |
| settings/bulk-import | client (direct) | 3 | colors; emoji; 73 hex — wizard |

### Cross-cutting (dashboard / reports / utility / auth)

| Page | Backend module | Score | Gaps |
|------|----------------|:----:|------|
| app/page.tsx (dashboard) | reports, SO, PO, cash-flow, budgets | 3 | colors; 56 hex — charts, complex |
| inventory/abc-analysis | stock-transactions | 3 | colors; 2 raw select; emoji (💡) |
| inventory/inventory-turnover | stock-transactions | 3 | colors; 2 raw select — DatePicker adopted |
| inventory/slow-moving | stock-transactions | 4 | colors only — strong report |
| inventory/stock-aging | stock-transactions | 3 | colors; emoji (⚠) |
| inventory/stock-balance | stock-transactions | 2 | colors; hand-rolled; 2 raw select; **heavy emoji (💰🏭⚙️⚠)** |
| inventory/stock-planning | stock-transactions | 3 | colors; emoji (⚠) — TreeTable adopted |
| inventory/valuation | stock-transactions | 3 | colors; emoji (💰) — strong table |
| inventory/ledger | stock-transactions | 4 | colors only — table + filter clean |
| inventory/stock-transactions | stock-transactions | 3 | colors; 4 raw select — FormModal + Print adopted |
| inventory/stock-reconciliation | (direct) | 4 | colors; 1 raw select — table + filter |
| inventory/stock-reconciliation/[id] | (direct) | 3 | colors; emoji (📱👥); 1 raw select — detail |
| inventory/stock-reconciliation/[id]/count | (direct) | 1 | colors; **no ERPShell** (mobile count); emoji (📷) — documented exception |
| inventory/labels | client (direct) | 1 | colors; **no ERPShell**; raw layout |
| login | auth (direct) | 3 | colors; emoji — no ERPShell (auth, documented exception) |
| print/[doc]/[id] | (print host) | 4 | near-zero hex (2); print renderer — exempt |

---

## Roadmap (prioritized backlog)

Sort: operational-flow order first, then **score ascending (worst first)** within each tier.
Complexity: S ≤ 1 file/simple, M = table+form migration, L = hierarchy/complex page.
Every item also inherits **Dep: F0** (token system) for the color portion.

**F0 — Foundation (do first, unblocks "no hardcoded colors" everywhere)**
- Ship token system in `globals.css`; codemod top-15 literals → tokens. Complexity **L**. Dep: none.
- Remove all 31 emoji files' pictographs; replace `alert()` in purchase-requisitions. **M**. Dep: none.

**Tier 2 — Master data**
| # | Module | Score | Fix | Cx | Dep |
|--|--------|:----:|-----|----|-----|
| 1 | settings/uom | 2 | ERPTable; SearchSelect×4; de-emoji | M | F0 |
| 2 | macro-categories | 2 | ERPTable + FormModal | M | F0 |
| 3 | categories | 2 | ERPTable + FormModal; SearchSelect×2 | M | F0, #2 |
| 4 | work-centers | 2 | ERPTable + FormModal; SearchSelect | M | F0 |
| 5 | items | 3 | SearchSelect×2; de-emoji | M | F0 |
| 6 | consumption-groups | 3 | de-emoji | S | F0 |
| 7 | warehouses | 3 | SearchSelect×2; de-emoji | S | F0 |

**Tier 3 — Procurement**
| # | Module | Score | Fix | Cx | Dep |
|--|--------|:----:|-----|----|-----|
| 8 | suppliers | 2 | SearchSelect×7; FormModal; de-emoji | L | F0 |
| 9 | purchase-requisitions | 2 | **kill `alert()`**; SearchSelect×4; de-emoji | M | F0 |
| 10 | supplier-items | 3 | SearchSelect×3; de-emoji | M | F0 |
| 11 | rfqs / purchase-orders / general-needs / ap-invoices / goods-receipts | 3 | SearchSelect (2–5 each); de-emoji | M×5 | F0 |

**Tier 4 — Manufacturing**
| # | Module | Score | Fix | Cx | Dep |
|--|--------|:----:|-----|----|-----|
| 12 | production-orders | 2 | ERPTable; SearchSelect×3; de-emoji; 104-hex | L | F0 |
| 13 | production-plans | 3 | SearchSelect×4 | M | F0 |
| 14 | bom / boms | 4 | SearchSelect×1 each | S×2 | F0 |

**Tier 5 — Sales**
| # | Module | Score | Fix | Cx | Dep |
|--|--------|:----:|-----|----|-----|
| 15 | customers | 2 | ERPTable + FormModal; SearchSelect×2 | M | F0 |
| 16 | sales-orders | 2 | ERPTable + FormModal; SearchSelect×4 | L | F0 |
| 17 | invoices (sales) | 2 | ERPTable; SearchSelect×4 | L | F0 |

**Tier 6 — Finance**
| # | Module | Score | Fix | Cx | Dep |
|--|--------|:----:|-----|----|-----|
| 18 | chart-of-accounts | 2 | **ERPTreeTable**; SearchSelect×4 | L | F0 |
| 19 | journal-entries | 2 | ERPTable + FormModal; SearchSelect×3; de-emoji | L | F0, #18 |
| 20 | je-queue | 2 | ERPTable; de-emoji | M | F0 |
| 21 | budgets | 2 | ERPTable + FormModal; SearchSelect×3; + roll-forward automation | L | F0 |
| 22 | fiscal-periods | 2 | ERPTable; SearchSelect×4 | M | F0 |
| 23 | automation / cash-flow / reports | 3 | de-emoji; tokens | S×3 | F0 |

**Tier 7 — Config**
| # | Module | Score | Fix | Cx | Dep |
|--|--------|:----:|-----|----|-----|
| 24 | settings/roles | 1 | **wrap ERPShell**; ERPTable | M | F0 |
| 25 | settings/users | 1 | **wrap ERPShell**; ERPTable | M | F0 |
| 26 | settings/tenants | 2 | ERPTable; de-emoji | M | F0 |
| 27 | bulk-import / general | 3 | de-emoji; tokens | S×2 | F0 |

**Cross-cutting (interleave by tier where the module lives)**
| # | Module | Score | Fix | Cx | Dep |
|--|--------|:----:|-----|----|-----|
| 28 | labels | 1 | **wrap ERPShell**; rebuild layout | M | F0 |
| 29 | stock-balance | 2 | ERPTable; **de-emoji (heavy)**; SearchSelect×2 | M | F0 |
| 30 | dashboard / abc / turnover / aging / planning / valuation / stock-transactions / stock-recon[id] | 3 | SearchSelect + de-emoji per page | S–M | F0 |
| 31 | ledger / slow-moving / stock-recon(list) / notifications | 4 | tokens only | S | F0 |

---

## Files involved

- `frontend/app/globals.css` — token definitions (new `:root`/`.dark` block).
- `frontend/components/ui/*` — reference tokens (no API changes).
- All 52 `frontend/app/**/page.tsx` — per-roadmap migration.
- This spec drives one shippable sub-spec per tier (SDD): `spec-ux-t2-master-data.md`, etc.

## Status log

| Date | Change |
|------|--------|
| 2026-06-20 | Draft created from full 52-page / 38-component audit. Awaiting review before implementation. |
| 2026-06-20 | **F0 shipped.** Token layer added to `globals.css` (value-preserving). Codemod replaced 2,267 hex literals with `var(--token)` across 67 files; 82 runtime alpha-append idioms (`${color}NN`) converted to `color-mix(in srgb, … N%, transparent)`; SVG gradient-id derivation sanitized. tsc 0 errors, prod build green (52 routes). 319 long-tail hex remain (grays `#111/#333/#fff`, alpha-hex, one-offs) — deferred to a follow-up codemod. Note: F0 deviates from the spec's draft token block in the safe direction — token values equal the de-facto literals (zero visual change) rather than the cleaned values; palette tuning happens later behind the seam. |
