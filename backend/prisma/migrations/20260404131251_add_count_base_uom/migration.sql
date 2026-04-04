-- AlterTable
ALTER TABLE "cfg_tenant_settings" ADD COLUMN     "count_base_uom_id" UUID;

-- AddForeignKey
ALTER TABLE "cfg_tenant_settings" ADD CONSTRAINT "cfg_tenant_settings_count_base_uom_id_fkey" FOREIGN KEY ("count_base_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
