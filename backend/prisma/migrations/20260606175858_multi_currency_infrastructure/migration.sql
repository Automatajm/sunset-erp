-- DropIndex
DROP INDEX "mc_exchange_rates_from_currency_to_currency_effective_date_key";

-- AlterTable
ALTER TABLE "cfg_tenant_settings" ADD COLUMN     "base_currency" VARCHAR(3) NOT NULL DEFAULT 'DOP';

-- AlterTable
ALTER TABLE "mc_exchange_rates" ADD COLUMN     "created_by" UUID,
ADD COLUMN     "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
ADD COLUMN     "tenant_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "mc_exchange_rates_tenant_id_idx" ON "mc_exchange_rates"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "mc_exchange_rates_tenant_id_from_currency_to_currency_effec_key" ON "mc_exchange_rates"("tenant_id", "from_currency", "to_currency", "effective_date");

-- AddForeignKey
ALTER TABLE "mc_exchange_rates" ADD CONSTRAINT "mc_exchange_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

