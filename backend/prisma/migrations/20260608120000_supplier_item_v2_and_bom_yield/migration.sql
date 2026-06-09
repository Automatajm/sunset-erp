-- supplier-item v2 fields + supplier-item price-history table + BOM yield_per_unit
-- migrated from an older branch (recovered work)

ALTER TABLE "in_supplier_items" ADD COLUMN IF NOT EXISTS "blocked_reason" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS "incoterm" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "is_blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "payment_terms" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "price_alert_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS "price_valid_from" DATE,
ADD COLUMN IF NOT EXISTS "price_valid_until" DATE,
ADD COLUMN IF NOT EXISTS "quality_rating" DECIMAL(3,2);

CREATE TABLE IF NOT EXISTS "po_supplier_item_price_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "supplier_item_id" UUID NOT NULL,
    "price" DECIMAL(15,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "source" VARCHAR(20) NOT NULL,
    "rfq_id" UUID,
    "grn_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    CONSTRAINT "po_supplier_item_price_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "po_supplier_item_price_history_tenant_id_idx" ON "po_supplier_item_price_history"("tenant_id");
CREATE INDEX IF NOT EXISTS "po_supplier_item_price_history_supplier_item_id_idx" ON "po_supplier_item_price_history"("supplier_item_id");
CREATE INDEX IF NOT EXISTS "po_supplier_item_price_history_valid_from_idx" ON "po_supplier_item_price_history"("valid_from");
CREATE INDEX IF NOT EXISTS "po_supplier_item_price_history_valid_until_idx" ON "po_supplier_item_price_history"("valid_until");
CREATE INDEX IF NOT EXISTS "po_supplier_item_price_history_source_idx" ON "po_supplier_item_price_history"("source");
CREATE INDEX IF NOT EXISTS "in_supplier_items_is_blocked_idx" ON "in_supplier_items"("is_blocked");
CREATE INDEX IF NOT EXISTS "in_supplier_items_price_valid_until_idx" ON "in_supplier_items"("price_valid_until");

ALTER TABLE "po_supplier_item_price_history" ADD CONSTRAINT "po_supplier_item_price_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "po_supplier_item_price_history" ADD CONSTRAINT "po_supplier_item_price_history_supplier_item_id_fkey" FOREIGN KEY ("supplier_item_id") REFERENCES "in_supplier_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "po_supplier_item_price_history" ADD CONSTRAINT "po_supplier_item_price_history_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "po_rfqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mfg_bom_components" ADD COLUMN IF NOT EXISTS "yield_per_unit" DECIMAL(15,4);
