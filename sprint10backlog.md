# Sunset ERP — Post Sprint 10A Backlog

## Sprint 10B-bis: Vendor & Item Master Enrichment
> Prioridad: Alta — bloquea calidad del AP cycle y vendor scorecard
> Prerequisito: Sprint 10A (AP Cycle) completado

### 1. Vendor-Item Cross Reference (Item Master)
Vincular múltiples vendors a un mismo item con condiciones específicas por vendor.

**Nuevo modelo: `SupplierItem` (po_supplier_items)**
```
supplierId        → Supplier
itemId            → Item
supplierItemCode  → código del item en el catálogo del proveedor
supplierItemName  → descripción del proveedor
leadTimeDays      → lead time específico de este vendor
minOrderQty       → cantidad mínima de orden
packSize          → tamaño de empaque
unitPrice         → precio acordado (base para validación en receipt)
currency          → moneda del precio
isPreferred       → vendor preferido para este item
isActive
validFrom / validTo → vigencia del precio acordado
notes
```

**Impacto en PO:** al crear línea de PO, sugerir precio desde SupplierItem.
**Impacto en Receipt Quality Gate:** comparar precio recibido vs `SupplierItem.unitPrice`.

---

### 2. Supplier Master Enrichment
Completar el modelo `Supplier` con información financiera y operacional real.

**Campos a agregar al modelo Supplier:**
```
# Clasificación
supplierType      → manufacturer | distributor | service | contractor
ratingScore       → score calculado del vendor scorecard

# Dirección
addressLine1/2
city / state / country / zipCode

# Contacto adicional
contactName
contactTitle
```

**Nuevo modelo: `SupplierContact` (po_supplier_contacts)**
```
supplierId
contactName
contactTitle
contactType   → primary | billing | technical | emergency
phone
email
isActive
```

**Nuevo modelo: `SupplierPaymentMethod` (po_supplier_payment_methods)**
```
supplierId
methodType        → wire | ach | check | credit_card | zelle | other
isDefault
currency
bankName
bankBranch
accountHolderName
accountNumber     → encriptado
routingNumber     → encriptado
swiftCode         → para wire internacionales
iban
reference         → referencia interna
notes
isActive
validFrom / validTo
```

**Nuevo modelo: `SupplierBankAccount` (po_supplier_bank_accounts)**
> Separado de PaymentMethod porque un vendor puede tener múltiples cuentas
> y múltiples métodos que usan la misma cuenta
```
supplierId
bankName
bankBranch
bankCountry
accountHolderName
accountNumber     → encriptado
routingNumber
swiftCode
iban
currency
isDefault
isActive
notes
```

---

### 3. Goods Receipt Module (po_*)
> Inicialmente postergado — se implementa después de AP cycle completo

**Nuevos modelos:**
- `GoodsReceipt` — evento de recepción (vinculado al PO)
- `GoodsReceiptLine` — línea con quality check por dimensión
- `ReceiptException` — log de excepciones autorizadas (quién, cuándo, razón)

**Quality Gate (5 dimensiones):**
1. Tiempo — on-time vs expected date
2. Cantidad — received <= ordered (incremento requiere autorización supervisor)
3. Especificaciones/Presentación — conforme / no conforme / parcial
4. Precio — received price <= PO unit price (incremento requiere autorización supervisor)
5. Estado general — accepted / rejected / accepted_with_exception

**Flujo de autorización:**
```
Excepción detectada → BLOQUEADO
→ Supervisor aprueba con nota (userId + timestamp + reason queda en ReceiptException)
→ Receipt procede con flag authorized_exception = true
```

---

### 4. Vendor Scorecard Module
> Depende de: Goods Receipt Module

**Nuevo modelo: `VendorScorecard` (po_vendor_scorecards)**
- KPIs acumulados por supplier por período
- on_time_rate, fill_rate, quality_rate, price_compliance_rate
- total_receipts, total_exceptions, total_rejections
- Calculado automáticamente al cerrar cada GoodsReceipt

---

## Orden de implementación sugerido

```
Sprint 10A  → AP Cycle (en curso)
Sprint 10B  → COGS desde BOM
Sprint 10C  → Inventory valuation
Sprint 10D  → OpEx JEs manuales
Sprint 10E  → Cash Flow population
              ↓
Sprint 11A  → Supplier Master Enrichment (contacts + payment methods + bank accounts)
Sprint 11B  → Vendor-Item Cross Reference (SupplierItem)
Sprint 11C  → Goods Receipt Module (quality gate + exceptions + authorization)
Sprint 11D  → Vendor Scorecard (KPIs automáticos desde receipts)
```

---

## Notas de arquitectura

- `accountNumber` y `routingNumber` en bank accounts → encriptar con AES-256 en service layer, nunca exponer en GET responses completos
- `ReceiptException` → inmutable una vez creada (audit log), solo se puede agregar notas
- `VendorScorecard` → calcular on-demand o en background job al cerrar período
- Frontend: Supplier detail page con tabs (Info | Contacts | Payment Methods | Bank Accounts | Items | Scorecard)
- Item detail page con tab Vendors (lista de SupplierItem con precios vigentes)