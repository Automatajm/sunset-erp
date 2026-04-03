-- AlterTable
ALTER TABLE "grn_receipts" ADD COLUMN     "supplier_id" UUID;

-- AddForeignKey
ALTER TABLE "grn_receipts" ADD CONSTRAINT "grn_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "po_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
