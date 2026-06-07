-- AlterTable
ALTER TABLE "cfg_tenant_settings" ADD COLUMN     "email_api_key" TEXT,
ADD COLUMN     "email_from_address" VARCHAR(255),
ADD COLUMN     "email_from_name" VARCHAR(255),
ADD COLUMN     "email_host" VARCHAR(255),
ADD COLUMN     "email_port" INTEGER,
ADD COLUMN     "email_provider" VARCHAR(20);

-- CreateTable
CREATE TABLE "ntf_notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "channel" VARCHAR(20) NOT NULL DEFAULT 'email',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "recipient_email" VARCHAR(255),
    "recipient_name" VARCHAR(255),
    "subject" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "ntf_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ntf_notifications_tenant_id_status_idx" ON "ntf_notifications"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ntf_notifications_tenant_id_type_idx" ON "ntf_notifications"("tenant_id", "type");

-- AddForeignKey
ALTER TABLE "ntf_notifications" ADD CONSTRAINT "ntf_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

