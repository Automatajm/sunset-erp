# Sunset ERP — Sprint 10 Plan & Context Handoff

## Project Overview
- **Stack:** NestJS + Prisma + PostgreSQL (port 3000) / Next.js + Tailwind CSS v4 + Tremor (port 3001)
- **Repo:** https://github.com/Automatajm/sunset-erp
- **Path:** `C:\Users\owner\Desktop\Sunset-ERP`
- **DB:** `postgresql://postgres:0824@localhost:5432/sunset_erp_dev`
- **Tenant ID:** `2f627a44-df80-4b0f-ba11-6fd44e62f243`
- **Demo login:** `admin@demo.com` / `Admin123!`
- **Dev:** Juan — Financial Analysis Manager, DR, bilingual ES/EN

---

## Current State (end of Sprint 9 + Simulation)

### Modules completed (backend + frontend)
| Module | Status |
|--------|--------|
| Auth / Multi-tenant | ✅ |
| Items / Customers / Suppliers / Warehouses / Work Centers | ✅ |
| Chart of Accounts (54 accounts, GAAP/IFRS) | ✅ |
| Sales Orders + Lines | ✅ |
| Purchase Orders + Lines | ✅ |
| BOM + BOM Routings | ✅ |
| Production Orders | ✅ |
| AR Invoices + Payments + JE | ✅ |
| Fiscal Periods | ✅ |
| Budgets + Budget Lines | ✅ |
| Journal Entries (manual) | ✅ |
| Financial Reports (P&L, Balance Sheet, Trial Balance) | ✅ |
| Automation Engine (auto JE) | ✅ |
| Bulk Import/Export (12 entities) | ✅ |
| Cash Flow module | ✅ (endpoints exist, not populated) |

### Simulation data loaded (Mesa Manufacturing Company)
**Master data:**
- 11 items: MESA-NAT, MESA-WAL, MESA-BLK (FG), RM-TOPE-MDF, RM-RIBETE, RM-PATA-ACE, RM-HERR, RM-ACAB-NAT/WAL/BLK, RM-EMPAQUE
- 6 customers: CUST-DECO, CUST-HOGAR, CUST-INTER, CUST-PLAZA, CUST-CORP, CUST-LUXE
- 6 suppliers: SUP-MADE1, SUP-MADE2, SUP-META1, SUP-META2, SUP-PINT1, SUP-EMPA1
- 3 warehouses, 5 work centers
- 3 BOMs (BOM-MESA-NAT, BOM-MESA-WAL, BOM-MESA-BLK) with 6 components each
- 15 BOM routing steps

**Transactional data:**
- 44 SO 2025 → confirmed → invoiced → paid (INV-2025-0001 to 0044) | $271,529.85
- 8 SO 2026 Q1 → confirmed → invoiced → paid (INV-2026-0001 to 0008) | $69,284.55
- 39 SO 2026 (Apr-Dec) → confirmed, pending invoicing
- 72 PO 2025+2026 → draft (not yet received or paid)
- 24 fiscal periods (2025+2026): 2025-01→12 closed, 2026-01→02 closed, 2026-03 open
- Budget BUDGET-2026 with 324 lines loaded

**AR KPIs (current):**
- Total invoiced: $340,814.40
- Total collected: $340,814.40
- Collection rate: 100%

**What's MISSING (the problem):**
- No AP cycle → POs exist but no receipts, no AP invoices, no supplier payments
- No COGS → AR invoices have zero cost, P&L shows only revenue, no expenses
- No inventory movements → stock balance is zero everywhere
- No opex JEs → no salaries, rent, utilities, depreciation
- P&L, Balance Sheet are incomplete/misleading

---

## Sprint 10 Plan (in priority order)

### Sprint 10A — AP Cycle
**Goal:** PO → receive goods → AP invoice → pay supplier → JE

**Flow:**
```
PO (draft) → confirmed → received (goods receipt)
→ AP Invoice created from PO
→ JE: Raw Material Inventory DR / Accounts Payable CR
→ AP Payment
→ JE: Accounts Payable DR / Cash/Bank CR
```

**What needs building:**
1. `POST /api/purchase-orders/:id/receive` — goods receipt endpoint
   - Creates stock transaction (inventory IN)
   - Creates AP invoice automatically
   - JE: `1.1.04 Raw Material Inventory DR` / `2.1.01 Accounts Payable CR`
2. AP Invoices module (`ap-invoices`) — similar to AR but for payables
   - `POST /api/ap-invoices` — create
   - `POST /api/ap-invoices/from-po/:poId` — auto from PO
   - `POST /api/ap-invoices/:id/pay` — record payment
   - JE on payment: `2.1.01 AP DR` / `1.1.02 Cash CR`
3. Frontend: AP Invoices screen under Financial menu

**Key accounts (already in CoA):**
- `1.1.02` — Cash/Bank
- `1.1.04` — Raw Material Inventory
- `2.1.01` — Accounts Payable
- `5.2.01` — Material purchases (alternative)

---

### Sprint 10B — COGS from BOM
**Goal:** When invoicing SO, calculate unit cost from BOM and record COGS

**Flow:**
```
AR Invoice sent → lookup BOM for each item
→ Calculate standard cost (BOM components × standard cost)
→ JE: COGS DR / Finished Goods Inventory CR
```

**What needs building:**
1. Fix `createFromSalesOrder` in `ar-invoices.service.ts` to:
   - Look up BOM for each line item
   - Calculate `cogsAmount = qty × BOM standard cost`
   - Populate `cogsAmount` on invoice lines
2. The JE logic already exists in `createInvoiceJe` — it just needs `cogsAmount` populated
3. Need `1.1.05 Finished Goods Inventory` account (already in CoA)
4. Need `5.1.01 Cost of Goods Sold` account (already in CoA)

**BOM cost calculation:**
```typescript
// For each SO line item:
const bom = await prisma.bom.findFirst({ where: { parentItemId: item.id } });
const components = await prisma.bomComponent.findMany({ where: { bomId: bom.id } });
const standardCost = components.reduce((sum, comp) => {
  return sum + (Number(comp.quantityPer) * Number(comp.item.standardCost));
}, 0);
const cogsAmount = soLine.orderedQuantity * standardCost;
```

---

### Sprint 10C — Inventory Valuation
**Goal:** Track stock movements, show inventory balance per warehouse

**Flow:**
```
PO received → stock IN (raw materials)
SO shipped → stock OUT (finished goods)
Production → stock OUT (raw materials) + stock IN (finished goods)
```

**What needs building:**
1. Stock transactions already have a module — verify it's wired to PO receipts
2. `GET /api/stock-transactions/balance` endpoint (may already exist)
3. Inventory valuation report on frontend
4. Average cost calculation on stock movements

---

### Sprint 10D — Manual Journal Entries (OpEx)
**Goal:** Record operating expenses to complete P&L

**Recurring monthly JEs to create for 2025 (bulk):**
- Salaries: `5.3.01 Salaries DR` / `2.1.02 Accrued Payroll CR` — ~$8,500/month
- Rent: `5.3.02 Rent DR` / `1.1.02 Cash CR` — ~$2,200/month
- Utilities: `5.3.03 Utilities DR` / `1.1.02 Cash CR` — ~$800/month
- Depreciation: `5.3.04 Depreciation DR` / `1.2.02 Accum Depreciation CR` — ~$1,200/month
- Total monthly OpEx: ~$12,700 | Annual 2025: ~$152,400

**Script approach:** Bulk-create JEs via API for all 12 months of 2025 + Q1 2026

---

## Important Technical Notes

### File locations
```
backend/src/modules/ar-invoices/ar-invoices.service.ts  ← recently modified
backend/src/modules/bulk-import/bulk-import.service.ts  ← recently modified (parseDate fix)
frontend/app/settings/bulk-import/page.tsx               ← recently modified (parseExcel fix)
```

### Key fixes already applied
1. **Date parsing:** `parseDate()` helper in bulk-import handles Excel serials, JS Date, YYYY-MM-DD, ISO strings
2. **parseExcel():** frontend uses `cellDates: true`, `raw: false`, strips hidden chars
3. **AR invoices retroactive:** `invoiceDate = new Date(so.orderDate)` instead of `new Date()`
4. **Invoice number year-aware:** `generateInvoiceNumber(tenantId, date?)` uses date year
5. **Fiscal period guard:** `assertPeriodOpen()` blocks JEs in closed/locked periods
6. **Future invoice guard:** blocks invoicing beyond end of current month

### PowerShell gotchas
- Token expires — always re-login at start of session
- `Where-Object` returns array even for single match — always use `[0]` or `Select-Object -First 1`
- Never use `.id` directly on a filtered result without `[0]` — concatenates all IDs with spaces
- BOM encoding issues with here-strings — use `[System.IO.File]::WriteAllText()` with UTF-8 no-BOM

### Chart of Accounts structure (key accounts)
```
1.1.01  Cash on Hand
1.1.02  Cash/Bank
1.1.03  Accounts Receivable
1.1.04  Raw Material Inventory
1.1.05  Finished Goods Inventory
2.1.01  Accounts Payable
2.1.02  Accrued Payroll
4.1.01  Revenue
5.1.01  Cost of Goods Sold
5.2.01  Material Purchases
5.3.01  Salaries
5.3.02  Rent
5.3.03  Utilities
5.3.04  Depreciation
```

---

## Suggested prompt for new chat

```
I'm building Sunset ERP — a full-stack manufacturing ERP.
Stack: NestJS backend + Prisma + PostgreSQL / Next.js frontend with TypeScript, Tailwind CSS v4, Tremor components.
Repo: https://github.com/Automatajm/sunset-erp
Path: C:\Users\owner\Desktop\Sunset-ERP
DB: postgresql://postgres:0824@localhost:5432/sunset_erp_dev
Tenant: 2f627a44-df80-4b0f-ba11-6fd44e62f243
Demo: admin@demo.com / Admin123!

Current state:
- 16 backend modules complete including AR invoices, BOM, production orders, budgets, automation engine, bulk import (12 entities), fiscal periods
- Simulation data loaded: Mesa manufacturing company, tables/chairs in 3 models (NAT/WAL/BLK)
- 44 SO 2025 + 8 SO 2026 Q1 → all invoiced and paid ($340,814.40 total, 100% collection)
- 39 SO 2026 (Apr-Dec) confirmed, pending invoicing
- 72 POs exist but no AP cycle yet
- Fiscal periods 2025 all closed, 2026-01/02 closed, 2026-03 open
- Budget BUDGET-2026 loaded with 324 lines

What's missing (Sprint 10 priority order):
1. AP Cycle: PO → receive → AP invoice → pay supplier → JEs
2. COGS from BOM: populate cogsAmount on AR invoice lines from BOM standard cost
3. Inventory valuation: stock balance from PO receipts and SO shipments
4. Manual JEs: opex (salaries, rent, utilities, depreciation) for complete P&L

Key technical notes:
- PowerShell: always use [0] or Select-Object -First 1 after Where-Object
- Token expires fast — re-login at session start
- BOM encoding: use [System.IO.File]::WriteAllText() with UTF-8 no-BOM for TypeScript files
- Date parsing fix already in bulk-import.service.ts (parseDate helper)
- AR invoices fix already applied (retroactive dates, fiscal period guard)

Start with Sprint 10A — AP Cycle. I need the complete ap-invoices module (service, controller, module, DTOs) and the goods receipt endpoint on purchase-orders. Show me what files to create/modify.
```

---

## Sprint 10E — Cash Flow Population

### Backend already exists:
- `POST /api/cash-flow` — create projection
- `GET /api/cash-flow/:id/summary` — monthly summary with running balance
- `POST /api/cash-flow/:id/lines` — add line manually

### What needs building:
**New endpoint:** `POST /api/cash-flow/:id/generate-from-data`

Pulls automatically from existing data:
```
Inflows:
  - AR Invoices (paid/sent) → lineType: 'inflow', category: 'ar_collection'
    amount = totalAmount, lineDate = invoiceDate

Outflows:
  - Purchase Orders (confirmed) → lineType: 'outflow', category: 'ap_payment'
    amount = total, lineDate = expectedDate ?? poDate + 30
  - Budget lines (expense accounts 5.x.xx) → lineType: 'outflow', category: 'opex'
    amount = budgetAmount, lineDate = first day of fiscalPeriod

Optional params: { startDate, endDate, includeAR, includePO, includeBudget }
```

### Quick simulation script (PowerShell — can run now):
```powershell
# 1. Create projection
$proj = Invoke-RestMethod -Uri "$base/cash-flow" -Method POST -Headers $h -Body (@{
    projectionCode = "CF-2026"
    projectionName = "Cash Flow 2026 — Mesa Manufacturing"
    startDate      = "2026-01-01"
    endDate        = "2026-12-31"
    scenario       = "realistic"
    description    = "Generated from AR invoices and PO data"
} | ConvertTo-Json)

# 2. Add AR inflows (from invoices already paid/sent)
# 3. Add PO outflows (from purchase orders)
# 4. GET /api/cash-flow/$($proj.id)/summary → monthly view
```

### Frontend screen needed:
- Financial → Cash Flow menu item
- Table: Period | Inflows | Outflows | Net | Running Balance
- Chart: waterfall or line showing running balance over 12 months
- Filter by scenario (optimistic/realistic/pessimistic)