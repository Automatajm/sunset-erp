# ADR-002: Shared Database Multi-Tenancy

**Status:** ✅ Accepted  
**Date:** 2026-03-14  
**Deciders:** Juan Mendoza, Development Team  
**Tags:** architecture, multi-tenancy, database, scalability

---

## CONTEXT

Sunset ERP is a multi-tenant SaaS platform. We need to decide how to store and isolate data for multiple tenants (customers).

Three main approaches:
1. **Database per Tenant** - Each tenant gets their own database
2. **Schema per Tenant** - Each tenant gets their own schema within a shared database
3. **Shared Database** - All tenants share one database, isolated by tenant_id column

Key considerations:
- Infrastructure costs (targeting 1,000+ tenants)
- Maintenance overhead
- Data isolation and security
- Backup and recovery
- Schema migrations
- Performance at scale

---

## DECISION

**We will use a Shared Database with Row-Level Security (RLS) approach.**

All tenants share:
- Single PostgreSQL database
- Same schema (tables, indexes, etc.)
- Data isolated by `tenant_id` column on every table

**Implementation:**
```sql
-- Every tenant-specific table has tenant_id
CREATE TABLE po_suppliers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES saas_tenants(id),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  ...
);

-- Row-Level Security policy
ALTER TABLE po_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON po_suppliers
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Composite index for performance
CREATE INDEX idx_po_suppliers_tenant_code 
  ON po_suppliers(tenant_id, code);
```

**Defense in Depth:**
1. **Application Layer:** Prisma global scope filters by tenant_id
2. **Database Layer:** RLS policies validate tenant_id
3. **Testing Layer:** Automated cross-tenant access tests

---

## CONSEQUENCES

### Positive

1. **Cost Efficiency**
   - Single database to maintain (not 1,000+)
   - Lower hosting costs ($50/month vs $5,000+/month)
   - Reduced backup storage (1 backup vs 1,000)

2. **Operational Simplicity**
   - Single schema migration for all tenants
   - One database to backup and restore
   - Easier monitoring and optimization
   - Simplified disaster recovery

3. **Development Speed**
   - No tenant provisioning delay (instant signup)
   - Easier to develop and test
   - Cross-tenant analytics possible
   - Simpler CI/CD pipeline

4. **Performance**
   - Better resource utilization
   - Shared connection pool
   - Efficient use of RAM/cache

5. **Industry Standard**
   - NetSuite uses this approach
   - Salesforce uses this approach
   - Odoo uses this approach
   - Proven at massive scale

### Negative

1. **Security Risk**
   - Application bug could leak data across tenants
   - Requires rigorous testing and validation
   - Zero tolerance for mistakes

2. **Noisy Neighbor**
   - One tenant's heavy queries can impact others
   - Requires query monitoring and limits
   - Need for fair-use policies

3. **Backup Granularity**
   - Cannot backup single tenant easily
   - Restore requires filtering by tenant_id
   - Point-in-time recovery affects all tenants

4. **Schema Changes**
   - All tenants get schema changes simultaneously
   - Cannot A/B test schema changes easily
   - Rollback affects all tenants

5. **Scale Limits**
   - Single database has upper limit (~10,000 tenants)
   - Will need sharding eventually
   - Migration to sharding is complex

### Neutral

1. **Compliance**
   - GDPR data residency may require regional databases
   - Some industries may require dedicated databases
   - Can offer dedicated DB as premium tier

---

## ALTERNATIVES CONSIDERED

### Alternative 1: Database per Tenant

**Description:** Each tenant gets their own PostgreSQL database

**Pros:**
- Perfect tenant isolation (security)
- Independent backups per tenant
- Can scale vertically per tenant
- Easy to move tenant to different server
- No noisy neighbor issues
- Compliance-friendly (data residency)

**Cons:**
- Very high costs (1,000 databases = $$$)
- Massive operational overhead
- Schema migrations complex (must run 1,000x)
- Connection pool per database
- Backup explosion (1,000 backup jobs)
- Slow tenant provisioning (minutes vs seconds)
- Cross-tenant analytics impossible

**Cost Analysis:**
- 1,000 tenants × $5/database/month = $5,000/month
- vs Shared: $50-200/month

**Why not chosen:**
- Costs 25-100x more
- Operations nightmare at scale
- Not necessary for security (RLS works)
- Slower time to market

### Alternative 2: Schema per Tenant

**Description:** Each tenant gets their own PostgreSQL schema

**Pros:**
- Better isolation than shared tables
- Easier than database per tenant
- Logical separation
- Independent migrations possible

**Cons:**
- PostgreSQL limit: ~1,000 schemas per database
- Connection pooling complex (SET search_path)
- Migrations still need to run 1,000x
- Schema name conflicts possible
- Backup still database-level
- Performance issues at scale

**Why not chosen:**
- Still has many DB-per-tenant problems
- PostgreSQL not optimized for many schemas
- Added complexity without enough benefit
- Industry leaders don't use this approach

---

## IMPLEMENTATION NOTES

### Tenant Context Middleware

```typescript
// Set tenant context from JWT
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.user.tenantId; // From JWT
    
    // Set PostgreSQL session variable
    await prisma.$executeRaw`SET app.tenant_id = ${tenantId}`;
    
    next();
  }
}
```

### Prisma Global Scope

```typescript
// Auto-filter all queries by tenant_id
const prisma = new PrismaClient({
  // Global middleware to inject tenant_id
});
```

### Testing Strategy

```typescript
// Automated test: Attempt cross-tenant access
test('cannot access other tenant data', async () => {
  const tenant1User = await loginAs(tenant1Admin);
  const tenant2Data = await getTenant2Supplier();
  
  const result = await tenant1User.getSupplier(tenant2Data.id);
  
  expect(result).toBeNull(); // Must not return data
});
```

### Migration to Sharding (Future)

When we hit ~10,000 tenants:

1. **Shard by tenant_id ranges**
   - DB1: tenant_id 0000-3333
   - DB2: tenant_id 3334-6666
   - DB3: tenant_id 6667-9999

2. **Application routing**
   - Hash tenant_id to determine shard
   - Route queries to correct database

3. **Large tenant isolation**
   - Move enterprise tenants to dedicated DB
   - Keep SMBs on shared database

---

## RELATED DECISIONS

- ADR-001: Modular Monolith Architecture
- ADR-003: PostgreSQL with Prisma ORM
- ADR-008: PostgreSQL Row-Level Security
- ADR-004: Database Table Module Prefixes

---

## REFERENCES

- [Multi-Tenancy Comparison - Microsoft Azure](https://docs.microsoft.com/azure/architecture/guide/multitenant/approaches/overview)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Salesforce Multi-Tenant Architecture](https://developer.salesforce.com/wiki/multi-tenant-architecture)
- [Force.com Multi-Tenant Architecture Paper](https://resources.docs.salesforce.com/rel1/doc/en-us/static/pdf/SF_Multitenancy_WP_101508.pdf)

---

**Review Date:** After 1,000 tenants onboarded  
**Success Criteria:**
- Zero cross-tenant data leaks
- Database size < 500GB at 1,000 tenants
- Query performance < 200ms p95
- Penetration test passes