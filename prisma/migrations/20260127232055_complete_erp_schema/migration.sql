-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER', 'VIEWER', 'GUEST');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('GLOBAL', 'TENANT', 'DEPARTMENT', 'OWN');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('PRODUCT', 'SERVICE', 'FIXED_ASSET', 'TOOL', 'MATERIAL', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "MeasurementSystem" AS ENUM ('METRIC', 'IMPERIAL', 'BOTH');

-- CreateEnum
CREATE TYPE "UnitPurpose" AS ENUM ('PURCHASE', 'STORAGE', 'CONSUMPTION', 'SALE');

-- CreateEnum
CREATE TYPE "CalendarType" AS ENUM ('ISO_8601', 'GREGORIAN');

-- CreateTable
CREATE TABLE "sys_tenants" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "domain" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxUsers" INTEGER NOT NULL DEFAULT 50,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "baseCurrencyId" UUID,
    "passwordPolicy" JSONB,
    "mfaRequired" BOOLEAN NOT NULL DEFAULT false,
    "sessionTimeout" INTEGER NOT NULL DEFAULT 480,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sys_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_users" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(100),
    "passwordHash" VARCHAR(255) NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "fullName" VARCHAR(200),
    "phone" VARCHAR(20),
    "avatar" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" VARCHAR(255),
    "passwordChangedAt" TIMESTAMP(3),
    "passwordExpiresAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sys_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_roles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "systemRole" "SystemRole",
    "parentRoleId" UUID,
    "level" INTEGER NOT NULL DEFAULT 1,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sys_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_permissions" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "module" VARCHAR(50) NOT NULL,
    "resource" VARCHAR(50) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "scope" "PermissionScope" NOT NULL DEFAULT 'TENANT',
    "isSystemPermission" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sys_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_user_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "scopeType" VARCHAR(50),
    "scopeId" UUID,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "assignedBy" UUID,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_role_permissions" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_user_permissions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "assignedBy" UUID,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "sys_user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshToken" VARCHAR(500) NOT NULL,
    "accessToken" VARCHAR(500),
    "ipAddress" VARCHAR(45) NOT NULL,
    "userAgent" TEXT NOT NULL,
    "deviceInfo" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "sys_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_password_history" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adm_audit_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resourceId" UUID,
    "ipAddress" VARCHAR(45) NOT NULL,
    "userAgent" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "metadata" JSONB,
    "status" "AuditStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adm_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adm_modules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "parentModuleId" UUID,
    "level" INTEGER NOT NULL DEFAULT 1,
    "modulePath" VARCHAR(255) NOT NULL,
    "icon" VARCHAR(50),
    "route" VARCHAR(255),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "adm_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdm_unit_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "system" "MeasurementSystem" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mdm_unit_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdm_units_of_measure" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "symbol" VARCHAR(20) NOT NULL,
    "categoryId" UUID NOT NULL,
    "system" "MeasurementSystem" NOT NULL,
    "isBaseUnit" BOOLEAN NOT NULL DEFAULT false,
    "conversionFactor" DECIMAL(18,8) NOT NULL DEFAULT 1.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mdm_units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdm_unit_conversions" (
    "id" UUID NOT NULL,
    "fromUnitId" UUID NOT NULL,
    "toUnitId" UUID NOT NULL,
    "factor" DECIMAL(18,8) NOT NULL,
    "formula" VARCHAR(500),

    CONSTRAINT "mdm_unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_currencies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "isBaseCurrency" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_exchange_rates" (
    "id" UUID NOT NULL,
    "fromCurrencyId" UUID NOT NULL,
    "toCurrencyId" UUID NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "source" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "fin_exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_calendar_configs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "calendarType" "CalendarType" NOT NULL DEFAULT 'ISO_8601',
    "firstDayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "fiscalYearStartDay" INTEGER NOT NULL DEFAULT 1,
    "useWeeklyPeriods" BOOLEAN NOT NULL DEFAULT true,
    "useMonthlyPeriods" BOOLEAN NOT NULL DEFAULT true,
    "useQuarterlyPeriods" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_calendar_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdm_categories" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "itemType" "ItemType" NOT NULL,
    "parentId" UUID,
    "level" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "mdm_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdm_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "itemType" "ItemType" NOT NULL,
    "categoryId" UUID NOT NULL,
    "isSellable" BOOLEAN NOT NULL DEFAULT false,
    "isPurchasable" BOOLEAN NOT NULL DEFAULT false,
    "isInventoriable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "baseUnitId" UUID NOT NULL,
    "costPrice" DECIMAL(18,4),
    "salePrice" DECIMAL(18,4),
    "taxRate" DECIMAL(5,2),
    "currentStock" DECIMAL(18,4),
    "minStock" DECIMAL(18,4),
    "maxStock" DECIMAL(18,4),
    "reorderPoint" DECIMAL(18,4),
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "sku" VARCHAR(100),
    "barcode" VARCHAR(100),
    "tags" TEXT[],
    "imageUrl" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "mdm_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdm_item_unit_conversions" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "purpose" "UnitPurpose" NOT NULL,
    "unitId" UUID NOT NULL,
    "factor" DECIMAL(18,8) NOT NULL,
    "price" DECIMAL(18,4),
    "code" VARCHAR(100),
    "barcode" VARCHAR(100),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mdm_item_unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sys_tenants_code_key" ON "sys_tenants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_tenants_domain_key" ON "sys_tenants"("domain");

-- CreateIndex
CREATE INDEX "sys_tenants_code_idx" ON "sys_tenants"("code");

-- CreateIndex
CREATE INDEX "sys_tenants_isActive_idx" ON "sys_tenants"("isActive");

-- CreateIndex
CREATE INDEX "sys_tenants_deletedAt_idx" ON "sys_tenants"("deletedAt");

-- CreateIndex
CREATE INDEX "sys_users_tenantId_isActive_idx" ON "sys_users"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "sys_users_tenantId_email_idx" ON "sys_users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "sys_users_email_idx" ON "sys_users"("email");

-- CreateIndex
CREATE INDEX "sys_users_deletedAt_idx" ON "sys_users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sys_users_tenantId_email_key" ON "sys_users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "sys_users_tenantId_username_key" ON "sys_users"("tenantId", "username");

-- CreateIndex
CREATE INDEX "sys_roles_tenantId_isActive_idx" ON "sys_roles"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "sys_roles_parentRoleId_idx" ON "sys_roles"("parentRoleId");

-- CreateIndex
CREATE INDEX "sys_roles_deletedAt_idx" ON "sys_roles"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sys_roles_tenantId_code_key" ON "sys_roles"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_permissions_code_key" ON "sys_permissions"("code");

-- CreateIndex
CREATE INDEX "sys_permissions_module_resource_action_idx" ON "sys_permissions"("module", "resource", "action");

-- CreateIndex
CREATE INDEX "sys_permissions_tenantId_isActive_idx" ON "sys_permissions"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "sys_permissions_deletedAt_idx" ON "sys_permissions"("deletedAt");

-- CreateIndex
CREATE INDEX "sys_user_roles_userId_idx" ON "sys_user_roles"("userId");

-- CreateIndex
CREATE INDEX "sys_user_roles_roleId_idx" ON "sys_user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_roles_userId_roleId_scopeType_scopeId_key" ON "sys_user_roles"("userId", "roleId", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "sys_role_permissions_roleId_idx" ON "sys_role_permissions"("roleId");

-- CreateIndex
CREATE INDEX "sys_role_permissions_permissionId_idx" ON "sys_role_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "sys_role_permissions_roleId_permissionId_key" ON "sys_role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "sys_user_permissions_userId_idx" ON "sys_user_permissions"("userId");

-- CreateIndex
CREATE INDEX "sys_user_permissions_permissionId_idx" ON "sys_user_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_permissions_userId_permissionId_key" ON "sys_user_permissions"("userId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "sys_sessions_refreshToken_key" ON "sys_sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "sys_sessions_userId_isValid_idx" ON "sys_sessions"("userId", "isValid");

-- CreateIndex
CREATE INDEX "sys_sessions_refreshToken_idx" ON "sys_sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "sys_sessions_expiresAt_idx" ON "sys_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "sys_password_history_userId_createdAt_idx" ON "sys_password_history"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "adm_audit_logs_tenantId_createdAt_idx" ON "adm_audit_logs"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "adm_audit_logs_userId_createdAt_idx" ON "adm_audit_logs"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "adm_audit_logs_action_module_idx" ON "adm_audit_logs"("action", "module");

-- CreateIndex
CREATE INDEX "adm_audit_logs_resourceId_idx" ON "adm_audit_logs"("resourceId");

-- CreateIndex
CREATE INDEX "adm_modules_tenantId_isActive_idx" ON "adm_modules"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "adm_modules_parentModuleId_idx" ON "adm_modules"("parentModuleId");

-- CreateIndex
CREATE INDEX "adm_modules_modulePath_idx" ON "adm_modules"("modulePath");

-- CreateIndex
CREATE INDEX "adm_modules_deletedAt_idx" ON "adm_modules"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "adm_modules_tenantId_modulePath_key" ON "adm_modules"("tenantId", "modulePath");

-- CreateIndex
CREATE UNIQUE INDEX "mdm_unit_categories_code_key" ON "mdm_unit_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "mdm_units_of_measure_code_key" ON "mdm_units_of_measure"("code");

-- CreateIndex
CREATE INDEX "mdm_units_of_measure_categoryId_idx" ON "mdm_units_of_measure"("categoryId");

-- CreateIndex
CREATE INDEX "mdm_units_of_measure_system_idx" ON "mdm_units_of_measure"("system");

-- CreateIndex
CREATE INDEX "mdm_unit_conversions_fromUnitId_idx" ON "mdm_unit_conversions"("fromUnitId");

-- CreateIndex
CREATE INDEX "mdm_unit_conversions_toUnitId_idx" ON "mdm_unit_conversions"("toUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "mdm_unit_conversions_fromUnitId_toUnitId_key" ON "mdm_unit_conversions"("fromUnitId", "toUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "fin_currencies_code_key" ON "fin_currencies"("code");

-- CreateIndex
CREATE INDEX "fin_exchange_rates_fromCurrencyId_toCurrencyId_idx" ON "fin_exchange_rates"("fromCurrencyId", "toCurrencyId");

-- CreateIndex
CREATE INDEX "fin_exchange_rates_effectiveDate_idx" ON "fin_exchange_rates"("effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "fin_exchange_rates_fromCurrencyId_toCurrencyId_effectiveDat_key" ON "fin_exchange_rates"("fromCurrencyId", "toCurrencyId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "sys_calendar_configs_tenantId_key" ON "sys_calendar_configs"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "mdm_categories_code_key" ON "mdm_categories"("code");

-- CreateIndex
CREATE INDEX "mdm_categories_tenantId_idx" ON "mdm_categories"("tenantId");

-- CreateIndex
CREATE INDEX "mdm_categories_parentId_idx" ON "mdm_categories"("parentId");

-- CreateIndex
CREATE INDEX "mdm_categories_itemType_idx" ON "mdm_categories"("itemType");

-- CreateIndex
CREATE INDEX "mdm_items_tenantId_itemType_idx" ON "mdm_items"("tenantId", "itemType");

-- CreateIndex
CREATE INDEX "mdm_items_tenantId_categoryId_idx" ON "mdm_items"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "mdm_items_tenantId_isSellable_idx" ON "mdm_items"("tenantId", "isSellable");

-- CreateIndex
CREATE INDEX "mdm_items_tenantId_isPurchasable_idx" ON "mdm_items"("tenantId", "isPurchasable");

-- CreateIndex
CREATE INDEX "mdm_items_deletedAt_idx" ON "mdm_items"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mdm_items_tenantId_code_key" ON "mdm_items"("tenantId", "code");

-- CreateIndex
CREATE INDEX "mdm_item_unit_conversions_itemId_idx" ON "mdm_item_unit_conversions"("itemId");

-- CreateIndex
CREATE INDEX "mdm_item_unit_conversions_purpose_idx" ON "mdm_item_unit_conversions"("purpose");

-- CreateIndex
CREATE UNIQUE INDEX "mdm_item_unit_conversions_itemId_purpose_unitId_key" ON "mdm_item_unit_conversions"("itemId", "purpose", "unitId");

-- AddForeignKey
ALTER TABLE "sys_tenants" ADD CONSTRAINT "sys_tenants_baseCurrencyId_fkey" FOREIGN KEY ("baseCurrencyId") REFERENCES "fin_currencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_users" ADD CONSTRAINT "sys_users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_roles" ADD CONSTRAINT "sys_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_roles" ADD CONSTRAINT "sys_roles_parentRoleId_fkey" FOREIGN KEY ("parentRoleId") REFERENCES "sys_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_permissions" ADD CONSTRAINT "sys_permissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_user_roles" ADD CONSTRAINT "sys_user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "sys_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_user_roles" ADD CONSTRAINT "sys_user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "sys_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_role_permissions" ADD CONSTRAINT "sys_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "sys_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_role_permissions" ADD CONSTRAINT "sys_role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "sys_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_user_permissions" ADD CONSTRAINT "sys_user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "sys_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_user_permissions" ADD CONSTRAINT "sys_user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "sys_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_sessions" ADD CONSTRAINT "sys_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "sys_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_password_history" ADD CONSTRAINT "sys_password_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "sys_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adm_audit_logs" ADD CONSTRAINT "adm_audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adm_audit_logs" ADD CONSTRAINT "adm_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "sys_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adm_modules" ADD CONSTRAINT "adm_modules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adm_modules" ADD CONSTRAINT "adm_modules_parentModuleId_fkey" FOREIGN KEY ("parentModuleId") REFERENCES "adm_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_units_of_measure" ADD CONSTRAINT "mdm_units_of_measure_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "mdm_unit_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_unit_conversions" ADD CONSTRAINT "mdm_unit_conversions_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "mdm_units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_unit_conversions" ADD CONSTRAINT "mdm_unit_conversions_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "mdm_units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_exchange_rates" ADD CONSTRAINT "fin_exchange_rates_fromCurrencyId_fkey" FOREIGN KEY ("fromCurrencyId") REFERENCES "fin_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_exchange_rates" ADD CONSTRAINT "fin_exchange_rates_toCurrencyId_fkey" FOREIGN KEY ("toCurrencyId") REFERENCES "fin_currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_calendar_configs" ADD CONSTRAINT "sys_calendar_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_categories" ADD CONSTRAINT "mdm_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_categories" ADD CONSTRAINT "mdm_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "mdm_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_items" ADD CONSTRAINT "mdm_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_items" ADD CONSTRAINT "mdm_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "mdm_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_items" ADD CONSTRAINT "mdm_items_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "mdm_units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_item_unit_conversions" ADD CONSTRAINT "mdm_item_unit_conversions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "mdm_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_item_unit_conversions" ADD CONSTRAINT "mdm_item_unit_conversions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "mdm_units_of_measure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
