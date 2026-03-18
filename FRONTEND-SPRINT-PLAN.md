# SUNSET ERP — FRONTEND SPRINT PLAN
**Updated:** March 17, 2026  
**Status:** Active development

---

## CURRENT STATE

### Completed
| Area | Status |
|---|---|
| Next.js 14 + TypeScript setup | Done |
| Sunset dark theme (design system v1.0) | Done |
| Login page (glassmorphism, sunset palette) | Done |
| Auth context + protected routes | Done |
| API client (Axios + JWT interceptors) | Done |
| ERPShell layout (topbar + horizontal nav) | Done |
| Dashboard (portlet grid, KPI table, charts) | Done |
| Chart of Accounts page (old layout — needs ERPShell) | Needs fix |

### API Services in `lib/api/`
| File | Status | Note |
|---|---|---|
| `client.ts` | Done | |
| `auth.ts` | Done | |
| `chart-of-accounts.ts` | Done | Fields wrong — uses `accountNumber` but backend expects `accountCode` |
| `financial-reports.ts` | Done | |
| `journal-entries.ts` | Done | Partial — missing post/unpost |
| `types.ts` | Partial | Missing most entity types |

### Pages in `app/`
| Route | Status |
|---|---|
| `/` | Done — dashboard with portlets |
| `/login` | Done |
| `/accounting/chart-of-accounts` | Needs refactor to ERPShell |

---

## BACKEND — ALL 16 MODULES (from Swagger)

| # | Module | Tag | Endpoints | Frontend Status |
|---|---|---|---|---|
| 1 | Authentication | Authentication | 6 | Done |
| 2 | Suppliers | Suppliers | 4 | Not started |
| 3 | Items | Items | 5 | Not started |
| 4 | Purchase Orders | Purchase Orders | 5 + status | Not started |
| 5 | Customers | Customers | 4 | Not started |
| 6 | Sales Orders | Sales Orders | 5 + status | Not started |
| 7 | Warehouses | Warehouses | 4 | Not started |
| 8 | Stock Transactions | Stock Transactions | 4 | Not started |
| 9 | Bill of Materials | BOM | 5 + calculate | Not started |
| 10 | Work Centers | Work Centers | 4 | Not started |
| 11 | Production Orders | Production Orders | 5 + status | Not started |
| 12 | Chart of Accounts | Chart of Accounts | 7 | Partial — fix fields |
| 13 | Journal Entries | Journal Entries | 7 (post/unpost) | Partial |
| 14 | Financial Reports | Financial Reports | 4 | Service done, no page |
| 15 | Fiscal Periods | Fiscal Periods | 10 | Not started |
| 16 | Budgets | Budgets | 10 | Not started |
| 17 | Cash Flow Projection | Cash Flow | 9 | Not started |

---

## KNOWN FIELD CORRECTIONS (from Swagger schemas)

### Chart of Accounts
Current code uses wrong field names. Correct mapping:

| Frontend (wrong) | Backend (correct) |
|---|---|
| `accountNumber` | `accountCode` |
| `name` | `accountName` |
| `accountCategory` | `accountSubType` |
| `allowManualPosting` | `isHeader` (inverted — header = non-posting) |

### Key enums extracted from Swagger
```
itemType:         raw_material | finished_good | work_in_progress | service
valuationMethod:  average | fifo | standard
warehouseType:    regular | consignment | transit
transactionType:  receipt | issue | transfer | adjustment
accountType:      asset | liability | equity | revenue | expense
entryType:        general | adjustment | closing | opening
PO status:        approved | rejected | closed
SO status:        confirmed | shipped | delivered | closed
Production status: released | in_progress | completed | cancelled
creditStatus:     good | watch | hold
scenario:         optimistic | realistic | pessimistic
lineType:         inflow | outflow
priority:         low | medium | high | urgent
workCenterType:   machine | labor | assembly | quality
periodStatus:     open | closed | locked
budgetStatus:     draft | approved
```

---

## SPRINT BACKLOG

### SPRINT A — FIXES & FOUNDATION (current)
**Goal:** Fix broken things, establish patterns for all future pages

**Tasks:**
1. Fix `lib/api/chart-of-accounts.ts` — correct field names from Swagger
2. Fix `lib/api/types.ts` — add all entity interfaces
3. Refactor `app/accounting/chart-of-accounts/page.tsx` to use ERPShell
4. Add edit modal + delete confirmation to Chart of Accounts
5. Fix `lib/api/journal-entries.ts` — add post/unpost methods

**Deliverable:** Chart of Accounts fully working with correct API fields, edit, delete, and ERPShell layout.

---

### SPRINT B — PROCUREMENT (next)
**Goal:** Suppliers + Items + Purchase Orders

**Order:** Suppliers → Items → Purchase Orders (Items depends on nothing, PO depends on both)

**Suppliers page** (`app/procurement/suppliers/page.tsx`)
- Table: code, name, category, paymentTerms, currency, email, phone
- Create modal: code*, name*, legalName, taxId, phone, email, website, paymentTerms, currency, category, notes
- Edit modal (same fields)
- Delete with confirmation

**Items page** (`app/inventory/items/page.tsx`)
- Table: code, name, itemType (badge), baseUom, standardCost, isStockable
- Filter by itemType (query param)
- Create modal: code*, name*, itemType*, baseUom*, description, valuationMethod, standardCost, leadTimeDays, safetyStock, reorderPoint, reorderQuantity + boolean toggles
- Statistics portlet: GET /api/items/statistics

**Purchase Orders page** (`app/procurement/purchase-orders/page.tsx`)
- Table: poNumber, supplier name, status (badge), expectedDate, totalAmount, currency
- Filter by status
- Create form (full page, not modal — has line items): supplierId* (searchable select from /api/suppliers), expectedDate, deliveryAddress, paymentTerms, currency, notes + dynamic lines (itemId*, orderedQuantity*, uom*, unitPrice*, discountPercent, expectedDate)
- Status workflow buttons: approve, reject, close
- Only draft POs editable/deletable

**New API services:** `lib/api/suppliers.ts`, `lib/api/items.ts`, `lib/api/purchase-orders.ts`

---

### SPRINT C — SALES
**Goal:** Customers + Sales Orders

**Customers page** (`app/sales/customers/page.tsx`)
- Table: code, name, creditStatus (badge), creditLimit, paymentTerms, currency, email
- Create/edit modal: code*, name*, legalName, taxId, phone, email, website, creditLimit, creditStatus (good|watch|hold), paymentTerms, currency, notes

**Sales Orders page** (`app/sales/sales-orders/page.tsx`)
- Table: soNumber, customer name, status (badge), requestedDate, totalAmount, currency
- Filter by status
- Create form (full page): customerId*, customerPo, requestedDate, promisedDate, paymentTerms, currency, notes + dynamic lines (itemId*, orderedQuantity*, uom*, unitPrice*, discountPercent, deliveryDate)
- Status workflow: confirmed → shipped → delivered → closed

**New API services:** `lib/api/customers.ts`, `lib/api/sales-orders.ts`

---

### SPRINT D — INVENTORY
**Goal:** Warehouses + Stock Transactions + Stock Balance

**Warehouses page** (`app/inventory/warehouses/page.tsx`)
- Table: code, name, warehouseType (badge), address, isActive
- Create/edit modal: code*, name*, warehouseType (regular|consignment|transit), address, isActive

**Stock Transactions page** (`app/inventory/stock-transactions/page.tsx`)
- Table: transactionType (badge), item name, warehouse name, quantity, uom, transactionDate, referenceType
- Filters: itemId, warehouseId, transactionType
- Create modal: transactionType*, itemId* (select), warehouseId* (select), quantity*, uom*, referenceId, referenceType, lotNumber, serialNumber, notes, transactionDate

**Stock Balance view** (`app/inventory/stock-balance/page.tsx`)
- Table: item name, warehouse name, quantity, uom
- Filters: itemId, warehouseId
- Calls GET /api/stock-transactions/balance

**New API services:** `lib/api/warehouses.ts`, `lib/api/stock-transactions.ts`

---

### SPRINT E — ACCOUNTING COMPLETION
**Goal:** Journal Entries + Financial Reports pages

**Journal Entries page** (`app/accounting/journal-entries/page.tsx`)
- Table: entryNumber, entryDate, entryType, description, status (badge), totalDebit
- Filter by status (draft|posted)
- Create form (full page): entryDate*, entryType*, description, referenceType, referenceNumber + dynamic lines (accountId* searchable select, debitAmount*, creditAmount*, description)
- Auto-validation: sum(debits) must equal sum(credits)
- Actions: Post (PATCH /:id/post), Unpost (PATCH /:id/unpost)
- Only draft entries editable/deletable

**Financial Reports page** (`app/accounting/reports/page.tsx`)
- Tabs: Trial Balance | P&L | Balance Sheet | General Ledger
- Shared filters: startDate, endDate, fiscalPeriod, accountType, accountNumber
- Each report renders its own table structure from the API response

---

### SPRINT F — FINANCIAL PLANNING
**Goal:** Fiscal Periods + Budgets + Cash Flow

**Fiscal Periods page** (`app/accounting/fiscal-periods/page.tsx`)
- Table: periodCode, periodName, fiscalYear, fiscalQuarter, status (badge with color: open=green, closed=amber, locked=red), isCurrent
- Filters: fiscalYear, status
- Create modal: periodCode*, periodName*, startDate*, endDate*, fiscalYear*, fiscalQuarter, isCurrent
- Actions per row: Close, Reopen, Lock, Unlock (conditionally shown based on status)

**Budgets page** (`app/accounting/budgets/page.tsx`)
- Table: budgetCode, budgetName, fiscalYear, status (badge), line count
- Filters: fiscalYear, status
- Create modal: budgetCode*, budgetName*, fiscalYear*, description
- Detail view: budget lines table + Add line form (accountId*, fiscalPeriod*, budgetAmount*, notes)
- Actions: Approve budget, View vs Actual report
- vs Actual: side-by-side table with budget, actual, variance columns

**Cash Flow page** (`app/accounting/cash-flow/page.tsx`)
- Table: projectionCode, projectionName, scenario (badge), startDate, endDate
- Filter by scenario
- Create modal: projectionCode*, projectionName*, startDate*, endDate*, scenario*, description
- Detail view: lines table + Add line form (lineDate*, lineType* inflow|outflow, category*, amount*, description, accountId)
- Summary view: GET /:id/summary — monthly table with totals and running balance

---

### SPRINT G — MANUFACTURING
**Goal:** BOM + Work Centers + Production Orders

**Work Centers page** (`app/manufacturing/work-centers/page.tsx`)
- Table: code, name, workCenterType, capacityPerHour, costPerHour, isActive
- Create/edit modal: code*, name*, workCenterType, capacityPerHour, efficiencyPercent, costPerHour, isActive, notes

**BOM page** (`app/manufacturing/bom/page.tsx`)
- Table: bomCode, item name, version, isActive
- Filter by itemId
- Create form: itemId* (select), bomCode, description, version, isActive + components list (componentItemId*, quantity*, uom*, scrapPercent, notes)
- Calculate requirements: GET /api/bom/:id/calculate/:quantity

**Production Orders page** (`app/manufacturing/production-orders/page.tsx`)
- Table: orderNumber, BOM code, status (badge), quantityOrdered, priority, plannedStartDate
- Filter by status
- Create modal: bomId* (select), workCenterId (select), quantityOrdered*, plannedStartDate, plannedEndDate, priority, notes
- Status workflow: released → in_progress → completed | cancelled

---

## FILE STRUCTURE (target)

```
app/
├── page.tsx                          — Dashboard
├── login/page.tsx                    — Login
├── procurement/
│   ├── suppliers/page.tsx
│   └── purchase-orders/
│       ├── page.tsx                  — List
│       └── new/page.tsx              — Create form
├── sales/
│   ├── customers/page.tsx
│   └── sales-orders/
│       ├── page.tsx
│       └── new/page.tsx
├── inventory/
│   ├── items/page.tsx
│   ├── warehouses/page.tsx
│   ├── stock-transactions/page.tsx
│   └── stock-balance/page.tsx
├── accounting/
│   ├── chart-of-accounts/page.tsx    — Fix fields
│   ├── journal-entries/
│   │   ├── page.tsx
│   │   └── new/page.tsx
│   ├── reports/page.tsx
│   ├── fiscal-periods/page.tsx
│   ├── budgets/page.tsx
│   └── cash-flow/page.tsx
└── manufacturing/
    ├── work-centers/page.tsx
    ├── bom/page.tsx
    └── production-orders/page.tsx

lib/api/
├── client.ts                         — Done
├── auth.ts                           — Done
├── types.ts                          — Expand
├── chart-of-accounts.ts              — Fix fields
├── financial-reports.ts              — Done
├── journal-entries.ts                — Add post/unpost
├── suppliers.ts                      — New
├── customers.ts                      — New
├── items.ts                          — New
├── purchase-orders.ts                — New
├── sales-orders.ts                   — New
├── warehouses.ts                     — New
├── stock-transactions.ts             — New
├── bom.ts                            — New
├── work-centers.ts                   — New
├── production-orders.ts              — New
├── fiscal-periods.ts                 — New
├── budgets.ts                        — New
└── cash-flow.ts                      — New

components/
├── layout/
│   ├── ERPShell.tsx                  — Done (replaces MainLayout)
│   └── MainLayout.tsx                — Deprecated, remove after migration
└── ui/                               — Done (20+ components)
```

---

## NAVIGATION MAP (ERPShell nav items)

```
Home          →  /
Activities    →  (future)
Sales         →  /sales/customers  (dropdown: Customers, Sales Orders)
Expenses      →  (future)
HR            →  (future)
Financial     →  /accounting/chart-of-accounts
Reports       →  /accounting/reports
Documents     →  (future)
Setup         →  (future)
Analytics     →  (future)
```

ERPShell needs a dropdown/submenu system added in Sprint B so Financial and Sales can expand.

---

## CODING STANDARDS

Every page follows this pattern — no exceptions:

```tsx
// 1. API service file: lib/api/[module].ts
// - TypeScript interfaces for entity and DTOs
// - All CRUD methods typed
// - Enums as const objects

// 2. Page file: app/[section]/[module]/page.tsx
// - Uses ERPShell with breadcrumbs and title
// - CSS-in-JS with <style> tag (no Tailwind conflicts)
// - Inline table (not DataTable component — too limited)
// - Modal for create/edit
// - Confirm dialog for delete
// - Loading spinner
// - Error display
// - No emojis, no sidebar, no MainLayout
```

**Icon rule:** All SVG icons must have `width: Npx; height: Npx; display: block; flex-shrink: 0` — never inherit container size.

---

## COMMIT CONVENTION

```
feat(suppliers): add suppliers list page with create/edit modals
feat(items): add items page with type filter and statistics
fix(chart-of-accounts): correct field names to match backend schema
feat(api): add suppliers, items, purchase-orders service files
```

---

*Sunset ERP Frontend Sprint Plan · v2.0 · March 17, 2026*