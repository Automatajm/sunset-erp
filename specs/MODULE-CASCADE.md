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

_Recounted 2026-06-08 against `backend/src/modules/` (39 dirs) and
`specs/completed/` (34 numbered backend specs + 5 frontend specs)._

| Metric | Value |
|--------|-------|
| Business modules total | 39 |
| **Specced (Done)** | **38** |
| **Pending** | **1 — `bulk-import`** |

**38 covered backend modules** (module → covering spec):
`auth` (001, +034 session), `suppliers` (002), `items` (003), `warehouses` (004),
`uom` (005), `macro-categories` (006), `chart-of-accounts` (007),
`consumption-groups` (008), `categories` (009), `work-centers` (010), `bom` (011),
`customers` (013), `warehouse-locations` (014), `journal-entries` (015),
`stock-transactions` (016), `stock-reconciliation` (017), `supplier-items` (018),
`sales-orders` + `production-plans` (019 production cluster),
`purchase-orders` + `rfqs` + `purchase-requisitions` + `general-needs`
(020 procurement cluster), `currency` + `tenant-settings` (021 multi-currency),
`notifications` (022), `goods-receipts` (023), `production-orders` (024),
`ap-invoices` (025), `ar-invoices` (026),
`users` + `roles` + `tenants` (+`tenant-settings`) (027 admin cluster),
`budgets` (029), `cash-flow` (030), `automation` (031), `financial-reports` (032),
`fiscal-periods` (033).
Cross-cutting (not a single module): `auto-codes` (012), `non-destructive-seed`
(028, tooling).

**Frontend specs** (separate series, not in the 39-module backend count):
frontend-002 (data components ✅), frontend-005/006/007/008 (document printing
✅); frontend-001 (theming) and frontend-003 (page inventory) remain in
`specs/active/`.

### ⚠️ The one genuinely unspecced backend module
- **`bulk-import`** (`backend/src/modules/bulk-import/` — controller + service +
  dto, ~2.4k LOC). It is *referenced* by several specs only as a frontend
  consumer of their envelopes (007/010/011/013) and as an `auto-codes` exception
  (012), but it has **no dedicated spec** of its own. It does CSV/Excel
  import/export with preview + dry-run across multiple entities. Candidate for
  the next `/new-spec bulk-import` (opportunity-finder first — it generates codes
  and writes many tenant-owned tables, so tenant-scoping + validation are the
  likely findings).

### Cascade integrity — resolved
All prior "specced before its dependency" violations are closed: `uom` (005),
`categories` (009), `consumption-groups` (008), `chart-of-accounts` (007) are all
Done, so `items`/`suppliers`/`bom` rest on specced foundations. No outstanding
back-fills.

---

## The cascade (spec top-to-bottom)

### Tier 0 — Foundation (depend on no business module)
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ✅ spec-001 | auth | User, Role, Permission, RolePermission, UserRole | none |
| ✅ spec-027 | tenants | Tenant, Subscription, SubscriptionPlan, Invoice, UsageRecord | none |
| ✅ spec-027 | users | User, UserTenant | none |
| ✅ spec-027 | roles | Role, RolePermission | none |
| ✅ spec-005 | uom | UomUnit, UomConversion | none |
| ✅ spec-007 | chart-of-accounts | Account | none |
| ✅ spec-006 | macro-categories | MacroCategory | none |
| ✅ spec-013 | customers | Customer | none |
| ✅ spec-010 | work-centers | WorkCenter | none |
| ✅ spec-004 | warehouses | Warehouse | none |
| ✅ spec-031 | automation | AutomationConfig, AutoJeQueue | none |
| ✅ spec-033 | fiscal-periods | FiscalPeriod | none |
| ⬜ | bulk-import | StockLocationBatch, StockLocationBatchLine, StockLocationUpdate | none |
| ✅ spec-032 | financial-reports | (none — read model) | none |

### Tier 1 — depend only on Tier 0
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ✅ spec-008 | consumption-groups | ConsumptionGroup | uom |
| ✅ spec-009 | categories | Category | chart-of-accounts, macro-categories |
| ✅ spec-021 | tenant-settings | TenantSettings | uom |
| ✅ spec-015 | journal-entries | JournalEntry, JournalEntryLine | chart-of-accounts |
| ✅ spec-029 | budgets | Budget, BudgetLine | chart-of-accounts |
| ✅ spec-030 | cash-flow | CashFlowProjection, CashFlowLine | chart-of-accounts |
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
| ✅ spec-017 | stock-reconciliation | StockCountSession, StockCountLine, StockCountAssignment | items, uom, warehouse-locations, warehouses |

### Tier 4 — operations & clusters
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ✅ spec-018 | supplier-items | SupplierItem | items, suppliers, uom |
| ✅ spec-020 | **Procurement cluster** ↺ | — | items, suppliers, warehouses, consumption-groups |
| ✅ spec-020 | · purchase-orders | PurchaseOrder, PurchaseOrderLine, ConsolidationConfig | items, suppliers, uom, rfqs* |
| ✅ spec-020 | · purchase-requisitions | PurchaseRequisition, PurchaseRequisitionLine | items, purchase-orders*, warehouses |
| ✅ spec-020 | · rfqs | Rfq, RfqLine, RfqSupplier, RfqResponseLine | items, suppliers, general-needs*, purchase-orders*, purchase-requisitions* |
| ✅ spec-020 | · general-needs | GeneralNeed, GeneralNeedLine | items, suppliers, consumption-groups, purchase-requisitions* |
| ✅ spec-019 | **Production cluster** ↺ | — | bom, items, customers |
| ✅ spec-019 | · production-plans | ProductionPlan, ProductionPlanLine | bom, items, sales-orders* |
| ✅ spec-019 | · sales-orders | SalesOrder, SalesOrderLine | customers, items, production-plans* |

`*` = intra-cluster cyclic edge — spec the cluster as one unit.

### Tier 5 — downstream transactions
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ✅ spec-023 | goods-receipts | GoodsReceipt, GoodsReceiptLine | items, purchase-orders, stock-transactions, suppliers, uom, warehouses |
| ✅ spec-024 | production-orders | ProductionOrder, MoLaborActual, MoMaterialActual, ProductionVariance | automation, bom, items, journal-entries, production-plans |
| ✅ spec-026 | ar-invoices | ArInvoice, ArInvoiceLine, ArPayment | automation, chart-of-accounts, customers, items, journal-entries, sales-orders, stock-transactions |

### Tier 6 — top of stack
| Status | Module | Owns (Prisma) | Depends on |
|--------|--------|---------------|-----------|
| ✅ spec-025 | ap-invoices | ApInvoice, ApInvoiceLine, ApPayment | automation, chart-of-accounts, goods-receipts, items, journal-entries, purchase-orders, stock-transactions, suppliers |

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
12. ~~**stock-reconciliation**~~ ✅ spec-017 — Tier 3, cycle counts feeding the movement ledger.
13. ~~**supplier-items**~~ ✅ spec-018 — Tier 4, last single module before the clusters.
14. ~~**Production cluster**~~ ✅ spec-019 — first cluster spec, one unit.
15. ~~**Procurement cluster**~~ ✅ spec-020 — Tier 4, four-module cycle shipped as one unit (award injection fix, 5 transactions, shared tx-aware generators).
16. ~~**goods-receipts**~~ ✅ spec-023 — Tier 5, wires the GoodsReceipt model that PO.receive bypasses.
17. **bulk-import** — Tier 0, the ONLY genuinely unspecced backend module. CSV/Excel
    import/export with preview + dry-run; generates codes and writes many
    tenant-owned tables. ← **next** (`/new-spec bulk-import`).

> **spec-018 (supplier-items) drift:** the module gained 5 endpoints
> (`price-history`, `expiring-prices`, `counts-by-supplier`, `counts-by-item`,
> `update-price`) and 9 schema fields (currency, incoterm, paymentTerms,
> priceValidFrom/Until, priceAlertDays, qualityRating, isBlocked, blockedReason)
> plus the `SupplierItemPriceHistory` model — all post-dating its spec. spec-018
> needs a v2 refresh to re-cover the module.
