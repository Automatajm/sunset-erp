# INDEXING STRATEGY - SUNSET ERP

**Document Version:** 1.0  
**Date:** March 15, 2026

---

## OVERVIEW

Database indexing strategy for optimal query performance in a multi-tenant environment.

---

## INDEXING PRINCIPLES

### 1. Multi-Tenant Index Pattern
**Always include tenant_id as first column in composite indexes**

```sql
-- ✅ GOOD: tenant_id first
CREATE INDEX idx_suppliers_tenant_code 
  ON po_suppliers(tenant_id, code);

-- ❌ BAD: tenant_id not first
CREATE INDEX idx_suppliers_code_tenant 
  ON po_suppliers(code, tenant_id);
```

**Why:** PostgreSQL can use index for queries filtering by tenant_id alone.

### 2. Cover the Query
Include all columns used in WHERE, JOIN, and ORDER BY clauses.

```sql
-- Query pattern:
SELECT id, name, email 
FROM po_suppliers 
WHERE tenant_id = ? AND status = 'active' 
ORDER BY name;

-- Optimal index:
CREATE INDEX idx_suppliers_tenant_status_name 
  ON po_suppliers(tenant_id, status, name);
```

### 3. Use CONCURRENTLY for Production
Never lock tables when adding indexes.

```sql
CREATE INDEX CONCURRENTLY idx_name ON table_name(column);
```

---

## STANDARD INDEXES

### Primary Keys (Automatic)
```sql
-- Automatically created by Prisma
id UUID PRIMARY KEY
```

### Foreign Keys
```sql
-- Always index foreign keys for JOIN performance
CREATE INDEX idx_po_lines_order 
  ON po_purchase_order_lines(purchase_order_id);

CREATE INDEX idx_po_lines_item 
  ON po_purchase_order_lines(item_id);
```

### Tenant Isolation
```sql
-- Every tenant table needs this
CREATE INDEX idx_{table}_tenant 
  ON {table}(tenant_id);
```

---

## TABLE-SPECIFIC INDEXES

### SaaS Tables

```sql
-- saas_tenants
CREATE UNIQUE INDEX idx_tenants_code ON saas_tenants(code);
CREATE UNIQUE INDEX idx_tenants_subdomain ON saas_tenants(subdomain) 
  WHERE subdomain IS NOT NULL;

-- saas_subscriptions
CREATE INDEX idx_subscriptions_tenant_status 
  ON saas_subscriptions(tenant_id, status);
```

### Authentication Tables

```sql
-- auth_users
CREATE UNIQUE INDEX idx_users_email ON auth_users(email);
CREATE INDEX idx_users_status ON auth_users(status);

-- auth_user_tenants
CREATE INDEX idx_user_tenants_user 
  ON auth_user_tenants(user_id, tenant_id);
CREATE INDEX idx_user_tenants_default 
  ON auth_user_tenants(user_id) 
  WHERE is_default = true;
```

### Procurement Tables

```sql
-- po_suppliers
CREATE UNIQUE INDEX idx_suppliers_tenant_code 
  ON po_suppliers(tenant_id, code);
CREATE INDEX idx_suppliers_tenant_name 
  ON po_suppliers(tenant_id, name);
CREATE INDEX idx_suppliers_tenant_active 
  ON po_suppliers(tenant_id, is_active) 
  WHERE is_active = true;

-- po_purchase_orders
CREATE UNIQUE INDEX idx_po_tenant_number 
  ON po_purchase_orders(tenant_id, po_number);
CREATE INDEX idx_po_tenant_supplier_status 
  ON po_purchase_orders(tenant_id, supplier_id, status);
CREATE INDEX idx_po_tenant_date 
  ON po_purchase_orders(tenant_id, po_date DESC);
```

### Inventory Tables

```sql
-- in_items
CREATE UNIQUE INDEX idx_items_tenant_code 
  ON in_items(tenant_id, code);
CREATE INDEX idx_items_tenant_type 
  ON in_items(tenant_id, item_type);
CREATE INDEX idx_items_tenant_active 
  ON in_items(tenant_id, is_active) 
  WHERE is_active = true;

-- in_stock
CREATE UNIQUE INDEX idx_stock_tenant_item_warehouse_lot 
  ON in_stock(tenant_id, item_id, warehouse_id, 
    COALESCE(lot_number, ''), COALESCE(serial_number, ''));
CREATE INDEX idx_stock_tenant_item 
  ON in_stock(tenant_id, item_id);
```

### Sales Tables

```sql
-- so_customers
CREATE UNIQUE INDEX idx_customers_tenant_code 
  ON so_customers(tenant_id, code);
CREATE INDEX idx_customers_tenant_name 
  ON so_customers(tenant_id, name);

-- so_sales_orders
CREATE UNIQUE INDEX idx_so_tenant_number 
  ON so_sales_orders(tenant_id, so_number);
CREATE INDEX idx_so_tenant_customer_status 
  ON so_sales_orders(tenant_id, customer_id, status);
```

### Accounting Tables

```sql
-- ac_accounts
CREATE UNIQUE INDEX idx_accounts_tenant_number 
  ON ac_accounts(tenant_id, account_number);
CREATE INDEX idx_accounts_tenant_type 
  ON ac_accounts(tenant_id, account_type);

-- ac_journal_entries
CREATE UNIQUE INDEX idx_je_tenant_number 
  ON ac_journal_entries(tenant_id, entry_number);
CREATE INDEX idx_je_tenant_date_status 
  ON ac_journal_entries(tenant_id, entry_date DESC, status);
```

---

## PARTIAL INDEXES

Use for specific query patterns:

```sql
-- Active records only
CREATE INDEX idx_suppliers_active 
  ON po_suppliers(tenant_id, name) 
  WHERE is_active = true AND deleted_at IS NULL;

-- Pending orders
CREATE INDEX idx_po_pending 
  ON po_purchase_orders(tenant_id, po_date) 
  WHERE status = 'pending';

-- Overdue items
CREATE INDEX idx_po_overdue 
  ON po_purchase_orders(tenant_id, expected_date) 
  WHERE status NOT IN ('completed', 'cancelled') 
    AND expected_date < CURRENT_DATE;
```

---

## WHEN NOT TO INDEX

❌ **Don't index:**
- Very small tables (< 1,000 rows)
- Columns with low cardinality (few distinct values)
- Columns rarely used in WHERE clauses
- Columns with frequent updates (index maintenance overhead)

**Example:**
```sql
-- ❌ Bad: gender column (only 2-3 values)
CREATE INDEX idx_users_gender ON auth_users(gender);

-- ❌ Bad: boolean flags (true/false only)
CREATE INDEX idx_items_stockable ON in_items(is_stockable);
```

---

## INDEX MONITORING

### Find Missing Indexes

```sql
-- Tables with sequential scans (might need indexes)
SELECT schemaname, tablename, seq_scan, seq_tup_read, 
       idx_scan, seq_tup_read / seq_scan as avg_seq_tup
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 20;
```

### Find Unused Indexes

```sql
-- Indexes never used (candidates for removal)
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%_pkey';
```

### Index Size

```sql
-- Largest indexes
SELECT schemaname, tablename, indexname,
       pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;
```

---

## INDEX MAINTENANCE

### Rebuild Bloated Indexes

```sql
-- Reindex concurrently (no downtime)
REINDEX INDEX CONCURRENTLY idx_suppliers_tenant_code;
```

### Auto-Vacuum Settings

```sql
-- Ensure autovacuum is enabled
ALTER TABLE po_suppliers SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);
```

---

## PERFORMANCE TARGETS

| Query Type | Target | With Indexes |
|------------|--------|--------------|
| Primary key lookup | < 1ms | Always fast |
| Tenant + code lookup | < 5ms | With proper index |
| Filtered list (100 rows) | < 20ms | With composite index |
| Aggregations | < 100ms | Depends on data volume |
| Full-text search | < 200ms | With GIN index |

---

**Related:** Migration Strategy, Performance Tuning  
**Review:** Quarterly based on query patterns