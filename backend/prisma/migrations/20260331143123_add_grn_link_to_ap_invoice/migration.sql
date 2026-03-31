-- AlterTable
ALTER TABLE "ap_invoice_lines" ADD COLUMN     "grn_line_id" UUID;

-- AlterTable
ALTER TABLE "ap_invoices" ADD COLUMN     "grn_id" UUID;

-- CreateIndex
CREATE INDEX "ap_invoice_lines_grn_line_id_idx" ON "ap_invoice_lines"("grn_line_id");

-- CreateIndex
CREATE INDEX "ap_invoices_tenant_id_grn_id_idx" ON "ap_invoices"("tenant_id", "grn_id");

-- AddForeignKey
ALTER TABLE "ap_invoices" ADD CONSTRAINT "ap_invoices_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "grn_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoice_lines" ADD CONSTRAINT "ap_invoice_lines_grn_line_id_fkey" FOREIGN KEY ("grn_line_id") REFERENCES "grn_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
