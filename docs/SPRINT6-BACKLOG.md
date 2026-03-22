# Sprint 6 Backlog — Pendientes Post-Sprint 6

> **Status:** Pendiente  
> **Aplica a:** Manufacturing module  
> **Prerequisito:** Sprint 6 Production Completeness completado ✅  
> **Depende de:** BomRouting model (no implementado aún)

---

## 1. Work Order PDF — Imprimible para supervisores

**Descripción:** Generar un PDF por MO listo para entregar al supervisor de producción en el piso.

**Contenido del PDF:**
```
┌─────────────────────────────────────────────────┐
│  WORK ORDER — MO-2026-0005                      │
│  BOM: BOM-BURGER-001  |  Product: Classic Burger│
│  Planned: Mar 22 → Mar 25, 2026                 │
│  Qty to Produce: 1,000 units                    │
├─────────────────────────────────────────────────┤
│  MATERIALS REQUIRED                             │
│  # │ Item          │ Qty      │ UOM    │ Done   │
│  1 │ Beef Patty    │ 1,000    │ units  │ ____   │
│  2 │ Burger Bun    │ 1,000    │ units  │ ____   │
│  3 │ Special Sauce │ 5,000    │ ml     │ ____   │
├─────────────────────────────────────────────────┤
│  LABOR / WORK CENTERS                           │
│  Step │ Operation    │ WC          │ Est. Hrs   │
│  1    │ Prep         │ Kitchen A   │ 4 hrs      │
│  2    │ Assembly     │ Line B      │ 6 hrs      │
│  3    │ QC           │ Inspection  │ 2 hrs      │
├─────────────────────────────────────────────────┤
│  DELIVERY CONFIRMATION                          │
│  Qty Produced: _______  Date: ___________       │
│  Supervisor: _____________  Sign: __________    │
└─────────────────────────────────────────────────┘
```

**Implementación:**
- Backend: `GET /api/production-orders/:id/work-order-pdf`
- Usar `@nestjs/pdf` o `pdfkit` para generar el PDF
- Frontend: botón "Print WO" en la fila de la MO → descarga PDF
- Ver skill `/mnt/skills/public/pdf/SKILL.md` para generación de PDFs

---

## 2. Auto-suggest Materials desde BOM

**Descripción:** Al abrir el panel de Materials en una MO, el sistema pre-llena los materiales requeridos según el BOM × cantidad a producir.

**Lógica:**
```
MO quantityToProduce = 1,000
BOM component: Beef Patty, quantityPer = 1.0, scrapPercent = 2%
→ Suggested qty = 1,000 × 1.0 × 1.02 = 1,020 units
```

**Implementación:**
- Backend: `GET /api/production-orders/:id/material-suggestions`
  - Lee BOM components del MO
  - Calcula `qtyRequired = qtyToProduce × component.quantityPer × (1 + scrapPercent/100)`
  - Retorna lista pre-llenada para confirmar
- Frontend: botón "Load from BOM" en el panel de Materials
  - Carga sugerencias → usuario ajusta → confirma como actuals

---

## 3. Auto-suggest Labor desde BOM Routing

**Descripción:** Al abrir el panel de Labor en una MO, el sistema sugiere las horas por work center según el routing del BOM.

**Prerequisito:** Implementar `BomRouting` model primero:

```prisma
model BomRouting {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  bomId        String   @map("bom_id") @db.Uuid
  stepNumber   Int      @map("step_number")
  workCenterId String   @map("work_center_id") @db.Uuid
  description  String?  @db.Text
  setupTime    Decimal? @map("setup_time") @db.Decimal(8, 2)   // hours
  runTimePerUnit Decimal? @map("run_time_per_unit") @db.Decimal(10, 6) // hours per unit
  isActive     Boolean  @default(true) @map("is_active")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  createdBy String   @map("created_by") @db.Uuid
  updatedBy String   @map("updated_by") @db.Uuid

  tenant     Tenant     @relation(fields: [tenantId], references: [id])
  bom        Bom        @relation(fields: [bomId], references: [id])
  workCenter WorkCenter @relation(fields: [workCenterId], references: [id])

  @@index([tenantId])
  @@index([bomId])
  @@map("mfg_bom_routings")
}
```

**Labor suggestion logic:**
```
MO quantityToProduce = 1,000
Routing step 1: Kitchen A, runTimePerUnit = 0.004 hrs
→ Suggested hours = 1,000 × 0.004 = 4 hrs

Routing step 2: Line B, runTimePerUnit = 0.006 hrs  
→ Suggested hours = 1,000 × 0.006 = 6 hrs
```

**API:**
- `GET /api/production-orders/:id/labor-suggestions`
- Frontend: botón "Load from Routing" en el panel de Labor

---

## 4. MO Efficiency Report

**Descripción:** Vista de resumen de eficiencia por MO — comparativa de planificado vs actual.

| MO | Product | Planned Units | Delivered | Efficiency | Labor Cost | Material Variance |
|----|---------|--------------|-----------|------------|------------|-------------------|
| MO-2026-0001 | Classic Burger | 165,000 | 160,000 | 97.0% | $206 | $125 |
| MO-2026-0002 | Classic Burger | 203,000 | 210,000 | 103.4% | — | — |

**API:** `GET /api/production-orders/efficiency-report?from=2026-01-01&to=2026-12-31`

**Frontend:** Nueva página `/manufacturing/efficiency` o widget en dashboard

---

## 5. Orden de implementación recomendada

1. **BomRouting model** — migración + CRUD endpoints (prerequisito para #3)
2. **Auto-suggest Materials** (#2) — alto valor, no requiere routing
3. **Work Order PDF** (#1) — alto valor operacional, independiente
4. **Auto-suggest Labor** (#3) — requiere BomRouting
5. **Efficiency Report** (#4) — reporting, puede hacerse en cualquier momento

---

*Backlog creado: 2026-03-22 — Sprint 6 complete*
