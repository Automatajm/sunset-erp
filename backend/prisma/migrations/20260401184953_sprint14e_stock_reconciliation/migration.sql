-- CreateTable
CREATE TABLE "in_stock_count_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_number" VARCHAR(50) NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "description" TEXT,
    "count_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "total_lines_count" INTEGER,
    "lines_with_variance" INTEGER,
    "total_variance_value" DECIMAL(15,2),
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "approval_notes" TEXT,
    "posted_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_stock_count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_stock_count_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "system_storage_qty" DECIMAL(15,3) NOT NULL,
    "storage_uom" VARCHAR(20) NOT NULL,
    "system_purchase_qty" DECIMAL(15,3) NOT NULL,
    "purchase_uom" VARCHAR(20) NOT NULL,
    "unit_cost_snapshot" DECIMAL(15,4) NOT NULL,
    "counted_storage_qty" DECIMAL(15,3),
    "counted_purchase_qty" DECIMAL(15,3),
    "variance_storage_qty" DECIMAL(15,3),
    "variance_purchase_qty" DECIMAL(15,3),
    "variance_value" DECIMAL(15,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "lot_number" VARCHAR(100),
    "serial_number" VARCHAR(100),
    "notes" TEXT,
    "adjustment_movement_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "in_stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "in_stock_count_sessions_tenant_id_idx" ON "in_stock_count_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "in_stock_count_sessions_tenant_id_warehouse_id_idx" ON "in_stock_count_sessions"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "in_stock_count_sessions_tenant_id_status_idx" ON "in_stock_count_sessions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "in_stock_count_sessions_count_date_idx" ON "in_stock_count_sessions"("count_date");

-- CreateIndex
CREATE UNIQUE INDEX "in_stock_count_sessions_tenant_id_session_number_key" ON "in_stock_count_sessions"("tenant_id", "session_number");

-- CreateIndex
CREATE INDEX "in_stock_count_lines_tenant_id_idx" ON "in_stock_count_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "in_stock_count_lines_session_id_idx" ON "in_stock_count_lines"("session_id");

-- CreateIndex
CREATE INDEX "in_stock_count_lines_item_id_idx" ON "in_stock_count_lines"("item_id");

-- CreateIndex
CREATE INDEX "in_stock_count_lines_status_idx" ON "in_stock_count_lines"("status");

-- CreateIndex
CREATE UNIQUE INDEX "in_stock_count_lines_session_id_item_id_lot_number_serial_n_key" ON "in_stock_count_lines"("session_id", "item_id", "lot_number", "serial_number");

-- AddForeignKey
ALTER TABLE "in_stock_count_sessions" ADD CONSTRAINT "in_stock_count_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_count_sessions" ADD CONSTRAINT "in_stock_count_sessions_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "in_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_count_lines" ADD CONSTRAINT "in_stock_count_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_count_lines" ADD CONSTRAINT "in_stock_count_lines_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "in_stock_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_count_lines" ADD CONSTRAINT "in_stock_count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
