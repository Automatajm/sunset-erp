# ADR-003: PostgreSQL with Prisma ORM

**Status:** ✅ Accepted  
**Date:** 2026-03-14  
**Deciders:** Juan Mendoza, Development Team  
**Tags:** database, orm, technology

---

## CONTEXT

Sunset ERP needs to choose a database and data access layer. Key requirements:

- Multi-tenant support with row-level security
- ACID transactions for financial data
- Support for 50+ tables with complex relationships
- Type-safe database access
- Automatic migrations
- Good TypeScript integration

Database options: PostgreSQL, MySQL, MongoDB  
ORM options: Prisma, TypeORM, Sequelize, Drizzle, Raw SQL

---

## DECISION

**Database: PostgreSQL 15+**  
**ORM: Prisma 5+**

We will use PostgreSQL as our primary database with Prisma as the ORM.

---

## CONSEQUENCES

### Positive - PostgreSQL

1. **Row-Level Security (RLS)**
   - Built-in tenant isolation
   - Database-level enforcement
   - Perfect for multi-tenancy

2. **ACID Compliance**
   - Critical for financial transactions
   - Reliable data consistency
   - Transaction support

3. **JSON Support**
   - JSONB for flexible data (settings, metadata)
   - Indexable JSON fields
   - Best of both worlds (relational + document)

4. **Performance**
   - Excellent query optimizer
   - Mature indexing strategies
   - Handles complex queries well

5. **Features**
   - UUID support (primary keys)
   - Full-text search
   - Partitioning for large tables
   - Materialized views

6. **Cost**
   - Open source (no licensing fees)
   - Cloud providers support it well
   - Scales vertically and horizontally

### Positive - Prisma

1. **Type Safety**
   - Auto-generated TypeScript types
   - Compile-time error checking
   - IntelliSense support

2. **Developer Experience**
   - Schema-first approach
   - Great documentation
   - Active community

3. **Migrations**
   - Automatic migration generation
   - Version controlled
   - Rollback support

4. **Prisma Studio**
   - Visual database browser
   - Helpful for development

5. **Query Builder**
   - Intuitive API
   - Type-safe queries
   - No SQL injection risk

6. **Auto-Generated Documentation**
   - ERD diagrams from schema
   - Always up-to-date

### Negative

1. **Prisma Limitations**
   - No built-in multi-schema support
   - Limited support for database-specific features
   - Can generate complex SQL for simple queries
   - Learning curve for advanced features

2. **Performance Overhead**
   - ORM adds slight overhead vs raw SQL
   - Need to optimize N+1 queries
   - Some complex queries need raw SQL

3. **PostgreSQL Complexity**
   - More complex than MySQL
   - Requires understanding of vacuum, indexes
   - Connection pooling required

4. **Vendor Lock-in**
   - Hard to switch databases later
   - Prisma-specific code

### Neutral

1. **Migration Strategy**
   - Must run migrations in sequence
   - Cannot skip versions

---

## ALTERNATIVES CONSIDERED

### Alternative 1: MySQL + TypeORM

**Pros:**
- TypeORM more mature
- Decorator-based approach
- Good TypeScript support
- MySQL simpler than PostgreSQL

**Cons:**
- No row-level security in MySQL
- Weaker multi-tenancy support
- TypeORM more complex
- Less type-safe than Prisma

**Why not chosen:** PostgreSQL RLS critical for multi-tenancy

### Alternative 2: MongoDB + Mongoose

**Pros:**
- Schema flexibility
- Horizontal scaling easier
- Good for rapid prototyping

**Cons:**
- No ACID across collections (before v4.2)
- Not suitable for financial data
- No joins (poor for ERP)
- Eventual consistency issues

**Why not chosen:** ERP requires relational data and ACID

### Alternative 3: PostgreSQL + Raw SQL

**Pros:**
- Maximum performance
- Full control
- No ORM overhead
- Access to all PostgreSQL features

**Cons:**
- No type safety
- Manual migrations
- SQL injection risk
- More boilerplate code
- Harder to maintain

**Why not chosen:** Type safety and DX more important than marginal performance gain

### Alternative 4: PostgreSQL + Drizzle ORM

**Pros:**
- Lightweight
- Better performance than Prisma
- Type-safe
- SQL-like syntax

**Cons:**
- Less mature (newer)
- Smaller community
- Less documentation
- No visual tools like Prisma Studio
- No auto-generated ERD

**Why not chosen:** Prisma more mature and better tooling

---

## IMPLEMENTATION NOTES

### Prisma Schema Structure

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id   String @id @default(uuid()) @db.Uuid
  name String @db.VarChar(255)
  // ...
  @@map("saas_tenants")
}
```

### Connection Pooling

```typescript
// Use PgBouncer in production
DATABASE_URL="postgresql://user:pass@pgbouncer:6432/sunset_erp"

// Prisma connection pool
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
```

### Migration Workflow

```bash
# Development
npx prisma migrate dev --name add_suppliers_table

# Production
npx prisma migrate deploy
```

### Query Optimization

```typescript
// Good: Single query with include
const order = await prisma.purchaseOrder.findUnique({
  where: { id },
  include: { lines: true, supplier: true }
});

// Bad: N+1 queries
const order = await prisma.purchaseOrder.findUnique({ where: { id } });
const lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
```

---

## RELATED DECISIONS

- ADR-002: Shared Database Multi-Tenancy
- ADR-004: Database Table Module Prefixes
- ADR-008: PostgreSQL Row-Level Security
- ADR-012: TypeScript Only

---

## REFERENCES

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Prisma vs TypeORM Comparison](https://www.prisma.io/docs/concepts/more/comparisons/prisma-and-typeorm)
- [PostgreSQL Best Practices](https://wiki.postgresql.org/wiki/Don%27t_Do_This)

---

**Review Date:** June 2026 (after 3 months in production)  
**Success Criteria:**
- Zero SQL injection vulnerabilities
- All migrations succeed on first try
- Query performance < 200ms p95
- Team satisfaction with DX