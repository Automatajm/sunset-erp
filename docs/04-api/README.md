# API DOCUMENTATION - SUNSET ERP

**Phase:** 2 - Architecture & Design  
**Section:** 04-api  
**Status:** In Progress  
**Date:** March 15, 2026

---

## OVERVIEW

REST API specification for Sunset ERP. Defines all endpoints, request/response formats, authentication, and error handling.

**API Base URL:**
- Development: `http://localhost:3000/api/v1`
- Staging: `https://staging-api.sunset-erp.com/api/v1`
- Production: `https://api.sunset-erp.com/api/v1`

---

## DOCUMENTS IN THIS SECTION

### 1. [API Design Principles](./api-design-principles.md)
Core principles guiding API design decisions.

### 2. [Authentication & Authorization](./authentication.md)
JWT-based auth, token management, RBAC implementation.

### 3. [API Endpoints Specification](./endpoints.md)
Complete list of all endpoints organized by module.

### 4. [Request/Response Formats](./request-response-formats.md)
Standard formats, pagination, filtering, sorting.

### 5. [Error Handling](./error-handling.md)
Error codes, messages, and handling strategies.

### 6. [Rate Limiting](./rate-limiting.md)
API rate limits and throttling policies.

---

## API SPECIFICATIONS BY MODULE

### Authentication Module
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/logout` - Logout user
- `POST /auth/refresh` - Refresh access token
- `GET /auth/me` - Get current user profile
- `POST /auth/select-tenant` - Select active tenant

### Tenant Management Module
- `POST /tenants` - Create tenant (admin only)
- `GET /tenants` - List all tenants (admin only)
- `GET /tenants/:id` - Get tenant details
- `PATCH /tenants/:id` - Update tenant
- `DELETE /tenants/:id` - Soft delete tenant

### User Management Module
- `POST /users` - Create user
- `GET /users` - List users (paginated)
- `GET /users/:id` - Get user details
- `PATCH /users/:id` - Update user
- `DELETE /users/:id` - Deactivate user
- `POST /users/:id/roles` - Assign roles

### Procurement Module
- `POST /procurement/suppliers` - Create supplier
- `GET /procurement/suppliers` - List suppliers
- `GET /procurement/suppliers/:id` - Get supplier
- `PATCH /procurement/suppliers/:id` - Update supplier
- `DELETE /procurement/suppliers/:id` - Delete supplier
- `POST /procurement/purchase-orders` - Create PO
- `GET /procurement/purchase-orders` - List POs
- `GET /procurement/purchase-orders/:id` - Get PO details
- `PATCH /procurement/purchase-orders/:id/status` - Update PO status

### Inventory Module
- `POST /inventory/items` - Create item
- `GET /inventory/items` - List items
- `GET /inventory/items/:id` - Get item details
- `GET /inventory/stock` - Get stock levels
- `POST /inventory/stock/movements` - Create stock movement
- `GET /inventory/stock/availability` - Check availability

### Sales Module
- `POST /sales/customers` - Create customer
- `GET /sales/customers` - List customers
- `POST /sales/orders` - Create sales order
- `GET /sales/orders` - List sales orders
- `GET /sales/orders/:id` - Get order details

### Accounting Module
- `POST /accounting/accounts` - Create account
- `GET /accounting/accounts` - List accounts
- `POST /accounting/journal-entries` - Create journal entry
- `GET /accounting/journal-entries` - List entries
- `POST /accounting/journal-entries/:id/post` - Post entry

---

## QUICK REFERENCE

### Standard Response Format

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-03-15T12:00:00Z",
    "requestId": "req_abc123"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid supplier code",
    "details": [
      {
        "field": "code",
        "message": "Code must be unique"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-03-15T12:00:00Z",
    "requestId": "req_abc123"
  }
}
```

### Pagination Format

**Request:**
```
GET /procurement/suppliers?page=1&limit=20&sortBy=name&order=asc
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Authentication Headers

```http
Authorization: Bearer {access_token}
X-Tenant-ID: {tenant_id}
```

---

## HTTP STATUS CODES

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PATCH, DELETE |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE (no body) |
| 400 | Bad Request | Validation error |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | No permission |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 422 | Unprocessable | Business logic error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

---

## VERSIONING STRATEGY

**API Version:** v1 (in URL path)

**Breaking Changes:** 
- Require new version (v2)
- Support old version for 12 months

**Non-Breaking Changes:**
- Same version
- Add optional fields
- Add new endpoints

---

## RATE LIMITS

| User Type | Requests/Minute | Requests/Hour |
|-----------|-----------------|---------------|
| Free Tier | 60 | 1,000 |
| Pro Tier | 300 | 10,000 |
| Enterprise | 1,000 | 100,000 |
| Admin | Unlimited | Unlimited |

---

## DOCUMENTATION TOOLS

### Swagger/OpenAPI
- **Location:** `http://localhost:3000/api/docs`
- **Format:** OpenAPI 3.0
- **Auto-generated:** From NestJS decorators

### Postman Collection
- **Export:** Available in `/docs/04-api/postman/`
- **Environments:** Dev, Staging, Production

---

**Status:** 6 documents to create  
**Priority:** HIGH - Frontend dependency  
**Owner:** Backend Team