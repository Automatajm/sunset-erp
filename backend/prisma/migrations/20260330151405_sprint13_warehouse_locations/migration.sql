/*
  Warnings:

  - A unique constraint covering the columns `[tenant_id,item_id,warehouse_id,level_id,bin_id,lot_number,serial_number]` on the table `in_stock` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "in_stock_tenant_id_item_id_warehouse_id_lot_number_serial_n_key";

-- AlterTable
ALTER TABLE "in_stock" ADD COLUMN     "bin_id" UUID,
ADD COLUMN     "level_id" UUID;

-- AlterTable
ALTER TABLE "in_stock_movements" ADD COLUMN     "from_bin_id" UUID,
ADD COLUMN     "from_level_id" UUID,
ADD COLUMN     "to_bin_id" UUID,
ADD COLUMN     "to_level_id" UUID;

-- AlterTable
ALTER TABLE "in_warehouses" ADD COLUMN     "location_tracking_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "in_wh_zones" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "zone_type" VARCHAR(30) NOT NULL DEFAULT 'storage',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_wh_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_wh_aisles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100),
    "full_code" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_wh_aisles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_wh_racks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "aisle_id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100),
    "full_code" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_wh_racks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_wh_levels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rack_id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100),
    "full_code" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "max_weight_kg" DECIMAL(10,2),
    "max_volume_ltr" DECIMAL(10,2),
    "max_pallets" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_wh_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_wh_bins" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100),
    "full_code" VARCHAR(50) NOT NULL,
    "bin_type" VARCHAR(30) NOT NULL DEFAULT 'standard',
    "max_weight_kg" DECIMAL(10,2),
    "max_volume_ltr" DECIMAL(10,2),
    "max_pallets" INTEGER,
    "allow_mixed_items" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_wh_bins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "in_wh_zones_tenant_id_idx" ON "in_wh_zones"("tenant_id");

-- CreateIndex
CREATE INDEX "in_wh_zones_warehouse_id_idx" ON "in_wh_zones"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "in_wh_zones_tenant_id_warehouse_id_code_key" ON "in_wh_zones"("tenant_id", "warehouse_id", "code");

-- CreateIndex
CREATE INDEX "in_wh_aisles_tenant_id_idx" ON "in_wh_aisles"("tenant_id");

-- CreateIndex
CREATE INDEX "in_wh_aisles_zone_id_idx" ON "in_wh_aisles"("zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "in_wh_aisles_zone_id_code_key" ON "in_wh_aisles"("zone_id", "code");

-- CreateIndex
CREATE INDEX "in_wh_racks_tenant_id_idx" ON "in_wh_racks"("tenant_id");

-- CreateIndex
CREATE INDEX "in_wh_racks_aisle_id_idx" ON "in_wh_racks"("aisle_id");

-- CreateIndex
CREATE UNIQUE INDEX "in_wh_racks_aisle_id_code_key" ON "in_wh_racks"("aisle_id", "code");

-- CreateIndex
CREATE INDEX "in_wh_levels_tenant_id_idx" ON "in_wh_levels"("tenant_id");

-- CreateIndex
CREATE INDEX "in_wh_levels_rack_id_idx" ON "in_wh_levels"("rack_id");

-- CreateIndex
CREATE UNIQUE INDEX "in_wh_levels_rack_id_code_key" ON "in_wh_levels"("rack_id", "code");

-- CreateIndex
CREATE INDEX "in_wh_bins_tenant_id_idx" ON "in_wh_bins"("tenant_id");

-- CreateIndex
CREATE INDEX "in_wh_bins_level_id_idx" ON "in_wh_bins"("level_id");

-- CreateIndex
CREATE UNIQUE INDEX "in_wh_bins_level_id_code_key" ON "in_wh_bins"("level_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "in_stock_tenant_id_item_id_warehouse_id_level_id_bin_id_lot_key" ON "in_stock"("tenant_id", "item_id", "warehouse_id", "level_id", "bin_id", "lot_number", "serial_number");

-- AddForeignKey
ALTER TABLE "in_stock" ADD CONSTRAINT "in_stock_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "in_wh_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock" ADD CONSTRAINT "in_stock_bin_id_fkey" FOREIGN KEY ("bin_id") REFERENCES "in_wh_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_movements" ADD CONSTRAINT "in_stock_movements_from_level_id_fkey" FOREIGN KEY ("from_level_id") REFERENCES "in_wh_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_movements" ADD CONSTRAINT "in_stock_movements_to_level_id_fkey" FOREIGN KEY ("to_level_id") REFERENCES "in_wh_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_movements" ADD CONSTRAINT "in_stock_movements_from_bin_id_fkey" FOREIGN KEY ("from_bin_id") REFERENCES "in_wh_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_movements" ADD CONSTRAINT "in_stock_movements_to_bin_id_fkey" FOREIGN KEY ("to_bin_id") REFERENCES "in_wh_bins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_wh_zones" ADD CONSTRAINT "in_wh_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_wh_zones" ADD CONSTRAINT "in_wh_zones_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "in_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_wh_aisles" ADD CONSTRAINT "in_wh_aisles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_wh_aisles" ADD CONSTRAINT "in_wh_aisles_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "in_wh_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_wh_racks" ADD CONSTRAINT "in_wh_racks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_wh_racks" ADD CONSTRAINT "in_wh_racks_aisle_id_fkey" FOREIGN KEY ("aisle_id") REFERENCES "in_wh_aisles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_wh_levels" ADD CONSTRAINT "in_wh_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_wh_levels" ADD CONSTRAINT "in_wh_levels_rack_id_fkey" FOREIGN KEY ("rack_id") REFERENCES "in_wh_racks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_wh_bins" ADD CONSTRAINT "in_wh_bins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_wh_bins" ADD CONSTRAINT "in_wh_bins_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "in_wh_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
