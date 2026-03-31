# ADR-014: Stock Triple UOM — Runtime Implementation

**Status:** Accepted  
**Date:** 2026-03-31  
**Deciders:** Juan (FP&A / Systems Engineering), Sunset ERP Architecture  
**Tags:** inventory, stock, uom, manufacturing, procurement, data-model

---

## CONTEXT

ADR-013 established the triple UOM architecture at the **Item model level** — each item carries `purchaseUomId`, `storageUomId`, and `consumptionUomId` with their respective conversion factors, backed by a `UomUnit` catalog and `UomConversion` table.

However, the runtime tables that record actual inventory quantities — `Stock`, `StockMovement`, and `GoodsReceiptLine` — were not updated in Sprint 11. They still store a single quantity field (`onHandQuantity`, `quantity`) with no UOM context. This creates a gap between the design intent and operational reality:

- A GRN receiving 10 SACOS of flour posts `onHandQuantity = 10` with no record that this represents 500 KG or 500,000 GR
- The warehouse manager sees "10" with no unit label
- Production cannot see how many KG are available without manual calculation
- MRP cannot explode BOMs correctly because consumptionQty is unknown

The schema is already correct at the Item level. This ADR closes the gap at the transaction level.

---

## DECISION

Add three quantity fields to `Stock`, `StockMovement`, and `GoodsReceiptLine`. Introduce a central `UomConversionService` that resolves conversion factors and calculates all three quantities at transaction time. Preserve existing single-quantity fields for backward compatibility during transition.

### Schema Changes

#### `in_stock`
```prisma
// New fields added alongside existing onHandQuantity
purchaseQty      Decimal  @default(0) @map("purchase_qty")      @db.Decimal(15,3)
purchaseUom      String   @default("") @map("purchase_uom")     @db.VarChar(20)
storageQty       Decimal  @default(0) @map("storage_qty")       @db.Decimal(15,3)
storageUom       String   @default("") @map("storage_uom")      @db.VarChar(20)
consumptionQty   Decimal  @default(0) @map("consumption_qty")   @db.Decimal(15,3)
consumptionUom   String   @default("") @map("consumption_uom")  @db.VarChar(20)
```

`onHandQuantity` is preserved as the storage quantity alias during transition. Both fields are kept in sync. A future migration (Sprint 16+) will remove `onHandQuantity` once all consumers are updated.

#### `in_stock_movements`
```prisma
// New fields — nullable, populated when UOM is configured for the item
purchaseQty      Decimal? @map("purchase_qty")      @db.Decimal(15,3)
purchaseUom      String?  @map("purchase_uom")      @db.VarChar(20)
consumptionQty   Decimal? @map("consumption_qty")   @db.Decimal(15,3)
consumptionUom   String?  @map("consumption_uom")   @db.VarChar(20)
// existing quantity / uom fields = storageQty / storageUom (no rename)
```

#### `grn_receipt_lines`
```prisma
// receivedQuantity / uom = purchaseQty / purchaseUom (already correct semantically)
storageQty       Decimal? @map("storage_qty")       @db.Decimal(15,3)
storageUom       String?  @map("storage_uom")       @db.VarChar(20)
consumptionQty   Decimal? @map("consumption_qty")   @db.Decimal(15,3)
consumptionUom   String?  @map("consumption_uom")   @db.VarChar(20)
```

#### `po_purchase_order_lines`
```prisma
purchaseUomId    String?  @map("purchase_uom_id") @db.Uuid
purchaseUom      UomUnit? @relation(fields: [purchaseUomId], references: [id])
// existing uom string preserved for display fallback
```

### UomConversionService

Single service used by all modules. Lives in `backend/src/modules/uom/`.

**Factor resolution chain (priority order):**
1. `SupplierItem.conversionFactor` — most specific, per supplier per item
2. `UomConversion` catalog — system-level bidirectional table
3. `Item.purchaseToConsumptionFactor` — manual fallback on Item master
4. `1.0` — identity, no conversion configured

```typescript
interface AllQties {
  purchaseQty:    Decimal; purchaseUom:    string;  // ← financial unit of record
  storageQty:     Decimal; storageUom:     string;  // auxiliary — warehouse display
  consumptionQty: Decimal; consumptionUom: string;  // auxiliary — production display
}

class UomConversionService {
  async convert(qty: Decimal, fromUomId: string, toUomId: string): Promise<Decimal>
  async calcAllQties(purchaseQty: Decimal, itemId: string, supplierItemId?: string, tenantId: string): Promise<AllQties>
  async getFactor(fromUomId: string, toUomId: string): Promise<Decimal>
}
```

### Migration for existing data
```sql
-- All existing stock records: 3 quantities = onHandQuantity (factor 1, no UOM configured)
UPDATE in_stock SET
  purchase_qty    = on_hand_quantity,
  purchase_uom    = base_uom,  -- from joined Item
  storage_qty     = on_hand_quantity,
  storage_uom     = base_uom,
  consumption_qty = on_hand_quantity,
  consumption_uom = base_uom;

-- StockMovements: purchase/consumption = storage quantity (factor 1)
UPDATE in_stock_movements SET
  purchase_qty    = quantity,
  purchase_uom    = uom,
  consumption_qty = quantity,
  consumption_uom = uom;
```


### Financial Valuation Rule

**purchaseUom is the financial unit of record.**

All monetary calculations — unit cost, inventory valuation, COGS, journal entry amounts, and 3-way match price comparison — are expressed in purchaseUom. storageUom and consumptionUom are operational display units only. Conversion to financial values always passes through purchaseUom.

```
purchaseUom    → OFFICIAL  — price, cost, JE amounts, valuation, 3-way match
storageUom     → AUXILIARY — warehouse counting, bin capacity, stock balance display
consumptionUom → AUXILIARY — BOM quantities, MRP explosion, production order issues
```

This rule is absolute. No module may compute a financial value directly from storageQty or consumptionQty without first converting to purchaseQty.

#### Unit cost storage

`Stock.unitCost` stores cost **per purchaseUom unit**:

```
Stock: Harina de Trigo
  purchaseQty   = 30    SACOS    ← official qty
  unitCost      = $43.00         ← per SACO (purchaseUom)
  totalValue    = $1,290.00      ← purchaseQty × unitCost

  storageQty    = 1,500  KG     ← display only
  consumptionQty= 1,500  KG     ← display only
  
  unitCostStorage     = $43.00 / 50 = $0.86/KG   ← derived for display
  unitCostConsumption = $43.00 / 50 = $0.86/KG   ← derived for display
```

`unitCostStorage` and `unitCostConsumption` are **never stored** — always derived at query time from `unitCost / conversionFactor`.

#### Average cost recalculation at GRN receipt

```
Existing stock:  20 SACOS @ $42.00 = $840.00
Incoming GRN:    10 SACOS @ $45.00 = $450.00   ← from AP Invoice / PO price
New average:     $1,290.00 / 30 SACOS = $43.00/SACO

Stock.unitCost ← $43.00  (in purchaseUom)
```

Conversion to storageUom and consumptionUom costs derived on demand:
```
costPerKg = $43.00 / 50 = $0.86
costPerGr = $43.00 / 50,000 = $0.00086
```

#### COGS derivation at production consumption

When production consumes in consumptionUom, the financial value is derived via purchaseUom:

```typescript
// MO issues 75 KG → financial value
const consumptionQty = 75;                          // KG
const purchaseQty    = consumptionQty / storageFactor;  // 75 / 50 = 1.5 SACOS
const cogsAmount     = purchaseQty * unitCost;      // 1.5 × $43.00 = $64.50

// JE:
// DR  WIP / Production Cost    $64.50
// CR  Inventory (1300)         $64.50
```

#### calcFinancialValue() — central method in UomConversionService

```typescript
calcFinancialValue(
  qty:     Decimal,
  uomType: 'purchase' | 'storage' | 'consumption',
  item:    { unitCost: Decimal; storageFactor: Decimal; consumptionFactor: Decimal }
): Decimal {
  switch (uomType) {
    case 'purchase':
      return qty.mul(item.unitCost);                         // direct — no conversion
    case 'storage':
      return qty.div(item.storageFactor).mul(item.unitCost); // KG → SACOS → $
    case 'consumption':
      return qty.div(item.consumptionFactor).mul(item.unitCost); // same path
  }
}
```

This method is the **single source of truth** for all financial value calculations in the system. No module may implement its own conversion logic.

#### 3-Way Match comparison

The 3-way match (ADR-018) compares quantities and prices in purchaseUom:

```
AP Invoice line: 10 SACOS @ $45.50
PO line:         10 SACOS @ $45.00
GRN line:        10 SACOS received

priceVariance = |$45.50 - $45.00| / $45.00 = 1.1%  → within 2% tolerance → PASS
```

Comparing in KG would yield the same percentage but introduces floating-point risk from the conversion. purchaseUom avoids this.

---

## CONSEQUENCES

### Positive

- Warehouse managers see stock in their operational unit (SACOS, ROLLOS, CAJAS)
- Production sees consumption units (KG, LTR, PCS) without manual conversion
- MRP can correctly explode BOMs using consumptionQty
- GRN service automatically converts at receipt — no user action required
- Conversion audit trail: all 3 quantities stored permanently in StockMovement
- Items with factor = 1 (same unit everywhere) require zero extra configuration

### Negative

- Stock model has 7 quantity-related fields during transition period (3 new + 4 existing)
- All stock mutation services must call `UomConversionService` — additional async operation per transaction
- Missing `UomConversion` catalog entries cause silent fallback to factor 1 — requires catalog maintenance
- `onHandQuantity` / `storageQty` dual-field synchronization is a short-term code smell

### Neutral

- Items without UOM configuration continue to work identically to current behavior
- `baseUom` string on Item preserved alongside `consumptionUomId` FK — parallel fields until migration
- Stock Balance page gains 3 columns but shows them collapsed by default for simple items

---

## ALTERNATIVES CONSIDERED

### Alternative 1: Convert at query time only, store single quantity

**Description:** Keep `onHandQuantity` as the single source of truth in consumptionUom. Convert to purchase/storage units when displaying to purchasing or warehouse users.

**Pros:**
- No schema changes to Stock
- No conversion service needed at write time

**Cons:**
- Cannot answer "how many SACOS are in the warehouse?" without joining Item and computing at query time
- MRP and warehouse queries become expensive — joins across UomConversion for every row
- Audit trail loses which unit was actually received

**Why not chosen:** Query-time conversion is viable for display but insufficient for operational reporting and audit.

### Alternative 2: Separate stock tables per UOM domain

**Description:** Three stock tables: `StockPurchase`, `StockStorage`, `StockConsumption`.

**Pros:**
- Perfect domain separation
- Each table has exactly the fields it needs

**Cons:**
- Every stock mutation writes to 3 tables — transactional complexity
- Unique constraint (item + warehouse + lot) must be enforced across 3 tables
- 3× the storage, 3× the indexes

**Why not chosen:** Operational complexity outweighs the conceptual purity.

### Alternative 3: JSON field for multiple UOM quantities

**Description:** Store `{ purchase: {qty, uom}, storage: {qty, uom}, consumption: {qty, uom} }` as a JSONB column.

**Pros:**
- Flexible — can add more UOM contexts without schema migration

**Cons:**
- Cannot index individual quantities
- Cannot do arithmetic in SQL (aggregations, running totals)
- Prisma type safety is lost

**Why not chosen:** Breaks queryability and type safety for a core operational field.

---

## IMPLEMENTATION NOTES

### Execution order (strict)
```
1. Prisma migration: add columns to Stock, StockMovement, GRNLine, POLine
2. Data migration: backfill new columns from existing onHandQuantity
3. Create UomConversionService with tests
4. Update GoodsReceiptsService to call calcAllQties() on line creation
5. Update StockService.adjustStock() to keep all 3 in sync
6. Update Stock Balance frontend: add 3 UOM columns (collapsed by default)
7. Update Item master UI: configure 3 UOMs with conversion factor preview
```

### Sync rule for Stock mutations
Every operation that changes stock quantities must update all 3:
```typescript
// In goods-receipts.service.ts
const allQties = await this.uomConversionService.calcAllQties(
  line.receivedQuantity, line.itemId, supplierItemId, tenantId
);

await prisma.stock.upsert({
  where: { tenantId_itemId_warehouseId_... },
  update: {
    purchaseQty:    { increment: allQties.purchaseQty },
    storageQty:     { increment: allQties.storageQty },
    consumptionQty: { increment: allQties.consumptionQty },
    onHandQuantity: { increment: allQties.storageQty }, // backward compat
  },
  ...
});
```

---

## RELATED DECISIONS

- ADR-013: Triple UOM System — Item model architecture (this ADR implements the runtime half)
- ADR-003: PostgreSQL + Prisma — migrations via `prisma migrate dev`
- ADR-015: Purchase Requisition — uses consumptionUom for PR line quantities
- ADR-016: PO Consolidation — converts PR consumptionQty to purchaseQty for PO lines
- ADR-019: Inventory Valuation Model — extends the financial rule defined here into average cost, COGS, and balance sheet reporting

---

## REFERENCES

- [ADR-013: Triple UOM, Categories, SupplierItem](./ADR-013-triple-uom-categories-supplier-item.md)
- [Sunset ERP Sprint 14 Plan](../../../SPRINT-14-PLAN.md)
- [APICS Dictionary — Unit of Measure Conversion](https://www.apics.org)

---

**Review Date:** 2026-09-30 — Review if performance of calcAllQties() becomes a bottleneck at >10,000 daily transactions, or if a third-party UOM conversion library should replace the in-house catalog.