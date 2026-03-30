# Sprint 12 — Items Enrichment + Global UI Components

**Status:** Complete  
**Fecha:** Marzo 2026  
**Rama:** main  

---

## Objetivo

Enriquecer el módulo de Items con UOM triple, gestión de suppliers por ítem, y construir los componentes UI globales reutilizables que estandarizan todas las interfaces del ERP.

---

## Backend

### Items Service (`items.service.ts`)
- Auto-generación de código de ítem (`ITEM-0001`, `ITEM-0002`…) cuando el campo `code` viene vacío
- `resolveConversionFactor()` — calcula factores UOM automáticamente desde el catálogo
- `update()` con mapeo limpio de datos y coerción numérica en DTOs
- Inyección de `UomService` para resolución de factores

### Items Module (`items.module.ts`)
- `UomModule` agregado como importación

### DTOs (`create-item.dto.ts`)
- Campo `code` marcado como opcional — permite auto-generación

### Supplier Items Service (`supplier-items.service.ts`)
- `create()` reactivar registros soft-deleted en lugar de lanzar error de constraint único

---

## Frontend

### Items Page (`/inventory/items`)

**Modal enriquecido — 3 tabs:**

| Tab | Contenido |
|-----|-----------|
| General | Código, tipo, nombre, descripción, clasificación, valoración, planning, propiedades (toggles) |
| Units of Measure | UOM triple: Purchase / Storage / Consumption con factores y preview de conversión |
| Suppliers | CRUD inline de supplier-items por ítem |

**Tab Suppliers:**
- Form siempre visible (Add / Edit mode)
- Campos: Supplier, Purchase UOM, Código proveedor, Último precio, Lead time, MOQ, Preferred
- Lista scrollable (280px) con search interno
- Acción Edit popula el form arriba (no inline edit)
- `forwardRef` + `useImperativeHandle` para comunicación modal→hijo
- Tab auxiliar — no tiene botones Save/Close en footer (proceso se completa en General/UOM)

**Stats Cards clickeables:**
- Click en Raw Material, Finished Good, etc. filtra la tabla por tipo
- Card activo se resalta con el color del tipo
- Segundo click limpia el filtro

**Overlay:**
- Click fuera del modal bloqueado completamente — solo se cierra con botones

---

## Componentes Globales Creados

### `ERPTable<T>` (`/components/ui/ERPTable.tsx`)

Tabla de datos reutilizable para todas las interfaces del ERP.

| Feature | Detalle |
|---------|---------|
| Sort | Click en header cicla asc → desc → off. Flechitas naranjas indican dirección |
| Search global | Buscador en toolbar busca en todas las columnas con `value` definido |
| Paginación | Botones de página con ellipsis, First/Prev/Next/Last, selector 10/25/50/100 |
| Export | Dropdown con CSV y Excel (xlsx). Exporta todos los registros ordenados |
| Sticky thead | Headers siempre visibles, solo tbody scrollea |
| Layout | Single table con `tableLayout: auto` — columnas alineadas perfectamente |
| Theme | Dark Sunset — fondo `#0d0a1a`, naranja `#fb923c`, mono `IBM Plex Mono` |

**API:**
```tsx
<ERPTable<Item>
  columns={ITEMS_COLUMNS(onEdit, onDelete)}
  data={filtered}
  rowKey={row => row.id}
  loading={loading}
  exportFilename="items"
  defaultPageSize={25}
  maxHeight="100%"
/>
```

### `ERPFilterBar<T>` (`/components/ui/ERPFilterBar.tsx`)

Sistema de filtros declarativo y reutilizable.

**Tipos de filtro:**

| Tipo | Render | Uso |
|------|--------|-----|
| `search` | Input de texto | Búsqueda libre |
| `select` | Dropdown | Categoría, Supplier, etc. |
| `multiselect` | Chips clickeables | Tipos, estados |
| `boolean` | Toggle button | Stockable, UOM Triple, etc. |

**Hook `useERPFilters`:** maneja estado de filtros.  
**Función `applyERPFilters`:** filtra datos de forma pura.

**Filtros configurados en Items:**
- Macro Category (select)
- Category (select)
- Supplier (select)
- Valuation Method (select)
- UOM Triple (boolean)
- Stockable / Purchasable / Saleable / Manufacturable (booleans)
- Botón `↺ Clear (N)` cuando hay filtros activos

### `ERPDatePicker` (`/components/ui/ERPDatePicker.tsx`)

Calendario único que soporta 4 modos de selección:

| Modo | Comportamiento |
|------|---------------|
| `day` | Click en día → OK confirma |
| `range` | Click día → hover preview → segundo click confirma |
| `week` | Click en número WK → OK confirma semana ISO completa |
| `week-range` | Click WK → segundo click WK confirma rango |

- Siempre abre en el mes actual
- 6 filas fijas (sin vibración de calendario)
- Fechas en tiempo local (sin shift UTC)
- Escape para cerrar sin seleccionar
- Integrado en Stock Ledger — reemplaza dos `input[type=date]`

---

## Layout Global

### Sin scroll de página
Todos los módulos ahora usan layout full viewport:

```
100vh
├── shell-brand (42px, sticky)
├── shell-nav (34px, sticky)
├── shell-sub breadcrumb (flex-shrink:0)
├── shell-title (flex-shrink:0)
└── shell-content (flex:1, overflow:hidden)
    └── itm-page (height:100%, flex column)
        ├── StatsBar (flex-shrink:0)
        ├── ERPFilterBar (flex-shrink:0)
        ├── Toolbar (flex-shrink:0)
        └── ERPTable (flex:1) ← único scroll
```

**Cambios en archivos base:**
- `ERPShell.tsx` — `.shell-content { overflow: hidden; min-height: 0 }`
- `globals.css` — `html, body { height: 100%; overflow: hidden }`
- `layout.tsx` — `className="dark h-full"` en html y body

---

## Commits

```
feat(sprint12): items enrichment complete + supplier CRUD
feat(sprint12): auto-calculate UOM conversion factors from catalog
feat(sprint12): ERPTable global component + items integration
feat(sprint12): ERPDatePicker + stock ledger integration
feat(sprint12): ERPFilterBar global component + Items filters
feat(sprint12): global search in ERPTable toolbar
feat(sprint12): full viewport layout - no page scroll
feat(sprint12): items enrichment - final UX polish
```

---

## Diferido a Sprints Posteriores

| Item | Motivo |
|------|--------|
| Stock movements `consumptionQuantity` / `purchaseQuantity` | Se cubre en Sprint 13 con el ciclo de compras |
| BOM — verificar `quantityPer` FK con `consumptionUomId` | Se cubre en Sprint 15 con producción |
| `baseUom` legacy cleanup | Requiere migración de datos — diferido |
| Light/dark theme switch | Cosmético — diferido |

---

## Próximo: Sprint 13 — Suppliers + Purchase Orders

Flujo objetivo:
```
Items → [Compras] → Recepción → Almacén → Producción
```

Módulos a desarrollar:
- Suppliers (completo — dirección, términos, contactos)
- Purchase Orders (cabecera + líneas + estados)
- Recepción de materiales (GRN → Stock update)