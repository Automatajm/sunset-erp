-- CreateEnum
CREATE TYPE "StatusType" AS ENUM ('INITIAL', 'INTERMEDIATE', 'FINAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL', 'URGENT');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ALERT', 'APPROVAL', 'TASK', 'REMINDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'IN_APP', 'SLACK', 'TEAMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('MAIN', 'BRANCH', 'VIRTUAL', 'CONSIGNMENT', 'QUARANTINE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'SCRAP', 'RETURN_TO_SUPPLIER', 'RETURN_FROM_CUSTOMER', 'COUNT_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RequisitionType" AS ENUM ('MANUAL', 'AUTOMATIC', 'SALES', 'PRODUCTION', 'TRANSFER', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "IssuePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('REGULAR', 'EMERGENCY', 'REBALANCE', 'RETURN');

-- CreateEnum
CREATE TYPE "ScrapType" AS ENUM ('EXPIRED', 'DAMAGED', 'OBSOLETE', 'QUALITY_REJECT', 'THEFT', 'LOST', 'REGULATORY', 'HAZARDOUS_DISPOSAL');

-- CreateEnum
CREATE TYPE "DisposalMethod" AS ENUM ('LANDFILL', 'INCINERATION', 'RECYCLING', 'HAZMAT_DISPOSAL', 'RETURN_TO_VENDOR', 'DONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierReturnType" AS ENUM ('DEFECTIVE', 'WRONG_ITEM', 'EXCESS_QUANTITY', 'EXPIRED', 'QUALITY_ISSUE', 'COMMERCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnResolution" AS ENUM ('CREDIT_NOTE', 'REPLACEMENT', 'REFUND', 'REPAIR', 'NO_CHARGE');

-- CreateTable
CREATE TABLE "mdm_status_groups" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "module" VARCHAR(50) NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "allowCustomStatuses" BOOLEAN NOT NULL DEFAULT false,
    "requireWorkflow" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemGroup" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mdm_status_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdm_statuses" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "statusGroupId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "statusType" "StatusType" NOT NULL DEFAULT 'INTERMEDIATE',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(20),
    "icon" VARCHAR(50),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "isDeletable" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "requiredPermission" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemStatus" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mdm_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdm_status_transitions" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "statusGroupId" UUID NOT NULL,
    "fromStatusId" UUID,
    "toStatusId" UUID NOT NULL,
    "transitionName" VARCHAR(100) NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "requiresReason" BOOLEAN NOT NULL DEFAULT false,
    "requiredPermission" VARCHAR(100),
    "allowedRoles" TEXT[],
    "validationRules" JSONB,
    "autoActions" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mdm_status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdm_status_history" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" UUID NOT NULL,
    "fromStatusId" UUID,
    "toStatusId" UUID NOT NULL,
    "transitionId" UUID,
    "changedBy" UUID NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "comments" TEXT,
    "documentSnapshot" JSONB,

    CONSTRAINT "mdm_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mdm_alert_types" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50) NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "icon" VARCHAR(50),
    "color" VARCHAR(20),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystemAlert" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mdm_alert_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_alert_rules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "alertTypeId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "scope" VARCHAR(50) NOT NULL,
    "warehouseId" UUID,
    "categoryId" UUID,
    "itemId" UUID,
    "conditions" JSONB NOT NULL,
    "autoActions" JSONB,
    "notificationChannels" "NotificationChannel"[],
    "notifyRoles" TEXT[],
    "notifyUsers" TEXT[],
    "repeatAlert" BOOLEAN NOT NULL DEFAULT false,
    "repeatInterval" INTEGER,
    "maxRepetitions" INTEGER,
    "escalateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "escalateAfterHours" INTEGER,
    "escalateToRoles" TEXT[],
    "escalateToUsers" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_alerts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "alertRuleId" UUID,
    "alertTypeId" UUID NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" UUID NOT NULL,
    "itemId" UUID,
    "warehouseId" UUID,
    "locationId" UUID,
    "lotNumber" VARCHAR(100),
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'NEW',
    "title" VARCHAR(500) NOT NULL,
    "message" TEXT NOT NULL,
    "alertData" JSONB NOT NULL,
    "actionsTaken" JSONB,
    "acknowledgedBy" UUID,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "escalatedAt" TIMESTAMP(3),
    "escalatedTo" TEXT[],
    "isRepeat" BOOLEAN NOT NULL DEFAULT false,
    "originalAlertId" UUID,
    "repeatCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_notifications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "alertId" UUID,
    "userId" UUID NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "actionUrl" VARCHAR(500),
    "actionLabel" VARCHAR(100),
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_warehouses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "warehouseType" "WarehouseType" NOT NULL DEFAULT 'MAIN',
    "address" TEXT,
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "country" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "phone" VARCHAR(50),
    "email" VARCHAR(100),
    "managerId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,

    CONSTRAINT "inv_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_warehouse_locations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "aisle" VARCHAR(20),
    "rack" VARCHAR(20),
    "shelf" VARCHAR(20),
    "bin" VARCHAR(20),
    "locationPath" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_warehouse_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_stock_levels" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "locationId" UUID,
    "lotNumber" VARCHAR(100),
    "serialNumber" VARCHAR(100),
    "expiryDate" TIMESTAMP(3),
    "quantityOnHand" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityAvailable" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityReserved" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityInTransit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lastStockCount" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_stock_transactions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "transactionNumber" VARCHAR(50) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "locationId" UUID,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,6) NOT NULL,
    "lotNumber" VARCHAR(100),
    "serialNumber" VARCHAR(100),
    "sourceModule" VARCHAR(50),
    "sourceDocumentType" VARCHAR(50),
    "sourceDocumentId" UUID,
    "sourceDocumentNumber" VARCHAR(100),
    "sourceLineId" UUID,
    "reason" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inv_stock_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_receipts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "receiptNumber" VARCHAR(50) NOT NULL,
    "purchaseOrderId" UUID,
    "purchaseOrderNumber" VARCHAR(50),
    "supplierId" UUID,
    "warehouseId" UUID NOT NULL,
    "statusId" UUID NOT NULL,
    "statusCode" VARCHAR(50) NOT NULL,
    "expectedDeliveryDate" TIMESTAMP(3),
    "actualDeliveryDate" TIMESTAMP(3),
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryPerformance" DECIMAL(5,2),
    "quantityAccuracy" DECIMAL(5,2),
    "qualityScore" DECIMAL(5,2),
    "totalQuantityOrdered" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalQuantityReceived" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalQuantityRejected" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "receivedBy" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inv_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_receipt_lines" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "itemId" UUID NOT NULL,
    "quantityOrdered" DECIMAL(18,6) NOT NULL,
    "quantityReceived" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityRejected" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityPending" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitId" UUID NOT NULL,
    "conversionFactor" DECIMAL(18,6) NOT NULL,
    "unitPriceOrdered" DECIMAL(18,6) NOT NULL,
    "unitPriceActual" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "qualityStatus" VARCHAR(50),
    "rejectionReason" TEXT,
    "locationId" UUID,
    "lotNumber" VARCHAR(100),
    "serialNumber" VARCHAR(100),
    "expiryDate" TIMESTAMP(3),
    "statusCode" VARCHAR(50) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "receivedBy" UUID,

    CONSTRAINT "inv_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_requisitions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "requisitionNumber" VARCHAR(50) NOT NULL,
    "requisitionType" "RequisitionType" NOT NULL,
    "sourceModule" VARCHAR(50),
    "sourceDocumentType" VARCHAR(50),
    "sourceDocumentId" UUID,
    "requestedBy" UUID NOT NULL,
    "requestedFor" VARCHAR(200),
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requiredDate" TIMESTAMP(3) NOT NULL,
    "priority" "IssuePriority" NOT NULL DEFAULT 'NORMAL',
    "warehouseId" UUID,
    "deliverToLocation" TEXT,
    "statusId" UUID NOT NULL,
    "statusCode" VARCHAR(50) NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "projectedIssueDate" TIMESTAMP(3),
    "actualIssueDate" TIMESTAMP(3),
    "isProjected" BOOLEAN NOT NULL DEFAULT false,
    "purpose" TEXT,
    "notes" TEXT,
    "totalQuantityRequested" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalQuantityIssued" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_requisition_lines" (
    "id" UUID NOT NULL,
    "requisitionId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "itemId" UUID NOT NULL,
    "quantityRequested" DECIMAL(18,6) NOT NULL,
    "quantityApproved" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityIssued" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityPending" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityCancelled" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitId" UUID NOT NULL,
    "conversionFactor" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "locationId" UUID,
    "lotNumber" VARCHAR(100),
    "serialNumber" VARCHAR(100),
    "statusCode" VARCHAR(50) NOT NULL,
    "cancellationReason" TEXT,
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedBy" UUID,

    CONSTRAINT "inv_requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_issues" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "issueNumber" VARCHAR(50) NOT NULL,
    "requisitionId" UUID,
    "requisitionNumber" VARCHAR(50),
    "sourceModule" VARCHAR(50),
    "sourceDocumentType" VARCHAR(50),
    "sourceDocumentId" UUID,
    "warehouseId" UUID NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" UUID NOT NULL,
    "issuedTo" UUID,
    "statusId" UUID NOT NULL,
    "statusCode" VARCHAR(50) NOT NULL,
    "issueType" VARCHAR(50) NOT NULL,
    "purpose" TEXT,
    "notes" TEXT,
    "totalQuantityIssued" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_issue_lines" (
    "id" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "requisitionLineId" UUID,
    "lineNumber" INTEGER NOT NULL,
    "itemId" UUID NOT NULL,
    "quantityRequested" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityIssued" DECIMAL(18,6) NOT NULL,
    "quantityVariance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitId" UUID NOT NULL,
    "conversionFactor" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "locationId" UUID,
    "lotNumber" VARCHAR(100),
    "serialNumber" VARCHAR(100),
    "varianceReason" TEXT,
    "statusCode" VARCHAR(50) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "issuedBy" UUID,

    CONSTRAINT "inv_issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_transfers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "transferNumber" VARCHAR(50) NOT NULL,
    "fromWarehouseId" UUID NOT NULL,
    "toWarehouseId" UUID NOT NULL,
    "transferType" "TransferType" NOT NULL DEFAULT 'REGULAR',
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedDate" TIMESTAMP(3),
    "shippedDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "expectedArrivalDate" TIMESTAMP(3),
    "requestedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "shippedBy" UUID,
    "receivedBy" UUID,
    "statusId" UUID NOT NULL,
    "statusCode" VARCHAR(50) NOT NULL,
    "priority" "IssuePriority" NOT NULL DEFAULT 'NORMAL',
    "reason" TEXT,
    "notes" TEXT,
    "shippingCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "insuranceCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "carrierName" VARCHAR(200),
    "trackingNumber" VARCHAR(100),
    "totalQuantityShipped" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalQuantityReceived" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalQuantityDamaged" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_transfer_lines" (
    "id" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "itemId" UUID NOT NULL,
    "quantityRequested" DECIMAL(18,6) NOT NULL,
    "quantityShipped" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityReceived" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityDamaged" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quantityRejected" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitId" UUID NOT NULL,
    "conversionFactor" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "fromLocationId" UUID,
    "toLocationId" UUID,
    "lotNumber" VARCHAR(100),
    "serialNumber" VARCHAR(100),
    "expiryDate" TIMESTAMP(3),
    "statusCode" VARCHAR(50) NOT NULL,
    "damageReason" TEXT,
    "rejectionReason" TEXT,
    "shippedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "inv_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_scraps" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "scrapNumber" VARCHAR(50) NOT NULL,
    "warehouseId" UUID NOT NULL,
    "scrapType" "ScrapType" NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "statusId" UUID NOT NULL,
    "statusCode" VARCHAR(50) NOT NULL,
    "scrapDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disposalDate" TIMESTAMP(3),
    "requestedBy" UUID NOT NULL,
    "processedBy" UUID,
    "disposalMethod" "DisposalMethod",
    "disposalLocation" VARCHAR(200),
    "disposalCompany" VARCHAR(200),
    "disposalCertificate" VARCHAR(100),
    "disposalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "accountingImpact" VARCHAR(50),
    "accountingEntryId" UUID,
    "totalQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "witnessedBy" UUID,
    "witnessedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_scraps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_scrap_lines" (
    "id" UUID NOT NULL,
    "scrapId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitId" UUID NOT NULL,
    "conversionFactor" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "locationId" UUID,
    "lotNumber" VARCHAR(100),
    "serialNumber" VARCHAR(100),
    "expiryDate" TIMESTAMP(3),
    "reason" TEXT,
    "isHazardous" BOOLEAN NOT NULL DEFAULT false,
    "hazardClass" VARCHAR(100),
    "disposalInstructions" TEXT,
    "photoUrls" TEXT[],
    "statusCode" VARCHAR(50) NOT NULL,
    "disposedAt" TIMESTAMP(3),
    "disposedBy" UUID,

    CONSTRAINT "inv_scrap_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_supplier_returns" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "returnNumber" VARCHAR(50) NOT NULL,
    "supplierId" UUID,
    "supplierName" VARCHAR(200),
    "supplierContact" VARCHAR(100),
    "sourceType" VARCHAR(50) NOT NULL,
    "receiptId" UUID,
    "receiptNumber" VARCHAR(50),
    "purchaseOrderId" UUID,
    "purchaseOrderNumber" VARCHAR(50),
    "warehouseId" UUID NOT NULL,
    "returnType" "SupplierReturnType" NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "returnRequestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedDate" TIMESTAMP(3),
    "supplierApprovedDate" TIMESTAMP(3),
    "shippedDate" TIMESTAMP(3),
    "supplierReceivedDate" TIMESTAMP(3),
    "rmaNumber" VARCHAR(100),
    "rmaExpiryDate" TIMESTAMP(3),
    "statusId" UUID NOT NULL,
    "statusCode" VARCHAR(50) NOT NULL,
    "expectedResolution" "ReturnResolution",
    "actualResolution" "ReturnResolution",
    "carrierName" VARCHAR(200),
    "trackingNumber" VARCHAR(100),
    "shippingCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "insuranceCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditNoteNumber" VARCHAR(100),
    "creditNoteAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "restockingFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "returnCostBornBy" VARCHAR(50),
    "approvedBy" UUID,
    "supplierApprovedBy" VARCHAR(200),
    "totalQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalLines" INTEGER NOT NULL DEFAULT 0,
    "impactsSupplierRating" BOOLEAN NOT NULL DEFAULT true,
    "accountingEntryId" UUID,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inv_supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inv_supplier_return_lines" (
    "id" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "receiptLineId" UUID,
    "lineNumber" INTEGER NOT NULL,
    "itemId" UUID NOT NULL,
    "itemCode" VARCHAR(100) NOT NULL,
    "itemName" VARCHAR(200) NOT NULL,
    "quantityReturned" DECIMAL(18,6) NOT NULL,
    "unitId" UUID NOT NULL,
    "conversionFactor" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "locationId" UUID,
    "lotNumber" VARCHAR(100),
    "serialNumber" VARCHAR(100),
    "expiryDate" TIMESTAMP(3),
    "returnReason" TEXT NOT NULL,
    "defectDescription" TEXT,
    "supplierQcStatus" VARCHAR(50),
    "supplierQcNotes" TEXT,
    "photoUrls" TEXT[],
    "expectedResolution" "ReturnResolution",
    "actualResolution" "ReturnResolution",
    "replacementReceiptId" UUID,
    "replacementReceived" BOOLEAN NOT NULL DEFAULT false,
    "replacementReceivedDate" TIMESTAMP(3),
    "statusCode" VARCHAR(50) NOT NULL,
    "shippedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "inv_supplier_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mdm_status_groups_code_key" ON "mdm_status_groups"("code");

-- CreateIndex
CREATE INDEX "mdm_status_groups_tenantId_idx" ON "mdm_status_groups"("tenantId");

-- CreateIndex
CREATE INDEX "mdm_status_groups_module_entityType_idx" ON "mdm_status_groups"("module", "entityType");

-- CreateIndex
CREATE INDEX "mdm_statuses_tenantId_idx" ON "mdm_statuses"("tenantId");

-- CreateIndex
CREATE INDEX "mdm_statuses_statusGroupId_idx" ON "mdm_statuses"("statusGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "mdm_statuses_statusGroupId_code_key" ON "mdm_statuses"("statusGroupId", "code");

-- CreateIndex
CREATE INDEX "mdm_status_transitions_statusGroupId_idx" ON "mdm_status_transitions"("statusGroupId");

-- CreateIndex
CREATE INDEX "mdm_status_transitions_fromStatusId_idx" ON "mdm_status_transitions"("fromStatusId");

-- CreateIndex
CREATE INDEX "mdm_status_transitions_toStatusId_idx" ON "mdm_status_transitions"("toStatusId");

-- CreateIndex
CREATE INDEX "mdm_status_history_tenantId_idx" ON "mdm_status_history"("tenantId");

-- CreateIndex
CREATE INDEX "mdm_status_history_entityType_entityId_idx" ON "mdm_status_history"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "mdm_status_history_changedAt_idx" ON "mdm_status_history"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mdm_alert_types_code_key" ON "mdm_alert_types"("code");

-- CreateIndex
CREATE INDEX "inv_alert_rules_tenantId_idx" ON "inv_alert_rules"("tenantId");

-- CreateIndex
CREATE INDEX "inv_alert_rules_alertTypeId_idx" ON "inv_alert_rules"("alertTypeId");

-- CreateIndex
CREATE INDEX "inv_alerts_tenantId_idx" ON "inv_alerts"("tenantId");

-- CreateIndex
CREATE INDEX "inv_alerts_status_idx" ON "inv_alerts"("status");

-- CreateIndex
CREATE INDEX "inv_alerts_severity_idx" ON "inv_alerts"("severity");

-- CreateIndex
CREATE INDEX "inv_alerts_itemId_idx" ON "inv_alerts"("itemId");

-- CreateIndex
CREATE INDEX "inv_alerts_createdAt_idx" ON "inv_alerts"("createdAt");

-- CreateIndex
CREATE INDEX "sys_notifications_tenantId_idx" ON "sys_notifications"("tenantId");

-- CreateIndex
CREATE INDEX "sys_notifications_userId_idx" ON "sys_notifications"("userId");

-- CreateIndex
CREATE INDEX "sys_notifications_status_idx" ON "sys_notifications"("status");

-- CreateIndex
CREATE INDEX "sys_notifications_createdAt_idx" ON "sys_notifications"("createdAt");

-- CreateIndex
CREATE INDEX "inv_warehouses_tenantId_idx" ON "inv_warehouses"("tenantId");

-- CreateIndex
CREATE INDEX "inv_warehouses_isActive_idx" ON "inv_warehouses"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "inv_warehouses_tenantId_code_key" ON "inv_warehouses"("tenantId", "code");

-- CreateIndex
CREATE INDEX "inv_warehouse_locations_tenantId_idx" ON "inv_warehouse_locations"("tenantId");

-- CreateIndex
CREATE INDEX "inv_warehouse_locations_warehouseId_idx" ON "inv_warehouse_locations"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "inv_warehouse_locations_warehouseId_code_key" ON "inv_warehouse_locations"("warehouseId", "code");

-- CreateIndex
CREATE INDEX "inv_stock_levels_tenantId_idx" ON "inv_stock_levels"("tenantId");

-- CreateIndex
CREATE INDEX "inv_stock_levels_itemId_idx" ON "inv_stock_levels"("itemId");

-- CreateIndex
CREATE INDEX "inv_stock_levels_warehouseId_idx" ON "inv_stock_levels"("warehouseId");

-- CreateIndex
CREATE INDEX "inv_stock_levels_expiryDate_idx" ON "inv_stock_levels"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "inv_stock_levels_tenantId_itemId_warehouseId_locationId_lot_key" ON "inv_stock_levels"("tenantId", "itemId", "warehouseId", "locationId", "lotNumber", "serialNumber");

-- CreateIndex
CREATE INDEX "inv_stock_transactions_tenantId_idx" ON "inv_stock_transactions"("tenantId");

-- CreateIndex
CREATE INDEX "inv_stock_transactions_itemId_idx" ON "inv_stock_transactions"("itemId");

-- CreateIndex
CREATE INDEX "inv_stock_transactions_warehouseId_idx" ON "inv_stock_transactions"("warehouseId");

-- CreateIndex
CREATE INDEX "inv_stock_transactions_transactionDate_idx" ON "inv_stock_transactions"("transactionDate");

-- CreateIndex
CREATE INDEX "inv_stock_transactions_sourceDocumentType_sourceDocumentId_idx" ON "inv_stock_transactions"("sourceDocumentType", "sourceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "inv_receipts_receiptNumber_key" ON "inv_receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "inv_receipts_tenantId_idx" ON "inv_receipts"("tenantId");

-- CreateIndex
CREATE INDEX "inv_receipts_warehouseId_idx" ON "inv_receipts"("warehouseId");

-- CreateIndex
CREATE INDEX "inv_receipts_statusCode_idx" ON "inv_receipts"("statusCode");

-- CreateIndex
CREATE INDEX "inv_receipts_receiptDate_idx" ON "inv_receipts"("receiptDate");

-- CreateIndex
CREATE INDEX "inv_receipt_lines_receiptId_idx" ON "inv_receipt_lines"("receiptId");

-- CreateIndex
CREATE INDEX "inv_receipt_lines_itemId_idx" ON "inv_receipt_lines"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "inv_requisitions_requisitionNumber_key" ON "inv_requisitions"("requisitionNumber");

-- CreateIndex
CREATE INDEX "inv_requisitions_tenantId_idx" ON "inv_requisitions"("tenantId");

-- CreateIndex
CREATE INDEX "inv_requisitions_statusCode_idx" ON "inv_requisitions"("statusCode");

-- CreateIndex
CREATE INDEX "inv_requisitions_requestedBy_idx" ON "inv_requisitions"("requestedBy");

-- CreateIndex
CREATE INDEX "inv_requisition_lines_requisitionId_idx" ON "inv_requisition_lines"("requisitionId");

-- CreateIndex
CREATE INDEX "inv_requisition_lines_itemId_idx" ON "inv_requisition_lines"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "inv_issues_issueNumber_key" ON "inv_issues"("issueNumber");

-- CreateIndex
CREATE INDEX "inv_issues_tenantId_idx" ON "inv_issues"("tenantId");

-- CreateIndex
CREATE INDEX "inv_issues_warehouseId_idx" ON "inv_issues"("warehouseId");

-- CreateIndex
CREATE INDEX "inv_issues_statusCode_idx" ON "inv_issues"("statusCode");

-- CreateIndex
CREATE INDEX "inv_issue_lines_issueId_idx" ON "inv_issue_lines"("issueId");

-- CreateIndex
CREATE INDEX "inv_issue_lines_itemId_idx" ON "inv_issue_lines"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "inv_transfers_transferNumber_key" ON "inv_transfers"("transferNumber");

-- CreateIndex
CREATE INDEX "inv_transfers_tenantId_idx" ON "inv_transfers"("tenantId");

-- CreateIndex
CREATE INDEX "inv_transfers_fromWarehouseId_idx" ON "inv_transfers"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "inv_transfers_toWarehouseId_idx" ON "inv_transfers"("toWarehouseId");

-- CreateIndex
CREATE INDEX "inv_transfers_statusCode_idx" ON "inv_transfers"("statusCode");

-- CreateIndex
CREATE INDEX "inv_transfer_lines_transferId_idx" ON "inv_transfer_lines"("transferId");

-- CreateIndex
CREATE INDEX "inv_transfer_lines_itemId_idx" ON "inv_transfer_lines"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "inv_scraps_scrapNumber_key" ON "inv_scraps"("scrapNumber");

-- CreateIndex
CREATE INDEX "inv_scraps_tenantId_idx" ON "inv_scraps"("tenantId");

-- CreateIndex
CREATE INDEX "inv_scraps_warehouseId_idx" ON "inv_scraps"("warehouseId");

-- CreateIndex
CREATE INDEX "inv_scraps_statusCode_idx" ON "inv_scraps"("statusCode");

-- CreateIndex
CREATE INDEX "inv_scrap_lines_scrapId_idx" ON "inv_scrap_lines"("scrapId");

-- CreateIndex
CREATE INDEX "inv_scrap_lines_itemId_idx" ON "inv_scrap_lines"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "inv_supplier_returns_returnNumber_key" ON "inv_supplier_returns"("returnNumber");

-- CreateIndex
CREATE INDEX "inv_supplier_returns_tenantId_idx" ON "inv_supplier_returns"("tenantId");

-- CreateIndex
CREATE INDEX "inv_supplier_returns_warehouseId_idx" ON "inv_supplier_returns"("warehouseId");

-- CreateIndex
CREATE INDEX "inv_supplier_returns_statusCode_idx" ON "inv_supplier_returns"("statusCode");

-- CreateIndex
CREATE INDEX "inv_supplier_returns_supplierId_idx" ON "inv_supplier_returns"("supplierId");

-- CreateIndex
CREATE INDEX "inv_supplier_return_lines_returnId_idx" ON "inv_supplier_return_lines"("returnId");

-- CreateIndex
CREATE INDEX "inv_supplier_return_lines_itemId_idx" ON "inv_supplier_return_lines"("itemId");

-- AddForeignKey
ALTER TABLE "mdm_status_groups" ADD CONSTRAINT "mdm_status_groups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_statuses" ADD CONSTRAINT "mdm_statuses_statusGroupId_fkey" FOREIGN KEY ("statusGroupId") REFERENCES "mdm_status_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_status_transitions" ADD CONSTRAINT "mdm_status_transitions_statusGroupId_fkey" FOREIGN KEY ("statusGroupId") REFERENCES "mdm_status_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_status_transitions" ADD CONSTRAINT "mdm_status_transitions_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "mdm_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_status_transitions" ADD CONSTRAINT "mdm_status_transitions_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "mdm_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_status_history" ADD CONSTRAINT "mdm_status_history_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "mdm_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_status_history" ADD CONSTRAINT "status_history_to_status" FOREIGN KEY ("toStatusId") REFERENCES "mdm_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mdm_status_history" ADD CONSTRAINT "mdm_status_history_transitionId_fkey" FOREIGN KEY ("transitionId") REFERENCES "mdm_status_transitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_alert_rules" ADD CONSTRAINT "inv_alert_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_alert_rules" ADD CONSTRAINT "inv_alert_rules_alertTypeId_fkey" FOREIGN KEY ("alertTypeId") REFERENCES "mdm_alert_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_alerts" ADD CONSTRAINT "inv_alerts_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "inv_alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_alerts" ADD CONSTRAINT "inv_alerts_alertTypeId_fkey" FOREIGN KEY ("alertTypeId") REFERENCES "mdm_alert_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_notifications" ADD CONSTRAINT "sys_notifications_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "inv_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_warehouses" ADD CONSTRAINT "inv_warehouses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "sys_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_warehouse_locations" ADD CONSTRAINT "inv_warehouse_locations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "inv_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_levels" ADD CONSTRAINT "inv_stock_levels_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "mdm_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_levels" ADD CONSTRAINT "inv_stock_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "inv_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_levels" ADD CONSTRAINT "inv_stock_levels_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "inv_warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_stock_transactions" ADD CONSTRAINT "inv_stock_transactions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "mdm_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_receipts" ADD CONSTRAINT "inv_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "inv_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_receipt_lines" ADD CONSTRAINT "inv_receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "inv_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_receipt_lines" ADD CONSTRAINT "inv_receipt_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "mdm_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_requisition_lines" ADD CONSTRAINT "inv_requisition_lines_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "inv_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_requisition_lines" ADD CONSTRAINT "inv_requisition_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "mdm_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_issues" ADD CONSTRAINT "inv_issues_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "inv_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_issue_lines" ADD CONSTRAINT "inv_issue_lines_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "inv_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_issue_lines" ADD CONSTRAINT "inv_issue_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "mdm_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_transfers" ADD CONSTRAINT "inv_transfers_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "inv_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_transfers" ADD CONSTRAINT "inv_transfers_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "inv_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_transfer_lines" ADD CONSTRAINT "inv_transfer_lines_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "inv_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_transfer_lines" ADD CONSTRAINT "inv_transfer_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "mdm_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_scraps" ADD CONSTRAINT "inv_scraps_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "inv_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_scrap_lines" ADD CONSTRAINT "inv_scrap_lines_scrapId_fkey" FOREIGN KEY ("scrapId") REFERENCES "inv_scraps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_scrap_lines" ADD CONSTRAINT "inv_scrap_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "mdm_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_supplier_returns" ADD CONSTRAINT "inv_supplier_returns_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "inv_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_supplier_return_lines" ADD CONSTRAINT "inv_supplier_return_lines_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "inv_supplier_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inv_supplier_return_lines" ADD CONSTRAINT "inv_supplier_return_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "mdm_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
