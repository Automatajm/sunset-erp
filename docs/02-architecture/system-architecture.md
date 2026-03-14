# SYSTEM ARCHITECTURE - SUNSET ERP

**Document Version:** 1.0  
**Date:** March 2026  
**Author:** Juan Mendoza  
**Status:** Draft

---

## TABLE OF CONTENTS

1. [Overview](#overview)
2. [Architecture Principles](#architecture-principles)
3. [High-Level Architecture](#high-level-architecture)
4. [SaaS Multi-Tenancy Architecture](#saas-multi-tenancy-architecture)
5. [Module Structure](#module-structure)
6. [Database Naming Convention](#database-naming-convention)
7. [Technology Stack](#technology-stack)
8. [Deployment Architecture](#deployment-architecture)
9. [Scalability Strategy](#scalability-strategy)
10. [Security Architecture](#security-architecture)

---

## 1. OVERVIEW

Sunset ERP is a multi-tenant SaaS ERP platform built with a shared database architecture, designed to scale from 100 to 10,000+ tenants.

**Architecture Style:** Modular Monolith (MVP), Microservices-ready  
**Multi-Tenancy Model:** Shared Database with Row-Level Security  
**Deployment:** Containerized (Docker) on cloud infrastructure

---

## 2. ARCHITECTURE PRINCIPLES

### 2.1 Design Principles

**SOLID Principles:**
- Single Responsibility: Each module has one clear purpose
- Open/Closed: Open for extension, closed for modification
- Liskov Substitution: Interfaces and abstract classes properly used
- Interface Segregation: Small, focused interfaces
- Dependency Inversion: Depend on abstractions, not concretions

**Clean Architecture:**
- Business logic independent of frameworks
- Testable without UI, database, or external services
- Independent of database (can swap PostgreSQL for another DB)

**DRY (Don't Repeat Yourself):**
- Shared logic in common modules
- Reusable components and utilities

**KISS (Keep It Simple):**
- Avoid over-engineering
- Start simple, add complexity when needed

### 2.2 Architectural Decisions

**Why Modular Monolith (not Microservices for MVP)?**
- Faster development (no distributed system complexity)
- Easier deployment and operations
- Single database (ACID guarantees, no distributed transactions)
- Can extract modules to microservices later if needed

**Why Shared Database (not Database per Tenant)?**
- Lower infrastructure cost (1 DB vs 1000+ DBs)
- Simpler maintenance and backups
- Easier migrations and schema updates
- Industry standard (NetSuite, Salesforce, Odoo use this)
- Can shard later when needed (10,000+ tenants)

**Why NestJS?**
- TypeScript-first (type safety)
- Modular structure built-in
- Dependency injection
- Excellent documentation
- Large ecosystem

**Why Prisma?**
- Type-safe database access
- Great TypeScript integration
- Automatic migrations
- Schema-first approach
- Good performance

**Why PostgreSQL?**
- ACID compliant
- Row-level security (perfect for multi-tenancy)
- JSON support (flexible data)
- Excellent performance
- Open source, no licensing costs

---

## 3. HIGH-LEVEL ARCHITECTURE

### 3.1 System Context Diagram (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL SYSTEMS                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Email     │  │   Payment    │  │   SMS/SMS    │      │
│  │   Service    │  │   Gateway    │  │   Provider   │      │
│  │  (SendGrid)  │  │   (Stripe)   │  │   (Twilio)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS/REST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         USERS                                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   End Users  │  │    Tenant    │  │    SaaS      │      │
│  │ (Employees)  │  │    Admins    │  │  Operators   │      │
│  │              │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   SUNSET ERP SYSTEM                          │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    FRONTEND                             │ │
│  │  React SPA (Vite, TypeScript, Tailwind)                │ │
│  │  - Authentication UI                                    │ │
│  │  - Business Modules UI                                  │ │
│  │  - Dashboards & Reports                                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                              ▲                                │
│                              │ REST API                       │
│                              ▼                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    BACKEND                              │ │
│  │  NestJS API (TypeScript)                                │ │
│  │  - Authentication & Authorization                       │ │
│  │  - Business Logic (Modules)                             │ │
│  │  - Data Access (Prisma ORM)                             │ │
│  └────────────────────────────────────────────────────────┘ │
│                              ▲                                │
│                              │                                │
│                              ▼                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                DATA LAYER                               │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │  PostgreSQL  │  │    Redis     │  │      S3      │ │ │
│  │  │   (Primary)  │  │   (Cache +   │  │     (File    │ │ │
│  │  │              │  │   Sessions)  │  │    Storage)  │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────┐
│                    WEB BROWSER                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  React SPA (Single Page Application)                  │   │
│  │  - Vite (build tool)                                   │   │
│  │  - React Router (routing)                              │   │
│  │  - React Query (state management)                      │   │
│  │  - Tailwind CSS (styling)                              │   │
│  │  - react-i18next (internationalization)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS/REST
                              │ JSON
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API GATEWAY                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  NGINX / AWS ALB                                       │   │
│  │  - SSL Termination                                     │   │
│  │  - Load Balancing                                      │   │
│  │  - Rate Limiting                                       │   │
│  │  - Request Routing                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              NESTJS APPLICATION SERVER                       │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Core Modules                                          │   │
│  │  - auth.module (Authentication)                        │   │
│  │  - tenants.module (Tenant Management)                  │   │
│  │  - billing.module (Subscriptions & Billing)            │   │
│  │  - users.module (User Management)                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Business Modules                                      │   │
│  │  - procurement.module (po_* tables)                    │   │
│  │  - inventory.module (in_* tables)                      │   │
│  │  - manufacturing.module (mfg_* tables)                 │   │
│  │  - sales.module (so_* tables)                          │   │
│  │  - financial.module (fn_* tables)                      │   │
│  │  - accounting.module (ac_* tables)                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Common Services                                       │   │
│  │  - logger.service                                      │   │
│  │  - cache.service (Redis)                               │   │
│  │  - email.service (SendGrid)                            │   │
│  │  - storage.service (S3)                                │   │
│  │  - i18n.service (Translations)                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Middleware & Guards                                   │   │
│  │  - tenant.middleware (Set tenant context)              │   │
│  │  - auth.guard (JWT validation)                         │   │
│  │  - permissions.guard (RBAC)                            │   │
│  │  - rate-limit.guard                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Data Access Layer                                     │   │
│  │  - Prisma Client (ORM)                                 │   │
│  │  - Global tenant scope                                 │   │
│  │  - Connection pooling                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  PERSISTENCE LAYER                           │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  PostgreSQL  │  │    Redis     │  │      S3      │      │
│  │              │  │              │  │              │      │
│  │  - saas_*    │  │  - Sessions  │  │  - Uploads   │      │
│  │  - auth_*    │  │  - Cache     │  │  - Exports   │      │
│  │  - po_*      │  │  - Queues    │  │  - Reports   │      │
│  │  - in_*      │  │  - Locks     │  │  - Logos     │      │
│  │  - mfg_*     │  │              │  │              │      │
│  │  - so_*      │  │              │  │              │      │
│  │  - ac_*      │  │              │  │              │      │
│  │  - fn_*      │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. SAAS MULTI-TENANCY ARCHITECTURE

### 4.1 Shared Database with Row-Level Security

```
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                         │
│                                                               │
│  Schema: public (shared by all tenants)                      │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Tenant-Agnostic Tables (no tenant_id)               │   │
│  │  - saas_tenants                                       │   │
│  │  - auth_users                                         │   │
│  │  - auth_permissions                                   │   │
│  │  - mc_currencies (multi-currency)                     │   │
│  │  - i18n_languages                                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Tenant-Specific Tables (with tenant_id)             │   │
│  │                                                       │   │
│  │  Every row has: tenant_id UUID                        │   │
│  │                                                       │   │
│  │  Procurement:                                         │   │
│  │  - po_suppliers(tenant_id, ...)                       │   │
│  │  - po_purchase_orders(tenant_id, ...)                 │   │
│  │                                                       │   │
│  │  Inventory:                                           │   │
│  │  - in_items(tenant_id, ...)                           │   │
│  │  - in_warehouses(tenant_id, ...)                      │   │
│  │  - in_stock(tenant_id, ...)                           │   │
│  │                                                       │   │
│  │  Sales:                                               │   │
│  │  - so_customers(tenant_id, ...)                       │   │
│  │  - so_sales_orders(tenant_id, ...)                    │   │
│  │                                                       │   │
│  │  [All other business modules...]                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Row-Level Security (RLS)                             │   │
│  │                                                       │   │
│  │  ALTER TABLE po_suppliers ENABLE ROW LEVEL SECURITY; │   │
│  │                                                       │   │
│  │  CREATE POLICY tenant_isolation ON po_suppliers      │   │
│  │    USING (tenant_id =                                 │   │
│  │      current_setting('app.tenant_id')::UUID);        │   │
│  │                                                       │   │
│  │  [Policy applied to all tenant tables]                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Indexes (Performance)                                │   │
│  │                                                       │   │
│  │  Every tenant table has composite index:             │   │
│  │  idx_[table]_tenant_[column]                          │   │
│  │                                                       │   │
│  │  Example:                                             │   │
│  │  CREATE INDEX idx_po_suppliers_tenant_code           │   │
│  │    ON po_suppliers(tenant_id, code);                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Tenant Context Flow

```
1. User Login
   ↓
2. JWT Generated (contains user_id)
   ↓
3. User Selects Tenant (from available tenants)
   ↓
4. New JWT Generated (contains user_id + tenant_id)
   ↓
5. All Subsequent Requests
   ↓
6. Middleware Extracts tenant_id from JWT
   ↓
7. Set PostgreSQL Session Variable:
   SET app.tenant_id = 'uuid-from-jwt'
   ↓
8. Prisma Query (auto-scoped by middleware)
   ↓
9. PostgreSQL RLS Validates tenant_id
   ↓
10. Return Data (only for this tenant)
```

### 4.3 Tenant Isolation Layers (Defense in Depth)

**Layer 1: Application Level**
- Middleware sets tenant context from JWT
- Prisma global scope filters all queries by tenant_id
- Never accept tenant_id from user input

**Layer 2: Database Level**
- Row-level security policies
- Every query validated by PostgreSQL
- Cross-tenant access physically impossible

**Layer 3: Testing Level**
- Automated tests attempt cross-tenant access
- Penetration testing
- Security audits

---

## 5. MODULE STRUCTURE

### 5.1 NestJS Module Organization

```
backend/src/
├── app.module.ts
├── main.ts
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── middleware/
│   └── utils/
├── config/
│   ├── database.config.ts
│   ├── redis.config.ts
│   └── app.config.ts
├── database/
│   └── prisma.service.ts
└── modules/
    ├── auth/
    │   ├── auth.module.ts
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   ├── guards/
    │   └── strategies/
    ├── tenants/
    │   ├── tenants.module.ts
    │   ├── tenants.controller.ts
    │   ├── tenants.service.ts
    │   └── dto/
    ├── billing/
    │   ├── billing.module.ts
    │   ├── billing.controller.ts
    │   ├── billing.service.ts
    │   └── dto/
    ├── procurement/
    │   ├── procurement.module.ts
    │   ├── suppliers/
    │   │   ├── suppliers.controller.ts
    │   │   ├── suppliers.service.ts
    │   │   └── dto/
    │   └── purchase-orders/
    │       ├── purchase-orders.controller.ts
    │       ├── purchase-orders.service.ts
    │       └── dto/
    ├── inventory/
    │   ├── inventory.module.ts
    │   ├── items/
    │   ├── warehouses/
    │   ├── stock/
    │   └── movements/
    ├── manufacturing/
    │   ├── manufacturing.module.ts
    │   ├── boms/
    │   ├── work-centers/
    │   └── production-orders/
    ├── sales/
    │   ├── sales.module.ts
    │   ├── customers/
    │   └── sales-orders/
    ├── accounting/
    │   ├── accounting.module.ts
    │   └── [ac_* tables]
    └── financial/
        ├── financial.module.ts
        └── [fn_* tables]
```

---

## 6. DATABASE NAMING CONVENTION

### 6.1 Module Prefix Standard

**Prefixes by Module:**

| Module | Prefix | Example Tables |
|--------|--------|----------------|
| SaaS Core | `saas_` | `saas_tenants`, `saas_subscriptions`, `saas_usage_records` |
| Authentication | `auth_` | `auth_users`, `auth_roles`, `auth_permissions`, `auth_user_roles` |
| Multi-Currency | `mc_` | `mc_currencies`, `mc_exchange_rates` |
| Internationalization | `i18n_` | `i18n_languages`, `i18n_translations` |
| Procurement | `po_` | `po_suppliers`, `po_purchase_orders`, `po_po_lines`, `po_receipts` |
| Inventory | `in_` | `in_items`, `in_warehouses`, `in_stock`, `in_movements` |
| Manufacturing | `mfg_` | `mfg_boms`, `mfg_bom_components`, `mfg_work_centers`, `mfg_production_orders` |
| Sales Orders | `so_` | `so_customers`, `so_sales_orders`, `so_so_lines`, `so_deliveries` |
| Accounting | `ac_` | `ac_accounts`, `ac_journal_entries`, `ac_je_lines` |
| Finance | `fn_` | `fn_ap_invoices`, `fn_ar_invoices`, `fn_payments` |
| Distribution | `dist_` | `dist_routes`, `dist_vehicles`, `dist_deliveries` |
| Maintenance | `maint_` | `maint_assets`, `maint_work_orders`, `maint_equipment` |
| Reporting | `rpt_` | `rpt_dashboards`, `rpt_saved_searches` |

### 6.2 Benefits

1. **Visual Organization:** Immediately know which module owns the table
2. **Team Collaboration:** Frontend/backend devs know table ownership
3. **Database Navigation:** 150+ tables organized logically
4. **Permissions:** Easier to grant module-specific database permissions
5. **Documentation:** Auto-generate docs per module
6. **Migration Management:** Group migrations by module
7. **Debugging:** Quickly identify which module has issues

### 6.3 Naming Rules

**Tables:**
- Format: `{prefix}_{plural_name}`
- Example: `po_suppliers`, `in_items`, `mfg_boms`
- All lowercase
- Snake_case

**Columns:**
- Format: `{singular_name}`
- Example: `supplier_id`, `item_code`, `created_at`
- All lowercase
- Snake_case

**Indexes:**
- Format: `idx_{table}_{columns}`
- Example: `idx_po_suppliers_tenant_code`

**Constraints:**
- Unique: `uq_{table}_{columns}`
- Check: `chk_{table}_{description}`
- Foreign Key: `fk_{source_table}_{target_table}`

---

## 7. TECHNOLOGY STACK

### 7.1 Backend Stack

**Runtime & Framework:**
- Node.js 20 LTS
- NestJS 10+
- TypeScript 5+

**Database & ORM:**
- PostgreSQL 15+
- Prisma 5+ (ORM)
- PgBouncer (connection pooling)

**Caching & Sessions:**
- Redis 7+
- Bull (job queues)

**Authentication:**
- Passport.js
- JWT (jsonwebtoken)
- bcrypt (password hashing)

**Validation:**
- class-validator
- class-transformer

**Testing:**
- Jest (unit & integration)
- Supertest (E2E)

### 7.2 Frontend Stack

**Framework & Build:**
- React 18+
- Vite 5+
- TypeScript 5+

**Styling:**
- Tailwind CSS 3+
- HeadlessUI (accessible components)

**State Management:**
- React Query (server state)
- Zustand (client state)

**Routing:**
- React Router 6+

**Internationalization:**
- react-i18next

**Forms:**
- React Hook Form
- Zod (validation)

**Testing:**
- Vitest
- React Testing Library

### 7.3 DevOps Stack

**CI/CD:**
- Jenkins
- GitHub Actions (alternative)

**Containerization:**
- Docker
- Docker Compose (local development)

**Version Control:**
- Git
- GitHub

**Code Quality:**
- ESLint + Prettier
- SonarQube
- Husky (pre-commit hooks)

**API Documentation:**
- Swagger / OpenAPI 3.0

---

## 8. DEPLOYMENT ARCHITECTURE

### 8.1 Production Environment

```
┌─────────────────────────────────────────────────────────────┐
│                      CLOUDFLARE CDN                          │
│  - DDoS Protection                                           │
│  - SSL/TLS Termination                                       │
│  - Static Asset Caching                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   LOAD BALANCER (NGINX)                      │
│  - Round Robin                                               │
│  - Health Checks                                             │
│  - SSL Termination (if not Cloudflare)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
        ┌───────────┐  ┌───────────┐  ┌───────────┐
        │  App      │  │  App      │  │  App      │
        │  Server 1 │  │  Server 2 │  │  Server N │
        │ (NestJS)  │  │ (NestJS)  │  │ (NestJS)  │
        └───────────┘  └───────────┘  └───────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         POSTGRESQL CLUSTER              │
        │  ┌────────────┐    ┌────────────┐       │
        │  │  Primary   │───>│  Replica 1 │       │
        │  │  (Write)   │    │   (Read)   │       │
        │  └────────────┘    └────────────┘       │
        │         │                                │
        │         └──────>┌────────────┐          │
        │                 │  Replica 2 │          │
        │                 │   (Read)   │          │
        │                 └────────────┘          │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         REDIS CLUSTER                    │
        │  - Cache                                 │
        │  - Sessions                              │
        │  - Job Queue                             │
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         S3 STORAGE                       │
        │  - File Uploads                          │
        │  - Report Exports                        │
        │  - Backups                               │
        └─────────────────────────────────────────┘
```

### 8.2 Environment Strategy

**Local Development:**
- Docker Compose
- PostgreSQL (single instance)
- Redis (single instance)
- Hot reload enabled

**Staging:**
- Identical to production (smaller instances)
- Anonymized production data
- Testing ground for releases

**Production:**
- Multi-server deployment
- Database replication
- Auto-scaling enabled
- Monitoring & alerting

---

## 9. SCALABILITY STRATEGY

### 9.1 Scaling Phases

**Phase 1: 0-1,000 Tenants**
- Single PostgreSQL instance (vertical scaling)
- 2+ application servers (horizontal)
- Read replicas for reports

**Phase 2: 1,000-10,000 Tenants**
- Database sharding by tenant ranges
- Separate database for large tenants
- Cache optimization

**Phase 3: 10,000+ Tenants**
- Geographic distribution
- Microservices extraction (if needed)
- Dedicated infrastructure per enterprise customer

### 9.2 Performance Optimization

**Database:**
- Connection pooling (PgBouncer)
- Query optimization
- Composite indexes (tenant_id first)
- Table partitioning (for large tables)

**Caching:**
- Redis for frequently accessed data
- Session storage
- Query result caching

**Application:**
- Stateless servers (easy horizontal scaling)
- Async processing (Bull queues)
- Lazy loading

---

## 10. SECURITY ARCHITECTURE

### 10.1 Security Layers

**Transport Security:**
- HTTPS only (TLS 1.3)
- HSTS headers
- Certificate management (Let's Encrypt)

**Authentication:**
- JWT tokens (access + refresh)
- Password hashing (bcrypt, cost 12)
- 2FA support (TOTP)

**Authorization:**
- Role-based access control (RBAC)
- Permission system
- Tenant isolation

**Data Security:**
- Encryption at rest (AES-256)
- Row-level security (PostgreSQL)
- Sensitive field encryption

**API Security:**
- Rate limiting (per user/tenant)
- Request validation
- CORS configuration
- CSRF protection

**Monitoring:**
- Security audit logs
- Failed login tracking
- Intrusion detection
- Vulnerability scanning

---

**Document Status:** Complete  
**Next:** Create database naming standard document and Prisma schema

---

**Related Documents:**
- Database Schema Design
- API Specification
- Deployment Guide