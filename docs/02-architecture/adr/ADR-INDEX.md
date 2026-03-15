# ARCHITECTURE DECISION RECORDS (ADRs) - SUNSET ERP

**Project:** Sunset ERP  
**Status:** Active  
**Last Updated:** March 15, 2026

---

## WHAT ARE ADRs?

Architecture Decision Records (ADRs) document significant architectural decisions made during the project. Each ADR captures:

- **Context:** What is the issue we're addressing?
- **Decision:** What did we decide?
- **Consequences:** What are the trade-offs?
- **Status:** Proposed, Accepted, Deprecated, Superseded

---

## ADR INDEX

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](./adr/ADR-001-modular-monolith.md) | Use Modular Monolith Architecture | ✅ Accepted | 2026-03-14 |
| [ADR-002](./adr/ADR-002-shared-database.md) | Shared Database Multi-Tenancy | ✅ Accepted | 2026-03-14 |
| [ADR-003](./adr/ADR-003-postgresql-prisma.md) | PostgreSQL with Prisma ORM | ✅ Accepted | 2026-03-14 |
| [ADR-004](./adr/ADR-004-module-prefixes.md) | Database Table Module Prefixes | ✅ Accepted | 2026-03-14 |
| [ADR-005](./adr/ADR-005-nestjs-backend.md) | NestJS for Backend Framework | ✅ Accepted | 2026-03-14 |
| [ADR-006](./adr/ADR-006-react-vite-frontend.md) | React with Vite for Frontend | ✅ Accepted | 2026-03-14 |
| [ADR-007](./adr/ADR-007-jwt-authentication.md) | JWT-Based Authentication | ✅ Accepted | 2026-03-14 |
| [ADR-008](./adr/ADR-008-row-level-security.md) | PostgreSQL Row-Level Security | ✅ Accepted | 2026-03-14 |
| [ADR-009](./adr/ADR-009-stripe-payments.md) | Stripe for Payment Processing | ✅ Accepted | 2026-03-14 |
| [ADR-010](./adr/ADR-010-redis-caching.md) | Redis for Caching and Sessions | ✅ Accepted | 2026-03-14 |
| [ADR-011](./adr/ADR-011-docker-deployment.md) | Docker for Deployment | ✅ Accepted | 2026-03-14 |
| [ADR-012](./adr/ADR-012-typescript-only.md) | TypeScript Only (No JavaScript) | ✅ Accepted | 2026-03-14 |

---

## ADR PROCESS

### When to Create an ADR

Create an ADR when making decisions about:

1. **Architecture:** Monolith vs microservices, database choice, caching strategy
2. **Technology:** Framework selection, library choices, language decisions
3. **Infrastructure:** Deployment approach, cloud provider, CI/CD tools
4. **Security:** Authentication method, encryption approach, access control
5. **Data:** Database schema, multi-tenancy approach, data partitioning

### ADR Template

Use the template in `adr/TEMPLATE.md` for new ADRs.

### ADR Lifecycle

1. **Proposed** - Decision under consideration
2. **Accepted** - Decision approved and implemented
3. **Deprecated** - Decision no longer recommended (but still in use)
4. **Superseded** - Decision replaced by a new ADR

---

## CATEGORIES

### Architecture
- ADR-001: Modular Monolith
- ADR-002: Shared Database Multi-Tenancy
- ADR-008: Row-Level Security

### Technology Stack
- ADR-003: PostgreSQL with Prisma
- ADR-005: NestJS Backend
- ADR-006: React with Vite Frontend
- ADR-012: TypeScript Only

### Database Design
- ADR-004: Module Prefixes for Tables
- ADR-008: Row-Level Security

### Security
- ADR-007: JWT Authentication
- ADR-008: Row-Level Security

### External Services
- ADR-009: Stripe for Payments
- ADR-010: Redis for Caching

### DevOps
- ADR-011: Docker Deployment

---

## REVIEW SCHEDULE

ADRs should be reviewed:
- **Quarterly:** Check if decisions still valid
- **Before major releases:** Validate architectural choices
- **When problems arise:** Re-evaluate relevant decisions

---

## CONTRIBUTING

To propose a new ADR:

1. Copy `adr/TEMPLATE.md` to `adr/ADR-XXX-title.md`
2. Fill in the template
3. Submit for review
4. Update this index once accepted

---

**Status:** 12 ADRs documented  
**Next Review:** June 2026