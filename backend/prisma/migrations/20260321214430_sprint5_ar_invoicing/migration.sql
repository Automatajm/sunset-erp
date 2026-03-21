-- CreateTable
CREATE TABLE "ar_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "so_id" UUID,
    "customer_id" UUID NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    "invoice_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "due_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "je_id" UUID,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ar_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_invoice_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "item_id" UUID,
    "description" TEXT,
    "quantity" DECIMAL(15,3) NOT NULL,
    "uom" VARCHAR(20),
    "unit_price" DECIMAL(15,4) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(15,2) NOT NULL,
    "cogs_amount" DECIMAL(15,2),
    "revenue_account_id" UUID,
    "cogs_account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ar_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "payment_number" VARCHAR(50) NOT NULL,
    "payment_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "amount" DECIMAL(15,2) NOT NULL,
    "payment_method" VARCHAR(50),
    "reference" VARCHAR(255),
    "je_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ar_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ar_invoices_tenant_id_idx" ON "ar_invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "ar_invoices_tenant_id_customer_id_idx" ON "ar_invoices"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "ar_invoices_tenant_id_so_id_idx" ON "ar_invoices"("tenant_id", "so_id");

-- CreateIndex
CREATE INDEX "ar_invoices_tenant_id_status_idx" ON "ar_invoices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ar_invoices_invoice_date_idx" ON "ar_invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "ar_invoices_due_date_idx" ON "ar_invoices"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "ar_invoices_tenant_id_invoice_number_key" ON "ar_invoices"("tenant_id", "invoice_number");

-- CreateIndex
CREATE INDEX "ar_invoice_lines_tenant_id_idx" ON "ar_invoice_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "ar_invoice_lines_invoice_id_idx" ON "ar_invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "ar_invoice_lines_item_id_idx" ON "ar_invoice_lines"("item_id");

-- CreateIndex
CREATE INDEX "ar_payments_tenant_id_idx" ON "ar_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "ar_payments_invoice_id_idx" ON "ar_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "ar_payments_payment_date_idx" ON "ar_payments"("payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "ar_payments_tenant_id_payment_number_key" ON "ar_payments"("tenant_id", "payment_number");

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "so_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_so_id_fkey" FOREIGN KEY ("so_id") REFERENCES "so_sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_je_id_fkey" FOREIGN KEY ("je_id") REFERENCES "ac_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoice_lines" ADD CONSTRAINT "ar_invoice_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoice_lines" ADD CONSTRAINT "ar_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ar_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoice_lines" ADD CONSTRAINT "ar_invoice_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoice_lines" ADD CONSTRAINT "ar_invoice_lines_revenue_account_id_fkey" FOREIGN KEY ("revenue_account_id") REFERENCES "ac_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoice_lines" ADD CONSTRAINT "ar_invoice_lines_cogs_account_id_fkey" FOREIGN KEY ("cogs_account_id") REFERENCES "ac_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ar_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_je_id_fkey" FOREIGN KEY ("je_id") REFERENCES "ac_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
