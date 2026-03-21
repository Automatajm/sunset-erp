# Sunset ERP — Phase 4: Interconexión & Automatización
## Sprints 5–9 | Project Plan

> **Status:** In Progress  
> **Author:** Juan M. / Automatajm  
> **Last Updated:** 2026-03-21  
> **Repo:** https://github.com/Automatajm/sunset-erp

---

## Table of Contents

1. [Overview & Vision](#1-overview--vision)
2. [Manual / Auto Toggle Architecture](#2-manual--auto-toggle-architecture)
3. [Budget Architecture](#3-budget-architecture)
4. [Sprint Plan](#4-sprint-plan)
5. [Database Schema — New Tables](#5-database-schema--new-tables)
6. [API Endpoints](#6-api-endpoints)
7. [Frontend Pages](#7-frontend-pages)
8. [Technical Reference](#8-technical-reference)

---

## 1. Overview & Vision

Sunset ERP Phase 4 connects all existing modules into a unified automated workflow — from incoming purchase orders to financial reporting. The system runs fully automatically **or** fully manually, configurable per tenant and overridable per transaction.

### 1.1 Core Design Principles

- **Manual / Auto toggle per module** — every automated action can be overridden manually
- **Single source of truth** — one budget, one ledger, one inventory — no parallel systems
- **Bulk import on every module** — Excel templates for all master data and transactions
- **Auto-posting with review** — system generates JEs, finance approves before posting
- **Variance tracking** — every discrepancy between planned and actual is logged as an issue

### 1.2 End-to-End Workflow

```
INCOMING CONTRACT / PO
        │
        ▼
   SALES ORDER ──────────────────────────────► BUDGET AUTO-UPDATE
        │                                              ▲
        ▼                                              │
  PRODUCTION ORDER                           (parametrized BOM + rates)
   ┌────┼────┐
   ▼    ▼    ▼
LABOR MAT. EQUIP.
        │
        ▼
  FINISHED GOODS DELIVERY
        │
        ├──► AUTO-JE: DR FG Inventory / CR WIP
        │
        ▼
   AR INVOICE  ◄──── Finance (manual or auto per customer)
        │
        ├──► AUTO-JE: DR AR / CR Revenue
        │           DR CoGS / CR FG Inventory
        │
        ▼
  VARIANCE REPORT
   ┌────┴────┐
   ▼         ▼
MERMA     SURPLUS
(Issue)   (Issue)
   │
   ▼
ADJUSTMENT JE
        │
        ▼
   AR PAYMENT
        │
        └──► AUTO-JE: DR Cash / CR AR
```

---

## 2. Manual / Auto Toggle Architecture

Every module operates in one of three modes, configurable per tenant:

| Mode | Trigger | User Action Required | Override |
|------|---------|---------------------|----------|
| `FULL_AUTO` | System event (e.g. FG delivery confirmed) | Review & approve only | Yes — edit before posting |
| `SEMI_AUTO` | User initiates, system fills data | Confirm generated values | Yes — full edit |
| `MANUAL` | User creates everything | Enter all values | N/A |

### 2.1 Module Configuration Defaults

| Module | Default Mode | Can Change | Notes |
|--------|-------------|------------|-------|
| SO → Production Order | `SEMI_AUTO` | Yes | System creates draft MO; user confirms |
| MO → Material Requisition | `FULL_AUTO` | Yes | Pulls from BOM automatically |
| FG Delivery → Journal Entry | `FULL_AUTO` | Yes | DR FG Inv / CR WIP on confirm |
| AR Invoice creation | `SEMI_AUTO` | Yes | Toggle per customer in customer master |
| Invoice → Journal Entry | `FULL_AUTO` | Yes | DR AR / CR Revenue on approval |
| Payment → Journal Entry | `FULL_AUTO` | Yes | DR Cash / CR AR on receipt confirm |
| Budget Auto-generation | `MANUAL` | Yes | Run on demand from contracts/POs |
| Variance Issues | `FULL_AUTO` | No | Always auto-logged; JE is manual review |
| Purchase Order from MRP | `SEMI_AUTO` | Yes | System suggests POs; buyer approves |

---

## 3. Budget Architecture

### 3.1 One Budget, Multiple Sources

A single budget per fiscal year. Lines tagged by `source` for full traceability:

```
BUDGET 2026
├── source = 'manual'     ← user entered or uploaded via Excel
├── source = 'auto'       ← calculated from contracts × BOM × rates
└── source = 'adjusted'   ← auto-generated then manually edited
```

**Rule:** Lines with `locked = true` are never overwritten by auto-runs.

### 3.2 New Budget Line Fields

| Field | Type | Description |
|-------|------|-------------|
| `budget_amount` | Decimal | Active value (manual or auto-accepted) |
| `auto_amount` | Decimal | System-calculated reference (read-only) |
| `source` | Enum | `manual` \| `auto` \| `adjusted` |
| `locked` | Boolean | If true, auto-run skips this line |
| `auto_run_id` | UUID | Reference to the auto-generation run |
| `notes` | Text | User annotation |

### 3.3 Auto-generation Flow

```
1. Upload projected contracts/POs → fiscal year
2. System reads BOM per product → material requirements per period
3. Apply Rate Card (labor + overhead rates) → cost per unit
4. Generate draft lines (source = 'auto', auto_run_id = run.id)
5. Finance reviews → adjusts (source = 'adjusted') → locks critical lines
6. Re-run respects locked lines; recalculates only unlocked ones
```

### 3.4 Budget Comparison View

| Indicator | Manual Bud | Auto Bud | Actual | Var vs Manual |
|-----------|-----------|---------|--------|--------------|
| Revenue | $8.54M | $8.68M | $8.68M | +$140K / +1.6% |
| Cost of Sales | $1.03M | $0.98M | $1.09M | -$60K / -5.8% |
| SG&A | $545K | $530K | $617K | -$72K / -13.2% |
| EBIT | $6.84M | $7.17M | $5.61M | -$1.23M / -18% |

---

## 4. Sprint Plan

| Sprint | Name | Scope | Depends On |
|--------|------|-------|-----------|
| **5** | AR Invoicing | Invoice lifecycle, auto-JE, AR aging, payments | Existing SO module |
| **6** | Production Completeness | MO actuals, FG delivery, variance tracking | Existing MO module |
| **7** | Accounting Automation Engine | Auto-JE triggers, manual toggle, JE review queue | Sprints 5 + 6 |
| **8** | Budget Auto-generation | Contract upload → MRP → rates → budget lines | Sprint 7 |
| **9** | Bulk Import (All Modules) | Excel upload + validation + preview everywhere | All sprints |

---

### Sprint 5 — AR Invoicing

**Goal:** Complete the revenue cycle from Sales Order to payment receipt with full accounting integration.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 5.1 | Invoice data model: `ar_invoices`, `ar_invoice_lines`, `ar_payments` | Critical | Linked to SO + customer |
| 5.2 | Invoice lifecycle: `draft → sent → partial → paid → overdue → void` | Critical | State machine |
| 5.3 | Auto-invoice from SO + FG Delivery (toggle per customer) | High | Semi-auto mode |
| 5.4 | Auto-JE on approval: DR AR / CR Revenue + DR CoGS / CR FG | Critical | Reversible |
| 5.5 | Payment application: partial and full | High | DR Cash / CR AR |
| 5.6 | AR Aging report: current / 30 / 60 / 90+ days | High | Dashboard widget |
| 5.7 | Invoice PDF generation | Medium | Download + email |
| 5.8 | Bulk invoice import from Excel | Medium | Template + validation |
| 5.9 | Dashboard KPIs: Invoiced, Collected, Pending, Overdue | High | Home page widget |

**Auto-JE on Invoice Approval:**
```
DR  1.1.03  Accounts Receivable        invoice_total
    CR  4.1.xx  Revenue (by product)       invoice_total

DR  5.1.xx  Cost of Goods Sold          fg_cost
    CR  1.1.05  Finished Goods Inventory    fg_cost
```

---

### Sprint 6 — Production Completeness

**Goal:** Close the production loop with labor/material actuals, FG delivery, and variance tracking.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 6.1 | Labor actuals posting against MO (planned vs actual hours) | Critical | Efficiency metric |
| 6.2 | Material consumption vs BOM (planned vs actual quantities) | Critical | Waste tracking |
| 6.3 | FG Delivery confirmation with quantity input | Critical | Triggers auto-JE |
| 6.4 | Auto-JE on FG delivery: DR FG Inventory / CR WIP | Critical | Cost rollup |
| 6.5 | Variance calculation: produced vs invoiced vs planned | High | Merma / surplus |
| 6.6 | Variance issue creation with automatic JE suggestion | High | DR Mermas / CR FG |
| 6.7 | MO efficiency report: labor hours, material yield, overhead | Medium | Management report |
| 6.8 | Equipment utilization tracking | Low | Future enhancement |

**Variance Logic:**
```
Planned:   1,000 units  → MO cost = $5,000
Delivered:   960 units  → FG Inventory += $4,800
Invoiced:    950 units  → Revenue recognized for 950

Merma (40 units, $200):
  DR  6.x.xx  Production Losses / Mermas    $200
      CR  1.1.05  Finished Goods Inventory       $200

Surplus (10 units) → remains in FG Inventory, no JE needed
```

---

### Sprint 7 — Accounting Automation Engine

**Goal:** Central auto-JE engine connecting all module events to accounting entries.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 7.1 | Auto-JE trigger engine: event → template → draft JE | Critical | Core infrastructure |
| 7.2 | JE review queue: pending auto-JEs awaiting finance approval | Critical | Workflow |
| 7.3 | Manual toggle per module in tenant settings | High | UI + config table |
| 7.4 | JE template library: configurable DR/CR patterns per event | High | Per-tenant |
| 7.5 | PO Receipt trigger: DR Raw Materials / CR AP | High | |
| 7.6 | MO Issue trigger: DR WIP / CR Raw Materials | High | |
| 7.7 | Bulk JE import from Excel | Medium | |
| 7.8 | Reversal workflow for auto-posted JEs | High | Audit compliance |

**Event → JE Template Map:**

| Event | Debit Account | Credit Account |
|-------|-------------|---------------|
| PO Receipt confirmed | 1.1.04 Raw Materials | 2.1.01 AP Suppliers |
| MO Material issue | WIP | 1.1.04 Raw Materials |
| FG Delivery confirmed | 1.1.05 FG Inventory | WIP |
| Invoice approved | 1.1.03 AR + 5.x CoGS | 4.1.x Revenue + 1.1.05 FG |
| Payment received | 1.1.02 Banks | 1.1.03 AR |
| Variance (merma) | 6.x Merma expense | 1.1.05 FG Inventory |

---

### Sprint 8 — Budget Auto-generation

**Goal:** Upload contracts → system calculates full budget using BOM and rate cards.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 8.1 | Rate Card master: labor, overhead, equipment rates per unit | Critical | Foundation |
| 8.2 | Contract / projected PO upload for budget period | Critical | Excel or manual |
| 8.3 | MRP: contracts × BOM → material requirements by period | Critical | Core engine |
| 8.4 | Labor budget: MRP units × labor rate from BOM | Critical | Auto-generated |
| 8.5 | Revenue budget: contracts × price → revenue lines | High | Auto-generated |
| 8.6 | Budget line tagging: `source = 'auto'` + `auto_run_id` | High | Traceability |
| 8.7 | Lock mechanism: preserve manual adjustments on re-run | High | Manual control |
| 8.8 | Budget comparison view: manual vs auto vs actual | Medium | Dashboard |
| 8.9 | Delta re-run: only recalculate unlocked lines | Medium | Smart refresh |

---

### Sprint 9 — Bulk Import (All Modules)

**Goal:** Excel import flow on every module — load thousands of records without manual entry.

#### Universal Import UX Pattern

```
1. Click "Import" → Download Excel template (headers + example row)
2. Fill template → Upload .xlsx
3. System validates → Preview: valid rows (✓) + errors (✗ highlighted)
4. "Import Valid Rows" → skips errors  OR  "Fix & Re-upload"
5. Confirmation: X imported, Y skipped → Error report downloadable
```

#### Templates by Module

| Module | Key Fields | Critical Validations |
|--------|-----------|---------------------|
| Chart of Accounts | accountNumber, name, accountType, accountCategory, parentAccountNumber | Unique#, valid type, parent exists |
| Budget Lines | fiscalYear, accountNumber, fiscalPeriod (YYYY-MM), budgetAmount | Account exists, valid period |
| Journal Entries | entryDate, description, accountNumber, debitAmount, creditAmount | DR = CR per entry group |
| Customers | customerCode, name, email, creditLimit, paymentTerms | Unique code, valid email |
| Suppliers | supplierCode, name, email, paymentTerms | Unique code |
| Inventory Items | itemCode, name, unitOfMeasure, unitCost, reorderPoint | Unique code, valid UOM |
| BOM Lines | bomCode, componentItemCode, quantity, wasteFactor | BOM exists, item exists |
| Purchase Orders | poNumber, supplierCode, itemCode, quantity, unitPrice, deliveryDate | Supplier + item exist |
| AR Invoices | invoiceNumber, customerCode, invoiceDate, dueDate, itemCode, qty, unitPrice | Customer exists, valid dates |
| Rate Cards | rateType, description, unitRate, effectiveDate | Valid rateType, numeric rate |

---

## 5. Prisma Schema — New Models

> All models follow the existing multi-tenant pattern in `backend/prisma/schema.prisma`.  
> Standard fields on every model: `id`, `tenantId`, `createdBy`, `updatedBy`, `deletedAt`, `createdAt`, `updatedAt`.

### Sprint 5 — AR Models

```prisma
model ArInvoice {
  id            String    @id @default(uuid())
  tenantId      String
  soId          String?   // optional Sales Order link
  customerId    String
  invoiceNumber String
  invoiceDate   DateTime
  dueDate       DateTime
  status        String    @default("draft")
  // draft | sent | partial | paid | overdue | void
  subtotal      Decimal   @default(0) @db.Decimal(15,2)
  taxAmount     Decimal   @default(0) @db.Decimal(15,2)
  totalAmount   Decimal   @default(0) @db.Decimal(15,2)
  paidAmount    Decimal   @default(0) @db.Decimal(15,2)
  notes         String?
  jeId          String?   // auto-JE reference

  lines         ArInvoiceLine[]
  payments      ArPayment[]
  journalEntry  JournalEntry?   @relation(fields: [jeId], references: [id])
  salesOrder    SalesOrder?     @relation(fields: [soId], references: [id])

  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  createdBy  String?
  updatedBy  String?
  deletedAt  DateTime?

  @@unique([tenantId, invoiceNumber])
  @@map("ar_invoices")
}

model ArInvoiceLine {
  id               String   @id @default(uuid())
  tenantId         String
  invoiceId        String
  itemId           String?
  description      String?
  quantity         Decimal  @db.Decimal(15,4)
  unitPrice        Decimal  @db.Decimal(15,4)
  amount           Decimal  @db.Decimal(15,2)
  cogsAmount       Decimal? @db.Decimal(15,2)
  revenueAccountId String?
  cogsAccountId    String?

  invoice ArInvoice @relation(fields: [invoiceId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("ar_invoice_lines")
}

model ArPayment {
  id            String   @id @default(uuid())
  tenantId      String
  invoiceId     String
  paymentDate   DateTime
  amount        Decimal  @db.Decimal(15,2)
  paymentMethod String?  // cash | transfer | check | card
  reference     String?
  jeId          String?
  notes         String?

  invoice      ArInvoice     @relation(fields: [invoiceId], references: [id])
  journalEntry JournalEntry? @relation(fields: [jeId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?

  @@map("ar_payments")
}
```

### Sprint 6 — Production Actuals Models

```prisma
model MoLaborActual {
  id           String   @id @default(uuid())
  tenantId     String
  moId         String
  employeeId   String?
  workDate     DateTime?
  hoursPlanned Decimal? @db.Decimal(8,2)
  hoursActual  Decimal? @db.Decimal(8,2)
  laborRate    Decimal? @db.Decimal(10,4)
  laborCost    Decimal? @db.Decimal(15,2)

  manufacturingOrder ManufacturingOrder @relation(fields: [moId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("mo_labor_actuals")
}

model MoMaterialActual {
  id           String  @id @default(uuid())
  tenantId     String
  moId         String
  itemId       String
  qtyPlanned   Decimal @db.Decimal(15,4)
  qtyActual    Decimal @db.Decimal(15,4)
  unitCost     Decimal @db.Decimal(10,4)
  varianceCost Decimal @db.Decimal(15,2)

  manufacturingOrder ManufacturingOrder @relation(fields: [moId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("mo_material_actuals")
}

model ProductionVariance {
  id           String   @id @default(uuid())
  tenantId     String
  moId         String
  varianceType String   // merma | surplus | labor | overhead
  quantity     Decimal? @db.Decimal(15,4)
  unitCost     Decimal? @db.Decimal(10,4)
  totalCost    Decimal? @db.Decimal(15,2)
  status       String   @default("open") // open | je_posted | closed
  jeId         String?
  notes        String?

  manufacturingOrder ManufacturingOrder @relation(fields: [moId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy String?
  updatedBy String?

  @@map("production_variances")
}
```

### Sprint 7 — Automation Engine Models

```prisma
model AutoJeTemplate {
  id               String  @id @default(uuid())
  tenantId         String
  eventType        String
  // po_receipt | mo_issue | fg_delivery | invoice_approved | payment_received | variance
  description      String?
  debitAccountId   String
  creditAccountId  String
  amountSource     String? // JSON path to amount field in source record
  isActive         Boolean @default(true)

  queue AutoJeQueue[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("auto_je_templates")
}

model AutoJeQueue {
  id          String    @id @default(uuid())
  tenantId    String
  templateId  String
  sourceId    String
  sourceType  String
  draftJeId   String?
  status      String    @default("pending")
  // pending | approved | rejected | posted
  reviewedBy  String?
  reviewedAt  DateTime?
  notes       String?

  template AutoJeTemplate @relation(fields: [templateId], references: [id])

  createdAt DateTime @default(now())

  @@map("auto_je_queue")
}

model AutomationConfig {
  id        String   @id @default(uuid())
  tenantId  String
  module    String
  mode      String   @default("semi_auto")
  // full_auto | semi_auto | manual
  updatedBy String?
  updatedAt DateTime @updatedAt

  @@unique([tenantId, module])
  @@map("automation_config")
}
```

### Sprint 8 — Budget Auto-generation Models

```prisma
model RateCard {
  id            String    @id @default(uuid())
  tenantId      String
  rateType      String    // labor | overhead | equipment
  description   String?
  unitRate      Decimal   @db.Decimal(10,4)
  currency      String    @default("USD")
  effectiveDate DateTime
  endDate       DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("rate_cards")
}

model BudgetAutoRun {
  id           String   @id @default(uuid())
  tenantId     String
  budgetId     String
  fiscalYear   String
  runDate      DateTime @default(now())
  linesCreated Int      @default(0)
  linesUpdated Int      @default(0)
  linesSkipped Int      @default(0) // locked lines
  status       String   // running | completed | failed
  errorLog     String?
  runBy        String?

  budget Budget @relation(fields: [budgetId], references: [id])

  @@map("budget_auto_runs")
}

// Extend existing FinBudgetLine model — add to schema:
// autoAmount  Decimal?  @db.Decimal(15,2)
// source      String    @default("manual")  // manual | auto | adjusted
// locked      Boolean   @default(false)
// autoRunId   String?
// notes       String?
```

### Sprint 9 — Import Job Models

```prisma
model ImportJob {
  id          String    @id @default(uuid())
  tenantId    String
  module      String
  filename    String?
  totalRows   Int       @default(0)
  validRows   Int       @default(0)
  errorRows   Int       @default(0)
  status      String    @default("pending")
  // pending | validating | importing | completed | failed
  importedBy  String?
  startedAt   DateTime?
  completedAt DateTime?

  errors ImportError[]

  @@map("import_jobs")
}

model ImportError {
  id           String @id @default(uuid())
  jobId        String
  rowNumber    Int
  field        String?
  errorMessage String
  rawValue     String?

  job ImportJob @relation(fields: [jobId], references: [id])

  @@map("import_errors")
}
```

## 6. API Endpoints

### Sprint 5 — AR Invoicing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ar-invoices` | List with filters (status, customer, date range) |
| `POST` | `/api/ar-invoices` | Create invoice (manual or from SO) |
| `GET` | `/api/ar-invoices/:id` | Detail with lines and payment history |
| `PATCH` | `/api/ar-invoices/:id/send` | Mark sent → triggers auto-JE |
| `PATCH` | `/api/ar-invoices/:id/void` | Void → reversal JE |
| `POST` | `/api/ar-invoices/:id/payments` | Apply payment (partial or full) |
| `GET` | `/api/ar-invoices/aging` | AR Aging: current / 30 / 60 / 90+ buckets |
| `POST` | `/api/ar-invoices/import` | Bulk import from Excel |
| `GET` | `/api/ar-invoices/:id/pdf` | Generate PDF |

### Sprint 6 — Production

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/manufacturing-orders/:id/labor-actuals` | Post labor actuals |
| `POST` | `/api/manufacturing-orders/:id/material-actuals` | Post material consumption |
| `POST` | `/api/manufacturing-orders/:id/deliver` | Confirm FG delivery + auto-JE |
| `GET` | `/api/manufacturing-orders/:id/variances` | Variance summary for MO |
| `GET` | `/api/production-variances` | All variances with filters |
| `PATCH` | `/api/production-variances/:id/post-je` | Post variance adjustment JE |

### Sprint 7 — Automation Engine

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auto-je/queue` | Pending auto-JEs awaiting review |
| `PATCH` | `/api/auto-je/:id/approve` | Approve and post |
| `PATCH` | `/api/auto-je/:id/reject` | Reject (deletes draft) |
| `GET` | `/api/automation-config` | Tenant automation settings |
| `PATCH` | `/api/automation-config/:module` | Update mode for a module |
| `GET` | `/api/auto-je/templates` | List JE templates |
| `POST` | `/api/auto-je/templates` | Create custom template |

### Sprint 8 — Budget Auto-generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/rate-cards` | List rate cards |
| `POST` | `/api/rate-cards` | Create rate entry |
| `POST` | `/api/budgets/:id/auto-generate` | Run auto-generation from contracts |
| `GET` | `/api/budgets/:id/auto-runs` | Auto-generation run history |
| `PATCH` | `/api/budget-lines/:id/lock` | Lock / unlock a line |

### Sprint 9 — Bulk Import

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/import/template/:module` | Download Excel template |
| `POST` | `/api/import/:module/validate` | Validate file → return preview |
| `POST` | `/api/import/:module` | Execute import of valid rows |
| `GET` | `/api/import/jobs` | List import jobs |
| `GET` | `/api/import/jobs/:id/errors` | Download error report |

---

## 7. Frontend Pages

| Sprint | Route | Page | Key Components |
|--------|-------|------|----------------|
| 5 | `/sales/invoices` | AR Invoice List | Status filters, aging summary, bulk actions |
| 5 | `/sales/invoices/new` | Create Invoice | SO selector, line items, auto-fill |
| 5 | `/sales/invoices/:id` | Invoice Detail | Lines, payments, JE link, PDF |
| 5 | `/sales/invoices/aging` | AR Aging Report | Bucket table, drill-down by customer |
| 6 | `/manufacturing/orders/:id/actuals` | MO Actuals Entry | Labor + material vs planned |
| 6 | `/manufacturing/orders/:id/delivery` | FG Delivery Confirm | Quantity input, variance preview |
| 6 | `/manufacturing/variances` | Variance Report | Merma/surplus + JE suggestions |
| 7 | `/accounting/automation` | Automation Settings | Module toggle table |
| 7 | `/accounting/je-queue` | JE Review Queue | Pending auto-JEs, approve/reject |
| 8 | `/accounting/budget/auto-generate` | Budget Auto-gen | Contract upload, MRP preview |
| 8 | `/accounting/budget/comparison` | Budget Comparison | Manual vs auto vs actual |
| 9 | `/settings/import` | Bulk Import Center | Module selector, template, upload |

---

## 8. Technical Reference

### 8.1 Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend | NestJS + TypeScript | 16 modules, 113+ endpoints |
| ORM | Prisma | PostgreSQL, multi-tenant |
| Database | PostgreSQL 17 | Local dev, cloud-ready |
| Frontend | Next.js 16 + TypeScript | App Router |
| UI | Tailwind CSS v4 + Tremor | Dark theme, IBM Plex fonts |
| Auth | JWT + RBAC | Tenant isolation |
| PowerShell | UTF-8 no-BOM | Use `[System.IO.File]::WriteAllText()` |

### 8.2 Key IDs — Demo Tenant

```
Tenant ID:   2f627a44-df80-4b0f-ba11-6fd44e62f243
Credentials: admin@demo.com / Admin123!
Backend:     http://localhost:3000
Frontend:    http://localhost:3001
Database:    postgresql://postgres:0824@localhost:5432/sunset_erp_dev
GitHub:      https://github.com/Automatajm/sunset-erp
Budget 2025: 0be97fc4-6da8-4840-9f27-8bf70f0479d6
Budget 2026: 614479cd-6cae-4465-ac50-1aa4e52729ce
```

### 8.3 Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| DB Tables | `snake_case` with module prefix | `ar_invoices`, `mo_labor_actuals` |
| API Routes | `kebab-case` | `/api/ar-invoices`, `/api/auto-je` |
| Frontend Routes | `kebab-case` | `/sales/invoices`, `/accounting/je-queue` |
| TypeScript Types | `PascalCase` | `ARInvoice`, `ProductionVariance` |
| Prisma Models | `PascalCase` | `ArInvoice`, `AutoJeTemplate` |

### 8.4 Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Core ERP Foundation (Auth, CoA, JE, TB) | ✅ Complete |
| Phase 2 | Operational Modules (SO, PO, MO, Inventory) | ✅ Complete |
| Phase 3 | Dashboard & Reporting (P&L, BS, Budget, KPIs) | ✅ Complete |
| **Phase 4** | **Interconexión & Automatización (Sprints 5–9)** | 🔄 In Progress |

---

*Sunset ERP — Confidential — Phase 4 Plan — 2026*
