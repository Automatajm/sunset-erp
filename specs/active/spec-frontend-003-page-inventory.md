# spec-frontend-003 — Page Inventory (Implementation Roadmap for spec-frontend-002)

Status: **Active**  
Owner: Frontend / Design System  
Sprint: TBD  
Module(s): `frontend/app/**` — all 51 pages  
Last updated: 2026-06-07  

> Companion to [`spec-frontend-002-data-components`](./spec-frontend-002-data-components.md):
> that spec builds the primitives (collapsible FilterBar, fixed-footer DataTable, TreeTable
> improvements, the modal system); **this spec decides where and in what order they land.**
> Pages with `ERPTreeTable` need the tree-specific improvements; pages listed with
> `FormModal`/`ConfirmModal`/`DetailModal` needs are the consumers of the new modal system;
> high-priority + high-friction pages get implemented first.

---

## Purpose

- **Who uses this module?** Frontend developers and the team planning the spec-frontend-002 rollout — it is the audit matrix and prioritized roadmap that tells them which of the 49 pages need which new primitives, and in what order. ERP end users are the indirect beneficiaries as the highest-friction pages get fixed first.
- **What business problem does it solve?** It converts the abstract "improve the frontend" goal into a concrete, evidence-based plan: a per-page inventory of table type, missing modals, data-path health, priority, and friction score, plus a P0–P4 implementation order so effort lands where it matters most.
- **What can the business NOT do without this module?** It cannot roll out spec-frontend-002 in a rational order — work would be guesswork, the one genuinely broken page and the 17 unguarded destructive actions could be missed, and high-traffic, high-friction pages might be fixed last instead of first.

## Business value

Without this audit, improving 49 pages is undirected effort — easy wins and dangerous gaps look the same from a distance. The inventory surfaces what actually matters: one page silently broken on a 200 response, 17 destructive actions with no confirmation guard, raw backend errors relayed to users on 10+ pages, and design-system violations across the app. By scoring every page on priority and friction and sequencing the work P0–P4, it ensures scarce frontend time fixes the broken and most-used surfaces first, reducing the risk of costly mistakes (an accidental void, ship, or delete) and accelerating real adoption gains.

---

## Method

Audit of 2026-06-06 across all 49 `page.tsx` files under `frontend/app/`. For each page:
- **Table Type** — primitives actually imported/rendered (`ERPTable`, `ERPTreeTable`,
  `ERPFilterBar`, hand-rolled `<table>`, or none).
- **Modals Needed** — what the page's actions require: `ConfirmModal` (destructive/
  irreversible), `FormModal` (create/edit), `DetailModal` (row/document detail).
  "(has X)" = exists today as a raw one-off composition; "MISSING" = the action exists
  but is unguarded or absent.
- **State** — the data path was traced end-to-end (page → `lib/api` getter or direct
  `apiClient` → actual backend return shape) against the envelope contracts shipped in
  specs 001–018. `empty/broken` = shape mismatch renders nothing on a 200.
- **Priority** — high = daily operational use (floor/finance/procurement staff),
  medium = reports/periodic, low = admin/settings.
- **Friction** — ux-reviewer rubric (0–10, lower is better): +1 derivable field asked,
  +1 extra click/step, +1 fake decision, +2 internals exposed (raw enums/UUIDs/backend
  errors), +2 unguarded dead end.

---

## The matrix

### Accounting (8)
| Page | Route | Table Type | Modals Needed | State | Priority | Friction |
|---|---|---|---|---|---|---|
| Automation Engine | /accounting/automation | custom table (grid tree) | none | working | low | 4 |
| Budgets | /accounting/budgets | custom table (cards + table) | FormModal (has 3 raw), DetailModal (has inline), ConfirmModal MISSING (approve irreversible) | working | medium | 5 |
| Cash Flow | /accounting/cash-flow | custom table (cards + table) | FormModal (has 2 raw), DetailModal (has inline), ConfirmModal MISSING (delete API w/o UI) | working | medium | 4 |
| Chart of Accounts | /accounting/chart-of-accounts | custom table | FormModal (has), ConfirmModal (has) | working | low | 3 |
| Fiscal Periods | /accounting/fiscal-periods | custom table | FormModal (has), ConfirmModal (has for delete; close/lock/unlock unguarded) | working | low | 5 |
| JE Review Queue | /accounting/je-queue | custom table + expand | ConfirmModal MISSING (approve = unguarded post), FormModal (has RejectModal), DetailModal (has inline) | working | high | 6 |
| Journal Entries | /accounting/journal-entries | custom table + expand | FormModal (has), ConfirmModal (has for delete; post/unpost unguarded), DetailModal (has inline) | working | high | 6 |
| Financial Reports | /accounting/reports | custom table (4 report tables) | none | working | medium | 3 |

### Inventory (18)
| Page | Route | Table Type | Modals Needed | State | Priority | Friction |
|---|---|---|---|---|---|---|
| ABC Analysis | /inventory/abc-analysis | ERPTable+FilterBar | none | working | medium | 3 |
| Categories | /inventory/categories | custom table | FormModal (has) | working | low | 3 |
| Consumption Groups | /inventory/consumption-groups | ERPTable+FilterBar | FormModal (has) | working (P0 fixed 2026-06-06) | low | 4 |
| Inventory Turnover | /inventory/inventory-turnover | ERPTable+FilterBar+DatePicker | none | working | medium | 4 |
| Items | /inventory/items | ERPTable+FilterBar | FormModal (has, tabbed), ConfirmModal (has) | working | high | 6 |
| Labels | /inventory/labels | custom table (print selectors) | none (utility) | working | medium | 4 |
| Stock Ledger | /inventory/ledger | ERPTable+FilterBar | none | working | high | 4 |
| Macro Categories | /inventory/macro-categories | custom table | FormModal (has), ConfirmModal (has) | working | low | 2 |
| Slow Moving | /inventory/slow-moving | ERPTable+FilterBar | none | working | medium | 3 |
| Stock Aging | /inventory/stock-aging | ERPTable+FilterBar | none | working | medium | 1 |
| Stock Balance | /inventory/stock-balance | custom table | DetailModal (has drawer) | working | high | 2 |
| Stock Planning | /inventory/stock-planning | **ERPTreeTable**+FilterBar | none (needs "Create PO" action from suggestion) | working | medium | 2 |
| Stock Reconciliation | /inventory/stock-reconciliation | ERPTable+FilterBar | FormModal (has raw CreateSession) | working | high | 3 |
| Recon Session | /inventory/stock-reconciliation/[id] | custom table (CountRow) | FormModal (has Approve + 391-line AssignmentModal), ConfirmModal MISSING (cancel = window.confirm) | working | high | 6 |
| Recon Count (mobile) | /inventory/stock-reconciliation/[id]/count | none (card + numpad) | none (full-screen flow) | working | high | 3 |
| Stock Transactions | /inventory/stock-transactions | ERPTable+FilterBar | FormModal (has raw CreateTx) | working | high | 6 |
| Valuation | /inventory/valuation | ERPTable+FilterBar | none | working | medium | 1 |
| Warehouses | /inventory/warehouses | **ERPTreeTable**+FilterBar | FormModal (has), ConfirmModal (has) | working | low | 3 |

### Manufacturing (5)
| Page | Route | Table Type | Modals Needed | State | Priority | Friction |
|---|---|---|---|---|---|---|
| BOM | /manufacturing/bom | **ERPTreeTable** | FormModal (has), DetailModal (has), ConfirmModal MISSING (delete unguarded) | working | medium | 6 |
| BOMs (duplicate) | /manufacturing/boms | **ERPTreeTable** | same as /bom — **duplicate route, candidate for removal** | working | low | 6 |
| Production Orders | /manufacturing/production-orders | custom table | FormModal (has 3), ConfirmModal MISSING (cancel unguarded) | working | high | 6 |
| Production Plans | /manufacturing/production-plans | ERPTable+FilterBar | FormModal (has), DetailModal (has drawer), ConfirmModal MISSING (cancel unguarded, alert() feedback) | working | high | 5 |
| Work Centers | /manufacturing/work-centers | custom table | FormModal (has), ConfirmModal (has) | working | medium | 3 |

### Procurement (7)
| Page | Route | Table Type | Modals Needed | State | Priority | Friction |
|---|---|---|---|---|---|---|
| AP Invoices | /procurement/ap-invoices | ERPTable+FilterBar | DetailModal (has drawer + 3-way match), FormModal (has) | working | high | 7 |
| General Needs | /procurement/general-needs | ERPTable+FilterBar | DetailModal (has), FormModal (has), ConfirmModal MISSING (status changes unguarded) | working | medium | 5 |
| Goods Receipts | /procurement/goods-receipts | ERPTable+FilterBar | DetailModal (has), FormModal (has), ConfirmModal MISSING (cancel = native confirm()) | working | high | 6 |
| Purchase Orders | /procurement/purchase-orders | ERPTable+FilterBar | DetailModal (has + receive), FormModal (has), ConfirmModal MISSING (cancel/confirm unguarded) | working | high | 7 |
| Purchase Requisitions | /procurement/purchase-requisitions | ERPTable+FilterBar | DetailModal (has + convert), FormModal (has), ConfirmModal MISSING (5 transitions unguarded) | working | high | 7 |
| RFQs | /procurement/rfqs | ERPTable+FilterBar | DetailModal (has 3-tab drawer), FormModal (has), ConfirmModal MISSING (cancel = native confirm()) | working | medium | 7 |
| Suppliers | /procurement/suppliers | ERPTable+FilterBar | FormModal (has 4-tab), DetailModal (has), ConfirmModal (has) | working | high | 4 |

### Sales (3)
| Page | Route | Table Type | Modals Needed | State | Priority | Friction |
|---|---|---|---|---|---|---|
| Customers | /sales/customers | custom table | FormModal (has), ConfirmModal (has) | working | high | 2 |
| AR Invoices | /sales/invoices | custom table + expand | FormModal (has 2), DetailModal (has inline), ConfirmModal MISSING (void/send unguarded) | working | high | 5 |
| Sales Orders | /sales/sales-orders | custom table + expand | FormModal (has), DetailModal (has inline), ConfirmModal MISSING (ship/deliver unguarded — create stock movements) | working | high | 5 |

### Settings (7)
| Page | Route | Table Type | Modals Needed | State | Priority | Friction |
|---|---|---|---|---|---|---|
| Bulk Import/Export | /settings/bulk-import | custom table (preview + dry-run) | FormModal (has 2 raw dialogs) | working | medium | 6 |
| General Settings | /settings/general | none (SearchSelect rows) | ConfirmModal (has WarningModal) | working | low | 3 |
| Notifications | /settings/notifications | **ERPTable+FilterBar** | none (Retry/Cancel/Drain are low-risk, reversible) | working | low | 3 |
| Roles & Permissions | /settings/roles | custom table (card grid) | FormModal (has), ConfirmModal MISSING (delete = window.confirm) | working | low | 6 |
| Tenants | /settings/tenants | custom table (master-detail) | FormModal (has 2), ConfirmModal MISSING (remove-user / unset-default unguarded) | working | low | 6 |
| UOM Catalog | /settings/uom | custom table (2 tables) | none (read-only catalog) | working | low | 4 |
| Users | /settings/users | custom table (grid rows) | FormModal (has 2), ConfirmModal MISSING (deactivate unguarded) | working | low | 5 |

### Root & Output (3)
| Page | Route | Table Type | Modals Needed | State | Priority | Friction |
|---|---|---|---|---|---|---|
| Dashboard | / | none (KPI tables + charts) | none | working | high | 4 |
| Login | /login | none | none | working | high | 1 |
| Print/PDF output | /print/[doc]/[id] | none (light-on-white document renderer, **outside ERPShell**, Suspense) | none (output route, reached via `PrintButton` `window.open`) | working | medium | 1 |

---

## Aggregate picture

| Dimension | Count |
|---|---|
| Pages total | 51 *(+2 since 2026-06-06: /settings/notifications, /print/[doc]/[id])* |
| **State**: working / broken / empty / unknown | 51 / 0 / 0 / 0 |
| **Table type**: ERPTable(+FilterBar) / ERPTreeTable / custom table / none | 18 / 4 / 22 / 7 |
| **Priority**: high / medium / low | 19 / 14 / 18 |
| **Friction**: 6+ (needs redesign attention) / 3–5 / 0–2 | 15 / 27 / 9 |
| Pages needing **ConfirmModal** (unguarded destructive action today) | 17 |
| Pages with raw one-off **FormModal** compositions | 24 |
| Pages with **DetailModal** patterns (drawers/inline expands) | 13 |
| Pages with a wired **PrintButton** (capability added since audit) | 13 |

### The one broken page (fix before anything else)
**/inventory/consumption-groups** — `lib/api/consumption-groups.ts:8` returns bare
`res.data` but the backend (spec-008) returns the `{consumptionGroups, count}` envelope:
the page sets an object where an array is expected → **empty table + dead stats on a
200**, and the same stale getter silently empties the consumption-group dropdown inside
the Items modal (caught + swallowed). One-line fix:
`return res.data.consumptionGroups ?? []`. This is a live instance of the
suppliers/items envelope incident the `frontend-sync` skill documents.

### Cross-cutting findings (feed spec-frontend-002's acceptance criteria)
1. **17 unguarded destructive actions** — the strongest argument for the ConfirmModal:
   procurement status transitions (cancel/confirm/approve/reject ×5 pages), accounting
   post/unpost/approve (je-queue, journal-entries, budgets, fiscal-periods lock),
   manufacturing cancels (production-orders/plans, BOM delete with **zero** guard),
   sales void/ship/deliver (ship creates stock movements!), settings deactivate-user /
   remove-tenant-user. Four pages use native `window.confirm` (recon session, goods-
   receipts, rfqs, roles) — off-design-system and unstyled.
2. **Raw backend errors relayed** in ≥10 pages (`alert(err.response.data.message)` or
   banner) — violates "errors are absorbed, not relayed".
3. **Raw enum/internal vocabulary exposed**: procurement line statuses (`general_need`,
   `pending`), stock-transactions modal free-text `referenceType` placeholder
   `purchase_order`, bulk-import sample rows with permission codes, budgets MRP modal
   defaulting raw GL account codes, journal-entries asking the user to type
   `fiscalPeriod` the backend derives.
4. **Design-system violations found during audit**: emojis in ≥9 pages (stock-aging,
   stock-balance, valuation, recon session, warehouses, purchase-requisitions, bom,
   production-orders/plans, settings/general, tenants); Spanish strings in both BOM
   pages; raw `<select>` where `SearchSelect` is mandated (recon CreateSession,
   stock-transactions CreateTx, warehouses modal).
5. **/manufacturing/boms is a near-identical duplicate of /manufacturing/bom** —
   consolidate to one route before investing modal work in either.
6. **Accounting + sales + settings use zero ERP primitives** (22 hand-rolled tables) —
   the largest migration surface for spec-frontend-002's DataTable, but most are
   working; migrate opportunistically when each page gets its modal work.

---

## Re-audit delta (2026-06-07) — post specs 029–034

Re-traced after budgets/cash-flow/automation/financial-reports/fiscal-periods
(029–033) and session-security (034) shipped. **No page regressed to broken**;
all 51 are working. Changes since the 2026-06-06 audit:

**New pages (+2)**
- **/settings/notifications** — notification center (Settings → Notifications).
  Notably it is a **reference implementation of the spec-frontend-002 target
  stack**: `ERPTable` + `ERPFilterBar` + `useERPFilters`/`applyERPFilters` + stat
  cards, no raw `<table>`. Retry/Cancel/Drain actions are reversible/low-risk so
  no ConfirmModal is owed. Use it as the worked example when migrating other
  pages. (One trap already hit + fixed here: `ERPFilter` must come from
  `ERPFilterBar`, never `ERPTable` — see commit fb28179.)
- **/print/[doc]/[id]** — light-on-white PDF/print renderer (14 documents via the
  `PRINT_DOCS` registry), rendered **outside `ERPShell`**, Suspense-wrapped,
  reached via `PrintButton` `window.open`. Output route, not a data page.

**029/030/033 envelopes — frontend-sync already done (no broken pages)**
- `budgetsApi.getAll` (`{budgets,count}`), `cashFlowApi` extractList
  (`{cashFlowProjections,count}`), `fiscalPeriodsApi` extractList
  (`{fiscalPeriods,count}`) were all made envelope-tolerant in the same specs.
  Verified still correct. automation + financial-reports added no envelope.

**034 session-security — cross-cutting, affects every page**
- **`AuthGate` now wraps the whole app** (`app/layout.tsx`): any non-`/login`
  route with no session redirects to `/login?next=` (+ cross-tab logout). This is
  the route-protection the matrix previously lacked — now global.
- **`InactivityGuard` renders inside `ERPShell`** — a 15-min idle → 2-min-warning
  → logout modal. **This is an already-shipped bespoke modal**; when spec-002's
  modal system lands it must align with (or absorb) it, not duplicate/conflict.
- **Access token is now per-tab memory** (not localStorage). Consequence for the
  print route: a `window.open` tab starts with an empty token and bootstraps auth
  via the httpOnly refresh-cookie silent-refresh on its first 401. Works today;
  flag for live verification when QAing print.
- **`PrintButton` wired into 13 surfaces** (PO/SO/AR/AP/GRN/RFQ/PR/JE/MO/count/
  BOM/customer/stock-tx) — a new capability since the audit; slightly lowers
  friction on those pages (no behavioral regression).

**32 financial-reports — new 400 paths** (`/accounting/reports`): half-specified
ranges, inverted ranges, malformed `fiscalPeriod`, and unknown `accountNumber`
now return 400/404. The reports page sends valid both-or-neither ranges so it is
unaffected in normal use, but it **relays raw errors** (finding #2) — reinforces
the "absorb errors" criterion for spec-002.

### Additional inputs to spec-frontend-002's acceptance criteria
7. **The modal system must reconcile with the shipped `InactivityGuard`** — the
   global session-warning modal is the first production modal; spec-002's
   `ConfirmModal`/`FormModal`/`DetailModal` should share its overlay/z-index/style
   conventions so the app has one modal language, not two.
8. **`/settings/notifications` is the canonical migration target** — every
   hand-rolled table should end up looking like it (ERPTable + ERPFilterBar +
   the filter hooks). Cite it in the spec as the reference.
9. **Print is now a first-class output path** — pages with a `PrintButton` should
   keep it working through any table/modal refactor (don't break the row→print
   action wiring); the print route itself stays outside `ERPShell` by design.

---

## Implementation roadmap (for spec-frontend-002)

Ordering rule: broken first, then high priority × high friction, then primitive-specific
batches. Friction in parentheses.

**P0 — immediate (independent of spec-frontend-002)**
1. Fix `/inventory/consumption-groups` envelope unwrap (one line + Items modal benefit).

**P1 — high priority + friction ≥6: first consumers of the modal system**
2. /procurement/purchase-orders (7) — ConfirmModal on cancel/confirm, DetailModal port
3. /procurement/purchase-requisitions (7) — ConfirmModal on 5 transitions
4. /procurement/ap-invoices (7) — FormModal port (from-PO/manual), DetailModal
5. /procurement/goods-receipts (6) — replace native confirm()
6. /inventory/stock-transactions (6) — FormModal port + kill free-text referenceType/UOM
7. /inventory/items (6) — tabbed FormModal port (largest form)
8. /inventory/stock-reconciliation/[id] (6) — ConfirmModal for cancel, decompose the
   391-line AssignmentModal into the modal system
9. /accounting/journal-entries (6) + /accounting/je-queue (6) — ConfirmModal on
   post/unpost/approve, drop the user-typed fiscalPeriod field
10. /manufacturing/production-orders (6) — ConfirmModal on cancel

**P2 — high priority, friction 4–5**
11. /sales/sales-orders (5) + /sales/invoices (5) — ConfirmModal on ship/deliver/void
12. /manufacturing/production-plans (5) — ConfirmModal + replace alert() feedback
13. /procurement/rfqs (7, medium-priority but shares the procurement drawer pattern)
14. /inventory/ledger (4), /procurement/suppliers (4), dashboard (4) — polish passes

**P3 — TreeTable batch (needs spec-frontend-002 tree improvements)**
15. /inventory/stock-planning (+ "Create PO from suggestion" action — closes the
    dead-end insight), /inventory/warehouses, /manufacturing/bom — after first
    consolidating /manufacturing/boms into /manufacturing/bom.

**P4 — medium/low priority cleanups**
16. Settings batch (roles/tenants/users ConfirmModals — small, similar shape)
17. Accounting batch (budgets/cash-flow/fiscal-periods guards + table migration)
18. Reports polish (auto-run on tab switch in /accounting/reports; merge the dual
    filter systems in turnover/abc)
19. Design-system sweep: emojis out (9 pages), Spanish strings out (bom), raw
    `<select>` → SearchSelect (3 pages) — mechanical, can ride along any P1–P3 touch.

---

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Full 49-page audit (6 parallel auditors, data paths traced page→lib/api→backend, ux-reviewer friction rubric applied per page) | 48 working, 1 broken (consumption-groups envelope); 17 unguarded destructive actions; 22 hand-rolled tables; 4 TreeTable pages; roadmap P0–P4 established |
| 2026-06-06 | P0 fixed (`lib/api/consumption-groups.ts` envelope unwrap) + full frontend-sync sweep of all 19 envelope contracts: every other getter/direct consumer verified compatible; the stale getter also affected the consumption-group dropdowns in items, bom and boms modals (4 consumers repaired by the one fix) | frontend build green |
| 2026-06-08 | **P1 adoption — FormModal ports.** Ported the two clean single-submit create/edit forms onto the shared `FormModal`: stock-transactions create modal (`37aa50d` — also killed the free-text traps: referenceType→whitelisted select, UOM→read-only derived from item) and ap-invoices PaymentModal (`85bba13`). **Deferred by design:** the other two "FormModal port" targets are NOT single-submit forms — ap-invoices `CreateApInvoiceModal` is a multi-mode wizard (choose/from-PO/manual, per-mode footer) and items `ItemModal` is a tabbed editor with a conditional footer (Save hidden on the Suppliers tab) and a create→suppliers handoff that does not close on submit. The correct primitive for both is `ModalShell` (shared overlay/a11y/style language, custom footer), not `FormModal`; tracked as a follow-up rather than forcing a degraded single-submit port. | 2 clean ports done; 2 complex modals → ModalShell follow-up |
| 2026-06-08 | **items ItemModal ported onto ModalShell** (`ec9cd0e`). The tabbed editor now uses the shared ModalShell (Radix overlay/focus-trap/ESC/scroll-lock + one style language) with its conditional footer in the footer slot (Save hidden on Suppliers tab) and the create→suppliers handoff preserved; footer Save submits the body form by id. SearchSelect dropdowns (position:fixed z-9999) are unaffected by the scrolling body. Build green. **Remaining FormModal/ModalShell adoption:** only ap-invoices `CreateApInvoiceModal` (multi-mode wizard) — ModalShell follow-up. | items done |
| 2026-06-07 | **P1 adoption — ConfirmModal guards (spec-frontend-002 consumers).** Replaced unguarded destructive actions with the new `ConfirmModal` across 7 pages: goods-receipts (cancel, was native `confirm()`), purchase-orders (confirm/close/cancel), purchase-requisitions (approve + cancel; reject keeps its reason modal), journal-entries (post/unpost), je-queue (approve→post), production-orders (cancel only; forward transitions stay direct), stock-reconciliation/[id] (cancel, was native `confirm()`). Commits `01082fc`, `47a02ab`, `b7b3ba8`; build green each; PrintButton wiring intact; no new deps. Also removed a stray empty untracked `app/procurement/supplier-items/page.tsx` (0 bytes) that broke tsc. **Remaining P1 = the larger FormModal/DetailModal PORTS** (ap-invoices, stock-transactions, items) — working modals to be made consistent; deferred (higher risk, lower marginal value than the guards). | 7 pages guarded |
| 2026-06-07 | Re-audit after specs 029–034. 49→**51 pages** (+/settings/notifications, +/print/[doc]/[id]). All 51 working — no regressions. 029/030/033 envelope getters verified tolerant (frontend-sync already done); 0 stale localStorage token reads (034 clean); AuthGate (global route protection) + InactivityGuard (global session modal) confirmed wired; PrintButton on 13 surfaces. New inputs #7–#9 added for spec-frontend-002 (reconcile modal system with InactivityGuard; /settings/notifications as canonical migration target; keep print wiring intact). Roadmap P0–P4 unchanged and still valid. | Doc-only refresh; matrix + aggregates + findings updated |
