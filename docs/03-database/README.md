# DATABASE DOCUMENTATION - SUNSET ERP

**Phase:** 2 - Architecture & Design  
**Section:** 03-database  
**Status:** In Progress  
**Date:** March 15, 2026

---

## OVERVIEW

This section contains detailed database design documentation beyond the Prisma schema, including migration strategies, indexing, performance optimization, partitioning, and operational procedures.

---

## DOCUMENTS IN THIS SECTION

### 1. [Migration Strategy](./migration-strategy.md)
How we manage database schema changes across environments and tenants.

**Contents:**
- Migration workflow (dev → staging → production)
- Zero-downtime migration techniques
- Rollback procedures
- Multi-tenant migration coordination

---

### 2. [Indexing Strategy](./indexing-strategy.md)
Database indexing for optimal query performance.

**Contents:**
- Index design principles
- Composite indexes for multi-tenant queries
- Index monitoring and maintenance
- When NOT to add indexes

---

### 3. [Performance Tuning](./performance-tuning.md)
Database optimization for scale.

**Contents:**
- Query optimization guidelines
- Connection pooling strategy
- Caching layers (Redis integration)
- Performance monitoring setup

---

### 4. [Partitioning Strategy](./partitioning-strategy.md)
Table partitioning for large-scale data management.

**Contents:**
- When to partition tables
- Partition by tenant_id
- Time-based partitioning (audit logs)
- Partition maintenance

---

### 5. [Backup & Recovery](./backup-recovery.md)
Data protection and disaster recovery procedures.

**Contents:**
- Backup schedule and retention
- Point-in-time recovery
- Tenant-specific restore procedures
- DR testing plan

---

### 6. [Data Archival](./data-archival.md)
Long-term data retention and archival strategy.

**Contents:**
- Archival policies by data type
- Archive storage (cold storage)
- Data retrieval procedures
- Compliance requirements (GDPR, etc.)

---

## RELATED DOCUMENTATION

- **Prisma Schema:** `backend/prisma/schema.prisma` (source of truth)
- **ERD Diagram:** `docs/02-architecture/diagrams/erd.md`
- **ADR-003:** PostgreSQL with Prisma ORM
- **ADR-008:** Row-Level Security

---

## QUICK REFERENCE

### Key Database Facts

| Metric | Value |
|--------|-------|
| Database | PostgreSQL 15+ |
| Total Tables | ~50 core tables |
| Total Indexes | ~150 indexes (estimated) |
| ORM | Prisma 5+ |
| Connection Pool | PgBouncer |
| Backup Frequency | Every 6 hours |
| Retention | 30 days |

### Table Categories

| Prefix | Module | Tables | Size Estimate (1K tenants) |
|--------|--------|--------|---------------------------|
| saas_* | SaaS Core | 10 | 50 MB |
| auth_* | Authentication | 7 | 20 MB |
| po_* | Procurement | 3 | 500 MB |
| in_* | Inventory | 4 | 2 GB |
| so_* | Sales | 3 | 800 MB |
| ac_* | Accounting | 3 | 1 GB |
| mfg_* | Manufacturing | 4 | 600 MB |

**Total Database Size (1,000 tenants):** ~5-10 GB

---

## DATABASE ENVIRONMENTS

### Development
- **Location:** Local Docker container
- **Data:** Test/seed data only
- **Migrations:** Auto-applied

### Staging
- **Location:** Cloud (same as production)
- **Data:** Anonymized production copy
- **Migrations:** Manual review + apply

### Production
- **Location:** Cloud (primary + replicas)
- **Data:** Live customer data
- **Migrations:** Scheduled maintenance windows

---

**Status:** 6 documents to be created  
**Priority:** HIGH - Required before implementation  
**Owner:** Database Team