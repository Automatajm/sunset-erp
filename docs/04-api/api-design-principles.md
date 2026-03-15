# API DESIGN PRINCIPLES - SUNSET ERP

**Version:** 1.0  
**Date:** March 15, 2026

---

## CORE PRINCIPLES

### 1. RESTful Design
Follow REST conventions for predictable, intuitive APIs.

**Resource-Based URLs:**
```
✅ GET /suppliers
✅ POST /suppliers
✅ GET /suppliers/:id
✅ PATCH /suppliers/:id
✅ DELETE /suppliers/:id

❌ GET /getSuppliers
❌ POST /createSupplier
❌ GET /deleteSupplier/:id
```

### 2. Consistent Naming
- **Resources:** Plural nouns (`/suppliers`, `/orders`)
- **Fields:** camelCase (`firstName`, `createdAt`)
- **Enums:** UPPER_SNAKE_CASE (`PENDING`, `APPROVED`)

### 3. Tenant Isolation
Every request must include tenant context.

```typescript
// Automatically injected by middleware from JWT
headers: {
  'Authorization': 'Bearer {token}',
  'X-Tenant-ID': '{tenant_id}'  // Read-only, from JWT
}
```

### 4. Idempotency
POST requests use idempotency keys for safety.

```typescript
headers: {
  'Idempotency-Key': 'unique-key-123'
}
```

### 5. Versioning
API version in URL path for clarity.

```
/api/v1/suppliers
/api/v2/suppliers  // Future breaking changes
```

---

## REQUEST DESIGN

### HTTP Methods

| Method | Purpose | Idempotent | Request Body |
|--------|---------|------------|--------------|
| GET | Retrieve | ✅ Yes | ❌ No |
| POST | Create | ❌ No | ✅ Yes |
| PATCH | Partial Update | ✅ Yes | ✅ Yes |
| PUT | Full Replace | ✅ Yes | ✅ Yes |
| DELETE | Remove | ✅ Yes | ❌ No |

**We prefer PATCH over PUT** for updates (only send changed fields).

### Query Parameters

```typescript
// Filtering
GET /suppliers?status=active&country=DO

// Pagination
GET /suppliers?page=1&limit=20

// Sorting
GET /suppliers?sortBy=name&order=asc

// Search
GET /suppliers?search=acme

// Field selection
GET /suppliers?fields=id,name,email

// Include relations
GET /purchase-orders?include=lines,supplier
```

### Request Body

```json
// POST /suppliers
{
  "code": "SUP001",
  "name": "ACME Corp",
  "email": "contact@acme.com",
  "phone": "+1-809-555-0100",
  "paymentTerms": "NET_30"
}
```

---

## RESPONSE DESIGN

### Success Response Structure

```typescript
interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;      // ISO 8601
    requestId: string;      // For tracing
    version: string;        // API version
  };
  pagination?: {            // For list endpoints
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
```

**Example:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-123",
    "code": "SUP001",
    "name": "ACME Corp",
    "createdAt": "2026-03-15T12:00:00Z"
  },
  "meta": {
    "timestamp": "2026-03-15T12:00:01Z",
    "requestId": "req_abc123",
    "version": "v1"
  }
}
```

### Error Response Structure

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;           // Machine-readable
    message: string;        // Human-readable
    details?: Array<{       // Validation errors
      field: string;
      message: string;
    }>;
    stackTrace?: string;    // Dev/staging only
  };
  meta: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}
```

**Example:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      },
      {
        "field": "code",
        "message": "Code must be unique"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-03-15T12:00:01Z",
    "requestId": "req_abc123"
  }
}
```

---

## PAGINATION

### Request Format
```
GET /suppliers?page=1&limit=20
```

**Parameters:**
- `page`: Page number (1-indexed, default: 1)
- `limit`: Items per page (default: 20, max: 100)

### Response Format
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

---

## FILTERING & SEARCH

### Exact Match
```
GET /suppliers?status=active
```

### Multiple Values (OR)
```
GET /suppliers?status=active,pending
```

### Range Queries
```
GET /purchase-orders?minTotal=1000&maxTotal=5000
GET /purchase-orders?fromDate=2026-01-01&toDate=2026-03-31
```

### Full-Text Search
```
GET /suppliers?search=acme
```

### Advanced Filtering
```json
// POST /suppliers/search
{
  "filters": [
    { "field": "status", "operator": "eq", "value": "active" },
    { "field": "creditLimit", "operator": "gte", "value": 10000 }
  ],
  "search": "acme",
  "page": 1,
  "limit": 20
}
```

---

## SORTING

```
GET /suppliers?sortBy=name&order=asc
GET /suppliers?sortBy=createdAt&order=desc
```

**Multiple fields:**
```
GET /suppliers?sortBy=status,name&order=asc,asc
```

---

## FIELD SELECTION

**Reduce payload size by selecting specific fields:**

```
GET /suppliers?fields=id,name,email
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-123",
      "name": "ACME Corp",
      "email": "contact@acme.com"
    }
  ]
}
```

---

## EXPANDING RELATIONS

**Include related resources:**

```
GET /purchase-orders/:id?include=supplier,lines
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "po-123",
    "poNumber": "PO-001",
    "supplier": {
      "id": "sup-123",
      "name": "ACME Corp"
    },
    "lines": [
      { "id": "line-1", "itemId": "item-1", "quantity": 10 },
      { "id": "line-2", "itemId": "item-2", "quantity": 5 }
    ]
  }
}
```

---

## BULK OPERATIONS

### Batch Create
```json
// POST /suppliers/batch
{
  "items": [
    { "code": "SUP001", "name": "Supplier 1" },
    { "code": "SUP002", "name": "Supplier 2" }
  ]
}
```

### Batch Update
```json
// PATCH /suppliers/batch
{
  "updates": [
    { "id": "uuid-1", "status": "inactive" },
    { "id": "uuid-2", "status": "inactive" }
  ]
}
```

### Batch Delete
```json
// DELETE /suppliers/batch
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

---

## ASYNCHRONOUS OPERATIONS

For long-running operations (exports, reports):

**Request:**
```
POST /reports/generate
{
  "type": "purchase-order-summary",
  "fromDate": "2026-01-01",
  "toDate": "2026-03-31"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "job-abc123",
    "status": "pending",
    "statusUrl": "/jobs/job-abc123"
  }
}
```

**Check Status:**
```
GET /jobs/job-abc123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "job-abc123",
    "status": "completed",
    "result": {
      "downloadUrl": "/downloads/report-xyz.pdf"
    }
  }
}
```

---

## WEBHOOKS

For real-time event notifications:

```json
// POST /webhooks (configure webhook endpoint)
{
  "url": "https://customer-app.com/webhooks",
  "events": ["purchase_order.created", "purchase_order.approved"],
  "secret": "webhook_secret_key"
}
```

**Webhook Payload:**
```json
{
  "event": "purchase_order.created",
  "timestamp": "2026-03-15T12:00:00Z",
  "data": {
    "id": "po-123",
    "poNumber": "PO-001"
  },
  "signature": "sha256=abc123..."  // HMAC signature
}
```

---

## DEPRECATION POLICY

### Announcing Deprecation
- 6 months notice minimum
- Warning header in responses
- Documentation updated

**Deprecated Endpoint Response:**
```http
HTTP/1.1 200 OK
Warning: 299 - "This endpoint is deprecated. Use /api/v2/suppliers instead. Support ends 2026-09-15"
```

### Sunset Period
- Old endpoints supported for 12 months
- Gradually reduce rate limits
- Final shutdown announced 3 months in advance

---

## TESTING PRINCIPLES

### Contract Testing
- OpenAPI spec is source of truth
- Frontend and backend test against spec
- Spec changes require approval

### Example-Driven Development
- Every endpoint has request/response examples
- Examples used in tests
- Examples in documentation

---

**Related Documents:**
- Authentication & Authorization
- Error Handling
- Rate Limiting

**Review:** Before each major release