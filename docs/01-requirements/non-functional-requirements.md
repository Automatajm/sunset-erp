# NON-FUNCTIONAL REQUIREMENTS - SUNSET ERP

**Document Version:** 1.0  
**Date:** March 2026  
**Author:** Juan Mendoza  
**Status:** Draft

---

## TABLE OF CONTENTS

1. [Overview](#overview)
2. [Performance Requirements](#performance-requirements)
3. [Scalability Requirements](#scalability-requirements)
4. [Security Requirements](#security-requirements)
5. [Reliability & Availability](#reliability--availability)
6. [Usability Requirements](#usability-requirements)
7. [Compliance Requirements](#compliance-requirements)

---

## 1. OVERVIEW

Non-functional requirements define system qualities and constraints for Sunset ERP.

**Priority Levels:**
- P0 (Must Have): Critical for MVP
- P1 (Should Have): Important for production
- P2 (Nice to Have): Future enhancement

---

## 2. PERFORMANCE REQUIREMENTS

**NFR-PERF-001: API Response Time**
- Priority: P0 (Must Have)
- Requirement: 95th percentile < 200ms
- Simple queries: < 50ms
- Complex queries: < 500ms
- Test: Load testing with 100+ concurrent users

**NFR-PERF-002: Page Load Time**
- Priority: P0 (Must Have)
- Requirement: < 2 seconds initial load
- First Contentful Paint: < 1 second
- Lighthouse score: > 85

**NFR-PERF-003: Database Queries**
- Priority: P0 (Must Have)
- Simple SELECT: < 10ms
- Complex JOIN: < 50ms
- Report queries: < 1 second

**NFR-PERF-004: Concurrent Users**
- Priority: P0 (Must Have)
- Normal: 100 concurrent users
- Peak: 500 concurrent users
- Maximum: 1000 concurrent users

---

## 3. SCALABILITY REQUIREMENTS

**NFR-SCALE-001: Horizontal Scaling**
- Priority: P0 (Must Have)
- Stateless API servers
- Can add/remove servers without downtime
- Load balancer distributes traffic

**NFR-SCALE-002: Database Scalability**
- Priority: P0 (Must Have)
- Support 1000+ tenants on shared DB
- Read replicas for reporting
- Table partitioning for large tables

**NFR-SCALE-003: Multi-Tenancy**
- Priority: P0 (Must Have)
- Phase 1: 100 tenants
- Phase 2: 1,000 tenants
- Phase 3: 10,000 tenants (with sharding)

---

## 4. SECURITY REQUIREMENTS

**NFR-SEC-001: Authentication**
- Priority: P0 (Must Have)
- JWT tokens (15min access, 7d refresh)
- Password: bcrypt, min 12 chars
- Failed login lockout: 5 attempts, 15min
- 2FA: Optional (TOTP)

**NFR-SEC-002: Authorization**
- Priority: P0 (Must Have)
- Role-based access control (RBAC)
- Granular permissions per module
- Default deny

**NFR-SEC-003: Data Encryption**
- Priority: P0 (Must Have)
- At rest: AES-256
- In transit: TLS 1.3
- Database connections: SSL

**NFR-SEC-004: Tenant Isolation**
- Priority: P0 (Must Have - CRITICAL)
- Zero cross-tenant data access
- Row-level security in database
- Application-level filtering
- Penetration testing required

**NFR-SEC-005: Audit Logging**
- Priority: P0 (Must Have)
- All security events logged
- Retention: 1 year minimum
- Tamper-proof logs

---

## 5. RELIABILITY & AVAILABILITY

**NFR-REL-001: Uptime SLA**
- Priority: P0 (Must Have)
- 99.9% uptime
- Max downtime: 43.8 minutes/month
- Excludes: Planned maintenance (48hr notice)

**NFR-REL-002: Redundancy**
- Priority: P0 (Must Have)
- Min 2 application server instances
- Database: Primary + replica with auto-failover
- No single point of failure

**NFR-REL-003: Data Backup**
- Priority: P0 (Must Have)
- Daily full, hourly incremental
- Retention: 30 days
- Geographic redundancy
- Monthly restore test

**NFR-REL-004: Disaster Recovery**
- Priority: P0 (Must Have)
- RTO: 4 hours
- RPO: 1 hour
- DR testing: Quarterly

---

## 6. USABILITY REQUIREMENTS

**NFR-USE-001: User Interface**
- Priority: P0 (Must Have)
- NetSuite-inspired design
- Consistent navigation
- Professional appearance
- Data-dense but readable

**NFR-USE-002: Accessibility**
- Priority: P1 (Should Have)
- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader compatible
- Color contrast: >4.5:1

**NFR-USE-003: Browser Support**
- Priority: P0 (Must Have)
- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Min resolution: 1366x768

**NFR-USE-004: Response Feedback**
- Priority: P0 (Must Have)
- Loading indicators for >200ms operations
- Success/error notifications
- Validation errors inline
- Disable buttons during submission

---

## 7. COMPLIANCE REQUIREMENTS

**NFR-COMP-001: GDPR**
- Priority: P0 (Must Have)
- Right to access (data export)
- Right to erasure (anonymization)
- Consent management
- Data breach notification: 72 hours

**NFR-COMP-002: DGII (Dominican Republic)**
- Priority: P0 (Must Have)
- NCF management
- Sequential control
- Electronic invoicing support
- Tax reports (Form 606, 607)

**NFR-COMP-003: Data Retention**
- Priority: P0 (Must Have)
- Financial records: 7 years
- Audit logs: 1 year online, 7 years archive
- Personal data: Delete on request (except legal hold)

**NFR-COMP-004: SOC 2 Readiness**
- Priority: P1 (Should Have)
- Security controls
- Availability: 99.9%
- Processing integrity
- Confidentiality
- Privacy

---

## 8. OPERATIONAL REQUIREMENTS

**NFR-OPS-001: Monitoring**
- Priority: P0 (Must Have)
- Application monitoring (APM)
- Error tracking
- Log aggregation
- Infrastructure monitoring
- Uptime monitoring

**NFR-OPS-002: Support SLAs**
- Priority: P1 (Should Have)
- Free: 48-72 hours
- Basic: 24 hours
- Pro: 12 hours
- Enterprise: 4 hours

**NFR-OPS-003: Documentation**
- Priority: P0 (Must Have)
- User manual
- API documentation (OpenAPI 3.0)
- Video tutorials
- Admin guide

---

## 9. MAINTAINABILITY REQUIREMENTS

**NFR-MAINT-001: Code Quality**
- Priority: P0 (Must Have)
- TypeScript strict mode
- ESLint + Prettier enforced
- Code coverage: 80%+ unit, 70%+ integration
- All code reviewed

**NFR-MAINT-002: Testing**
- Priority: P0 (Must Have)
- Automated tests in CI
- Tests must pass before merge
- Performance tests: Weekly
- Security tests: Every deployment

**NFR-MAINT-003: Deployment**
- Priority: P0 (Must Have)
- CI/CD automated
- Zero-downtime deployments
- Rollback capability
- Deployment time: <10 minutes

---

**Total NFRs:** 35 core requirements  
**Status:** Ready for implementation  

**Next Documents:**
- SaaS Requirements
- User Stories