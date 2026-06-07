-- AlterTable
ALTER TABLE "ap_invoices" ADD COLUMN     "amount_base" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "base_currency" VARCHAR(3) NOT NULL DEFAULT 'DOP',
ADD COLUMN     "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1;

