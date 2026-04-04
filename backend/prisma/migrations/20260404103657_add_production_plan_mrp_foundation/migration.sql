-- AlterTable
ALTER TABLE "mfg_bom_components" ADD COLUMN     "consumption_uom_id" UUID;

-- AlterTable
ALTER TABLE "mfg_production_orders" ADD COLUMN     "plan_line_id" UUID;

-- AlterTable
ALTER TABLE "po_general_need_lines" ADD COLUMN     "consumption_group_id" UUID;

-- CreateTable
CREATE TABLE "mfg_production_plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_number" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "horizon" VARCHAR(20) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'free',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "crp_status" VARCHAR(20),
    "crp_run_at" TIMESTAMP(3),
    "crp_notes" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "mfg_production_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_production_plan_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "bom_id" UUID,
    "planned_qty" DECIMAL(15,3) NOT NULL,
    "uom" VARCHAR(20) NOT NULL,
    "planned_start" DATE NOT NULL,
    "planned_end" DATE NOT NULL,
    "produced_qty" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "so_line_id" UUID,
    "gn_line_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "mfg_production_plan_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mfg_production_plans_tenant_id_idx" ON "mfg_production_plans"("tenant_id");

-- CreateIndex
CREATE INDEX "mfg_production_plans_tenant_id_status_idx" ON "mfg_production_plans"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "mfg_production_plans_tenant_id_horizon_idx" ON "mfg_production_plans"("tenant_id", "horizon");

-- CreateIndex
CREATE INDEX "mfg_production_plans_period_start_idx" ON "mfg_production_plans"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "mfg_production_plans_tenant_id_plan_number_key" ON "mfg_production_plans"("tenant_id", "plan_number");

-- CreateIndex
CREATE INDEX "mfg_production_plan_lines_tenant_id_idx" ON "mfg_production_plan_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "mfg_production_plan_lines_plan_id_idx" ON "mfg_production_plan_lines"("plan_id");

-- CreateIndex
CREATE INDEX "mfg_production_plan_lines_item_id_idx" ON "mfg_production_plan_lines"("item_id");

-- CreateIndex
CREATE INDEX "mfg_production_plan_lines_status_idx" ON "mfg_production_plan_lines"("status");

-- AddForeignKey
ALTER TABLE "mfg_bom_components" ADD CONSTRAINT "mfg_bom_components_consumption_uom_id_fkey" FOREIGN KEY ("consumption_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_orders" ADD CONSTRAINT "mfg_production_orders_plan_line_id_fkey" FOREIGN KEY ("plan_line_id") REFERENCES "mfg_production_plan_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_general_need_lines" ADD CONSTRAINT "po_general_need_lines_consumption_group_id_fkey" FOREIGN KEY ("consumption_group_id") REFERENCES "in_consumption_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_plans" ADD CONSTRAINT "mfg_production_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_plan_lines" ADD CONSTRAINT "mfg_production_plan_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_plan_lines" ADD CONSTRAINT "mfg_production_plan_lines_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "mfg_production_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_plan_lines" ADD CONSTRAINT "mfg_production_plan_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_plan_lines" ADD CONSTRAINT "mfg_production_plan_lines_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "mfg_boms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_plan_lines" ADD CONSTRAINT "mfg_production_plan_lines_so_line_id_fkey" FOREIGN KEY ("so_line_id") REFERENCES "so_sales_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
