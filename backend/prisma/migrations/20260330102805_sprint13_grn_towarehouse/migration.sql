-- CreateTable
CREATE TABLE "grn_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "grn_number" VARCHAR(50) NOT NULL,
    "po_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "received_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'posted',
    "condition" VARCHAR(50) NOT NULL DEFAULT 'complete',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "grn_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_receipt_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "grn_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "po_line_id" UUID,
    "item_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "stock_movement_id" UUID,
    "received_quantity" DECIMAL(15,3) NOT NULL,
    "uom" VARCHAR(20) NOT NULL,
    "unit_cost" DECIMAL(15,4),
    "lot_number" VARCHAR(100),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "grn_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grn_receipts_tenant_id_idx" ON "grn_receipts"("tenant_id");

-- CreateIndex
CREATE INDEX "grn_receipts_tenant_id_po_id_idx" ON "grn_receipts"("tenant_id", "po_id");

-- CreateIndex
CREATE INDEX "grn_receipts_tenant_id_status_idx" ON "grn_receipts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "grn_receipts_received_date_idx" ON "grn_receipts"("received_date");

-- CreateIndex
CREATE UNIQUE INDEX "grn_receipts_tenant_id_grn_number_key" ON "grn_receipts"("tenant_id", "grn_number");

-- CreateIndex
CREATE INDEX "grn_receipt_lines_tenant_id_idx" ON "grn_receipt_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "grn_receipt_lines_grn_id_idx" ON "grn_receipt_lines"("grn_id");

-- CreateIndex
CREATE INDEX "grn_receipt_lines_po_line_id_idx" ON "grn_receipt_lines"("po_line_id");

-- CreateIndex
CREATE INDEX "grn_receipt_lines_item_id_idx" ON "grn_receipt_lines"("item_id");

-- CreateIndex
CREATE INDEX "grn_receipt_lines_stock_movement_id_idx" ON "grn_receipt_lines"("stock_movement_id");

-- AddForeignKey
ALTER TABLE "in_stock_movements" ADD CONSTRAINT "in_stock_movements_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "in_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_receipts" ADD CONSTRAINT "grn_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_receipts" ADD CONSTRAINT "grn_receipts_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "po_purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_receipts" ADD CONSTRAINT "grn_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "in_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_receipt_lines" ADD CONSTRAINT "grn_receipt_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_receipt_lines" ADD CONSTRAINT "grn_receipt_lines_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grn_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_receipt_lines" ADD CONSTRAINT "grn_receipt_lines_po_line_id_fkey" FOREIGN KEY ("po_line_id") REFERENCES "po_purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_receipt_lines" ADD CONSTRAINT "grn_receipt_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_receipt_lines" ADD CONSTRAINT "grn_receipt_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "in_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_receipt_lines" ADD CONSTRAINT "grn_receipt_lines_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "in_stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
