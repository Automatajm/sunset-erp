-- AlterTable
ALTER TABLE "grn_receipt_lines" ADD COLUMN     "consumption_qty" DECIMAL(15,3),
ADD COLUMN     "consumption_uom" VARCHAR(20),
ADD COLUMN     "storage_qty" DECIMAL(15,3),
ADD COLUMN     "storage_uom" VARCHAR(20);

-- AlterTable
ALTER TABLE "in_stock" ADD COLUMN     "consumption_qty" DECIMAL(15,3) NOT NULL DEFAULT 0,
ADD COLUMN     "consumption_uom" VARCHAR(20) NOT NULL DEFAULT '',
ADD COLUMN     "purchase_qty" DECIMAL(15,3) NOT NULL DEFAULT 0,
ADD COLUMN     "purchase_uom" VARCHAR(20) NOT NULL DEFAULT '',
ADD COLUMN     "storage_qty" DECIMAL(15,3) NOT NULL DEFAULT 0,
ADD COLUMN     "storage_uom" VARCHAR(20) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "in_stock_movements" ADD COLUMN     "consumption_qty" DECIMAL(15,3),
ADD COLUMN     "consumption_uom" VARCHAR(20),
ADD COLUMN     "movement_value" DECIMAL(15,2),
ADD COLUMN     "purchase_qty" DECIMAL(15,3),
ADD COLUMN     "purchase_uom" VARCHAR(20),
ADD COLUMN     "unit_cost_at_movement" DECIMAL(15,4);

-- AlterTable
ALTER TABLE "po_purchase_order_lines" ADD COLUMN     "purchase_uom_id" UUID;

-- AlterTable
ALTER TABLE "po_suppliers" ADD COLUMN     "minimum_order_amount" DECIMAL(15,2),
ADD COLUMN     "minimum_order_currency" VARCHAR(3);

-- CreateTable
CREATE TABLE "po_purchase_requisitions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pr_number" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "requested_by" UUID NOT NULL,
    "department_id" VARCHAR(100),
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "required_date" DATE NOT NULL,
    "justification" TEXT,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "source_ref_id" UUID,
    "estimated_amount" DECIMAL(15,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "rejected_by" UUID,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "po_purchase_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_purchase_requisition_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pr_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "item_id" UUID,
    "item_status" VARCHAR(20) NOT NULL DEFAULT 'catalog',
    "generic_description" TEXT,
    "generic_spec" TEXT,
    "quantity" DECIMAL(15,3) NOT NULL,
    "uom" VARCHAR(20) NOT NULL,
    "unit_estimate" DECIMAL(15,4),
    "required_date" DATE NOT NULL,
    "warehouse_id" UUID,
    "notes" TEXT,
    "created_item_id" UUID,
    "po_line_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "po_purchase_requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_consolidation_config" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "delivery_window_days" INTEGER NOT NULL DEFAULT 7,
    "max_delivery_gap_days" INTEGER NOT NULL DEFAULT 15,
    "price_variance_warn_pct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "mrp_separation" VARCHAR(20) NOT NULL DEFAULT 'auto_group',
    "lead_time_split_days" INTEGER NOT NULL DEFAULT 7,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "po_consolidation_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_supplier_scores" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "item_id" UUID,
    "period_code" VARCHAR(20) NOT NULL,
    "period_type" VARCHAR(10) NOT NULL,
    "price_score" DECIMAL(5,2) NOT NULL,
    "delivery_score" DECIMAL(5,2) NOT NULL,
    "quality_score" DECIMAL(5,2) NOT NULL,
    "lead_time_score" DECIMAL(5,2) NOT NULL,
    "total_score" DECIMAL(5,2) NOT NULL,
    "po_count" INTEGER NOT NULL,
    "grn_count" INTEGER NOT NULL,
    "on_time_count" INTEGER NOT NULL,
    "complete_count" INTEGER NOT NULL,
    "avg_price" DECIMAL(15,4),
    "avg_lead_days" DECIMAL(8,2),
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "po_supplier_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "po_purchase_requisitions_tenant_id_idx" ON "po_purchase_requisitions"("tenant_id");

-- CreateIndex
CREATE INDEX "po_purchase_requisitions_tenant_id_status_idx" ON "po_purchase_requisitions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "po_purchase_requisitions_tenant_id_requested_by_idx" ON "po_purchase_requisitions"("tenant_id", "requested_by");

-- CreateIndex
CREATE INDEX "po_purchase_requisitions_required_date_idx" ON "po_purchase_requisitions"("required_date");

-- CreateIndex
CREATE UNIQUE INDEX "po_purchase_requisitions_tenant_id_pr_number_key" ON "po_purchase_requisitions"("tenant_id", "pr_number");

-- CreateIndex
CREATE INDEX "po_purchase_requisition_lines_tenant_id_idx" ON "po_purchase_requisition_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "po_purchase_requisition_lines_pr_id_idx" ON "po_purchase_requisition_lines"("pr_id");

-- CreateIndex
CREATE INDEX "po_purchase_requisition_lines_item_id_idx" ON "po_purchase_requisition_lines"("item_id");

-- CreateIndex
CREATE INDEX "po_purchase_requisition_lines_item_status_idx" ON "po_purchase_requisition_lines"("item_status");

-- CreateIndex
CREATE UNIQUE INDEX "po_consolidation_config_tenant_id_key" ON "po_consolidation_config"("tenant_id");

-- CreateIndex
CREATE INDEX "po_supplier_scores_tenant_id_idx" ON "po_supplier_scores"("tenant_id");

-- CreateIndex
CREATE INDEX "po_supplier_scores_tenant_id_supplier_id_idx" ON "po_supplier_scores"("tenant_id", "supplier_id");

-- CreateIndex
CREATE INDEX "po_supplier_scores_tenant_id_item_id_idx" ON "po_supplier_scores"("tenant_id", "item_id");

-- CreateIndex
CREATE INDEX "po_supplier_scores_total_score_idx" ON "po_supplier_scores"("total_score");

-- CreateIndex
CREATE UNIQUE INDEX "po_supplier_scores_tenant_id_supplier_id_item_id_period_cod_key" ON "po_supplier_scores"("tenant_id", "supplier_id", "item_id", "period_code");

-- AddForeignKey
ALTER TABLE "po_purchase_order_lines" ADD CONSTRAINT "po_purchase_order_lines_purchase_uom_id_fkey" FOREIGN KEY ("purchase_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_requisitions" ADD CONSTRAINT "po_purchase_requisitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_requisition_lines" ADD CONSTRAINT "po_purchase_requisition_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_requisition_lines" ADD CONSTRAINT "po_purchase_requisition_lines_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "po_purchase_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_requisition_lines" ADD CONSTRAINT "po_purchase_requisition_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_requisition_lines" ADD CONSTRAINT "po_purchase_requisition_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "in_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_requisition_lines" ADD CONSTRAINT "po_purchase_requisition_lines_po_line_id_fkey" FOREIGN KEY ("po_line_id") REFERENCES "po_purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_consolidation_config" ADD CONSTRAINT "po_consolidation_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_supplier_scores" ADD CONSTRAINT "po_supplier_scores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_supplier_scores" ADD CONSTRAINT "po_supplier_scores_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "po_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_supplier_scores" ADD CONSTRAINT "po_supplier_scores_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
