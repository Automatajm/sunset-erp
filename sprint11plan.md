# Sprint 11 — UOM Catalog, Triple UOM, Item Categories & Supplier-Item
**Sunset ERP · Date:** 2026-03-28  
**Status:** Ready to execute  
**ADR:** ADR-013

---

## Objective

Build the foundational classification and unit-of-measure infrastructure before more transactional data enters the system. This sprint is purely additive — no existing data or APIs are broken.

---

## Confirmed Design Decisions

| Decision | Choice |
|----------|--------|
| `categoryId` on Item | Nullable in DB, required in UI |
| ConsumptionGroup | Always optional |
| StorageUom vs PurchaseUom | Independent — can differ |
| UOM triple on sales items | Yes, with 1:1:1 factors |
| UOM as FK | FK to `UomUnit` — not free strings |
| Conversion factor | Auto-calculated from catalog, manual override allowed |
| Company UOM system | Configured in `TenantSettings` |
| Table prefix | `cfg_` for UOM/settings, `in_` for inventory |

---

## New Tables

```
cfg_uom_units             UOM catalog (LTR, GAL, KG, LB, PCS...)
cfg_uom_conversions       Conversion factors between units
cfg_tenant_settings       Company-level defaults (metric/imperial, base units)
in_macro_categories       Top-level item grouping
in_categories             Item category with GL account links
in_consumption_groups     Production-facing item grouping with shared consumption UOM
in_supplier_items         Multi-supplier per item junction table
```

## Modified Tables

```
in_items                  Add: purchaseUomId, storageUomId, consumptionUomId,
                               purchaseToConsumptionFactor, storageToConsumptionFactor,
                               consumptionGroupId, macrocategoryId (via category)
in_stock_movements        Add: consumptionQuantity, purchaseQuantity (future step)
```

---

## Execution Order (strict — dependencies flow downward)

### Step 1 — UomUnit + UomConversion + seed data
**New tables:** `cfg_uom_units`, `cfg_uom_conversions`  
**New module:** `backend/src/modules/uom/`  
**Seed:** Full catalog — metric, imperial, universal units + all conversion factors  

**Endpoints:**
```
GET  /uom/units                     List all UOM units (filterable by type, system)
GET  /uom/units/:id
GET  /uom/conversions               List all conversion factors
GET  /uom/convert?from=GAL&to=LTR&qty=50  → { result: 189.27, factor: 3.78541 }
```

---

### Step 2 — TenantSettings
**New table:** `cfg_tenant_settings`  
**New module:** `backend/src/modules/tenant-settings/`  

**Fields:**
```
defaultUomSystem   'metric' | 'imperial'
volumeBaseUomId    FK → cfg_uom_units
massBaseUomId      FK → cfg_uom_units
lengthBaseUomId    FK → cfg_uom_units
areaBaseUomId      FK → cfg_uom_units
```

**Endpoints:**
```
GET   /tenant-settings          Get current tenant settings
PATCH /tenant-settings          Update settings
```

**Seed for demo tenant:** `metric`, volumeBase=LTR, massBase=KG, lengthBase=M

---

### Step 3 — MacroCategory
**New table:** `in_macro_categories`  
**New module:** `backend/src/modules/macro-categories/`  

**Fields:** `code`, `name`, `description`, `isActive`  
**Constraint:** Cannot delete if has child categories  

**Endpoints:**
```
GET    /macro-categories
POST   /macro-categories
PATCH  /macro-categories/:id
DELETE /macro-categories/:id
```

**Seed:**
```
WOOD      Wood & Panels
PACKING   Packing Materials
CHEMICAL  Chemicals & Adhesives
METAL     Metal & Hardware
OFFICE    Office & Supplies
```

---

### Step 4 — Category
**New table:** `in_categories`  
**New module:** `backend/src/modules/categories/`  

**Fields:** `macrocategoryId` (required), `code`, `name`, `description`,  
`inventoryAccountId` (FK → ChartOfAccount), `cogsAccountId` (FK → ChartOfAccount)  

**Constraint:** `macrocategoryId` required — no orphan categories  

**Endpoints:**
```
GET    /categories?macroCategoryId=
GET    /categories/:id
POST   /categories
PATCH  /categories/:id
DELETE /categories/:id
```

**Seed:**
```
WOOD     → FG-FURNITURE    Finished Furniture      (inv: 1.3.01, cogs: 5.1.01)
WOOD     → RM-WOOD         Raw Wood Materials      (inv: 1.3.02, cogs: 5.1.02)
PACKING  → PKG-CARTON      Carton Packaging        (inv: 1.3.03, cogs: 5.1.03)
CHEMICAL → CHM-ADHESIVE    Adhesives               (inv: 1.3.04, cogs: 5.1.04)
```

---

### Step 5 — ConsumptionGroup
**New table:** `in_consumption_groups`  
**New module:** `backend/src/modules/consumption-groups/`  

**Fields:** `code`, `name`, `description`, `consumptionUomId` (FK → cfg_uom_units)  

**Endpoints:**
```
GET    /consumption-groups
GET    /consumption-groups/:id          (includes items + converted ATP)
POST   /consumption-groups
PATCH  /consumption-groups/:id
DELETE /consumption-groups/:id
```

---

### Step 6 — Item modifications
**Modify:** `backend/src/modules/items/` (service, DTO, controller)  
**Prisma migration:** Add new fields to `in_items`  

**New fields on Item:**
```prisma
categoryId                   String?   @map("category_id") @db.Uuid        // was already there, now FK
consumptionGroupId           String?   @map("consumption_group_id") @db.Uuid
purchaseUomId                String?   @map("purchase_uom_id") @db.Uuid
purchaseToConsumptionFactor  Decimal   @default(1) @map("purchase_to_consumption_factor") @db.Decimal(15,6)
storageUomId                 String?   @map("storage_uom_id") @db.Uuid
storageToConsumptionFactor   Decimal   @default(1) @map("storage_to_consumption_factor") @db.Decimal(15,6)
consumptionUomId             String?   @map("consumption_uom_id") @db.Uuid
```

**Auto-conversion on save:** When `purchaseUomId` and `consumptionUomId` are set and a conversion exists in catalog → auto-populate `purchaseToConsumptionFactor`.

**Enriched response:**
```json
{
  "conversions": {
    "purchase":     { "uom": "GAL", "factor": 3.78541, "consumptionUom": "LTR" },
    "storage":      { "uom": "GAL", "factor": 3.78541, "consumptionUom": "LTR" },
    "consumption":  { "uom": "LTR" }
  },
  "preview": "1 GAL = 3.785 LTR (consumption)"
}
```

---

### Step 7 — SupplierItem
**New table:** `in_supplier_items`  
**New module:** `backend/src/modules/supplier-items/`  

**Fields:**
```
supplierId           FK → sc_suppliers
itemId               FK → in_items
supplierItemCode     VARCHAR(100)
supplierItemName     VARCHAR(255)
purchaseUomId        FK → cfg_uom_units
packSize             DECIMAL(15,4) DEFAULT 1
packUom              FK → cfg_uom_units
conversionFactor     DECIMAL(15,6) DEFAULT 1   (auto-calculated if in catalog)
lastPrice            DECIMAL(15,4)
leadTimeDays         INT DEFAULT 0
moq                  DECIMAL(15,3) DEFAULT 1
isPreferred          BOOLEAN DEFAULT false
isActive             BOOLEAN DEFAULT true
notes                TEXT
UNIQUE(tenantId, supplierId, itemId)
```

**Endpoints:**
```
GET    /supplier-items?itemId=&supplierId=&isPreferred=
POST   /supplier-items
PATCH  /supplier-items/:id
DELETE /supplier-items/:id
GET    /items/:id/suppliers          All suppliers for an item + conversion preview
GET    /suppliers/:id/items          All items from a supplier
```

**Business rule:** When `isPreferred = true` is set on a SupplierItem, system automatically sets `isPreferred = false` on all other SupplierItems for that item, and updates `Item.defaultSupplierId`.

---

### Step 8 — Data migration (existing 4 items)

```sql
-- Assign categories
UPDATE in_items SET category_id = '<fg_furniture_id>'
WHERE code IN ('MESA-BLK', 'MESA-NAT', 'MESA-WAL');

UPDATE in_items SET category_id = '<pkg_carton_id>'
WHERE code = 'RM-EMPAQUE';

-- Set UOM triple (1:1 for now — units exist as PCS in catalog)
UPDATE in_items SET
  purchase_uom_id               = (SELECT id FROM cfg_uom_units WHERE code = 'PCS'),
  purchase_to_consumption_factor = 1,
  storage_uom_id                = (SELECT id FROM cfg_uom_units WHERE code = 'PCS'),
  storage_to_consumption_factor  = 1,
  consumption_uom_id            = (SELECT id FROM cfg_uom_units WHERE code = 'PCS')
WHERE code IN ('MESA-BLK', 'MESA-NAT', 'MESA-WAL');

UPDATE in_items SET
  purchase_uom_id               = (SELECT id FROM cfg_uom_units WHERE code = 'PCS'),
  purchase_to_consumption_factor = 1,
  storage_uom_id                = (SELECT id FROM cfg_uom_units WHERE code = 'PCS'),
  storage_to_consumption_factor  = 1,
  consumption_uom_id            = (SELECT id FROM cfg_uom_units WHERE code = 'PCS')
WHERE code = 'RM-EMPAQUE';
```

---

### Step 9 — Frontend pages

| Page | Route | Priority |
|------|-------|----------|
| UOM Units (read-only catalog) | `/settings/uom` | Medium |
| Tenant Settings | `/settings/general` | High |
| Macro Categories | `/inventory/macro-categories` | High |
| Categories | `/inventory/categories` | High |
| Consumption Groups | `/inventory/consumption-groups` | Medium |
| Item page — enriched modal | `/inventory/items` (modify existing) | High |
| Item detail — Suppliers tab | `/inventory/items` (expand existing) | High |

**ERPShell NAV additions:**
```
Inventory → Master Data:
  + Macro Categories   /inventory/macro-categories
  + Categories         /inventory/categories
  + Consumption Groups /inventory/consumption-groups

Settings → Configuration:
  + General Settings   /settings/general
  + Units of Measure   /settings/uom
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `categoryId` required breaks Item creates | High | Keep nullable in DB; DTO validation warns but doesn't block during transition |
| Missing UomConversion causes runtime error | Medium | Service returns manual factor as fallback; logs warning |
| Existing `baseUom` strings don't match new UomUnit codes | Medium | Seed UomUnit with exact codes used in existing data (PCS, units) |
| SupplierItem duplicate on create | Low | UNIQUE constraint + clear error message in API |
| `isPreferred` sync race condition | Low | Handle in DB transaction — update all, then set one |

---

## Definition of Done

- [ ] All 7 new tables created and migrated
- [ ] All endpoints tested with Postman/PowerShell
- [ ] Existing 4 items migrated with categories and UOM
- [ ] Demo tenant configured: metric system, LTR/KG/M base units
- [ ] Frontend pages for MacroCategory, Category, TenantSettings live
- [ ] Item modal enriched with Category selector and UOM triple UI
- [ ] Item detail shows Suppliers tab with add/edit supplier
- [ ] UOM conversion endpoint tested: `GET /uom/convert?from=GAL&to=LTR&qty=50` → 189.27
- [ ] Git commit: `feat(sprint11): uom catalog, triple uom, categories, supplier-item`
- [ ] ADR-013 saved to `docs/02-architecture/adr/`

---

## File Structure

```
backend/src/modules/
  uom/
    uom.module.ts
    uom.controller.ts
    uom.service.ts
    dto/

  tenant-settings/
    tenant-settings.module.ts
    tenant-settings.controller.ts
    tenant-settings.service.ts
    dto/

  macro-categories/
    macro-categories.module.ts
    macro-categories.controller.ts
    macro-categories.service.ts
    dto/

  categories/
    categories.module.ts
    categories.controller.ts
    categories.service.ts
    dto/

  consumption-groups/
    consumption-groups.module.ts
    consumption-groups.controller.ts
    consumption-groups.service.ts
    dto/

  supplier-items/
    supplier-items.module.ts
    supplier-items.controller.ts
    supplier-items.service.ts
    dto/

frontend/app/
  settings/
    general/page.tsx        (TenantSettings)
    uom/page.tsx            (UOM catalog — read only)
  inventory/
    macro-categories/page.tsx
    categories/page.tsx
    consumption-groups/page.tsx
    items/page.tsx          (MODIFIED — add UOM + Category + Suppliers tab)

frontend/lib/api/
  uom.ts
  tenant-settings.ts
  macro-categories.ts
  categories.ts
  consumption-groups.ts
  supplier-items.ts
```