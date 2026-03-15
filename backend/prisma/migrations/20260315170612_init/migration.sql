-- CreateTable
CREATE TABLE "saas_tenants" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "legal_name" VARCHAR(255),
    "tax_id" VARCHAR(50),
    "subdomain" VARCHAR(100),
    "country" VARCHAR(2) NOT NULL,
    "industry" VARCHAR(100),
    "company_size" VARCHAR(50),
    "logo_url" VARCHAR(500),
    "primary_color" VARCHAR(7),
    "secondary_color" VARCHAR(7),
    "subscription_plan" VARCHAR(50) NOT NULL DEFAULT 'free',
    "subscription_status" VARCHAR(20) NOT NULL DEFAULT 'trial',
    "trial_starts_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "subscription_starts_at" TIMESTAMP(3),
    "subscription_ends_at" TIMESTAMP(3),
    "default_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "default_language" VARCHAR(10) NOT NULL DEFAULT 'en-US',
    "fiscal_year_start" INTEGER NOT NULL DEFAULT 1,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "saas_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_subscription_plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "price_monthly" DECIMAL(10,2) NOT NULL,
    "price_yearly" DECIMAL(10,2) NOT NULL,
    "limits" JSONB NOT NULL,
    "features" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "billing_cycle" VARCHAR(20) NOT NULL DEFAULT 'monthly',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "trial_start" TIMESTAMP(3),
    "trial_end" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID,
    "invoice_number" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "invoice_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "due_date" DATE NOT NULL,
    "paid_at" TIMESTAMP(3),
    "payment_method" VARCHAR(50),
    "stripe_invoice_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_usage_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "metric_name" VARCHAR(100) NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20),
    "avatar_url" VARCHAR(500),
    "locale" VARCHAR(10) NOT NULL DEFAULT 'en-US',
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_user_tenants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_user_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "auth_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "module" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mc_currencies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "decimal_places" SMALLINT NOT NULL DEFAULT 2,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mc_currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mc_exchange_rates" (
    "id" UUID NOT NULL,
    "from_currency" VARCHAR(3) NOT NULL,
    "to_currency" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mc_exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "i18n_languages" (
    "id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "native_name" VARCHAR(100) NOT NULL,
    "is_rtl" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "i18n_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "i18n_translations" (
    "id" UUID NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,
    "translation_key" VARCHAR(255) NOT NULL,
    "translation_value" TEXT NOT NULL,
    "context" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "i18n_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "legal_name" VARCHAR(255),
    "tax_id" VARCHAR(50),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "website" VARCHAR(255),
    "payment_terms" VARCHAR(50),
    "currency" VARCHAR(3),
    "credit_limit" DECIMAL(15,2),
    "category" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "po_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "po_number" VARCHAR(50) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "po_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "expected_date" DATE,
    "delivery_address" TEXT,
    "payment_terms" VARCHAR(50),
    "currency" VARCHAR(3),
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "po_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_purchase_order_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "description" TEXT,
    "ordered_quantity" DECIMAL(15,3) NOT NULL,
    "received_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "uom" VARCHAR(20) NOT NULL,
    "unit_price" DECIMAL(15,4) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_code" VARCHAR(20),
    "line_total" DECIMAL(15,2) NOT NULL,
    "expected_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "po_purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "item_type" VARCHAR(50) NOT NULL,
    "category_id" UUID,
    "base_uom" VARCHAR(20) NOT NULL,
    "is_stockable" BOOLEAN NOT NULL DEFAULT true,
    "is_purchasable" BOOLEAN NOT NULL DEFAULT true,
    "is_saleable" BOOLEAN NOT NULL DEFAULT true,
    "is_manufacturable" BOOLEAN NOT NULL DEFAULT false,
    "is_lot_tracked" BOOLEAN NOT NULL DEFAULT false,
    "is_serial_tracked" BOOLEAN NOT NULL DEFAULT false,
    "is_expiry_tracked" BOOLEAN NOT NULL DEFAULT false,
    "valuation_method" VARCHAR(50) NOT NULL DEFAULT 'average',
    "standard_cost" DECIMAL(15,4),
    "lead_time_days" INTEGER NOT NULL DEFAULT 0,
    "safety_stock" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "reorder_point" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "reorder_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "default_supplier_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_warehouses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "warehouse_type" VARCHAR(50) NOT NULL DEFAULT 'regular',
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "in_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_stock" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "on_hand_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "lot_number" VARCHAR(100),
    "serial_number" VARCHAR(100),
    "unit_cost" DECIMAL(15,4),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "in_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_stock_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "movement_number" VARCHAR(50) NOT NULL,
    "movement_type" VARCHAR(50) NOT NULL,
    "movement_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "item_id" UUID NOT NULL,
    "from_warehouse_id" UUID,
    "to_warehouse_id" UUID,
    "quantity" DECIMAL(15,3) NOT NULL,
    "uom" VARCHAR(20) NOT NULL,
    "lot_number" VARCHAR(100),
    "serial_number" VARCHAR(100),
    "unit_cost" DECIMAL(15,4),
    "reference_type" VARCHAR(50),
    "reference_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "in_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_boms" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_item_id" UUID NOT NULL,
    "bom_number" VARCHAR(50) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "mfg_boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_bom_components" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bom_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "component_item_id" UUID NOT NULL,
    "quantity_per" DECIMAL(15,6) NOT NULL,
    "uom" VARCHAR(20) NOT NULL,
    "scrap_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "is_phantom" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "mfg_bom_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_work_centers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "work_center_type" VARCHAR(50) NOT NULL,
    "capacity_per_hour" DECIMAL(10,2),
    "efficiency_percent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "cost_per_hour" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "mfg_work_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfg_production_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "po_number" VARCHAR(50) NOT NULL,
    "item_id" UUID NOT NULL,
    "bom_id" UUID,
    "quantity_to_produce" DECIMAL(15,3) NOT NULL,
    "quantity_produced" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "planned_start_date" DATE,
    "planned_end_date" DATE,
    "actual_start_date" DATE,
    "actual_end_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "mfg_production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "so_customers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "legal_name" VARCHAR(255),
    "tax_id" VARCHAR(50),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "website" VARCHAR(255),
    "credit_limit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit_status" VARCHAR(20) NOT NULL DEFAULT 'good',
    "payment_terms" VARCHAR(50),
    "currency" VARCHAR(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "so_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "so_sales_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "so_number" VARCHAR(50) NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "customer_po" VARCHAR(100),
    "requested_date" DATE,
    "promised_date" DATE,
    "payment_terms" VARCHAR(50),
    "currency" VARCHAR(3),
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "so_sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "so_sales_order_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "item_id" UUID NOT NULL,
    "description" TEXT,
    "ordered_quantity" DECIMAL(15,3) NOT NULL,
    "reserved_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "shipped_quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "uom" VARCHAR(20) NOT NULL,
    "unit_price" DECIMAL(15,4) NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_code" VARCHAR(20),
    "line_total" DECIMAL(15,2) NOT NULL,
    "delivery_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "so_sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ac_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "account_number" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "account_type" VARCHAR(50) NOT NULL,
    "account_category" VARCHAR(100),
    "parent_account_id" UUID,
    "currency" VARCHAR(3),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "allow_manual_posting" BOOLEAN NOT NULL DEFAULT true,
    "require_reconciliation" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ac_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ac_journal_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entry_number" VARCHAR(50) NOT NULL,
    "entry_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "posting_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "fiscal_period" VARCHAR(20) NOT NULL,
    "journal_type" VARCHAR(50) NOT NULL DEFAULT 'general',
    "reference" VARCHAR(255),
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ac_journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ac_journal_entry_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "account_id" UUID NOT NULL,
    "description" TEXT,
    "debit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3),
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_by" UUID,

    CONSTRAINT "ac_journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saas_tenants_code_key" ON "saas_tenants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "saas_tenants_subdomain_key" ON "saas_tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "saas_subscription_plans_code_key" ON "saas_subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "saas_invoices_invoice_number_key" ON "saas_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "saas_usage_records_tenant_id_idx" ON "saas_usage_records"("tenant_id");

-- CreateIndex
CREATE INDEX "saas_usage_records_tenant_id_metric_name_idx" ON "saas_usage_records"("tenant_id", "metric_name");

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");

-- CreateIndex
CREATE INDEX "auth_user_tenants_user_id_idx" ON "auth_user_tenants"("user_id");

-- CreateIndex
CREATE INDEX "auth_user_tenants_tenant_id_idx" ON "auth_user_tenants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_user_tenants_user_id_tenant_id_key" ON "auth_user_tenants"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "auth_roles_tenant_id_idx" ON "auth_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_roles_tenant_id_code_key" ON "auth_roles"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "auth_permissions_code_key" ON "auth_permissions"("code");

-- CreateIndex
CREATE INDEX "auth_permissions_module_idx" ON "auth_permissions"("module");

-- CreateIndex
CREATE INDEX "auth_role_permissions_role_id_idx" ON "auth_role_permissions"("role_id");

-- CreateIndex
CREATE INDEX "auth_role_permissions_permission_id_idx" ON "auth_role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_role_permissions_role_id_permission_id_key" ON "auth_role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "auth_user_roles_user_id_idx" ON "auth_user_roles"("user_id");

-- CreateIndex
CREATE INDEX "auth_user_roles_role_id_idx" ON "auth_user_roles"("role_id");

-- CreateIndex
CREATE INDEX "auth_user_roles_tenant_id_idx" ON "auth_user_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_user_roles_user_id_role_id_tenant_id_key" ON "auth_user_roles"("user_id", "role_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "mc_currencies_code_key" ON "mc_currencies"("code");

-- CreateIndex
CREATE INDEX "mc_currencies_code_idx" ON "mc_currencies"("code");

-- CreateIndex
CREATE INDEX "mc_exchange_rates_from_currency_idx" ON "mc_exchange_rates"("from_currency");

-- CreateIndex
CREATE INDEX "mc_exchange_rates_to_currency_idx" ON "mc_exchange_rates"("to_currency");

-- CreateIndex
CREATE INDEX "mc_exchange_rates_effective_date_idx" ON "mc_exchange_rates"("effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "mc_exchange_rates_from_currency_to_currency_effective_date_key" ON "mc_exchange_rates"("from_currency", "to_currency", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "i18n_languages_code_key" ON "i18n_languages"("code");

-- CreateIndex
CREATE INDEX "i18n_languages_code_idx" ON "i18n_languages"("code");

-- CreateIndex
CREATE INDEX "i18n_translations_language_code_idx" ON "i18n_translations"("language_code");

-- CreateIndex
CREATE INDEX "i18n_translations_translation_key_idx" ON "i18n_translations"("translation_key");

-- CreateIndex
CREATE UNIQUE INDEX "i18n_translations_language_code_translation_key_key" ON "i18n_translations"("language_code", "translation_key");

-- CreateIndex
CREATE INDEX "po_suppliers_tenant_id_idx" ON "po_suppliers"("tenant_id");

-- CreateIndex
CREATE INDEX "po_suppliers_tenant_id_code_idx" ON "po_suppliers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "po_suppliers_tenant_id_name_idx" ON "po_suppliers"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "po_suppliers_tenant_id_code_key" ON "po_suppliers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "po_purchase_orders_tenant_id_idx" ON "po_purchase_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "po_purchase_orders_tenant_id_po_number_idx" ON "po_purchase_orders"("tenant_id", "po_number");

-- CreateIndex
CREATE INDEX "po_purchase_orders_tenant_id_supplier_id_idx" ON "po_purchase_orders"("tenant_id", "supplier_id");

-- CreateIndex
CREATE INDEX "po_purchase_orders_tenant_id_status_idx" ON "po_purchase_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "po_purchase_orders_po_date_idx" ON "po_purchase_orders"("po_date");

-- CreateIndex
CREATE UNIQUE INDEX "po_purchase_orders_tenant_id_po_number_key" ON "po_purchase_orders"("tenant_id", "po_number");

-- CreateIndex
CREATE INDEX "po_purchase_order_lines_tenant_id_idx" ON "po_purchase_order_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "po_purchase_order_lines_purchase_order_id_idx" ON "po_purchase_order_lines"("purchase_order_id");

-- CreateIndex
CREATE INDEX "po_purchase_order_lines_item_id_idx" ON "po_purchase_order_lines"("item_id");

-- CreateIndex
CREATE INDEX "in_items_tenant_id_idx" ON "in_items"("tenant_id");

-- CreateIndex
CREATE INDEX "in_items_tenant_id_code_idx" ON "in_items"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "in_items_tenant_id_name_idx" ON "in_items"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "in_items_tenant_id_item_type_idx" ON "in_items"("tenant_id", "item_type");

-- CreateIndex
CREATE UNIQUE INDEX "in_items_tenant_id_code_key" ON "in_items"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "in_warehouses_tenant_id_idx" ON "in_warehouses"("tenant_id");

-- CreateIndex
CREATE INDEX "in_warehouses_tenant_id_code_idx" ON "in_warehouses"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "in_warehouses_tenant_id_code_key" ON "in_warehouses"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "in_stock_tenant_id_idx" ON "in_stock"("tenant_id");

-- CreateIndex
CREATE INDEX "in_stock_tenant_id_item_id_idx" ON "in_stock"("tenant_id", "item_id");

-- CreateIndex
CREATE INDEX "in_stock_tenant_id_warehouse_id_idx" ON "in_stock"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "in_stock_tenant_id_item_id_warehouse_id_lot_number_serial_n_key" ON "in_stock"("tenant_id", "item_id", "warehouse_id", "lot_number", "serial_number");

-- CreateIndex
CREATE INDEX "in_stock_movements_tenant_id_idx" ON "in_stock_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "in_stock_movements_tenant_id_movement_number_idx" ON "in_stock_movements"("tenant_id", "movement_number");

-- CreateIndex
CREATE INDEX "in_stock_movements_tenant_id_item_id_idx" ON "in_stock_movements"("tenant_id", "item_id");

-- CreateIndex
CREATE INDEX "in_stock_movements_movement_date_idx" ON "in_stock_movements"("movement_date");

-- CreateIndex
CREATE INDEX "in_stock_movements_movement_type_idx" ON "in_stock_movements"("movement_type");

-- CreateIndex
CREATE UNIQUE INDEX "in_stock_movements_tenant_id_movement_number_key" ON "in_stock_movements"("tenant_id", "movement_number");

-- CreateIndex
CREATE INDEX "mfg_boms_tenant_id_idx" ON "mfg_boms"("tenant_id");

-- CreateIndex
CREATE INDEX "mfg_boms_tenant_id_parent_item_id_idx" ON "mfg_boms"("tenant_id", "parent_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "mfg_boms_tenant_id_bom_number_version_key" ON "mfg_boms"("tenant_id", "bom_number", "version");

-- CreateIndex
CREATE INDEX "mfg_bom_components_tenant_id_idx" ON "mfg_bom_components"("tenant_id");

-- CreateIndex
CREATE INDEX "mfg_bom_components_bom_id_idx" ON "mfg_bom_components"("bom_id");

-- CreateIndex
CREATE INDEX "mfg_bom_components_component_item_id_idx" ON "mfg_bom_components"("component_item_id");

-- CreateIndex
CREATE INDEX "mfg_work_centers_tenant_id_idx" ON "mfg_work_centers"("tenant_id");

-- CreateIndex
CREATE INDEX "mfg_work_centers_tenant_id_code_idx" ON "mfg_work_centers"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "mfg_work_centers_tenant_id_code_key" ON "mfg_work_centers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "mfg_production_orders_tenant_id_idx" ON "mfg_production_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "mfg_production_orders_tenant_id_po_number_idx" ON "mfg_production_orders"("tenant_id", "po_number");

-- CreateIndex
CREATE INDEX "mfg_production_orders_tenant_id_item_id_idx" ON "mfg_production_orders"("tenant_id", "item_id");

-- CreateIndex
CREATE INDEX "mfg_production_orders_status_idx" ON "mfg_production_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mfg_production_orders_tenant_id_po_number_key" ON "mfg_production_orders"("tenant_id", "po_number");

-- CreateIndex
CREATE INDEX "so_customers_tenant_id_idx" ON "so_customers"("tenant_id");

-- CreateIndex
CREATE INDEX "so_customers_tenant_id_code_idx" ON "so_customers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "so_customers_tenant_id_name_idx" ON "so_customers"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "so_customers_tenant_id_code_key" ON "so_customers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "so_sales_orders_tenant_id_idx" ON "so_sales_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "so_sales_orders_tenant_id_so_number_idx" ON "so_sales_orders"("tenant_id", "so_number");

-- CreateIndex
CREATE INDEX "so_sales_orders_tenant_id_customer_id_idx" ON "so_sales_orders"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "so_sales_orders_status_idx" ON "so_sales_orders"("status");

-- CreateIndex
CREATE INDEX "so_sales_orders_order_date_idx" ON "so_sales_orders"("order_date");

-- CreateIndex
CREATE UNIQUE INDEX "so_sales_orders_tenant_id_so_number_key" ON "so_sales_orders"("tenant_id", "so_number");

-- CreateIndex
CREATE INDEX "so_sales_order_lines_tenant_id_idx" ON "so_sales_order_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "so_sales_order_lines_sales_order_id_idx" ON "so_sales_order_lines"("sales_order_id");

-- CreateIndex
CREATE INDEX "so_sales_order_lines_item_id_idx" ON "so_sales_order_lines"("item_id");

-- CreateIndex
CREATE INDEX "ac_accounts_tenant_id_idx" ON "ac_accounts"("tenant_id");

-- CreateIndex
CREATE INDEX "ac_accounts_tenant_id_account_number_idx" ON "ac_accounts"("tenant_id", "account_number");

-- CreateIndex
CREATE INDEX "ac_accounts_account_type_idx" ON "ac_accounts"("account_type");

-- CreateIndex
CREATE UNIQUE INDEX "ac_accounts_tenant_id_account_number_key" ON "ac_accounts"("tenant_id", "account_number");

-- CreateIndex
CREATE INDEX "ac_journal_entries_tenant_id_idx" ON "ac_journal_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "ac_journal_entries_tenant_id_entry_number_idx" ON "ac_journal_entries"("tenant_id", "entry_number");

-- CreateIndex
CREATE INDEX "ac_journal_entries_entry_date_idx" ON "ac_journal_entries"("entry_date");

-- CreateIndex
CREATE INDEX "ac_journal_entries_status_idx" ON "ac_journal_entries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ac_journal_entries_tenant_id_entry_number_key" ON "ac_journal_entries"("tenant_id", "entry_number");

-- CreateIndex
CREATE INDEX "ac_journal_entry_lines_tenant_id_idx" ON "ac_journal_entry_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "ac_journal_entry_lines_journal_entry_id_idx" ON "ac_journal_entry_lines"("journal_entry_id");

-- CreateIndex
CREATE INDEX "ac_journal_entry_lines_account_id_idx" ON "ac_journal_entry_lines"("account_id");

-- AddForeignKey
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "saas_subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "saas_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_usage_records" ADD CONSTRAINT "saas_usage_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_user_tenants" ADD CONSTRAINT "auth_user_tenants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_user_tenants" ADD CONSTRAINT "auth_user_tenants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_roles" ADD CONSTRAINT "auth_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_role_permissions" ADD CONSTRAINT "auth_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_role_permissions" ADD CONSTRAINT "auth_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "auth_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_user_roles" ADD CONSTRAINT "auth_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_user_roles" ADD CONSTRAINT "auth_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mc_exchange_rates" ADD CONSTRAINT "mc_exchange_rates_from_currency_fkey" FOREIGN KEY ("from_currency") REFERENCES "mc_currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mc_exchange_rates" ADD CONSTRAINT "mc_exchange_rates_to_currency_fkey" FOREIGN KEY ("to_currency") REFERENCES "mc_currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "i18n_translations" ADD CONSTRAINT "i18n_translations_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "i18n_languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_suppliers" ADD CONSTRAINT "po_suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_suppliers" ADD CONSTRAINT "po_suppliers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_suppliers" ADD CONSTRAINT "po_suppliers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_orders" ADD CONSTRAINT "po_purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_orders" ADD CONSTRAINT "po_purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "po_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_orders" ADD CONSTRAINT "po_purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_orders" ADD CONSTRAINT "po_purchase_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_order_lines" ADD CONSTRAINT "po_purchase_order_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_order_lines" ADD CONSTRAINT "po_purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "po_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_purchase_order_lines" ADD CONSTRAINT "po_purchase_order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_items" ADD CONSTRAINT "in_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_items" ADD CONSTRAINT "in_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_items" ADD CONSTRAINT "in_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_warehouses" ADD CONSTRAINT "in_warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock" ADD CONSTRAINT "in_stock_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock" ADD CONSTRAINT "in_stock_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock" ADD CONSTRAINT "in_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "in_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_movements" ADD CONSTRAINT "in_stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_movements" ADD CONSTRAINT "in_stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_stock_movements" ADD CONSTRAINT "in_stock_movements_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "in_warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_boms" ADD CONSTRAINT "mfg_boms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_boms" ADD CONSTRAINT "mfg_boms_parent_item_id_fkey" FOREIGN KEY ("parent_item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_bom_components" ADD CONSTRAINT "mfg_bom_components_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_bom_components" ADD CONSTRAINT "mfg_bom_components_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "mfg_boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_bom_components" ADD CONSTRAINT "mfg_bom_components_component_item_id_fkey" FOREIGN KEY ("component_item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_work_centers" ADD CONSTRAINT "mfg_work_centers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfg_production_orders" ADD CONSTRAINT "mfg_production_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "so_customers" ADD CONSTRAINT "so_customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "so_sales_orders" ADD CONSTRAINT "so_sales_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "so_sales_orders" ADD CONSTRAINT "so_sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "so_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "so_sales_orders" ADD CONSTRAINT "so_sales_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "so_sales_orders" ADD CONSTRAINT "so_sales_orders_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "so_sales_order_lines" ADD CONSTRAINT "so_sales_order_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "so_sales_order_lines" ADD CONSTRAINT "so_sales_order_lines_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "so_sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "so_sales_order_lines" ADD CONSTRAINT "so_sales_order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "in_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_accounts" ADD CONSTRAINT "ac_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_journal_entries" ADD CONSTRAINT "ac_journal_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_journal_entry_lines" ADD CONSTRAINT "ac_journal_entry_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "saas_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_journal_entry_lines" ADD CONSTRAINT "ac_journal_entry_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "ac_journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ac_journal_entry_lines" ADD CONSTRAINT "ac_journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ac_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
