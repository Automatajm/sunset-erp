# DATABASE MIGRATION STRATEGY - SUNSET ERP

**Document Version:** 1.0  
**Date:** March 15, 2026  
**Status:** Active

---

## OVERVIEW

This document defines how we manage database schema changes across all environments while maintaining zero downtime and data integrity for our multi-tenant SaaS platform.

---

## MIGRATION PRINCIPLES

### 1. Always Forward Compatible
Every migration must allow the old code to continue working during deployment.

### 2. Never Break Production
Migrations are tested in staging with production-like data before deployment.

### 3. Atomic Changes
Each migration is a single logical change that can be rolled back independently.

### 4. Documented & Reviewed
All migrations require code review and are documented with context.

---

## MIGRATION WORKFLOW

### Development Environment

```bash
# 1. Modify Prisma schema
# Edit: backend/prisma/schema.prisma

# 2. Generate migration
npx prisma migrate dev --name add_supplier_rating

# This creates:
# - Migration SQL file in prisma/migrations/
# - Updates Prisma client
# - Applies to local database

# 3. Test the migration
npm run test

# 4. Commit migration files
git add prisma/migrations/
git commit -m "Add supplier rating column"
```

### Staging Environment

```bash
# 1. Pull latest code
git pull origin main

# 2. Review migration SQL
cat prisma/migrations/XXXXXX_add_supplier_rating/migration.sql

# 3. Apply migration
npx prisma migrate deploy

# 4. Verify schema
npx prisma db pull
npx prisma generate

# 5. Run integration tests
npm run test:integration

# 6. Verify no errors in logs
tail -f logs/staging.log
```

### Production Environment

```bash
# 1. Schedule maintenance window (if needed)
# For breaking changes only

# 2. Backup database
./scripts/backup-production.sh

# 3. Apply migration
npx prisma migrate deploy

# 4. Monitor for errors
./scripts/monitor-migration.sh

# 5. Verify application health
curl https://api.sunset-erp.com/health

# 6. Rollback if issues detected
# (see Rollback section below)
```

---

## ZERO-DOWNTIME MIGRATIONS

### Pattern 1: Adding Columns (Safe)

```sql
-- ✅ SAFE: Adding nullable column
ALTER TABLE po_suppliers 
ADD COLUMN rating INTEGER;

-- Application can deploy immediately
-- Old code ignores new column
-- New code starts using it
```

### Pattern 2: Removing Columns (Multi-Step)

```sql
-- ❌ DANGEROUS: Don't do this in one step
ALTER TABLE po_suppliers DROP COLUMN old_field;

-- ✅ SAFE: Three-step process

-- Step 1: Stop writing to column (code deploy)
-- Deploy code that doesn't use old_field

-- Step 2: Wait 24 hours (verify no usage)
-- Monitor logs for any errors

-- Step 3: Drop column (migration)
ALTER TABLE po_suppliers DROP COLUMN old_field;
```

### Pattern 3: Renaming Columns (Multi-Step)

```sql
-- ❌ Don't rename directly
ALTER TABLE po_suppliers RENAME COLUMN name TO supplier_name;

-- ✅ Safe approach:

-- Step 1: Add new column
ALTER TABLE po_suppliers ADD COLUMN supplier_name VARCHAR(255);

-- Step 2: Backfill data
UPDATE po_suppliers SET supplier_name = name;

-- Step 3: Deploy code to use supplier_name

-- Step 4: Drop old column (after verification)
ALTER TABLE po_suppliers DROP COLUMN name;
```

### Pattern 4: Adding NOT NULL Constraints

```sql
-- ❌ Dangerous: Immediate NOT NULL
ALTER TABLE po_suppliers 
ADD COLUMN email VARCHAR(255) NOT NULL;

-- ✅ Safe approach:

-- Step 1: Add nullable column
ALTER TABLE po_suppliers 
ADD COLUMN email VARCHAR(255);

-- Step 2: Backfill with default values
UPDATE po_suppliers 
SET email = CONCAT(code, '@placeholder.com')
WHERE email IS NULL;

-- Step 3: Add NOT NULL constraint
ALTER TABLE po_suppliers 
ALTER COLUMN email SET NOT NULL;
```

---

## MULTI-TENANT CONSIDERATIONS

### Shared Schema Migrations

All tenants share the same schema, so migrations apply to all tenants simultaneously.

**Advantages:**
- Single migration execution
- Consistent schema across tenants
- Simpler to manage

**Challenges:**
- Cannot A/B test schema changes
- All tenants affected by issues
- Must be universally safe

### Testing with Multi-Tenant Data

```sql
-- Create test tenants in staging
INSERT INTO saas_tenants (id, code, name) VALUES
  ('test-tenant-1', 'TEST1', 'Test Tenant 1'),
  ('test-tenant-2', 'TEST2', 'Test Tenant 2');

-- Test migration with tenant isolation
SET app.tenant_id = 'test-tenant-1';
SELECT * FROM po_suppliers; -- Should only see tenant 1 data

SET app.tenant_id = 'test-tenant-2';
SELECT * FROM po_suppliers; -- Should only see tenant 2 data
```

---

## MIGRATION SAFETY CHECKLIST

Before applying production migration:

- [ ] Migration tested in local environment
- [ ] Migration tested in staging with production-like data
- [ ] Migration SQL reviewed by senior developer
- [ ] Rollback plan documented
- [ ] Database backup completed
- [ ] Monitoring alerts configured
- [ ] Maintenance window scheduled (if downtime required)
- [ ] Team notified of deployment
- [ ] Performance impact assessed
- [ ] Tenant isolation verified (no cross-tenant data access)

---

## ROLLBACK PROCEDURES

### Automatic Rollback (Preferred)

```bash
# Prisma doesn't support automatic rollback
# We need manual rollback procedures
```

### Manual Rollback

```bash
# 1. Stop application traffic
kubectl scale deployment api --replicas=0

# 2. Restore from backup
pg_restore -d sunset_erp backup_YYYYMMDD_HHMMSS.sql

# 3. Verify data integrity
SELECT COUNT(*) FROM po_suppliers;

# 4. Restart application with old code
git checkout previous-commit
npm run build
kubectl scale deployment api --replicas=3

# 5. Monitor for errors
kubectl logs -f deployment/api
```

### Migration-Specific Rollback

For each migration, document the reverse SQL:

```sql
-- Migration: Add supplier rating column
-- File: 20260315_add_supplier_rating

-- Forward migration
ALTER TABLE po_suppliers ADD COLUMN rating INTEGER;

-- Rollback migration (save as separate file)
ALTER TABLE po_suppliers DROP COLUMN rating;
```

---

## COMMON MIGRATION SCENARIOS

### 1. Adding a New Table

```sql
-- Safe, no downtime needed
CREATE TABLE po_supplier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES saas_tenants(id),
  supplier_id UUID NOT NULL REFERENCES po_suppliers(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_supplier_contacts_tenant_supplier 
  ON po_supplier_contacts(tenant_id, supplier_id);

-- Enable RLS
ALTER TABLE po_supplier_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON po_supplier_contacts
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### 2. Adding an Index

```sql
-- Use CONCURRENTLY to avoid locking table
CREATE INDEX CONCURRENTLY idx_po_suppliers_tenant_code 
  ON po_suppliers(tenant_id, code);

-- If it fails, drop and retry
DROP INDEX CONCURRENTLY IF EXISTS idx_po_suppliers_tenant_code;
```

### 3. Changing Data Types

```sql
-- Example: Change phone from VARCHAR(20) to VARCHAR(50)

-- Step 1: Add new column
ALTER TABLE po_suppliers ADD COLUMN phone_new VARCHAR(50);

-- Step 2: Copy data
UPDATE po_suppliers SET phone_new = phone;

-- Step 3: Deploy code to use phone_new

-- Step 4: Drop old column
ALTER TABLE po_suppliers DROP COLUMN phone;

-- Step 5: Rename new column
ALTER TABLE po_suppliers RENAME COLUMN phone_new TO phone;
```

---

## LARGE DATA MIGRATIONS

For migrations affecting millions of rows:

### Batch Processing

```sql
-- Don't do this (locks table for hours):
UPDATE in_stock SET unit_cost = unit_cost * 1.1;

-- Do this instead (batch updates):
DO $$
DECLARE
  batch_size INTEGER := 10000;
  offset_val INTEGER := 0;
  rows_affected INTEGER;
BEGIN
  LOOP
    UPDATE in_stock
    SET unit_cost = unit_cost * 1.1
    WHERE id IN (
      SELECT id FROM in_stock
      ORDER BY id
      LIMIT batch_size OFFSET offset_val
    );
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    EXIT WHEN rows_affected = 0;
    
    offset_val := offset_val + batch_size;
    COMMIT; -- Release locks
    PERFORM pg_sleep(0.1); -- Brief pause
  END LOOP;
END $$;
```

### Background Jobs

For very large migrations:
1. Deploy code that writes to both old and new columns
2. Run background job to backfill historical data
3. Monitor progress
4. Once complete, deploy code using only new column
5. Drop old column

---

## MONITORING & ALERTING

### Migration Monitoring

```bash
# Monitor long-running queries during migration
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;

# Check table locks
SELECT * FROM pg_locks
WHERE NOT granted;

# Monitor table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Post-Migration Verification

```sql
-- Verify row counts didn't change unexpectedly
SELECT COUNT(*) FROM po_suppliers; -- Compare to pre-migration count

-- Verify tenant isolation still works
SET app.tenant_id = 'test-tenant-id';
SELECT * FROM po_suppliers; -- Should only see tenant's data

-- Check for any NULL values in NOT NULL columns
SELECT * FROM po_suppliers WHERE email IS NULL; -- Should be empty
```

---

## MIGRATION SCHEDULE

### Preferred Maintenance Windows

- **Development:** Anytime
- **Staging:** Weekdays 9 AM - 5 PM EST
- **Production:** 
  - Minor migrations (no downtime): Anytime
  - Major migrations (potential downtime): Sunday 2 AM - 6 AM EST

### Deployment Frequency

- Development: Multiple times per day
- Staging: Daily (end of day)
- Production: Weekly (Thursday evening)

---

## DOCUMENTATION REQUIREMENTS

Each migration must include:

1. **Migration File Name:** Descriptive and dated
   - Format: `YYYYMMDD_HHMMSS_description`
   - Example: `20260315_120000_add_supplier_rating.sql`

2. **Migration Comment Block:**
```sql
-- Migration: Add supplier rating column
-- Date: 2026-03-15
-- Author: Juan Mendoza
-- Ticket: SUNSET-123
-- 
-- Description:
-- Adds a rating column (1-5 stars) to po_suppliers table
-- to track supplier performance.
--
-- Rollback:
-- ALTER TABLE po_suppliers DROP COLUMN rating;
```

3. **Testing Evidence:**
   - Screenshots of successful staging deployment
   - Test results
   - Performance impact assessment

---

## RELATED DOCUMENTS

- Prisma Schema: `backend/prisma/schema.prisma`
- Indexing Strategy: `03-database/indexing-strategy.md`
- Performance Tuning: `03-database/performance-tuning.md`
- ADR-003: PostgreSQL with Prisma ORM

---

**Review Schedule:** Quarterly  
**Last Updated:** March 15, 2026  
**Next Review:** June 15, 2026