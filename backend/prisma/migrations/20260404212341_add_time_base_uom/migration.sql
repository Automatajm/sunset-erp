-- AlterTable
ALTER TABLE "cfg_tenant_settings" ADD COLUMN     "time_base_uom_id" UUID;

-- AddForeignKey
ALTER TABLE "cfg_tenant_settings" ADD CONSTRAINT "cfg_tenant_settings_time_base_uom_id_fkey" FOREIGN KEY ("time_base_uom_id") REFERENCES "cfg_uom_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
