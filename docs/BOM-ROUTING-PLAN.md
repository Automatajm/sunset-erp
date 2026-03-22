# BomRouting — Plan de Implementación

> **Status:** Pendiente → arrancar post Sprint 6  
> **Tipo:** Prerequisito para Sprint 8 (Budget Auto-generation)  
> **Estimated effort:** 1-2 días  
> **Repo:** https://github.com/Automatajm/sunset-erp

---

## 1. Qué es y por qué importa

`BomRouting` define el paso a paso de producción ligado a un BOM. Cada paso tiene un Work Center, tiempo de setup y tiempo de ejecución por unidad. Esto permite:

- **Auto-suggest labor** al crear actuals en una MO (Sprint 6 backlog #3)
- **Budget auto-generation** calcular horas de labor por producto (Sprint 8)
- **Work Order PDF** mostrar los pasos operacionales al supervisor
- **Capacidad de planeación** saber qué work centers están saturados

### Ejemplo
```
BOM: BOM-BURGER-001 — Classic Burger, qty 1,000 units

Step 1 | Prep         | Work Center: Kitchen A   | setup: 0.5h | run: 0.002 h/unit → 2h total
Step 2 | Assembly     | Work Center: Line B      | setup: 0.5h | run: 0.004 h/unit → 4h total  
Step 3 | QC & Pack    | Work Center: Inspection  | setup: 0.25h| run: 0.001 h/unit → 1h total
                                                   TOTAL LABOR: 1.25h setup + 7h run = 8.25h
```

---

## 2. Prisma Schema

Agregar al final de `backend/prisma/schema.prisma`:

```prisma
// ============================================================================
// BOM ROUTING TABLES (mfg_*)
// BomRouting — prerequisito Sprint 8
// ============================================================================

model BomRouting {
  id             String   @id @default(uuid()) @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  bomId          String   @map("bom_id") @db.Uuid
  stepNumber     Int      @map("step_number")
  workCenterId   String   @map("work_center_id") @db.Uuid
  description    String?  @db.Text
  // Setup time in hours (fixed per MO, regardless of quantity)
  setupTime      Decimal  @default(0) @map("setup_time") @db.Decimal(8, 2)
  // Run time per unit in hours
  runTimePerUnit Decimal  @default(0) @map("run_time_per_unit") @db.Decimal(10, 6)
  isActive       Boolean  @default(true) @map("is_active")
  notes          String?  @db.Text

  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")
  createdBy String    @map("created_by") @db.Uuid
  updatedBy String    @map("updated_by") @db.Uuid
  deletedBy String?   @map("deleted_by") @db.Uuid

  tenant     Tenant     @relation(fields: [tenantId], references: [id])
  bom        Bom        @relation(fields: [bomId], references: [id], onDelete: Cascade)
  workCenter WorkCenter @relation(fields: [workCenterId], references: [id])

  @@unique([bomId, stepNumber])
  @@index([tenantId])
  @@index([bomId])
  @@index([workCenterId])
  @@map("mfg_bom_routings")
}
```

**Relaciones inversas a agregar:**

En `Bom`:
```prisma
  routings  BomRouting[]
```

En `WorkCenter`:
```prisma
  routings  BomRouting[]
```

En `Tenant`:
```prisma
  bomRoutings BomRouting[]
```

---

## 3. Migration

```powershell
cd C:\Users\owner\Desktop\Sunset-ERP\backend
npx prisma migrate dev --name "bom_routing"
```

---

## 4. DTOs

**Archivo:** `backend/src/modules/bom/dto/bom-routing.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, IsUUID, Min } from 'class-validator';

export class CreateBomRoutingDto {
  @ApiProperty({ example: 1, description: 'Step sequence number' })
  @IsNumber()
  @Min(1)
  stepNumber: number;

  @ApiProperty({ example: 'uuid-work-center-id' })
  @IsUUID()
  workCenterId: string;

  @ApiPropertyOptional({ example: 'Mix and shape beef patties' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 0.5, description: 'Setup time in hours (fixed per MO)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  setupTime?: number;

  @ApiPropertyOptional({ example: 0.004, description: 'Run time per unit in hours' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  runTimePerUnit?: number;

  @ApiPropertyOptional({ example: 'Requires food-grade gloves' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBomRoutingDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  stepNumber?: number;

  @ApiPropertyOptional({ example: 'uuid-work-center-id' })
  @IsOptional()
  @IsUUID()
  workCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  setupTime?: number;

  @ApiPropertyOptional({ example: 0.004 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  runTimePerUnit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
```

---

## 5. API Endpoints

Agregar al módulo BOM existente (`/api/bom`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/bom/:id/routing` | Get all routing steps for a BOM |
| `POST` | `/api/bom/:id/routing` | Add a routing step |
| `PATCH` | `/api/bom/:id/routing/:stepId` | Update a routing step |
| `DELETE` | `/api/bom/:id/routing/:stepId` | Delete a routing step |
| `GET` | `/api/bom/:id/routing/labor-estimate/:quantity` | Calculate total labor hours for a given quantity |

### Labor estimate response example
```json
{
  "quantity": 1000,
  "steps": [
    {
      "stepNumber": 1,
      "description": "Prep",
      "workCenter": { "id": "...", "name": "Kitchen A" },
      "setupTime": 0.5,
      "runTimePerUnit": 0.002,
      "totalHours": 2.5
    },
    {
      "stepNumber": 2,
      "description": "Assembly",
      "workCenter": { "id": "...", "name": "Line B" },
      "setupTime": 0.5,
      "runTimePerUnit": 0.004,
      "totalHours": 4.5
    }
  ],
  "totalSetupHours": 1.0,
  "totalRunHours": 6.0,
  "totalLaborHours": 7.0,
  "estimatedLaborCost": 87.50
}
```

---

## 6. Production Order Integration

### Labor suggestions endpoint
`GET /api/production-orders/:id/labor-suggestions`

```json
{
  "moId": "...",
  "poNumber": "MO-2026-0005",
  "quantityToProduce": 1000,
  "suggestions": [
    {
      "stepNumber": 1,
      "workCenterId": "...",
      "workCenterName": "Kitchen A",
      "description": "Prep",
      "hoursPlanned": 2.5,
      "laborRate": 12.50,
      "estimatedCost": 31.25
    }
  ],
  "totalPlannedHours": 7.0,
  "totalEstimatedCost": 87.50
}
```

### Frontend: "Load from Routing" button
- En el `LaborModal`, agregar botón **"Load from Routing"**
- Llama a `/api/production-orders/:id/labor-suggestions`
- Pre-llena los campos del modal con los valores sugeridos
- Usuario puede ajustar antes de confirmar

---

## 7. Material Suggestions (Sprint 6 Backlog #2)

### Endpoint
`GET /api/production-orders/:id/material-suggestions`

```json
{
  "moId": "...",
  "quantityToProduce": 1000,
  "suggestions": [
    {
      "itemId": "...",
      "itemCode": "RM-BEEF",
      "itemName": "Beef Patty",
      "qtyPlanned": 1020,
      "uom": "units",
      "unitCost": 2.50,
      "totalCost": 2550.00,
      "note": "Includes 2% scrap"
    }
  ],
  "totalMaterialCost": 5100.00
}
```

This endpoint does NOT require BomRouting — it only needs BomComponents (already exists).

### Frontend: "Load from BOM" button
- En el panel de Materials, agregar botón **"Load from BOM"**
- Llama a `/api/production-orders/:id/material-suggestions`
- Pre-llena la tabla de actuals con sugerencias
- Usuario confirma o ajusta cantidades

**Note:** Material suggestions can be implemented NOW without waiting for BomRouting.

---

## 8. Frontend Pages

### BOM detail page enhancement
`/manufacturing/bom/:id` — agregar tab **"Routing"**

```
BOM: BOM-BURGER-001
Tabs: [Components] [Routing] [Cost Summary]

Routing tab:
┌────┬──────────────┬───────────────┬──────────┬──────────────┬───────────┐
│ #  │ Description  │ Work Center   │ Setup(h) │ Run (h/unit) │ Actions   │
├────┼──────────────┼───────────────┼──────────┼──────────────┼───────────┤
│ 1  │ Prep         │ Kitchen A     │ 0.50     │ 0.002        │ Edit Del  │
│ 2  │ Assembly     │ Line B        │ 0.50     │ 0.004        │ Edit Del  │
│ 3  │ QC & Pack    │ Inspection    │ 0.25     │ 0.001        │ Edit Del  │
└────┴──────────────┴───────────────┴──────────┴──────────────┴───────────┘
[+ Add Step]

For quantity: [1000] units → Total labor: 7.0 hrs | Est. cost: $87.50
```

---

## 9. Sprint 8 Integration

Once BomRouting is implemented, Sprint 8 budget auto-generation can calculate:

```
Contract: 50,000 Classic Burgers for Q1 2026

Materials budget (from BOM components):
  Beef Patty:    50,000 × 1.02 = 51,000 units × $2.50 = $127,500
  Bun:           50,000 × 1.00 = 50,000 units × $0.80 = $40,000
  
Labor budget (from BOM routing):
  Kitchen A:    50,000 × 0.002 + 0.5h = 100.5h × $12.50 = $1,256
  Line B:       50,000 × 0.004 + 0.5h = 200.5h × $12.50 = $2,506
  
Total production budget: $171,262
→ Auto-generates budget lines in ac_budget_lines for the fiscal period
```

---

## 10. Orden de implementación

1. ✅ Prisma model + migration
2. ✅ DTOs (`bom-routing.dto.ts`)
3. ✅ Service methods en `bom.service.ts` (agregar, no reemplazar)
4. ✅ Controller endpoints en `bom.controller.ts`
5. ✅ Material suggestions endpoint en `production-orders.service.ts`
6. ✅ Labor suggestions endpoint en `production-orders.service.ts`
7. ✅ Frontend: Routing tab en BOM detail page
8. ✅ Frontend: "Load from BOM" button en MO Materials panel
9. ✅ Frontend: "Load from Routing" button en MO Labor panel

---

*Plan creado: 2026-03-22 | Prerequisito para Sprint 8*
