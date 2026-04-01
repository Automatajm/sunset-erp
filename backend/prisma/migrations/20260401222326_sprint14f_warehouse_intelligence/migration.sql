-- AlterTable
ALTER TABLE "in_items" ADD COLUMN     "barcode_external" VARCHAR(100),
ADD COLUMN     "barcode_internal" VARCHAR(100);

-- AlterTable
ALTER TABLE "in_stock_count_lines" ADD COLUMN     "assigned_to_user_id" UUID,
ADD COLUMN     "bin_id" UUID,
ADD COLUMN     "level_id" UUID,
ADD COLUMN     "location_code" VARCHAR(100);

-- CreateTable
CREATE TABLE "in_stock_count_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "zone_ids" UUID[],
    "aisle_ids" UUID[],
    "level_ids" UUID[],
    "bin_ids" UUID[],
    "category_ids" UUID[],
    "macro_category_ids" UUID[],
    "item_ids" UUID[],
    "assigned_line_ids" UUID[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "in_stock_count_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_stock_location_updates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "stock_id" UUID,
    "from_level_id" UUID,
    "from_bin_id" UUID,
    "from_code" VARCHAR(100),
    "to_level_id" UUID,
    "to_bin_id" UUID,
    "to_code" VARCHAR(100) NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "batch_ref" VARCHAR(100),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "in_stock_location_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_stock_location_batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "batch_ref" VARCHAR(100) NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "total_lines" INTEGER,
    "lines_ok" INTEGER,
    "lines_with_mismatch" INTEGER,
    "lines_with_excess" INTEGER,
    "lines_with_shortage" INTEGER,
    "raw_data" JSONB,
    "notes" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "in_stock_location_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_stock_location_batch_lines" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_code" VARCHAR(50) NOT NULL,
    "bin_code" VARCHAR(100) NOT NULL,
    "qty" DECIMAL(15,3) NOT NULL,
    "uom" VARCHAR(20) NOT NULL,
    "item_id" UUID,
    "bin_id" UUID,
    "level_id" UUID,
    "validation_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "validation_message" TEXT,
    "system_qty" DECIMAL(15,3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_stock_location_batch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "in_stock_count_assignments_tenant_id_idx" ON "in_stock_count_assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "in_stock_count_assignments_session_id_idx" ON "in_stock_count_assignments"("session_id");

-- CreateIndex
CREATE INDEX "in_stock_count_assignments_user_id_idx" ON "in_stock_count_assignments"("user_id");

-- CreateIndex
CREATE INDEX "in_stock_location_updates_tenant_id_idx" ON "in_stock_location_updates"("tenant_id");

-- CreateIndex
CREATE INDEX "in_stock_location_updates_tenant_id_item_id_idx" ON "in_stock_location_updates"("tenant_id", "item_id");

-- CreateIndex
CREATE INDEX "in_stock_location_updates_tenant_id_warehouse_id_idx" ON "in_stock_location_updates"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "in_stock_location_updates_created_at_idx" ON "in_stock_location_updates"("created_at");

-- CreateIndex
CREATE INDEX "in_stock_location_batches_tenant_id_idx" ON "in_stock_location_batches"("tenant_id");

-- CreateIndex
CREATE INDEX "in_stock_location_batches_tenant_id_status_idx" ON "in_stock_location_batches"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "in_stock_location_batches_tenant_id_batch_ref_key" ON "in_stock_location_batches"("tenant_id", "batch_ref");

-- CreateIndex
CREATE INDEX "in_stock_location_batch_lines_batch_id_idx" ON "in_stock_location_batch_lines"("batch_id");

-- CreateIndex
CREATE INDEX "in_stock_location_batch_lines_validation_status_idx" ON "in_stock_location_batch_lines"("validation_status");

-- CreateIndex
CREATE INDEX "in_items_tenant_id_barcode_internal_idx" ON "in_items"("tenant_id", "barcode_internal");

-- CreateIndex
CREATE INDEX "in_items_tenant_id_barcode_external_idx" ON "in_items"("tenant_id", "barcode_external");

-- AddForeignKey
ALTER TABLE "in_stock_count_lines" ADD CONSTRAINT "in_stock_count_lines_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "in_wh_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_count_lines" ADD CONSTRAINT "in_stock_count_lines_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "in_wh_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_count_assignments" ADD CONSTRAINT "in_stock_count_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_count_assignments" ADD CONSTRAINT "in_stock_count_assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "in_stock_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_location_updates" ADD CONSTRAINT "in_stock_location_updates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_location_updates" ADD CONSTRAINT "in_stock_location_updates_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_location_batches" ADD CONSTRAINT "in_stock_location_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_location_batch_lines" ADD CONSTRAINT "in_stock_location_batch_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "in_stock_location_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
