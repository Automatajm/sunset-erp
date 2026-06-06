# Module Dependency Cascade — Spec Coverage Master Checklist

> Purpose: guarantee that **no backend module ships a spec before its dependencies**.
> Modules are ordered in a **topological cascade** (dependencies first). Spec a module
> only after every module it depends on is `✅ Done`. This file is the single source of
> truth for *what to spec next* and *what was skipped*.

Status legend: `✅ Done` · `⬜ Pending` · `🔢 spec-XXX`

Dependency signals used: (1) `imports:[]` in `*.module.ts`, (2) injected `*Service`,
(3) **Prisma foreign-key relations** between owned models (the dominant signal).

Two legitimate dependency **cycles** exist and must be specced as one cluster each:
- **Procurement cluster** — `purchase-orders ↔ rfqs ↔ purchase-requisitions ↔ general-needs`
- **Production cluster** — `production-plans ↔ sales-orders`

---

## Coverage summary

| Metric | Value |
|--------|-------|
| Business modules total | 38 |
| Specced (Done) | 16 — `auth`, `suppliers`, `items`, `warehouses`, `uom`, `macro-categories`, `chart-of-accounts`, `consumption-groups`, `categories`, `work-centers`, `bom`, spec-012 (auto-codes, cross-cutting), `customers`, `warehouse-locations`, `journal-entries`, `stock-transactions` |
| Pending | 22 |

### ⚠️ Cascade violations already shipped (skipped prerequisites)
These were specced **before** their own dependencies were specced. Their prerequisites
must be back-filled to restore cascade integrity:

- `items` (spec-003) depends on → `uom` ✅ (spec-005), `categories` ✅ (spec-009), `consumption-groups` ✅ (spec-008) — **cascade integrity restored**
- `suppliers` (spec-002) depends on → `items` ✅ (ok)
- `warehouses` (spec-004) depends on → nothing (ok)

So **`categories`, `consumption-groups`** are the remaining highest-priority back-fills
(`uom` back-filled by spec-005; `categories` unblocked — `chart-of-accounts` ✅ spec-007).

---

## The cascade (spec top-to-bottom)

### Tier 0 — Foundation (depend on no business module)
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ✅ spec-001 | auth | User, Role, Permission, RolePermission, UserRole | none |
| ⬜ | tenants | Tenant, Subscription, SubscriptionPlan, Invoice, UsageRecord | none |
| ⬜ | users | User, UserTenant | none |
| ⬜ | roles | Role, RolePermission | none |
| ✅ spec-005 | uom | UomUnit, UomConversion | none |
| ✅ spec-007 | chart-of-accounts | Account | none |
| ✅ spec-006 | macro-categories | MacroCategory | none |
| ✅ spec-013 | customers | Customer | none |
| ✅ spec-010 | work-centers | WorkCenter | none |
| ✅ spec-004 | warehouses | Warehouse | none |
| ⬜ | automation | AutomationConfig, AutoJeQueue | none |
| ⬜ | fiscal-periods | FiscalPeriod | none |
| ⬜ | bulk-import | StockLocationBatch, StockLocationBatchLine, StockLocationUpdate | none |
| ⬜ | financial-reports | (none — read model) | none |

### Tier 1 — depend only on Tier 0
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ✅ spec-008 | consumption-groups | ConsumptionGroup | uom |
| ✅ spec-009 | categories | Category | chart-of-accounts, macro-categories |
| ⬜ | tenant-settings | TenantSettings | uom |
| ✅ spec-015 | journal-entries | JournalEntry, JournalEntryLine | chart-of-accounts |
| ⬜ | budgets | Budget, BudgetLine | chart-of-accounts |
| ⬜ | cash-flow | CashFlowProjection, CashFlowLine | chart-of-accounts |
| ✅ spec-014 | warehouse-locations | WarehouseZone, WarehouseAisle, WarehouseRack, WarehouseLevel, WarehouseBin | warehouses |

### Tier 2 — master data
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ✅ spec-003 | items | Item | categories, consumption-groups, uom |

### Tier 3 — depend on items
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ✅ spec-002 | suppliers | Supplier, SupplierScore | items |
| ✅ spec-011 | bom | Bom, BomComponent, BomRouting | consumption-groups, items, uom, work-centers |
| ✅ spec-016 | stock-transactions | StockMovement, StockLocationUpdate, Stock | items, uom, warehouse-locations, warehouses |
| ⬜ | stock-reconciliation | StockCountSession, StockCountLine, StockCountAssignment | items, uom, warehouse-locations, warehouses |

### Tier 4 — operations & clusters
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ⬜ | supplier-items | SupplierItem | items, suppliers, uom |
| ⬜ | **Procurement cluster** ↺ | — | items, suppliers, warehouses, consumption-groups |
| ⬜ | · purchase-orders | PurchaseOrder, PurchaseOrderLine, ConsolidationConfig | items, suppliers, uom, rfqs* |
| ⬜ | · purchase-requisitions | PurchaseRequisition, PurchaseRequisitionLine | items, purchase-orders*, warehouses |
| ⬜ | · rfqs | Rfq, RfqLine, RfqSupplier, RfqResponseLine | items, suppliers, general-needs*, purchase-orders*, purchase-requisitions* |
| ⬜ | · general-needs | GeneralNeed, GeneralNeedLine | items, suppliers, consumption-groups, purchase-requisitions* |
| ⬜ | **Production cluster** ↺ | — | bom, items, customers |
| ⬜ | · production-plans | ProductionPlan, ProductionPlanLine | bom, items, sales-orders* |
| ⬜ | · sales-orders | SalesOrder, SalesOrderLine | customers, items, production-plans* |

`*` = intra-cluster cyclic edge — spec the cluster as one unit.

### Tier 5 — downstream transactions
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ⬜ | goods-receipts | GoodsReceipt, GoodsReceiptLine | items, purchase-orders, stock-transactions, suppliers, uom, warehouses |
| ⬜ | production-orders | ProductionOrder, MoLaborActual, MoMaterialActual, ProductionVariance | automation, bom, items, journal-entries, production-plans |
| ⬜ | ar-invoices | ArInvoice, ArInvoiceLine, ArPayment | automation, chart-of-accounts, customers, items, journal-entries, sales-orders, stock-transactions |

### Tier 6 — top of stack
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ⬜ | ap-invoices | ApInvoice, ApInvoiceLine, ApPayment | automation, chart-of-accounts, goods-receipts, items, journal-entries, purchase-orders, stock-transactions, suppliers |

---

## Recommended spec order (next 10)

Restore cascade integrity first (back-fill skipped prerequisites), then climb:

1. ~~**uom**~~ ✅ spec-005 — Tier 0, prerequisite of items✅, consumption-groups, bom, stock-*, supplier-items, procurement. Highest leverage.
2. ~~**macro-categories**~~ ✅ spec-006 — Tier 0, prerequisite of categories.
3. ~~**chart-of-accounts**~~ ✅ spec-007 — Tier 0, prerequisite of journal-entries, budgets, cash-flow, categories, invoices.
4. ~~**consumption-groups**~~ ✅ spec-008 — Tier 1, prerequisite of items✅, bom, general-needs.
5. ~~**categories**~~ ✅ spec-009 — Tier 1, prerequisite of items✅.
6. ~~**customers**~~ ✅ spec-013 — Tier 0, prerequisite of sales-orders, ar-invoices.
7. ~~**work-centers**~~ ✅ spec-010 — Tier 0, prerequisite of bom.
8. ~~**warehouse-locations**~~ ✅ spec-014 — Tier 1, prerequisite of stock-*.
9. ~~**journal-entries**~~ ✅ spec-015 — Tier 1, prerequisite of production-orders, invoices.
10. ~~**bom**~~ ✅ spec-011 — Tier 3, prerequisite of production cluster.
11. ~~**stock-transactions**~~ ✅ spec-016 — Tier 3, prerequisite of goods-receipts, stock-reconciliation, invoices.
12. **stock-reconciliation** — Tier 3 (deps all ✅), cycle counts feeding the movement ledger. ← **next**
