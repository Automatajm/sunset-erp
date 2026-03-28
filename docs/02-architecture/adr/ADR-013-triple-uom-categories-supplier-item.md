# ADR-013: Triple UOM System, UOM Catalog, Item Category Hierarchy, and Supplier-Item Relationship

**Status:** Accepted  
**Date:** 2026-03-28  
**Deciders:** Juan (FP&A / Systems Engineering), Sunset ERP Architecture  
**Tags:** inventory, manufacturing, procurement, data-model, uom, categories, tenant-settings

---

## CONTEXT

The current `Item` model has a single `baseUom` field (a free-text string) that serves all three logistics domains simultaneously — purchasing, warehousing, and production. This creates four distinct operational problems:

**Problem 1 — No UOM catalog:** Units of measure are free-text strings with no validation, no type classification (volume, mass, count), and no system affiliation (metric vs imperial). Automatic conversion is impossible and data inconsistency exists across modules.

**Problem 2 — Purchasing:** Suppliers sell the same material in different commercial presentations (gallons, barrels, kits, liters). The purchasing team must manually convert quantities when comparing quotes and creating POs. There is no system-enforced conversion and no way to track which supplier sells which presentation.

**Problem 3 — Warehousing:** Warehouse staff need to count and organize inventory in the unit that best fits physical manipulation and storage. Forcing them to work in the purchase unit or production unit creates counting errors and inefficiencies.

**Problem 4 — Production:** Production planners need to see material requirements in the unit they consume in the process. Converting from purchase or storage units at point of consumption is error-prone and wastes time.

Additionally, `categoryId` on `Item` exists but has no backing table — item classification is impossible. No GL account linkage at category level for automatic JE routing. No way to assign multiple suppliers to a single item with individual commercial conditions.

---

## DECISION

Implement a six-part enrichment of the Item module, executed in strict dependency order:

### 1. UOM Catalog + Conversion Table

```
UomUnit
  ├── code         → LTR, GAL, BRL, KG, LB, PCS, M, FT
  ├── name         → Liter, Gallon, Barrel, Kilogram, Pound, Piece
  ├── type         → volume | mass | count | length | area | time
  ├── system       → metric | imperial | universal
  └── isBase       → true = base unit for its type+system
                     (LTR = base for volume+metric, GAL = base for volume+imperial)

UomConversion
  ├── fromUomId    → GAL
  ├── toUomId      → LTR
  ├── factor       → 3.78541
  └── UNIQUE(fromUomId, toUomId)
```

**Seeded conversions:**

| From | To | Factor | Type |
|------|----|--------|------|
| GAL | LTR | 3.78541 | volume |
| LTR | GAL | 0.26417 | volume |
| BRL | LTR | 200.000 | volume |
| LTR | BRL | 0.00500 | volume |
| OZ | LTR | 0.02957 | volume |
| LB | KG | 0.45359 | mass |
| KG | LB | 2.20462 | mass |
| FT | M | 0.30480 | length |
| M | FT | 3.28084 | length |
| IN | CM | 2.54000 | length |

Universal units (PCS, UNIT, BOX, PALLET, KIT) have no conversion — always 1:1 within themselves.

### 2. Tenant UOM Settings

```
TenantSettings (one record per tenant)
  ├── defaultUomSystem   → 'metric' | 'imperial'
  ├── volumeBaseUomId    → FK → UomUnit (LTR if metric, GAL if imperial)
  ├── massBaseUomId      → FK → UomUnit (KG if metric, LB if imperial)
  ├── lengthBaseUomId    → FK → UomUnit (M if metric, FT if imperial)
  └── areaBaseUomId      → FK → UomUnit (M2 if metric, FT2 if imperial)
```

- **Production always sees quantities in the company's base UOM system**
- **Purchasing can receive any UOM from any supplier** — system converts automatically
- When `purchaseUom` and `consumptionUom` exist in `UomConversion`, `purchaseToConsumptionFactor` is calculated automatically
- Manual factor override allowed for special cases not in catalog

### 3. Category Hierarchy (two-level, strict)

```
MacroCategory  (top level — required for all Categories)
  └── Category  (must belong to MacroCategory — never orphaned)
        └── Item  (must belong to Category)
```

- `MacroCategory`: grouping only — no GL accounts, no transactions
- `Category`: carries `inventoryAccountId` and `cogsAccountId` for automatic JE routing
- `categoryId` on Item: **nullable in DB, required in UI**

### 4. Triple UOM per Item

Each item carries three independent unit fields — all FK to `UomUnit`:

| Field | Owner | Purpose | Example |
|-------|-------|---------|---------|
| `purchaseUomId` | Purchasing | Unit used in POs and supplier quotes | GAL, BRL, KIT |
| `storageUomId` | Warehouse | Unit used for stock counting | LTR, PCS, CAJA |
| `consumptionUomId` | Production | Unit used in BOM and production orders | LTR, KG, PCS |

Conversion factors per item:
- `purchaseToConsumptionFactor`: auto-calculated from `UomConversion` when possible, manual override allowed
- `storageToConsumptionFactor`: auto-calculated from `UomConversion` when possible, manual override allowed

`baseUom` string field **preserved** for backward compatibility. `consumptionUomId` progressively replaces it.

### 5. Consumption Group (optional)

Groups interchangeable items sharing the same consumption unit. Production sees total availability across all presentations:

```
ConsumptionGroup: "INDUSTRIAL ADHESIVE" (consumptionUom: LTR)
  ├── PEG-LOCTITE-GAL  → 200 GAL × 3.78541 =  757.1 LTR
  └── PEG-BOSTIK-BRL   →   3 BRL × 200     =  600.0 LTR
  Total visible to Production: 1,357.1 LTR
```

Always optional. Items with no conversion needs do not require a group.

### 6. Supplier-Item Relationship

New `SupplierItem` junction table — UNIQUE on `(tenantId, supplierId, itemId)`:
- One item → N suppliers, one supplier → N items
- Same supplier cannot duplicate same item
- Each record: supplier's item code/name, purchase UOM (FK UomUnit), pack size, last price, lead time, MOQ, preferred flag
- Only one `SupplierItem` per item can be `isPreferred = true`

---

## KEY DESIGN DECISIONS

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UOM as FK vs free string | FK to UomUnit | Enables auto-conversion, validation, system detection |
| Conversion factor | Auto from catalog, manual override | Covers 95% automatically, handles edge cases |
| Company UOM system | TenantSettings | Production always sees its system; purchasing receives any |
| `categoryId` nullability | Nullable DB, required UI | Avoids breaking existing API contracts |
| ConsumptionGroup | Always optional | Not all items need conversion |
| StorageUom independence | Can differ from PurchaseUom | Three independent logistics domains |
| UOM triple on sales items | Yes, with 1:1:1 factors | Zero cost now; expensive to migrate later |
| Table prefix for UOM/Settings | `cfg_` prefix | Configuration domain, separate from inventory `in_` domain |

---

## CONSEQUENCES

### Positive

- Purchasing receives quotes in any unit, any system — system converts automatically
- Production always sees consumption units regardless of how purchased or stored
- Warehouse manages stock in the most operationally convenient unit
- Automatic conversion eliminates calculation errors at PO receipt, stock movement, and BOM explosion
- GL account routing for inventory JEs becomes automatic via Category
- Multi-supplier per item enables cost comparison and supply chain resilience
- System detects metric/imperial mismatch at data entry and warns before saving
- Stock Planning ATP aggregates by ConsumptionGroup — true availability in production units

### Negative

- Item creation form becomes significantly more complex
- UomConversion catalog must be maintained — missing conversions cause runtime fallback to manual factor
- All stock movement modules must be updated to record in all three UOMs
- `baseUom` string creates technical debt as parallel to `consumptionUomId`
- More complex stock balance queries — join UomUnit and convert on the fly

### Neutral

- Items with no conversion (factor = 1 everywhere) fully supported without extra configuration
- Imperial and metric items can coexist in same tenant — system converts at display time
- ConsumptionGroup aggregation is read-only computed view — does not change physical stock storage

---

## ALTERNATIVES CONSIDERED

### Alternative 1: Free-text UOM with manual conversion at transaction time

**Description:** Keep one free-text UOM. Require users to manually enter conversion when creating POs, receiving goods, or issuing to production.

**Pros:**
- No schema changes required
- Simpler data model

**Cons:**
- Manual conversion is error-prone
- No metric/imperial mismatch detection
- No aggregation across presentations in Stock Planning

**Why not chosen:** Creates the exact operational problems we are solving.

### Alternative 2: UOM conversion table only, no triple UOM per item

**Description:** Create `UomUnit` and `UomConversion`. Keep one UOM per item. Convert at query time.

**Pros:**
- Simpler item model
- Conversion catalog reusable

**Cons:**
- Does not solve three-logistics separation — purchasing, warehouse, production share one unit
- Cannot express "buy in GAL, store in LTR, consume in LTR" per item

**Why not chosen:** Solves unit validation but not the operational domain separation.

### Alternative 3: Item variants (parent-child item structure)

**Description:** Parent item = consumption unit. Child variants = commercial presentations.

**Pros:**
- Clean separation between commercial and production items

**Cons:**
- Adds complexity to all item-referencing modules
- ConsumptionGroup achieves same aggregation goal without restructuring item hierarchy

**Why not chosen:** Overkill for current scale.

### Alternative 4: UOM system toggle only (no per-item UOM)

**Description:** One global setting: metric or imperial. All items use system base units automatically.

**Pros:**
- Very simple — zero per-item configuration

**Cons:**
- Cannot handle mixed-unit purchasing (supplier A in GAL, supplier B in BRL)
- Cannot separate warehouse unit from production unit

**Why not chosen:** Too rigid for real purchasing operations.

---

## IMPLEMENTATION NOTES

### Execution order (strict — dependencies flow downward)

```
Step 1: UomUnit + UomConversion + seed data           (cfg_uom_units, cfg_uom_conversions)
Step 2: TenantSettings                                 (cfg_tenant_settings → references UomUnit)
Step 3: MacroCategory                                  (in_macro_categories)
Step 4: Category                                       (in_categories → references MacroCategory + GL accounts)
Step 5: ConsumptionGroup                               (in_consumption_groups → references UomUnit)
Step 6: Item modifications                             (in_items → references Category, ConsumptionGroup, UomUnit ×3)
Step 7: SupplierItem                                   (in_supplier_items → references Item + Supplier + UomUnit)
Step 8: Data migration for existing 4 items
Step 9: Update AP receipt + stock movements to record all 3 UOMs
```

### Auto-conversion logic at PO receipt

```typescript
const factor = await uomConversionService.getFactor(
  item.purchaseUomId,
  item.consumptionUomId
) ?? item.purchaseToConsumptionFactor; // fallback to manual factor

const consumptionQty = purchaseQty * factor;
const storageQty     = purchaseQty * (factor / item.storageToConsumptionFactor);

// StockMovement stores all three
movement.purchaseQuantity    = purchaseQty;    // what PO says
movement.quantity            = storageQty;     // what warehouse manages
movement.consumptionQuantity = consumptionQty; // what production sees
```

### Metric/Imperial mismatch detection

```typescript
const supplierUom = await uomUnitService.findById(dto.purchaseUomId);
const tenantSystem = tenantSettings.defaultUomSystem;

if (supplierUom.system !== 'universal' && supplierUom.system !== tenantSystem) {
  // Warning — do NOT block purchasing
  return { warning: 'Supplier uses imperial units. Conversion applied automatically.' };
}
```

### Data migration for existing 4 items

```sql
-- 1. Create seed MacroCategories
INSERT INTO in_macro_categories (id, tenant_id, code, name) VALUES
  (gen_random_uuid(), '2f627a44-...', 'WOOD',    'Wood & Panels'),
  (gen_random_uuid(), '2f627a44-...', 'PACKING', 'Packing Materials');

-- 2. Create seed Categories
INSERT INTO in_categories (id, tenant_id, macro_category_id, code, name) VALUES
  (gen_random_uuid(), '2f627a44-...', '<wood_id>',    'FG-FURNITURE', 'Finished Furniture'),
  (gen_random_uuid(), '2f627a44-...', '<packing_id>', 'PKG-CARTON',   'Carton Packaging');

-- 3. Assign categories to items
UPDATE in_items SET category_id = '<fg_furniture_id>'
WHERE code IN ('MESA-BLK', 'MESA-NAT', 'MESA-WAL');

UPDATE in_items SET category_id = '<pkg_carton_id>'
WHERE code = 'RM-EMPAQUE';

-- 4. Set UOM triple (all 1:1 for existing items)
UPDATE in_items SET
  purchase_uom_id              = (SELECT id FROM cfg_uom_units WHERE code = base_uom),
  purchase_to_consumption_factor = 1,
  storage_uom_id               = (SELECT id FROM cfg_uom_units WHERE code = base_uom),
  storage_to_consumption_factor  = 1,
  consumption_uom_id           = (SELECT id FROM cfg_uom_units WHERE code = base_uom)
WHERE tenant_id = '2f627a44-df80-4b0f-ba11-6fd44e62f243';
```

### Modules impacted in Sprint 11

| Module | Change required |
|--------|----------------|
| Items API | Add UOM FK fields, category, consumption group relations |
| AP Invoice receipt | Convert purchaseQty → storageQty + consumptionQty |
| Stock movements schema | Add `consumptionQuantity` + `purchaseQuantity` columns |
| Stock balance display | Show in all 3 UOMs |
| Stock Planning ATP | Aggregate by ConsumptionGroup in consumptionUom |
| BOM components | Verify `quantityPer` FK alignment to consumptionUom |
| PO lines | Default `purchaseUom` from SupplierItem when supplier selected |

---

## RELATED DECISIONS

- ADR-001: Modular monolith — new modules (`uom`, `categories`, `supplier-items`) follow same pattern
- ADR-002: Shared database — all new tables use `tenant_id` for RLS
- ADR-003: PostgreSQL + Prisma — migrations via `prisma migrate dev`
- ADR-004: Module prefixes — UOM/settings tables use `cfg_` prefix; category/item tables use `in_` prefix

---

## REFERENCES

- [Sunset ERP Sprint 11 Plan](./SPRINT11-PLAN.md)
- [APICS Dictionary — Unit of Measure](https://www.apics.org)
- [NIST Unit Conversion Factors](https://www.nist.gov/pml/weights-and-measures)
- [PostgreSQL UNIQUE constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

---

**Review Date:** 2026-09-28 — Review if density-based mass↔volume conversions become necessary, or if ConsumptionGroup aggregation performance degrades at >10,000 items.