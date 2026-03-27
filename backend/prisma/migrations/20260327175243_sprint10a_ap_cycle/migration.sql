-- CreateTable
CREATE TABLE "ap_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "po_id" UUID,
    "supplier_id" UUID NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    "supplier_ref" VARCHAR(100),
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

    CONSTRAINT "ap_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ap_invoice_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "po_line_id" UUID,
    "line_number" INTEGER NOT NULL,
    "item_id" UUID,
    "description" TEXT,
    "quantity" DECIMAL(15,3) NOT NULL,
    "uom" VARCHAR(20),
    "unit_price" DECIMAL(15,4) NOT NULL,
    "original_po_price" DECIMAL(15,4),
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(15,2) NOT NULL,
    "price_variance" DECIMAL(15,2),
    "inventory_account_id" UUID,
    "expense_account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ap_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ap_payments" (
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

    CONSTRAINT "ap_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ap_invoices_tenant_id_idx" ON "ap_invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "ap_invoices_tenant_id_supplier_id_idx" ON "ap_invoices"("tenant_id", "supplier_id");

-- CreateIndex
CREATE INDEX "ap_invoices_tenant_id_po_id_idx" ON "ap_invoices"("tenant_id", "po_id");

-- CreateIndex
CREATE INDEX "ap_invoices_tenant_id_status_idx" ON "ap_invoices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ap_invoices_invoice_date_idx" ON "ap_invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "ap_invoices_due_date_idx" ON "ap_invoices"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "ap_invoices_tenant_id_invoice_number_key" ON "ap_invoices"("tenant_id", "invoice_number");

-- CreateIndex
CREATE INDEX "ap_invoice_lines_tenant_id_idx" ON "ap_invoice_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "ap_invoice_lines_invoice_id_idx" ON "ap_invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "ap_invoice_lines_item_id_idx" ON "ap_invoice_lines"("item_id");

-- CreateIndex
CREATE INDEX "ap_invoice_lines_po_line_id_idx" ON "ap_invoice_lines"("po_line_id");

-- CreateIndex
CREATE INDEX "ap_payments_tenant_id_idx" ON "ap_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "ap_payments_invoice_id_idx" ON "ap_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "ap_payments_payment_date_idx" ON "ap_payments"("payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "ap_payments_tenant_id_payment_number_key" ON "ap_payments"("tenant_id", "payment_number");

-- AddForeignKey
ALTER TABLE "ap_invoices" ADD CONSTRAINT "ap_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoices" ADD CONSTRAINT "ap_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "po_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoices" ADD CONSTRAINT "ap_invoices_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "po_purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoices" ADD CONSTRAINT "ap_invoices_je_id_fkey" FOREIGN KEY ("je_id") REFERENCES "ac_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ap_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_po_line_id_fkey" FOREIGN KEY ("po_line_id") REFERENCES "po_purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_inventory_account_id_fkey" FOREIGN KEY ("inventory_account_id") REFERENCES "ac_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "ac_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ap_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_je_id_fkey" FOREIGN KEY ("je_id") REFERENCES "ac_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
