-- AlterTable
ALTER TABLE "grn_receipt_lines" ADD COLUMN     "expiry_date" DATE;

-- AlterTable
ALTER TABLE "grn_receipts" ADD COLUMN     "supplier_ref" VARCHAR(100);
