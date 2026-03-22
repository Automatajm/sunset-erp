-- CreateTable
CREATE TABLE "auto_automation_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "mode" VARCHAR(20) NOT NULL DEFAULT 'review_required',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "auto_automation_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_je_queue" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "je_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "source_id" UUID NOT NULL,
    "source_ref" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "auto_je_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auto_automation_configs_tenant_id_idx" ON "auto_automation_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_automation_configs_tenant_id_module_key" ON "auto_automation_configs"("tenant_id", "module");

-- CreateIndex
CREATE INDEX "auto_je_queue_tenant_id_idx" ON "auto_je_queue"("tenant_id");

-- CreateIndex
CREATE INDEX "auto_je_queue_tenant_id_status_idx" ON "auto_je_queue"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "auto_je_queue_tenant_id_event_type_idx" ON "auto_je_queue"("tenant_id", "event_type");

-- CreateIndex
CREATE INDEX "auto_je_queue_je_id_idx" ON "auto_je_queue"("je_id");

-- AddForeignKey
ALTER TABLE "auto_automation_configs" ADD CONSTRAINT "auto_automation_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_je_queue" ADD CONSTRAINT "auto_je_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_je_queue" ADD CONSTRAINT "auto_je_queue_je_id_fkey" FOREIGN KEY ("je_id") REFERENCES "ac_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
