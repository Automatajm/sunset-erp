-- AlterTable
ALTER TABLE "po_purchase_orders" ADD COLUMN     "rfq_id" UUID;

-- CreateTable
CREATE TABLE "po_general_needs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "gn_number" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "po_general_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_general_need_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "gn_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "item_id" UUID,
    "generic_description" TEXT,
    "quantity" DECIMAL(15,3) NOT NULL,
    "uom" VARCHAR(20) NOT NULL,
    "required_date" DATE NOT NULL,
    "suggested_supplier_id" UUID,
    "estimated_unit_cost" DECIMAL(15,4),
    "source_type" VARCHAR(20),
    "source_mo_id" UUID,
    "pr_line_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "po_general_need_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_rfqs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rfq_number" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "issue_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "response_deadline" DATE,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "pr_id" UUID,
    "gn_id" UUID,
    "notes" TEXT,
    "awarded_at" TIMESTAMP(3),
    "awarded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "po_rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_rfq_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "item_id" UUID,
    "generic_description" TEXT,
    "quantity" DECIMAL(15,3) NOT NULL,
    "uom" VARCHAR(20) NOT NULL,
    "required_date" DATE NOT NULL,
    "pr_line_id" UUID,
    "gn_line_id" UUID,
    "awarded_supplier_id" UUID,
    "awarded_response_line_id" UUID,
    "awarded_unit_price" DECIMAL(15,4),
    "awarded_qty" DECIMAL(15,3),
    "po_line_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "po_rfq_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_rfq_suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'invited',
    "sent_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "total_offered_amount" DECIMAL(15,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "po_rfq_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_rfq_response_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rfq_supplier_id" UUID NOT NULL,
    "rfq_line_id" UUID NOT NULL,
    "offered_qty" DECIMAL(15,3) NOT NULL,
    "uom" VARCHAR(20) NOT NULL,
    "unit_price" DECIMAL(15,4) NOT NULL,
    "lead_time_days" INTEGER NOT NULL,
    "valid_until" DATE,
    "pack_size" DECIMAL(15,4),
    "moq" DECIMAL(15,3),
    "is_awarded" BOOLEAN NOT NULL DEFAULT false,
    "awarded_qty" DECIMAL(15,3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "po_rfq_response_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "po_general_needs_tenant_id_idx" ON "po_general_needs"("tenant_id");

-- CreateIndex
CREATE INDEX "po_general_needs_tenant_id_status_idx" ON "po_general_needs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "po_general_needs_period_start_idx" ON "po_general_needs"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "po_general_needs_tenant_id_gn_number_key" ON "po_general_needs"("tenant_id", "gn_number");

-- CreateIndex
CREATE INDEX "po_general_need_lines_tenant_id_idx" ON "po_general_need_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "po_general_need_lines_gn_id_idx" ON "po_general_need_lines"("gn_id");

-- CreateIndex
CREATE INDEX "po_general_need_lines_item_id_idx" ON "po_general_need_lines"("item_id");

-- CreateIndex
CREATE INDEX "po_general_need_lines_status_idx" ON "po_general_need_lines"("status");

-- CreateIndex
CREATE INDEX "po_rfqs_tenant_id_idx" ON "po_rfqs"("tenant_id");

-- CreateIndex
CREATE INDEX "po_rfqs_tenant_id_status_idx" ON "po_rfqs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "po_rfqs_issue_date_idx" ON "po_rfqs"("issue_date");

-- CreateIndex
CREATE INDEX "po_rfqs_tenant_id_gn_id_idx" ON "po_rfqs"("tenant_id", "gn_id");

-- CreateIndex
CREATE UNIQUE INDEX "po_rfqs_tenant_id_rfq_number_key" ON "po_rfqs"("tenant_id", "rfq_number");

-- CreateIndex
CREATE INDEX "po_rfq_lines_tenant_id_idx" ON "po_rfq_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "po_rfq_lines_rfq_id_idx" ON "po_rfq_lines"("rfq_id");

-- CreateIndex
CREATE INDEX "po_rfq_lines_item_id_idx" ON "po_rfq_lines"("item_id");

-- CreateIndex
CREATE INDEX "po_rfq_lines_status_idx" ON "po_rfq_lines"("status");

-- CreateIndex
CREATE INDEX "po_rfq_suppliers_tenant_id_idx" ON "po_rfq_suppliers"("tenant_id");

-- CreateIndex
CREATE INDEX "po_rfq_suppliers_rfq_id_idx" ON "po_rfq_suppliers"("rfq_id");

-- CreateIndex
CREATE INDEX "po_rfq_suppliers_supplier_id_idx" ON "po_rfq_suppliers"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "po_rfq_suppliers_rfq_id_supplier_id_key" ON "po_rfq_suppliers"("rfq_id", "supplier_id");

-- CreateIndex
CREATE INDEX "po_rfq_response_lines_tenant_id_idx" ON "po_rfq_response_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "po_rfq_response_lines_rfq_supplier_id_idx" ON "po_rfq_response_lines"("rfq_supplier_id");

-- CreateIndex
CREATE INDEX "po_rfq_response_lines_rfq_line_id_idx" ON "po_rfq_response_lines"("rfq_line_id");

-- CreateIndex
CREATE INDEX "po_rfq_response_lines_is_awarded_idx" ON "po_rfq_response_lines"("is_awarded");

-- CreateIndex
CREATE UNIQUE INDEX "po_rfq_response_lines_rfq_supplier_id_rfq_line_id_key" ON "po_rfq_response_lines"("rfq_supplier_id", "rfq_line_id");

-- AddForeignKey
ALTER TABLE "po_purchase_orders" ADD CONSTRAINT "po_purchase_orders_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "po_rfqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_general_needs" ADD CONSTRAINT "po_general_needs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_general_need_lines" ADD CONSTRAINT "po_general_need_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_general_need_lines" ADD CONSTRAINT "po_general_need_lines_gn_id_fkey" FOREIGN KEY ("gn_id") REFERENCES "po_general_needs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_general_need_lines" ADD CONSTRAINT "po_general_need_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_general_need_lines" ADD CONSTRAINT "po_general_need_lines_suggested_supplier_id_fkey" FOREIGN KEY ("suggested_supplier_id") REFERENCES "po_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_general_need_lines" ADD CONSTRAINT "po_general_need_lines_pr_line_id_fkey" FOREIGN KEY ("pr_line_id") REFERENCES "po_purchase_requisition_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfqs" ADD CONSTRAINT "po_rfqs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfqs" ADD CONSTRAINT "po_rfqs_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "po_purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfqs" ADD CONSTRAINT "po_rfqs_gn_id_fkey" FOREIGN KEY ("gn_id") REFERENCES "po_general_needs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_lines" ADD CONSTRAINT "po_rfq_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_lines" ADD CONSTRAINT "po_rfq_lines_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "po_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_lines" ADD CONSTRAINT "po_rfq_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_lines" ADD CONSTRAINT "po_rfq_lines_pr_line_id_fkey" FOREIGN KEY ("pr_line_id") REFERENCES "po_purchase_requisition_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_lines" ADD CONSTRAINT "po_rfq_lines_gn_line_id_fkey" FOREIGN KEY ("gn_line_id") REFERENCES "po_general_need_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_lines" ADD CONSTRAINT "po_rfq_lines_awarded_supplier_id_fkey" FOREIGN KEY ("awarded_supplier_id") REFERENCES "po_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_lines" ADD CONSTRAINT "po_rfq_lines_po_line_id_fkey" FOREIGN KEY ("po_line_id") REFERENCES "po_purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_suppliers" ADD CONSTRAINT "po_rfq_suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_suppliers" ADD CONSTRAINT "po_rfq_suppliers_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "po_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_suppliers" ADD CONSTRAINT "po_rfq_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "po_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_response_lines" ADD CONSTRAINT "po_rfq_response_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_response_lines" ADD CONSTRAINT "po_rfq_response_lines_rfq_supplier_id_fkey" FOREIGN KEY ("rfq_supplier_id") REFERENCES "po_rfq_suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_rfq_response_lines" ADD CONSTRAINT "po_rfq_response_lines_rfq_line_id_fkey" FOREIGN KEY ("rfq_line_id") REFERENCES "po_rfq_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
