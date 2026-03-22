-- CreateTable
CREATE TABLE "mfg_mo_labor_actuals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "mo_id" UUID NOT NULL,
    "work_date" DATE,
    "employee_id" VARCHAR(100),
    "employee_name" VARCHAR(255),
    "hours_planned" DECIMAL(8,2),
    "hours_actual" DECIMAL(8,2) NOT NULL,
    "labor_rate" DECIMAL(10,4),
    "labor_cost" DECIMAL(15,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "mfg_mo_labor_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_mo_material_actuals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "mo_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty_planned" DECIMAL(15,4) NOT NULL,
    "qty_actual" DECIMAL(15,4) NOT NULL,
    "unit_cost" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "variance_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "mfg_mo_material_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_production_variances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "mo_id" UUID NOT NULL,
    "variance_type" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(15,4),
    "unit_cost" DECIMAL(10,4),
    "total_cost" DECIMAL(15,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "je_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "mfg_production_variances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mfg_mo_labor_actuals_tenant_id_idx" ON "mfg_mo_labor_actuals"("tenant_id");

-- CreateIndex
CREATE INDEX "mfg_mo_labor_actuals_mo_id_idx" ON "mfg_mo_labor_actuals"("mo_id");

-- CreateIndex
CREATE INDEX "mfg_mo_labor_actuals_work_date_idx" ON "mfg_mo_labor_actuals"("work_date");

-- CreateIndex
CREATE INDEX "mfg_mo_material_actuals_tenant_id_idx" ON "mfg_mo_material_actuals"("tenant_id");

-- CreateIndex
CREATE INDEX "mfg_mo_material_actuals_mo_id_idx" ON "mfg_mo_material_actuals"("mo_id");

-- CreateIndex
CREATE INDEX "mfg_mo_material_actuals_item_id_idx" ON "mfg_mo_material_actuals"("item_id");

-- CreateIndex
CREATE INDEX "mfg_production_variances_tenant_id_idx" ON "mfg_production_variances"("tenant_id");

-- CreateIndex
CREATE INDEX "mfg_production_variances_mo_id_idx" ON "mfg_production_variances"("mo_id");

-- CreateIndex
CREATE INDEX "mfg_production_variances_status_idx" ON "mfg_production_variances"("status");

-- CreateIndex
CREATE INDEX "mfg_production_variances_variance_type_idx" ON "mfg_production_variances"("variance_type");

-- AddForeignKey
ALTER TABLE "mfg_mo_labor_actuals" ADD CONSTRAINT "mfg_mo_labor_actuals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_mo_labor_actuals" ADD CONSTRAINT "mfg_mo_labor_actuals_mo_id_fkey" FOREIGN KEY ("mo_id") REFERENCES "mfg_production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_mo_material_actuals" ADD CONSTRAINT "mfg_mo_material_actuals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_mo_material_actuals" ADD CONSTRAINT "mfg_mo_material_actuals_mo_id_fkey" FOREIGN KEY ("mo_id") REFERENCES "mfg_production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_mo_material_actuals" ADD CONSTRAINT "mfg_mo_material_actuals_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_variances" ADD CONSTRAINT "mfg_production_variances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_variances" ADD CONSTRAINT "mfg_production_variances_mo_id_fkey" FOREIGN KEY ("mo_id") REFERENCES "mfg_production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_variances" ADD CONSTRAINT "mfg_production_variances_je_id_fkey" FOREIGN KEY ("je_id") REFERENCES "ac_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
