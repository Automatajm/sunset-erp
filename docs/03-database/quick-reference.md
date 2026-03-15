# DATABASE QUICK REFERENCE - SUNSET ERP

**Remaining Topics:** Performance, Partitioning, Backup, Archival

---

## PERFORMANCE TUNING

### Connection Pooling
- **Tool:** PgBouncer
- **Pool Size:** 100 connections
- **Mode:** Transaction pooling

### Query Optimization
```sql
-- Use EXPLAIN ANALYZE
EXPLAIN ANALYZE
SELECT * FROM po_suppliers WHERE tenant_id = ?;

-- Target: < 200ms for p95
```

### Caching Strategy
- **Redis:** Query results, session data
- **TTL:** 5-15 minutes for frequently accessed data
- **Invalidation:** On write operations

---

## PARTITIONING STRATEGY

### When to Partition
- Tables > 100 GB
- Time-series data (audit logs)
- Clear partition key (tenant_id, date)

### Partition by Tenant (Future)
```sql
-- When hitting 10,000+ tenants
CREATE TABLE po_suppliers_partition_1
  PARTITION OF po_suppliers
  FOR VALUES FROM ('00000000') TO ('33333333');
```

### Partition by Date
```sql
-- Audit logs by month
CREATE TABLE audit_logs_202601
  PARTITION OF audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

---

## BACKUP & RECOVERY

### Backup Schedule
- **Frequency:** Every 6 hours
- **Retention:** 30 days
- **Method:** pg_dump + continuous WAL archiving

### Backup Command
```bash
pg_dump -Fc sunset_erp > backup_$(date +%Y%m%d_%H%M%S).dump
```

### Point-in-Time Recovery
```bash
# Restore to specific time
pg_restore -d sunset_erp -C backup.dump
# Then apply WAL logs to specific timestamp
```

### Tenant-Specific Restore
```sql
-- Export single tenant
COPY (SELECT * FROM po_suppliers WHERE tenant_id = ?)
  TO '/tmp/tenant_backup.csv';
```

---

## DATA ARCHIVAL

### Archival Policies
| Data Type | Retention | Archive After |
|-----------|-----------|---------------|
| Transactions | 7 years | 2 years |
| Audit Logs | 7 years | 1 year |
| User Sessions | 90 days | N/A (delete) |
| Temp Data | 30 days | N/A (delete) |

### Archival Process
```sql
-- Move old data to archive table
INSERT INTO po_purchase_orders_archive
SELECT * FROM po_purchase_orders
WHERE po_date < NOW() - INTERVAL '2 years';

DELETE FROM po_purchase_orders
WHERE po_date < NOW() - INTERVAL '2 years';
```

### Cold Storage
- **Location:** AWS S3 Glacier
- **Format:** Parquet files
- **Retrieval:** 3-5 hours

---

**Status:** Quick Reference Complete  
**Full Docs:** To be expanded as needed