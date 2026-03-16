-- CreateTable
CREATE TABLE "ac_budgets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "budget_code" VARCHAR(50) NOT NULL,
    "budget_name" VARCHAR(255) NOT NULL,
    "fiscal_year" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ac_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ac_budget_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "fiscal_period" VARCHAR(20) NOT NULL,
    "budget_amount" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ac_budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ac_cash_flow_projections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "projection_code" VARCHAR(50) NOT NULL,
    "projection_name" VARCHAR(255) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "scenario" VARCHAR(50) NOT NULL DEFAULT 'realistic',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ac_cash_flow_projections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ac_cash_flow_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cash_flow_projection_id" UUID NOT NULL,
    "line_date" DATE NOT NULL,
    "line_type" VARCHAR(50) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ac_cash_flow_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ac_budgets_tenant_id_idx" ON "ac_budgets"("tenant_id");

-- CreateIndex
CREATE INDEX "ac_budgets_fiscal_year_idx" ON "ac_budgets"("fiscal_year");

-- CreateIndex
CREATE INDEX "ac_budgets_status_idx" ON "ac_budgets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ac_budgets_tenant_id_budget_code_key" ON "ac_budgets"("tenant_id", "budget_code");

-- CreateIndex
CREATE INDEX "ac_budget_lines_tenant_id_idx" ON "ac_budget_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "ac_budget_lines_budget_id_idx" ON "ac_budget_lines"("budget_id");

-- CreateIndex
CREATE INDEX "ac_budget_lines_account_id_idx" ON "ac_budget_lines"("account_id");

-- CreateIndex
CREATE INDEX "ac_budget_lines_fiscal_period_idx" ON "ac_budget_lines"("fiscal_period");

-- CreateIndex
CREATE UNIQUE INDEX "ac_budget_lines_budget_id_account_id_fiscal_period_key" ON "ac_budget_lines"("budget_id", "account_id", "fiscal_period");

-- CreateIndex
CREATE INDEX "ac_cash_flow_projections_tenant_id_idx" ON "ac_cash_flow_projections"("tenant_id");

-- CreateIndex
CREATE INDEX "ac_cash_flow_projections_scenario_idx" ON "ac_cash_flow_projections"("scenario");

-- CreateIndex
CREATE UNIQUE INDEX "ac_cash_flow_projections_tenant_id_projection_code_key" ON "ac_cash_flow_projections"("tenant_id", "projection_code");

-- CreateIndex
CREATE INDEX "ac_cash_flow_lines_tenant_id_idx" ON "ac_cash_flow_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "ac_cash_flow_lines_cash_flow_projection_id_idx" ON "ac_cash_flow_lines"("cash_flow_projection_id");

-- CreateIndex
CREATE INDEX "ac_cash_flow_lines_line_date_idx" ON "ac_cash_flow_lines"("line_date");

-- CreateIndex
CREATE INDEX "ac_cash_flow_lines_line_type_idx" ON "ac_cash_flow_lines"("line_type");

-- CreateIndex
CREATE INDEX "ac_cash_flow_lines_account_id_idx" ON "ac_cash_flow_lines"("account_id");

-- AddForeignKey
ALTER TABLE "ac_budgets" ADD CONSTRAINT "ac_budgets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_budget_lines" ADD CONSTRAINT "ac_budget_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_budget_lines" ADD CONSTRAINT "ac_budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "ac_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_budget_lines" ADD CONSTRAINT "ac_budget_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ac_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_cash_flow_projections" ADD CONSTRAINT "ac_cash_flow_projections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_cash_flow_lines" ADD CONSTRAINT "ac_cash_flow_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_cash_flow_lines" ADD CONSTRAINT "ac_cash_flow_lines_cash_flow_projection_id_fkey" FOREIGN KEY ("cash_flow_projection_id") REFERENCES "ac_cash_flow_projections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_cash_flow_lines" ADD CONSTRAINT "ac_cash_flow_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ac_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
