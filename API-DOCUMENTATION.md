# SUNSET ERP - API DOCUMENTATION
Complete API Reference for Production-Ready ERP Platform

## Base URL
```
http://localhost:3000/api
```

## Authentication
All endpoints (except /auth/login and /auth/register) require JWT authentication.

### Headers
```
Authorization: Bearer {token}
Content-Type: application/json
```

---

## 🔐 AUTHENTICATION ENDPOINTS

### POST /api/auth/register
Register a new user

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:** 201 Created
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

### POST /api/auth/login
Login and get JWT token

**Request:**
```json
{
  "email": "admin@demo.com",
  "password": "Admin123!"
}
```

**Response:** 200 OK
```json
{
  "access_token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "admin@demo.com"
  },
  "requiresTenantSelection": false
}
```

### GET /api/auth/profile
Get current user profile

**Response:** 200 OK
```json
{
  "id": "uuid",
  "email": "admin@demo.com",
  "firstName": "Admin",
  "tenantId": "uuid"
}
```

---

## 📦 SUPPLIERS ENDPOINTS

### POST /api/suppliers
Create a new supplier

**Permission:** PROCUREMENT:CREATE

**Request:**
```json
{
  "code": "SUP-001",
  "name": "Acme Corporation",
  "contactPerson": "Jane Smith",
  "email": "jane@acme.com",
  "phone": "+1-555-0100",
  "paymentTerms": "Net 30"
}
```

**Response:** 201 Created

### GET /api/suppliers
List all suppliers

**Permission:** PROCUREMENT:VIEW

**Response:** 200 OK
```json
[
  {
    "id": "uuid",
    "code": "SUP-001",
    "name": "Acme Corporation",
    "email": "jane@acme.com"
  }
]
```

---

## 📦 ITEMS ENDPOINTS

### POST /api/items
Create a new item

**Permission:** INVENTORY:CREATE

**Request:**
```json
{
  "code": "ITEM-001",
  "name": "Steel Bolt M10x50",
  "itemType": "raw_material",
  "baseUom": "PCS",
  "isPurchasable": true,
  "isSaleable": false,
  "isManufacturable": false
}
```

### GET /api/items
List all items

**Permission:** INVENTORY:VIEW

**Query Parameters:**
- `itemType`: Filter by type (raw_material, finished_good, etc.)

**Response:** 200 OK

### GET /api/items/statistics
Get item statistics

**Permission:** INVENTORY:VIEW

**Response:** 200 OK
```json
{
  "totalItems": 10,
  "byType": {
    "raw_material": 5,
    "finished_good": 3,
    "work_in_progress": 2
  }
}
```

---

## 📋 PURCHASE ORDERS ENDPOINTS

### POST /api/purchase-orders
Create a purchase order

**Permission:** PROCUREMENT:CREATE

**Request:**
```json
{
  "supplierId": "uuid",
  "orderDate": "2026-03-15",
  "expectedDate": "2026-03-25",
  "currency": "USD",
  "lines": [
    {
      "itemId": "uuid",
      "quantity": 100,
      "uom": "PCS",
      "unitPrice": 2.50,
      "discountPercent": 10
    }
  ]
}
```

**Response:** 201 Created
```json
{
  "id": "uuid",
  "poNumber": "PO-2026-0001",
  "supplier": { "name": "Acme Corp" },
  "total": 225.00,
  "status": "draft"
}
```

### PATCH /api/purchase-orders/:id/status/:status
Update PO status

**Permission:** PROCUREMENT:APPROVE

**Parameters:**
- `:id` - PO UUID
- `:status` - approved, closed, cancelled

**Response:** 200 OK

---

## 👥 CUSTOMERS ENDPOINTS

### POST /api/customers
Create a customer

**Permission:** SALES:CREATE

**Request:**
```json
{
  "code": "CUST-001",
  "name": "Retail Chain Inc",
  "email": "orders@retailchain.com",
  "creditLimit": 50000,
  "creditStatus": "good",
  "paymentTerms": "Net 45"
}
```

### GET /api/customers
List all customers

**Permission:** SALES:VIEW

---

## 📄 SALES ORDERS ENDPOINTS

### POST /api/sales-orders
Create a sales order

**Permission:** SALES:CREATE

**Request:**
```json
{
  "customerId": "uuid",
  "customerPo": "CUST-PO-123",
  "requestedDate": "2026-04-01",
  "lines": [
    {
      "itemId": "uuid",
      "orderedQuantity": 50,
      "uom": "PCS",
      "unitPrice": 15.99,
      "discountPercent": 5
    }
  ]
}
```

**Response:** 201 Created
```json
{
  "id": "uuid",
  "soNumber": "SO-2026-0001",
  "customer": { "name": "Retail Chain" },
  "total": 759.52,
  "status": "draft"
}
```

### PATCH /api/sales-orders/:id/status/:status
Update SO status

**Permission:** SALES:APPROVE

**Status values:** confirmed, shipped, delivered, closed

---

## 🏭 WAREHOUSES ENDPOINTS

### POST /api/warehouses
Create a warehouse

**Permission:** INVENTORY:CREATE

**Request:**
```json
{
  "code": "WH-MAIN",
  "name": "Main Warehouse",
  "warehouseType": "regular",
  "address": "123 Industrial Blvd",
  "isActive": true
}
```

### GET /api/warehouses/:id
Get warehouse with stock count

**Permission:** INVENTORY:VIEW

**Response:** 200 OK
```json
{
  "id": "uuid",
  "code": "WH-MAIN",
  "name": "Main Warehouse",
  "_count": {
    "stock": 150
  }
}
```

---

## 📦 STOCK TRANSACTIONS ENDPOINTS

### POST /api/stock-transactions
Create stock movement

**Permission:** INVENTORY:CREATE

**Request:**
```json
{
  "transactionType": "receipt",
  "itemId": "uuid",
  "warehouseId": "uuid",
  "quantity": 500,
  "uom": "PCS",
  "lotNumber": "LOT-2026-001",
  "referenceType": "purchase_order",
  "notes": "Initial stock receipt"
}
```

**Transaction Types:**
- `receipt` - Inbound (positive quantity)
- `issue` - Outbound (negative quantity)
- `transfer` - Between warehouses
- `adjustment` - Corrections

**Response:** 201 Created
```json
{
  "id": "uuid",
  "movementNumber": "SM-2026-0001",
  "quantity": 500,
  "item": { "name": "Bolt M10x50" },
  "warehouse": { "name": "Main Warehouse" }
}
```

### GET /api/stock-transactions/balance
Get current stock balance

**Permission:** INVENTORY:VIEW

**Query Parameters:**
- `itemId`: Filter by item
- `warehouseId`: Filter by warehouse

**Response:** 200 OK
```json
[
  {
    "item": { "name": "Bolt M10x50", "baseUom": "PCS" },
    "warehouse": { "name": "Main Warehouse" },
    "onHandQuantity": 450,
    "reservedQuantity": 0
  }
]
```

---

## 🏭 BILL OF MATERIALS (BOM) ENDPOINTS

### POST /api/bom
Create a BOM

**Permission:** INVENTORY:CREATE

**Request:**
```json
{
  "itemId": "uuid",
  "bomCode": "BOM-CHAIR-001",
  "description": "Office Chair Assembly",
  "version": "1",
  "isActive": true,
  "components": [
    {
      "componentItemId": "uuid",
      "quantity": 4,
      "uom": "PCS",
      "scrapPercent": 5,
      "notes": "Main frame bolts"
    }
  ]
}
```

**Response:** 201 Created
```json
{
  "id": "uuid",
  "bomNumber": "BOM-CHAIR-001",
  "parentItem": { "name": "Office Chair" },
  "version": 1,
  "components": [
    {
      "componentItem": { "name": "Bolt M10x50" },
      "quantityPer": 4,
      "scrapPercent": 5
    }
  ]
}
```

### GET /api/bom/:id/calculate/:quantity
Calculate material requirements

**Permission:** INVENTORY:VIEW

**Parameters:**
- `:id` - BOM UUID
- `:quantity` - Production quantity

**Response:** 200 OK
```json
{
  "bom": {
    "bomNumber": "BOM-CHAIR-001",
    "parentItem": { "name": "Office Chair" }
  },
  "productionQuantity": 100,
  "requirements": [
    {
      "componentItem": { "name": "Bolt M10x50" },
      "quantityPerUnit": 4,
      "requiredQuantity": 400,
      "scrapQuantity": 20,
      "totalQuantity": 420,
      "uom": "PCS"
    }
  ]
}
```

---

## ⚙️ WORK CENTERS ENDPOINTS

### POST /api/work-centers
Create a work center

**Permission:** INVENTORY:CREATE

**Request:**
```json
{
  "code": "WC-ASSEMBLY-01",
  "name": "Assembly Line 1",
  "workCenterType": "assembly",
  "capacityPerHour": 50,
  "efficiencyPercent": 95,
  "costPerHour": 75,
  "isActive": true
}
```

**Response:** 201 Created

---

## 🏭 PRODUCTION ORDERS ENDPOINTS

### POST /api/production-orders
Create production order

**Permission:** INVENTORY:CREATE

**Request:**
```json
{
  "bomId": "uuid",
  "quantityOrdered": 200,
  "plannedStartDate": "2026-04-01",
  "plannedEndDate": "2026-04-10",
  "priority": "high",
  "notes": "Urgent customer order"
}
```

**Response:** 201 Created
```json
{
  "id": "uuid",
  "poNumber": "MO-2026-0001",
  "bom": {
    "bomNumber": "BOM-CHAIR-001",
    "components": [...]
  },
  "quantityToProduce": 200,
  "status": "draft",
  "plannedStartDate": "2026-04-01T00:00:00.000Z"
}
```

### PATCH /api/production-orders/:id/status/:status
Update production order status

**Permission:** INVENTORY:EDIT

**Status values:**
- `released` - Ready for production
- `in_progress` - Currently manufacturing
- `completed` - Finished
- `cancelled` - Cancelled

**Response:** 200 OK
```json
{
  "message": "Production order MO-2026-0001 status updated to in_progress",
  "productionOrder": {
    "status": "in_progress",
    "actualStartDate": "2026-03-15T00:00:00.000Z"
  }
}
```

---

## 📊 PERMISSION CODES

All endpoints require specific permissions. These are enforced via RBAC:

### Procurement
- `PROCUREMENT:VIEW`
- `PROCUREMENT:CREATE`
- `PROCUREMENT:EDIT`
- `PROCUREMENT:DELETE`
- `PROCUREMENT:APPROVE`

### Inventory
- `INVENTORY:VIEW`
- `INVENTORY:CREATE`
- `INVENTORY:EDIT`
- `INVENTORY:DELETE`
- `INVENTORY:ADJUST`

### Sales
- `SALES:VIEW`
- `SALES:CREATE`
- `SALES:EDIT`
- `SALES:DELETE`
- `SALES:APPROVE`

### Accounting
- `ACCOUNTING:VIEW`
- `ACCOUNTING:CREATE`
- `ACCOUNTING:EDIT`
- `ACCOUNTING:DELETE`
- `ACCOUNTING:POST`

### Admin
- `ADMIN:USERS`
- `ADMIN:ROLES`
- `ADMIN:SETTINGS`

---

## 🔢 HTTP STATUS CODES

- `200 OK` - Successful GET, PATCH
- `201 Created` - Successful POST
- `400 Bad Request` - Validation error, business rule violation
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Missing required permission
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Duplicate code/number
- `500 Internal Server Error` - Server error

---

## 📝 COMMON PATTERNS

### Auto-Generated Numbers
All transactional documents auto-generate sequential numbers:
- Purchase Orders: `PO-YYYY-####`
- Sales Orders: `SO-YYYY-####`
- Stock Movements: `SM-YYYY-####`
- BOMs: `BOM-YYYY-####`
- Production Orders: `MO-YYYY-####`

### Soft Delete
All business entities use soft delete. Deleted records have `deletedAt` timestamp and `deletedBy` user ID.

### Audit Trail
All records include:
- `createdAt` / `createdBy`
- `updatedAt` / `updatedBy`
- `deletedAt` / `deletedBy` (when applicable)

### Tenant Isolation
All queries automatically filter by `tenantId` from JWT token. Cross-tenant access is impossible.

---

## 🧪 TESTING

### Demo Credentials
```
Email: admin@demo.com
Password: Admin123!
Tenant: DEMO
```

### Swagger UI
Interactive API documentation available at:
```
http://localhost:3000/api/docs
```

---

## 🚀 COMPLETE WORKFLOWS

### Procurement to Stock
1. POST /api/suppliers - Create supplier
2. POST /api/items - Create item
3. POST /api/purchase-orders - Create PO
4. PATCH /api/purchase-orders/:id/status/approved - Approve
5. POST /api/stock-transactions - Receive stock

### Sales to Delivery
1. POST /api/customers - Create customer
2. POST /api/sales-orders - Create SO
3. PATCH /api/sales-orders/:id/status/confirmed - Confirm
4. POST /api/stock-transactions - Issue stock

### Manufacturing
1. POST /api/items - Create finished good
2. POST /api/bom - Create BOM with components
3. GET /api/bom/:id/calculate/100 - Check materials needed
4. POST /api/production-orders - Create production order
5. PATCH /api/production-orders/:id/status/released - Release
6. PATCH /api/production-orders/:id/status/in_progress - Start
7. POST /api/stock-transactions - Issue materials
8. PATCH /api/production-orders/:id/status/completed - Complete
9. POST /api/stock-transactions - Receive finished goods

---

**Last Updated**: March 15, 2026  
**Version**: 1.0.0  
**Status**: Production Ready ✅

