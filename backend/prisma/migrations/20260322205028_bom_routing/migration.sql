-- CreateTable
CREATE TABLE "mfg_bom_routings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bom_id" UUID NOT NULL,
    "step_number" INTEGER NOT NULL,
    "work_center_id" UUID NOT NULL,
    "description" TEXT,
    "setup_time" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "run_time_per_unit" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "mfg_bom_routings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mfg_bom_routings_tenant_id_idx" ON "mfg_bom_routings"("tenant_id");

-- CreateIndex
CREATE INDEX "mfg_bom_routings_bom_id_idx" ON "mfg_bom_routings"("bom_id");

-- CreateIndex
CREATE INDEX "mfg_bom_routings_work_center_id_idx" ON "mfg_bom_routings"("work_center_id");

-- CreateIndex
CREATE UNIQUE INDEX "mfg_bom_routings_bom_id_step_number_key" ON "mfg_bom_routings"("bom_id", "step_number");

-- AddForeignKey
ALTER TABLE "mfg_bom_routings" ADD CONSTRAINT "mfg_bom_routings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_bom_routings" ADD CONSTRAINT "mfg_bom_routings_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "mfg_boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_bom_routings" ADD CONSTRAINT "mfg_bom_routings_work_center_id_fkey" FOREIGN KEY ("work_center_id") REFERENCES "mfg_work_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
