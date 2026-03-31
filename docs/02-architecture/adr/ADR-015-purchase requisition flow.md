# ADR-015: Purchase Requisition Flow

**Status:** Accepted  
**Date:** 2026-03-31  
**Deciders:** Juan (FP&A / Systems Engineering), Sunset ERP Architecture  
**Tags:** procurement, purchase-requisition, approval, workflow, mrp, master-data

---

## CONTEXT

Currently, purchase needs in Sunset ERP are expressed directly as Purchase Orders. There is no formal intake process. This creates four operational problems:

**Problem 1 — No traceability:** There is no record of why a PO was created, who requested it, or what business need it satisfies. Procurement cannot distinguish between strategic purchases, production-driven requirements, and ad-hoc requests.

**Problem 2 — No approval gate:** Any user with PO access can create a purchase order of any value without authorization. This bypasses budget controls and creates financial exposure.

**Problem 3 — No MRP integration:** Material Requirements Planning may calculate that 500 KG of resin is needed for next month's production plan, but this signal currently has no path into procurement. Buyers must reconcile MRP outputs manually with purchase needs.

**Problem 4 — Catalog gap:** Stakeholders who need to request a new material — one not yet in the item catalog — have no formal channel. Requests are made via email or verbally, and the procurement team has no structured way to handle the "create item first" step before purchasing.

---

## DECISION

Introduce a `PurchaseRequisition` (PR) module as the mandatory entry point for all purchase needs. Every Purchase Order must originate from one or more approved PRs, with the exception of emergency POs (manual override with justification).

### PR Origins

Three entry points feed into the PR pool:

```
1. Manual Request     → Stakeholder creates PR via UI
2. MRP Suggestion     → System auto-creates draft PRs from production plan gaps
3. Production Plan    → Scheduled plan generates bulk PRs for a period
```

All three produce the same `PurchaseRequisition` record. Only the `source` field differs.

### State Machine

```
DRAFT → SUBMITTED → APPROVED → IN_PROGRESS → COMPLETED
                  → REJECTED
DRAFT → CANCELLED
SUBMITTED → CANCELLED
APPROVED → CANCELLED (before PO is created)
```

| Transition | Who can trigger |
|-----------|----------------|
| submit | requestedBy user |
| approve | designated approver per amount threshold |
| reject | designated approver per amount threshold |
| cancel | requestedBy or admin |
| in_progress | system (when first PO line is created) |
| completed | system (when all PR lines have a PO line) |

### Approval Thresholds (single-level, Sprint 14B)

Thresholds stored in `TenantSettings.approvalThresholds` as JSONB:
```json
{
  "auto_approve_below": 500,
  "levels": [
    { "max": 5000,  "role": "supervisor" },
    { "max": 25000, "role": "manager" },
    { "max": null,  "role": "director" }
  ]
}
```

PRs below the `auto_approve_below` threshold are approved automatically upon submission. No approver action required.

### Generic Item Flow

When a stakeholder needs an item not yet in the system:

```
PR line: itemId = null, itemStatus = 'pending_item'
         genericDescription = "Solvent for UV coating process"
         genericSpec = "Flash point > 60°C, viscosity 25-30 cP"
         quantity = 50, uom = "LTR"
         requiredDate = 2026-05-01

  ↓ PR is submitted and approved normally

Procurement sees ⚠️ badge on PR line in Consolidation Console
  
  ↓ Procurement creates item in Item master:
    Items → New Item → "UV-SOLV-001"

  ↓ Returns to PR line → assigns createdItemId = "UV-SOLV-001"
    itemStatus changes: pending_item → item_created

  ↓ PR line is now eligible for PO consolidation
```

This enforces catalog discipline: no PO can be created for an item that doesn't exist in the system.

### Schema

```prisma
model PurchaseRequisition {
  id              String    @id @default(uuid()) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  prNumber        String    @map("pr_number") @db.VarChar(50)  // PR-YYYY-NNNN
  title           String    @db.VarChar(255)
  requestedBy     String    @map("requested_by") @db.Uuid
  departmentId    String?   @map("department_id") @db.VarChar(100)
  priority        String    @default("normal") @db.VarChar(20)
  // normal | urgent | critical
  requiredDate    DateTime  @map("required_date") @db.Date
  justification   String?   @db.Text
  source          String    @default("manual") @db.VarChar(20)
  // manual | mrp | production_plan
  sourceRefId     String?   @map("source_ref_id") @db.Uuid
  estimatedAmount Decimal?  @map("estimated_amount") @db.Decimal(15,2)
  status          String    @default("draft") @db.VarChar(20)
  approvedBy      String?   @map("approved_by") @db.Uuid
  approvedAt      DateTime? @map("approved_at")
  rejectedBy      String?   @map("rejected_by") @db.Uuid
  rejectedAt      DateTime? @map("rejected_at")
  rejectionReason String?   @map("rejection_reason") @db.Text
  notes           String?   @db.Text
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")
  createdBy       String    @map("created_by") @db.Uuid
  updatedBy       String    @map("updated_by") @db.Uuid
  deletedBy       String?   @map("deleted_by") @db.Uuid

  tenant Tenant @relation(fields: [tenantId], references: [id])
  lines  PurchaseRequisitionLine[]

  @@unique([tenantId, prNumber])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([tenantId, requestedBy])
  @@index([requiredDate])
  @@map("po_purchase_requisitions")
}

model PurchaseRequisitionLine {
  id                 String    @id @default(uuid()) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  prId               String    @map("pr_id") @db.Uuid
  lineNumber         Int       @map("line_number")
  itemId             String?   @map("item_id") @db.Uuid
  itemStatus         String    @default("catalog") @map("item_status") @db.VarChar(20)
  // catalog | pending_item | item_created
  genericDescription String?   @map("generic_description") @db.Text
  genericSpec        String?   @map("generic_spec") @db.Text
  quantity           Decimal   @db.Decimal(15,3)
  uom                String    @db.VarChar(20)
  unitEstimate       Decimal?  @map("unit_estimate") @db.Decimal(15,4)
  requiredDate       DateTime  @map("required_date") @db.Date
  warehouseId        String?   @map("warehouse_id") @db.Uuid
  notes              String?   @db.Text
  createdItemId      String?   @map("created_item_id") @db.Uuid
  poLineId           String?   @map("po_line_id") @db.Uuid
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")
  deletedAt          DateTime? @map("deleted_at")
  createdBy          String    @map("created_by") @db.Uuid
  updatedBy          String    @map("updated_by") @db.Uuid

  tenant              Tenant            @relation(fields: [tenantId], references: [id])
  purchaseRequisition PurchaseRequisition @relation(fields: [prId], references: [id], onDelete: Cascade)
  item                Item?             @relation(fields: [itemId], references: [id])
  warehouse           Warehouse?        @relation(fields: [warehouseId], references: [id])
  purchaseOrderLine   PurchaseOrderLine? @relation(fields: [poLineId], references: [id])

  @@index([tenantId])
  @@index([prId])
  @@index([itemId])
  @@index([itemStatus])
  @@map("po_purchase_requisition_lines")
}
```

---

## CONSEQUENCES

### Positive

- Full traceability from business need to PO to GRN to AP Invoice
- Budget controls enforced at the approval gate — no unauthorized purchases
- MRP integration point: system can auto-generate PRs, buyer reviews and approves
- Catalog discipline enforced: items must exist before purchasing
- Procurement workload becomes predictable — visible queue of approved PRs awaiting PO
- Priority and urgency visible to procurement before consolidating
- Department-level spending analysis becomes possible (departmentId on PR)

### Negative

- Adds a step to the procurement process — users must create a PR before a PO
- Emergency purchases require workaround (manual override justification)
- Generic item flow adds friction: stakeholder submits PR, procurement creates item, then returns to PR
- MRP auto-PR generation requires production plan to be maintained — garbage in, garbage out

### Neutral

- Existing POs created before this ADR have no PR link — historical data remains as-is
- PRs can be created without an item (generic) — this is intentional, not a data integrity issue
- Auto-approve threshold means low-value requests bypass human review entirely

---

## ALTERNATIVES CONSIDERED

### Alternative 1: Skip PR, enforce approval directly on PO

**Description:** Keep PO as the entry point but add an approval workflow to PO itself. PO draft → PO submitted → PO approved.

**Pros:**
- One fewer document type in the system
- Simpler user experience for small teams

**Cons:**
- No way to consolidate multiple small requests into one PO (core requirement)
- MRP output cannot flow into PO without a staging area
- Generic items cannot be handled before the PO is built
- No visibility into future purchase needs before they become POs

**Why not chosen:** Consolidation and MRP integration require a pre-PO staging document.

### Alternative 2: Use Sales Order as PR analogue

**Description:** Repurpose or mirror the internal SO mechanism for internal purchase requests.

**Pros:**
- Reuses existing approval and line item patterns

**Cons:**
- Conceptually wrong — confuses procurement domain with sales domain
- SO module has customer, delivery, and revenue fields that don't apply to internal requests

**Why not chosen:** Domain confusion outweighs implementation savings.

### Alternative 3: Multi-level approval workflow with parallel approvers

**Description:** Implement full workflow engine with parallel approvers, delegation, escalation, and SLA timers in Sprint 14B.

**Pros:**
- Production-grade approval for complex organizations

**Cons:**
- Adds 3-4 weeks of development
- Most tenants don't need parallel approval for initial deployment

**Why not chosen:** Sprint 14B implements single-level approval. Multi-level approval is documented for Sprint 16+.

---

## IMPLEMENTATION NOTES

### Auto-number format
`PR-YYYY-NNNN` — same pattern as PO-YYYY-NNNN, GRN-YYYY-NNNN. Sequence resets per year.

### MRP hook
```typescript
// In mrp.service.ts — called when production plan gap is detected
async createPrFromMrp(itemId, qty, requiredDate, moId, tenantId): Promise<PurchaseRequisition> {
  return this.prService.create({
    source: 'mrp',
    sourceRefId: moId,
    title: `MRP requirement: ${item.code} for MO ${mo.poNumber}`,
    lines: [{ itemId, quantity: qty, uom: item.consumptionUom, requiredDate }],
    estimatedAmount: qty * item.standardCost,
    // auto-submit if below auto-approve threshold
  });
}
```

### PR → PO link
When a PR line is converted to a PO line in the Consolidation Console:
```typescript
await prisma.purchaseRequisitionLine.update({
  where: { id: prLineId },
  data: { poLineId: createdPoLineId }
});
await prisma.purchaseRequisition.update({
  where: { id: prId },
  data: { status: allLinesLinked ? 'in_progress' : 'in_progress' }
});
```

---

## RELATED DECISIONS

- ADR-014: Stock Triple UOM — PR lines use consumptionUom for quantities
- ADR-016: PO Consolidation Rules Engine — receives approved PRs as input
- ADR-001: Modular monolith — new `purchase-requisitions` module follows same pattern

---

## REFERENCES

- [Sunset ERP Sprint 14 Plan](../../../SPRINT-14-PLAN.md)
- [APICS Dictionary — Purchase Requisition](https://www.apics.org)
- [ISO 9001 — Purchasing Controls (Clause 8.4)](https://www.iso.org)

---

**Review Date:** 2026-09-30 — Review multi-level approval requirements based on tenant feedback. Consider adding delegation and escalation if single-level proves insufficient for larger organizations.