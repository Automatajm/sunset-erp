# spec-frontend-003 — Page Inventory (Implementation Roadmap for spec-frontend-002)

Status: **Active**  
Owner: Frontend / Design System  
Sprint: TBD  
Module(s): `frontend/app/**` — all 49 pages  
Last updated: 2026-06-06  

> Companion to [`spec-frontend-002-data-components`](./spec-frontend-002-data-components.md):
> that spec builds the primitives (collapsible FilterBar, fixed-footer DataTable, TreeTable
> improvements, the modal system); **this spec decides where and in what order they land.**
> Pages with `ERPTreeTable` need the tree-specific improvements; pages listed with
> `FormModal`/`ConfirmModal`/`DetailModal` needs are the consumers of the new modal system;
> high-priority + high-friction pages get implemented first.

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

### Settings (6)
| Page | Route | Table Type | Modals Needed | State | Priority | Friction |
|---|---|---|---|---|---|---|
| Bulk Import/Export | /settings/bulk-import | custom table (preview + dry-run) | FormModal (has 2 raw dialogs) | working | medium | 6 |
| General Settings | /settings/general | none (SearchSelect rows) | ConfirmModal (has WarningModal) | working | low | 3 |
| Roles & Permissions | /settings/roles | custom table (card grid) | FormModal (has), ConfirmModal MISSING (delete = window.confirm) | working | low | 6 |
| Tenants | /settings/tenants | custom table (master-detail) | FormModal (has 2), ConfirmModal MISSING (remove-user / unset-default unguarded) | working | low | 6 |
| UOM Catalog | /settings/uom | custom table (2 tables) | none (read-only catalog) | working | low | 4 |
| Users | /settings/users | custom table (grid rows) | FormModal (has 2), ConfirmModal MISSING (deactivate unguarded) | working | low | 5 |

### Root (2)
| Page | Route | Table Type | Modals Needed | State | Priority | Friction |
|---|---|---|---|---|---|---|
| Dashboard | / | none (KPI tables + charts) | none | working | high | 4 |
| Login | /login | none | none | working | high | 1 |

---

## Aggregate picture

| Dimension | Count |
|---|---|
| Pages total | 49 |
| **State**: working / broken / empty / unknown | 49 / 0 / 0 / 0 *(P0 fixed)* |
| **Table type**: ERPTable(+FilterBar) / ERPTreeTable / custom table / none | 17 / 4 / 22 / 6 |
| **Priority**: high / medium / low | 19 / 13 / 17 |
| **Friction**: 6+ (needs redesign attention) / 3–5 / 0–2 | 15 / 26 / 8 |
| Pages needing **ConfirmModal** (unguarded destructive action today) | 17 |
| Pages with raw one-off **FormModal** compositions | 24 |
| Pages with **DetailModal** patterns (drawers/inline expands) | 13 |

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
