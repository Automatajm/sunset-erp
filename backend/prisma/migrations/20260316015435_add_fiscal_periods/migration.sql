-- CreateTable
CREATE TABLE "ac_fiscal_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period_code" VARCHAR(20) NOT NULL,
    "period_name" VARCHAR(100) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "fiscal_year" VARCHAR(20) NOT NULL,
    "fiscal_quarter" VARCHAR(10),
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ac_fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ac_fiscal_periods_tenant_id_idx" ON "ac_fiscal_periods"("tenant_id");

-- CreateIndex
CREATE INDEX "ac_fiscal_periods_tenant_id_period_code_idx" ON "ac_fiscal_periods"("tenant_id", "period_code");

-- CreateIndex
CREATE INDEX "ac_fiscal_periods_fiscal_year_idx" ON "ac_fiscal_periods"("fiscal_year");

-- CreateIndex
CREATE INDEX "ac_fiscal_periods_status_idx" ON "ac_fiscal_periods"("status");

-- CreateIndex
CREATE INDEX "ac_fiscal_periods_is_current_idx" ON "ac_fiscal_periods"("is_current");

-- CreateIndex
CREATE UNIQUE INDEX "ac_fiscal_periods_tenant_id_period_code_key" ON "ac_fiscal_periods"("tenant_id", "period_code");

-- AddForeignKey
ALTER TABLE "ac_fiscal_periods" ADD CONSTRAINT "ac_fiscal_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
