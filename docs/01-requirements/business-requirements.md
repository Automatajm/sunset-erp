# BUSINESS REQUIREMENTS - SUNSET ERP

**Document Version:** 1.0  
**Date:** March 2026  
**Author:** Juan Mendoza  
**Status:** Draft

---

## 1. EXECUTIVE SUMMARY

### 1.1 Purpose

Sunset ERP is a complete, enterprise-grade, multi-tenant SaaS ERP platform designed to serve manufacturing and distribution companies in the Dominican Republic and Latin America. The system covers the entire business value chain from procurement to distribution, including manufacturing, maintenance, and comprehensive financial reporting.

### 1.2 Business Problem

**Current State:**
- Manufacturing companies rely on fragmented systems (Excel, QuickBooks, standalone MRP)
- No integrated view of operations (procurement, production, inventory, sales, finance)
- Manual data entry and reconciliation between systems
- Limited real-time visibility into operations
- Expensive enterprise ERP solutions (NetSuite, SAP) cost $50K-$500K+ to implement
- Local software providers lack modern, cloud-based solutions

**Pain Points:**
1. Production delays due to poor material planning
2. Inventory inaccuracy (20-30% variance common)
3. Manual financial reporting (takes weeks to close books)
4. No real-time cost visibility
5. Cannot scale operations without adding headcount
6. Compliance challenges (DGII, tax reporting)

**Market Opportunity:**
- 5,000+ manufacturing companies in Dominican Republic
- 50,000+ in Latin America (target expansion markets)
- 80% using fragmented systems
- Market size: $50M+ (DR), $500M+ (LATAM)

### 1.3 Proposed Solution

Complete cloud-based ERP with:
- Full manufacturing capabilities (BOM, production, costing)
- Integrated financial accounting
- Real-time inventory management
- Asset and maintenance management
- Modular licensing (buy only what you need)
- NetSuite-quality UI at 1/10th the price
- Local Dominican Republic support

### 1.4 Scope

**In Scope (Version 1.0):**
- Procurement Management
- Inventory Management (materials, WIP, finished goods)
- Manufacturing (BOM, routing, production orders, costing)
- Sales Management
- Distribution & Logistics
- Asset & Maintenance Management
- Financial Management (GL, AP, AR, reporting)
- Multi-tenant SaaS architecture
- Multi-currency support
- Multi-language (Spanish, English)

**Out of Scope (Future Versions):**
- HR & Payroll (Version 2.0)
- CRM (Version 2.0)
- Advanced Planning & Scheduling (Version 2.0)
- Mobile applications (Version 2.0)
- E-commerce integration (Version 2.0)

---

## 2. BUSINESS OBJECTIVES

### 2.1 Primary Objectives

1. **Replace Fragmented Systems**
   - Eliminate need for Excel + QuickBooks + standalone MRP
   - Single source of truth for all operations

2. **Enable Real-Time Decision Making**
   - Live inventory visibility
   - Real-time production status
   - Current financial position

3. **Reduce Operational Costs**
   - 50% reduction in manual data entry time
   - 30% reduction in inventory carrying costs
   - 40% faster month-end close

4. **Ensure Regulatory Compliance**
   - DGII tax compliance (Dominican Republic)
   - NCF management
   - Electronic invoicing (e-Factura)

5. **Enable Business Scaling**
   - Support growth without proportional headcount increase
   - Multi-company management
   - Multi-currency operations

### 2.2 Success Metrics

| Metric | Current State | Target (12 months) | Measurement |
|--------|--------------|-------------------|-------------|
| Customer Acquisition | 0 | 50+ manufacturing companies | Active subscriptions |
| Monthly Recurring Revenue | $0 | $50,000+ | MRR |
| Customer Retention | N/A | 95%+ | Annual retention rate |
| System Uptime | N/A | 99.9% | Monthly uptime % |
| Data Entry Time | Baseline | -50% | Customer survey |
| Inventory Accuracy | Baseline | 95%+ | Cycle count accuracy |
| Month-End Close Time | Baseline | -40% | Days to close books |
| NPS Score | N/A | 50+ | Customer survey |

---

## 3. STAKEHOLDERS

### 3.1 Primary Stakeholders

**End Users:**
- Production Managers (need: production planning, shop floor control)
- Warehouse Managers (need: inventory control, stock movements)
- Purchasing Managers (need: supplier management, PO processing)
- Sales Managers (need: order management, customer data)
- Financial Controllers (need: accounting, financial reports)
- Maintenance Managers (need: asset management, work orders)

**Decision Makers:**
- CFOs (concern: cost, ROI, compliance)
- COOs (concern: operational efficiency, integration)
- IT Managers (concern: security, uptime, support)

**Administrators:**
- Tenant Administrators (manage users, settings within company)
- SaaS Operators (manage platform, tenants, billing)

### 3.2 Secondary Stakeholders

- Accountants/Auditors (external)
- Regulatory authorities (DGII)
- Third-party integrators (API consumers)
- Support team
- Sales team

---

## 4. MARKET ANALYSIS

### 4.1 Target Market Segments

**Primary: Small-Medium Manufacturers (10-200 employees)**
- Food & beverage production
- Consumer goods manufacturing
- Chemical/pharmaceutical
- Agricultural processing
- Contract manufacturing

**Secondary: Distributors**
- Wholesale distribution
- Import/export companies

**Tertiary: Service Companies**
- Equipment maintenance providers
- Manufacturing service providers

### 4.2 Competitive Landscape

**Direct Competitors:**

1. **NetSuite** (Oracle)
   - Strengths: Complete functionality, mature product
   - Weaknesses: Very expensive ($50K-$500K), complex implementation
   - Our advantage: 1/10th the cost, local support, simpler

2. **SAP Business One**
   - Strengths: Enterprise credibility, comprehensive
   - Weaknesses: Expensive, requires consultants
   - Our advantage: Modern UI, SaaS model, lower cost

3. **Odoo**
   - Strengths: Open source, modular
   - Weaknesses: Requires technical expertise, limited support
   - Our advantage: Better UX, professional support, proven architecture

4. **QuickBooks Online + Add-ons**
   - Strengths: Easy to use, well-known
   - Weaknesses: Not designed for manufacturing, fragmented
   - Our advantage: Integrated manufacturing, purpose-built

**Indirect Competitors:**
- Excel + QuickBooks (current state for many)
- GenPro (local ERP, agriculture-focused)
- Custom-built systems

### 4.3 Competitive Advantages

1. **Cost:** 1/10th price of NetSuite/SAP
2. **Ease of Use:** NetSuite-inspired UI
3. **Local Support:** Dominican Republic-based team
4. **Manufacturing Focus:** Built for manufacturers, not adapted
5. **Modern Technology:** Cloud-native, real-time
6. **Modular Pricing:** Buy only what you need
7. **Multi-Currency:** Built-in from day one
8. **Compliance:** DGII compliance built-in

---

## 5. BUSINESS MODEL

### 5.1 Revenue Model

**Subscription Revenue (90%):**
- Monthly subscriptions by module
- Annual subscriptions (15% discount)
- Module add-ons

**Professional Services (10%):**
- Implementation services
- Training
- Custom reports
- Data migration

### 5.2 Pricing Strategy

**Starter Package** - $49/month
- Target: 1-5 employees
- Basic procurement, inventory, sales, finance

**Manufacturing Package** - $199/month
- Target: 5-50 employees
- Full manufacturing module
- Standard feature set

**Enterprise Package** - $499/month
- Target: 50-200 employees
- All modules
- Advanced features
- Priority support

**Module Add-ons** - $29/month each
- Distribution & Logistics
- Advanced Maintenance
- Additional users ($5/user/month)

**Enterprise Unlimited** - Custom
- 200+ employees
- Dedicated infrastructure
- Custom development
- 24/7 support

### 5.3 Cost Structure

**Development (Year 1):** 60%
- Development team salaries
- Infrastructure (AWS)
- Tools and software

**Sales & Marketing (Year 1):** 20%
- Marketing campaigns
- Sales team
- Demo environment

**Operations (Year 1):** 15%
- Support team
- Customer success
- Infrastructure scaling

**Administrative (Year 1):** 5%
- Legal, accounting
- Office overhead

---

## 6. CONSTRAINTS

### 6.1 Budget Constraints
- Bootstrap/self-funded initially
- Must be profitable by month 18
- Limited marketing budget year 1

### 6.2 Time Constraints
- MVP in 9 months (core manufacturing ERP)
- Complete version in 15 months
- Market pressure to launch quickly

### 6.3 Technical Constraints
- Must run on affordable cloud infrastructure
- Must support 1000+ concurrent users
- Must handle 10,000+ BOMs per tenant
- 99.9% uptime SLA

### 6.4 Regulatory Constraints
- DGII compliance (Dominican Republic)
- GDPR compliance (for EU customers)
- Data residency requirements (some countries)
- Tax reporting requirements

### 6.5 Resource Constraints
- Small initial team (2-3 developers)
- Limited design resources
- No dedicated QA initially

---

## 7. RISKS

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep delays launch | High | High | Strict MVP definition, phase approach |
| Competitors lower prices | Medium | Medium | Focus on superior UX, local support |
| Slow customer adoption | Medium | High | Freemium model, pilot customers |
| Technical scalability issues | Low | High | Load testing, auto-scaling architecture |
| DGII compliance gaps | Medium | High | Work with local accountants, legal review |
| Key developer leaves | Medium | High | Code documentation, knowledge sharing |
| Infrastructure costs exceed budget | Low | Medium | Usage monitoring, cost optimization |
| Data breach/security incident | Low | Critical | Security audit, penetration testing, insurance |

---

## 8. ASSUMPTIONS

1. Target market exists and is willing to pay
2. Cloud-based SaaS is acceptable (not on-premise requirement)
3. Companies will trust startup with business data
4. Dominican Republic internet infrastructure is sufficient
5. NetSuite UI patterns are familiar/desirable to users
6. Modular approach is valued over all-in-one only
7. Multi-currency is essential for market
8. Spanish and English are sufficient languages initially
9. Shared database multi-tenancy is acceptable
10. 9-month MVP timeline is achievable

---

## 9. DEPENDENCIES

### 9.1 External Dependencies
- Stripe for payment processing
- AWS/cloud provider for infrastructure
- Email service provider (SendGrid)
- SSL certificate provider
- Domain registrar

### 9.2 Internal Dependencies
- Complete Phase 2 (Design) before development
- Database schema finalized before coding
- API specification complete before frontend
- Seed data for testing/demos

### 9.3 Third-Party Dependencies
- No critical third-party integrations for MVP
- Optional: Accounting software export (future)
- Optional: E-commerce integration (future)

---

## 10. APPROVAL

**Document Status:** Draft - Pending Review

**Approvals Required:**
- [ ] Business Owner: Juan Mendoza
- [ ] Technical Lead: [TBD]
- [ ] Financial Advisor: [TBD]

**Review Date:** [TBD]  
**Approval Date:** [TBD]

---

**Next Document:** Functional Requirements  
**Location:** `docs/01-requirements/functional-requirements.md`
