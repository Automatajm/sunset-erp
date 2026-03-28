-- AlterTable
ALTER TABLE "in_items" ADD COLUMN     "consumption_group_id" UUID,
ADD COLUMN     "consumption_uom_id" UUID,
ADD COLUMN     "purchase_to_consumption_factor" DECIMAL(18,8) NOT NULL DEFAULT 1,
ADD COLUMN     "purchase_uom_id" UUID,
ADD COLUMN     "storage_to_consumption_factor" DECIMAL(18,8) NOT NULL DEFAULT 1,
ADD COLUMN     "storage_uom_id" UUID;

-- CreateTable
CREATE TABLE "cfg_uom_units" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "system" VARCHAR(20) NOT NULL,
    "is_base" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "symbol" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfg_uom_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cfg_uom_conversions" (
    "id" UUID NOT NULL,
    "from_uom_id" UUID NOT NULL,
    "to_uom_id" UUID NOT NULL,
    "factor" DECIMAL(18,8) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfg_uom_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cfg_tenant_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "default_uom_system" VARCHAR(20) NOT NULL DEFAULT 'metric',
    "volume_base_uom_id" UUID,
    "mass_base_uom_id" UUID,
    "length_base_uom_id" UUID,
    "area_base_uom_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "cfg_tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_macro_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_macro_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "macro_category_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "inventory_account_id" UUID,
    "cogs_account_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_consumption_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "consumption_uom_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_consumption_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_supplier_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "supplier_item_code" VARCHAR(100),
    "supplier_item_name" VARCHAR(255),
    "purchase_uom_id" UUID NOT NULL,
    "pack_size" DECIMAL(15,4) NOT NULL DEFAULT 1,
    "conversion_factor" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "last_price" DECIMAL(15,4),
    "lead_time_days" INTEGER NOT NULL DEFAULT 0,
    "moq" DECIMAL(15,3) NOT NULL DEFAULT 1,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_supplier_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cfg_uom_units_type_idx" ON "cfg_uom_units"("type");

-- CreateIndex
CREATE INDEX "cfg_uom_units_system_idx" ON "cfg_uom_units"("system");

-- CreateIndex
CREATE INDEX "cfg_uom_units_type_system_idx" ON "cfg_uom_units"("type", "system");

-- CreateIndex
CREATE UNIQUE INDEX "cfg_uom_units_code_key" ON "cfg_uom_units"("code");

-- CreateIndex
CREATE INDEX "cfg_uom_conversions_from_uom_id_idx" ON "cfg_uom_conversions"("from_uom_id");

-- CreateIndex
CREATE INDEX "cfg_uom_conversions_to_uom_id_idx" ON "cfg_uom_conversions"("to_uom_id");

-- CreateIndex
CREATE UNIQUE INDEX "cfg_uom_conversions_from_uom_id_to_uom_id_key" ON "cfg_uom_conversions"("from_uom_id", "to_uom_id");

-- CreateIndex
CREATE UNIQUE INDEX "cfg_tenant_settings_tenant_id_key" ON "cfg_tenant_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "in_macro_categories_tenant_id_idx" ON "in_macro_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "in_macro_categories_tenant_id_code_key" ON "in_macro_categories"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "in_categories_tenant_id_idx" ON "in_categories"("tenant_id");

-- CreateIndex
CREATE INDEX "in_categories_tenant_id_macro_category_id_idx" ON "in_categories"("tenant_id", "macro_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "in_categories_tenant_id_code_key" ON "in_categories"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "in_consumption_groups_tenant_id_idx" ON "in_consumption_groups"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "in_consumption_groups_tenant_id_code_key" ON "in_consumption_groups"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "in_supplier_items_tenant_id_idx" ON "in_supplier_items"("tenant_id");

-- CreateIndex
CREATE INDEX "in_supplier_items_tenant_id_item_id_idx" ON "in_supplier_items"("tenant_id", "item_id");

-- CreateIndex
CREATE INDEX "in_supplier_items_tenant_id_supplier_id_idx" ON "in_supplier_items"("tenant_id", "supplier_id");

-- CreateIndex
CREATE INDEX "in_supplier_items_is_preferred_idx" ON "in_supplier_items"("is_preferred");

-- CreateIndex
CREATE UNIQUE INDEX "in_supplier_items_tenant_id_supplier_id_item_id_key" ON "in_supplier_items"("tenant_id", "supplier_id", "item_id");

-- AddForeignKey
ALTER TABLE "in_items" ADD CONSTRAINT "in_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "in_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_items" ADD CONSTRAINT "in_items_consumption_group_id_fkey" FOREIGN KEY ("consumption_group_id") REFERENCES "in_consumption_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_items" ADD CONSTRAINT "in_items_purchase_uom_id_fkey" FOREIGN KEY ("purchase_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_items" ADD CONSTRAINT "in_items_storage_uom_id_fkey" FOREIGN KEY ("storage_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_items" ADD CONSTRAINT "in_items_consumption_uom_id_fkey" FOREIGN KEY ("consumption_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfg_uom_conversions" ADD CONSTRAINT "cfg_uom_conversions_from_uom_id_fkey" FOREIGN KEY ("from_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfg_uom_conversions" ADD CONSTRAINT "cfg_uom_conversions_to_uom_id_fkey" FOREIGN KEY ("to_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfg_tenant_settings" ADD CONSTRAINT "cfg_tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfg_tenant_settings" ADD CONSTRAINT "cfg_tenant_settings_volume_base_uom_id_fkey" FOREIGN KEY ("volume_base_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfg_tenant_settings" ADD CONSTRAINT "cfg_tenant_settings_mass_base_uom_id_fkey" FOREIGN KEY ("mass_base_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfg_tenant_settings" ADD CONSTRAINT "cfg_tenant_settings_length_base_uom_id_fkey" FOREIGN KEY ("length_base_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cfg_tenant_settings" ADD CONSTRAINT "cfg_tenant_settings_area_base_uom_id_fkey" FOREIGN KEY ("area_base_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_macro_categories" ADD CONSTRAINT "in_macro_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_categories" ADD CONSTRAINT "in_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_categories" ADD CONSTRAINT "in_categories_macro_category_id_fkey" FOREIGN KEY ("macro_category_id") REFERENCES "in_macro_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_categories" ADD CONSTRAINT "in_categories_inventory_account_id_fkey" FOREIGN KEY ("inventory_account_id") REFERENCES "ac_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_categories" ADD CONSTRAINT "in_categories_cogs_account_id_fkey" FOREIGN KEY ("cogs_account_id") REFERENCES "ac_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_consumption_groups" ADD CONSTRAINT "in_consumption_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_consumption_groups" ADD CONSTRAINT "in_consumption_groups_consumption_uom_id_fkey" FOREIGN KEY ("consumption_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_supplier_items" ADD CONSTRAINT "in_supplier_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_supplier_items" ADD CONSTRAINT "in_supplier_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "po_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_supplier_items" ADD CONSTRAINT "in_supplier_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_supplier_items" ADD CONSTRAINT "in_supplier_items_purchase_uom_id_fkey" FOREIGN KEY ("purchase_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
