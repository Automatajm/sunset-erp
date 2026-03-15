# Create Purchase Order - Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant API
    participant TenantMiddleware
    participant AuthGuard
    participant PermissionGuard
    participant POService
    participant Prisma
    participant PostgreSQL
    participant EventEmitter

    User->>Frontend: Click "Create Purchase Order"
    Frontend->>Frontend: Open PO form
    
    User->>Frontend: Fill form<br/>(Supplier, Items, Quantities)
    Frontend->>Frontend: Client-side validation (Zod)
    
    User->>Frontend: Click "Submit"
    
    Frontend->>API: POST /procurement/purchase-orders<br/>Authorization: Bearer {JWT}<br/>{supplierId, lines: [...]}
    
    API->>TenantMiddleware: Extract tenant context
    TenantMiddleware->>TenantMiddleware: Parse JWT token
    TenantMiddleware->>TenantMiddleware: Extract tenantId, userId, roles
    TenantMiddleware->>TenantMiddleware: Set request context
    TenantMiddleware->>PostgreSQL: SET app.tenant_id = '{tenantId}'
    PostgreSQL-->>TenantMiddleware: OK
    
    TenantMiddleware->>AuthGuard: Validate authentication
    AuthGuard->>AuthGuard: Verify JWT signature
    AuthGuard->>AuthGuard: Check token expiration
    
    alt Token expired
        AuthGuard-->>API: 401 Unauthorized
        API-->>Frontend: Token expired
        Frontend->>Frontend: Refresh token flow
    end
    
    AuthGuard->>PermissionGuard: Check permissions
    PermissionGuard->>PermissionGuard: Check PROCUREMENT:CREATE permission
    
    alt No permission
        PermissionGuard-->>API: 403 Forbidden
        API-->>Frontend: Error: No permission
        Frontend-->>User: Access denied message
    end
    
    PermissionGuard->>POService: createPurchaseOrder(dto)
    
    POService->>POService: Validate business rules
    
    POService->>Prisma: Check supplier exists<br/>WHERE id = ? AND tenantId = ?
    Prisma->>PostgreSQL: SELECT * FROM po_suppliers<br/>WHERE id = ? AND tenant_id = ?
    
    Note over PostgreSQL: Row-Level Security (RLS)<br/>validates tenant_id automatically
    
    PostgreSQL-->>Prisma: Supplier record
    Prisma-->>POService: Supplier found
    
    alt Supplier not found or wrong tenant
        POService-->>API: 404 Not Found
        API-->>Frontend: Supplier not found
        Frontend-->>User: Error message
    end
    
    POService->>Prisma: Check items exist
    loop For each line item
        Prisma->>PostgreSQL: SELECT * FROM in_items<br/>WHERE id = ? AND tenant_id = ?
        PostgreSQL-->>Prisma: Item record
    end
    Prisma-->>POService: All items valid
    
    POService->>POService: Calculate line totals
    POService->>POService: Calculate PO total
    POService->>POService: Generate PO number (PO-YYYYMMDD-XXXX)
    
    POService->>Prisma: Begin transaction
    Prisma->>PostgreSQL: BEGIN
    
    POService->>Prisma: Create purchase order
    Prisma->>PostgreSQL: INSERT INTO po_purchase_orders<br/>(tenant_id, supplier_id, po_number, total, status, created_by)
    
    Note over PostgreSQL: RLS policy ensures<br/>tenant_id matches session
    
    PostgreSQL-->>Prisma: PO created (id)
    Prisma-->>POService: PO entity
    
    loop For each line
        POService->>Prisma: Create purchase order line
        Prisma->>PostgreSQL: INSERT INTO po_purchase_order_lines<br/>(tenant_id, purchase_order_id, item_id, quantity, unit_price, line_total)
        PostgreSQL-->>Prisma: Line created
    end
    
    POService->>Prisma: Create audit log entry
    Prisma->>PostgreSQL: INSERT INTO audit_logs<br/>(tenant_id, user_id, action, resource, resource_id)
    PostgreSQL-->>Prisma: Log created
    
    POService->>Prisma: Commit transaction
    Prisma->>PostgreSQL: COMMIT
    PostgreSQL-->>Prisma: Success
    
    POService->>EventEmitter: Emit 'purchase_order.created' event
    EventEmitter->>EventEmitter: Trigger async handlers
    
    Note over EventEmitter: Background tasks:<br/>- Send email notification<br/>- Update analytics<br/>- Webhook triggers
    
    POService-->>API: PO created successfully
    API-->>Frontend: 201 Created<br/>{id, poNumber, total, status}
    
    Frontend->>Frontend: Show success toast
    Frontend->>Frontend: Invalidate PO list cache (React Query)
    Frontend->>User: Redirect to /procurement/purchase-orders/{id}
    
    User->>Frontend: View created PO
    Frontend->>API: GET /procurement/purchase-orders/{id}
    API->>TenantMiddleware: Extract tenant
    TenantMiddleware->>POService: getPurchaseOrder(id)
    POService->>Prisma: Find PO with lines<br/>WHERE id = ? AND tenant_id = ?
    Prisma->>PostgreSQL: SELECT po.*, lines.*, supplier.*<br/>FROM po_purchase_orders po<br/>JOIN po_purchase_order_lines lines ON...<br/>WHERE po.id = ? AND po.tenant_id = ?
    
    Note over PostgreSQL: RLS ensures user can only<br/>see their tenant's data
    
    PostgreSQL-->>Prisma: PO with lines
    Prisma-->>POService: PO entity
    POService-->>API: PO data
    API-->>Frontend: 200 OK + PO details
    Frontend-->>User: Display PO details
```

**Key Multi-Tenant Security Features:**

1. **Tenant Context Isolation**
   - Tenant ID extracted from JWT (not from user input)
   - Set in PostgreSQL session: `SET app.tenant_id`
   - All queries automatically filtered

2. **Defense in Depth**
   - Layer 1: Middleware filters by tenantId
   - Layer 2: Prisma global middleware
   - Layer 3: PostgreSQL Row-Level Security (RLS)

3. **Authorization**
   - JWT authentication required
   - Permission check: PROCUREMENT:CREATE
   - Role-based access control (RBAC)

4. **Data Validation**
   - Client-side: Zod schema validation
   - Server-side: DTO validation (class-validator)
   - Business rules: Supplier must belong to tenant

5. **Audit Trail**
   - All create/update/delete logged
   - User ID, tenant ID, timestamp recorded
   - Complete audit trail for compliance

6. **Transaction Safety**
   - ACID transaction for PO + lines
   - All-or-nothing insertion
   - Rollback on any error

**Error Scenarios Handled:**
- Invalid/expired JWT → 401 Unauthorized
- No permission → 403 Forbidden
- Supplier not found → 404 Not Found
- Supplier belongs to different tenant → 404 (not 403, prevents enumeration)
- Validation errors → 400 Bad Request
- Database errors → 500 Internal Server Error (with rollback)