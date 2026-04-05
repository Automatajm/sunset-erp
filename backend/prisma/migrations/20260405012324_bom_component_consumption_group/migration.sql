/*
  Warnings:

  - You are about to drop the column `component_item_id` on the `mfg_bom_components` table. All the data in the column will be lost.
  - Added the required column `consumption_group_id` to the `mfg_bom_components` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "mfg_bom_components" DROP CONSTRAINT "mfg_bom_components_component_item_id_fkey";

-- DropIndex
DROP INDEX "mfg_bom_components_component_item_id_idx";

-- AlterTable
ALTER TABLE "mfg_bom_components" DROP COLUMN "component_item_id",
ADD COLUMN     "consumption_group_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "mfg_bom_components_consumption_group_id_idx" ON "mfg_bom_components"("consumption_group_id");

-- AddForeignKey
ALTER TABLE "mfg_bom_components" ADD CONSTRAINT "mfg_bom_components_consumption_group_id_fkey" FOREIGN KEY ("consumption_group_id") REFERENCES "in_consumption_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
