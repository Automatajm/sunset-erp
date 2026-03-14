# SAAS REQUIREMENTS - SUNSET ERP

**Document Version:** 1.0  
**Date:** March 2026  
**Author:** Juan Mendoza  
**Status:** Draft

---

## TABLE OF CONTENTS

1. [Overview](#overview)
2. [Tenant Management](#tenant-management)
3. [Subscription & Billing](#subscription--billing)
4. [Usage Metering & Limits](#usage-metering--limits)
5. [Tenant Onboarding](#tenant-onboarding)
6. [Admin Portal](#admin-portal)
7. [Multi-Tenancy Technical Requirements](#multi-tenancy-technical-requirements)

---

## 1. OVERVIEW

This document defines SaaS-specific requirements for Sunset ERP as a multi-tenant cloud platform.

**SaaS Model:** Shared database, row-level security, subscription-based pricing

---

## 2. TENANT MANAGEMENT

### 2.1 Tenant Registration

**SAAS-TENANT-001: Self-Service Registration**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: New tenants can register without sales contact
- Requirements:
  - Public registration page
  - Email verification required
  - Company information collected:
    - Company name
    - Tax ID (RNC for Dominican Republic)
    - Country
    - Industry
    - Company size (employees)
  - Admin user created automatically
  - Free trial starts immediately (14 days)
  - No credit card required for trial
- Business Rules:
  - Email must be unique (not already registered)
  - Company name generates subdomain (companyname.sunset-erp.com)
  - Subdomain must be unique
  - Trial converts to Free plan after 14 days
- Success Criteria: User can start using system in <30 seconds

**SAAS-TENANT-002: Email Verification**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Verify email before full access
- Requirements:
  - Verification email sent on registration
  - Link expires in 24 hours
  - Resend verification option
  - Account limited until verified (can view but not create)
- Business Rules:
  - Cannot add users until email verified
  - Cannot upgrade to paid plan until verified

**SAAS-TENANT-003: Tenant Profile**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Tenant settings and configuration
- Requirements:
  - Company name, logo, colors (branding)
  - Contact information
  - Billing contact (separate from admin)
  - Default currency
  - Default language
  - Fiscal year settings
  - Tax settings (for invoicing)
  - Subdomain (can change once)
- Access: Tenant admin only

**SAAS-TENANT-004: Subdomain Management**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Custom subdomain for tenant
- Requirements:
  - Auto-generated from company name initially
  - Format: companyname.sunset-erp.com
  - Can customize (lowercase, alphanumeric, hyphens)
  - Uniqueness enforced
  - Change allowed once (with 7-day grace period)
  - SSL certificate auto-generated
- Business Rules:
  - 3-50 characters
  - Cannot use reserved names (admin, api, www, etc.)

**SAAS-TENANT-005: Tenant Suspension**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Temporarily disable tenant
- Reasons:
  - Payment failure (after retry period)
  - Terms of service violation
  - Security issue
  - Tenant request
- When suspended:
  - Users cannot login
  - API access disabled
  - Data retained (not deleted)
  - Billing continues (unless requested cancellation)
  - Email sent to tenant admin
- Reactivation:
  - Payment issue resolved
  - Violation resolved
  - Admin approval
- Success Criteria: Suspend/reactivate without data loss

**SAAS-TENANT-006: Tenant Cancellation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Permanently close tenant account
- Requirements:
  - Tenant admin can request cancellation
  - Confirmation required (type company name)
  - Data export offered before cancellation
  - Cancellation effective at end of billing period
  - Data retained for 30 days (recovery period)
  - After 30 days: Data anonymized/deleted (GDPR)
  - Cancellation cannot be undone after 30 days
- Business Rules:
  - Prorated refund if annual plan
  - No refund if monthly plan
  - Outstanding invoices must be paid

---

## 3. SUBSCRIPTION & BILLING

### 3.1 Subscription Plans

**SAAS-BILL-001: Subscription Plan Definition**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Define and manage subscription tiers
- Plans:

**Free Plan:**
- Price: $0/month
- 1 company
- 2 users
- 100 items
- 50 transactions/month
- 1GB storage
- Community support (forum)
- Sunset branding on invoices

**Basic Plan:**
- Price: $49/month or $490/year (2 months free)
- 1 company
- 5 users
- 1,000 items
- 500 transactions/month
- 10GB storage
- Email support (24hr response)
- Remove Sunset branding

**Pro Plan:**
- Price: $199/month or $1,990/year
- 3 companies
- 20 users
- 10,000 items
- 5,000 transactions/month
- 50GB storage
- Priority email support (12hr response)
- API access
- Advanced reports

**Enterprise Plan:**
- Price: Custom (starts at $499/month)
- Unlimited companies, users, items, transactions
- 500GB storage
- Dedicated support (4hr response, 24/7)
- SLA guarantee (99.9%)
- Custom features
- Dedicated account manager
- Optional: Dedicated infrastructure

**SAAS-BILL-002: Plan Upgrades**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Users can upgrade their plan
- Requirements:
  - Self-service upgrade (credit card required)
  - Immediate access to new limits
  - Prorated billing:
    - If monthly: Charge difference for remaining days
    - If annual: Charge difference for remaining months
  - Email confirmation of upgrade
  - Upgrade history tracked
- Business Rules:
  - Can upgrade anytime
  - New plan effective immediately
  - Cannot downgrade mid-period (must wait until renewal)

**SAAS-BILL-003: Plan Downgrades**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Users can downgrade their plan
- Requirements:
  - Scheduled for next billing period (not immediate)
  - Warning if exceeding new limits
  - Must reduce usage before downgrade effective
  - Email confirmation
- Business Rules:
  - Cannot downgrade if currently exceeding new limits
  - Must delete data or upgrade to higher plan
  - Example: Pro plan with 15 users cannot downgrade to Basic (5 users)

**SAAS-BILL-004: Add-Ons**
- Priority: P2 (Nice to Have)
- Phase: V1.0
- Description: Purchase additional capacity
- Add-ons:
  - Additional users: $5/user/month
  - Additional storage: $10/10GB/month
  - Additional companies: $20/company/month
  - SMS notifications: $0.05/SMS
- Business Rules:
  - Add-ons billed monthly
  - Can add/remove anytime
  - Prorated billing

### 3.2 Payment Processing

**SAAS-BILL-010: Payment Methods**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Accept payments for subscriptions
- Payment methods:
  - Credit card (Visa, Mastercard, Amex)
  - Debit card
  - Bank transfer (Enterprise plan only)
- Technology: Stripe
- Requirements:
  - Card information stored in Stripe (PCI compliant)
  - Tokenization (no card numbers in our database)
  - 3D Secure support (for fraud prevention)
  - Multiple cards allowed (backup payment method)
  - Primary card designation
- Business Rules:
  - Card charged on subscription date
  - Retry failed payments (3 attempts over 7 days)
  - Suspend account if all retries fail

**SAAS-BILL-011: Invoicing**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Generate invoices for subscriptions
- Requirements:
  - Invoice generated on billing date
  - Invoice number (sequential)
  - Invoice includes:
    - Subscription plan and period
    - Add-ons (if any)
    - Subtotal, tax, total
    - Payment method (last 4 digits)
    - Billing address
  - Invoice PDF downloadable
  - Invoice emailed to billing contact
  - Invoice history available
  - Tax calculation (based on billing country)
- Business Rules:
  - Invoice due immediately
  - Late payment fee after 7 days (configurable)
  - NCF for Dominican Republic customers

**SAAS-BILL-012: Tax Calculation**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Calculate applicable taxes
- Requirements:
  - Tax rate based on billing country
  - Dominican Republic: 18% ITBIS
  - US: State sales tax (if applicable)
  - EU: VAT (if applicable)
  - Tax-exempt for business customers (with valid tax ID)
  - Tax line item on invoice
- Technology: Stripe Tax or manual configuration
- Business Rules:
  - Tax inclusive or exclusive (configurable)
  - Tax ID validation

**SAAS-BILL-013: Payment Retry Logic**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Handle failed payments
- Retry schedule:
  - Day 0: Initial payment attempt
  - Day 3: First retry
  - Day 5: Second retry
  - Day 7: Third retry (final)
  - Day 8: Suspend account
- Notifications:
  - Email after each failed attempt
  - Final warning before suspension
  - Update payment method link in email
- Business Rules:
  - Different card can be tried anytime
  - Account unsuspended immediately on successful payment
  - Reinstate access to full plan

**SAAS-BILL-014: Refund Policy**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Handle refunds
- Policy:
  - Monthly plans: No refunds (cancel anytime)
  - Annual plans: Prorated refund if cancelled mid-year
  - 30-day money-back guarantee (if dissatisfied)
- Refund process:
  - Tenant requests refund
  - Admin reviews and approves
  - Refund processed via Stripe (5-10 business days)
  - Account downgraded or cancelled
- Business Rules:
  - Refund only to original payment method
  - Refund history tracked

### 3.3 Billing Management

**SAAS-BILL-020: Billing Portal**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Self-service billing management
- Features:
  - Current plan and usage
  - Upgrade/downgrade plan
  - Update payment method
  - View invoice history
  - Download invoices
  - Update billing address
  - Cancel subscription
- Access: Tenant admin only
- Technology: Embedded Stripe billing portal or custom

**SAAS-BILL-021: Usage Dashboard**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Show current usage vs limits
- Metrics displayed:
  - Users: 5 of 5 (100%)
  - Items: 237 of 1,000 (24%)
  - Storage: 2.3GB of 10GB (23%)
  - Transactions: 142 of 500 this month (28%)
- Visualization:
  - Progress bars
  - Color coding (green, yellow, red)
  - Alert at 80%, 90%, 100%
- Business Rules:
  - Updated real-time
  - Historical usage trends (last 6 months)

**SAAS-BILL-022: Billing Notifications**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Email notifications for billing events
- Notifications:
  - Payment successful (invoice attached)
  - Payment failed (retry scheduled)
  - Approaching usage limits (80%, 90%, 100%)
  - Plan upgraded/downgraded
  - Subscription cancelled
  - Refund processed
- Recipients: Billing contact (and tenant admin if different)
- Frequency: Immediate for critical, daily digest for non-critical

---

## 4. USAGE METERING & LIMITS

**SAAS-METER-001: User Count Metering**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Track active users
- Metric: Number of enabled user accounts
- Enforcement:
  - Cannot add user if at limit
  - Upgrade prompt when at limit
  - Disabled users don't count toward limit
- Measurement: Database query (count active users)

**SAAS-METER-002: Storage Metering**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Track storage usage
- Metric: Total file storage (GB)
- Includes:
  - Uploaded files (invoices, photos, attachments)
  - Database size (per tenant)
- Enforcement:
  - Cannot upload if at limit
  - Warning at 80%, 90%
  - Blocked at 100%
- Measurement: S3 bucket size + database size per tenant

**SAAS-METER-003: Transaction Count Metering**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Track monthly transactions
- Metric: Number of transactions per month
- Counts as transaction:
  - Invoice created
  - Purchase order created
  - Stock movement
  - Journal entry
  - (Other significant business events)
- Enforcement:
  - Soft limit (warning but allow)
  - Overage fee or upgrade prompt
- Measurement: Database query (count transactions this month)
- Reset: Monthly on subscription anniversary

**SAAS-METER-004: Item Count Metering**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Track number of items (products)
- Metric: Total active items in inventory
- Enforcement:
  - Cannot create item if at limit
  - Upgrade prompt
- Measurement: Database query (count active items)

**SAAS-METER-005: Company Count Metering**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track number of companies (multi-company)
- Metric: Number of active companies per tenant
- Enforcement:
  - Cannot add company if at limit
  - Only Pro and Enterprise plans support multiple companies
- Measurement: Database query

**SAAS-METER-006: API Call Metering**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Track API usage
- Metric: API calls per month
- Limits:
  - Free: No API access
  - Basic: No API access
  - Pro: 10,000 calls/month
  - Enterprise: Unlimited (or 100,000/month)
- Enforcement:
  - 429 error when limit exceeded
  - Overage fee ($0.001 per extra call)
- Measurement: Redis counter per tenant

**SAAS-METER-007: Limit Enforcement**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Enforce subscription limits
- Hard limits (blocked):
  - User count
  - Storage
  - Item count
  - Company count
- Soft limits (warning only):
  - Transaction count
  - API calls (then overage fee)
- User experience:
  - Clear error message
  - Upgrade path presented
  - Contact sales (for Enterprise)

---

## 5. TENANT ONBOARDING

**SAAS-ONBOARD-001: Welcome Email**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Email sent immediately after registration
- Content:
  - Welcome message
  - Getting started guide link
  - Login URL (subdomain)
  - Admin username and email
  - Password reset link (if needed)
  - Trial expiration date
  - Support contact
- Language: Based on selected language during registration

**SAAS-ONBOARD-002: Guided Setup Wizard**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: First-time setup assistant
- Steps:
  1. Company profile (name, address, currency)
  2. Fiscal year setup
  3. Chart of accounts (select template or import)
  4. Add first users (optional)
  5. Add first items (optional)
  6. Sample data option (demo data for exploration)
- Progress: Step indicator (1 of 6)
- Skip option: Can complete later
- Success: Dashboard shown with "Getting Started" checklist

**SAAS-ONBOARD-003: Sample Data**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Optional demo data for exploration
- Data included:
  - 10 customers
  - 10 suppliers
  - 20 items
  - 5 sales orders
  - 5 purchase orders
  - Sample chart of accounts
- Business Rules:
  - Clearly marked as "SAMPLE"
  - Easy to delete all sample data
  - Option offered during setup wizard
  - Cannot use sample data in production (warning)

**SAAS-ONBOARD-004: Getting Started Checklist**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Help new users get productive quickly
- Checklist items:
  - Complete company profile
  - Add chart of accounts
  - Create first customer
  - Create first item
  - Create first sales order
  - Invite team members
  - Set up taxes
- Progress: Shown on dashboard
- Dismissible: Can hide once complete

**SAAS-ONBOARD-005: Trial to Paid Conversion**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Convert trial to paid subscription
- Process:
  - Trial expires after 14 days
  - 3 days before expiry: Email reminder
  - 1 day before expiry: Final reminder
  - On expiry: Account moves to Free plan (if no upgrade)
  - Upgrade anytime during trial
- Free plan limitations:
  - 2 users (must disable extras)
  - 100 items (must delete extras or upgrade)
  - No new transactions until compliance
- User experience:
  - Upgrade prompt in app
  - One-click upgrade to Basic/Pro

---

## 6. ADMIN PORTAL

**SAAS-ADMIN-001: SaaS Operator Dashboard**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Internal admin portal for SaaS operators
- Metrics displayed:
  - Total tenants (active, trial, suspended, cancelled)
  - Total users
  - Revenue (MRR, ARR)
  - Churn rate
  - New signups (today, this week, this month)
  - Failed payments
  - Storage usage (total)
  - Top tenants by usage
- Access: SaaS admin only (not tenant admins)

**SAAS-ADMIN-002: Tenant Management (Admin)**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Admin can manage any tenant
- Actions:
  - View tenant details
  - View usage and limits
  - Suspend/unsuspend tenant
  - Cancel tenant
  - Change plan (manual override)
  - Adjust limits (exception basis)
  - View tenant activity logs
  - Impersonate user (for support) with consent
- Access: SaaS super admin only
- Audit: All admin actions logged

**SAAS-ADMIN-003: Support Ticket Management**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Manage customer support tickets
- Features:
  - Ticket list (all tenants)
  - Ticket details (conversation history)
  - Assign to support agent
  - Change priority/status
  - Internal notes
  - Merge duplicate tickets
  - Canned responses
- Integration: Email (support@sunset-erp.com)
- Technology: Zendesk, Freshdesk, or custom

**SAAS-ADMIN-004: Feature Flags**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: Enable/disable features per tenant
- Use cases:
  - Beta feature testing (enable for specific tenants)
  - Gradual rollout (enable for 10%, 50%, 100%)
  - Emergency disable (if feature has bug)
  - Custom features (Enterprise tenants only)
- UI: Toggle switches
- Implementation: Database flag + application check

**SAAS-ADMIN-005: Analytics & Reporting**
- Priority: P1 (Should Have)
- Phase: V1.0
- Description: SaaS business metrics
- Reports:
  - Growth metrics (signups, active users, revenue)
  - Retention cohorts
  - Churn analysis
  - Feature usage
  - Support ticket volume
  - Payment success/failure rates
- Export: CSV, Excel
- Frequency: Daily, weekly, monthly

---

## 7. MULTI-TENANCY TECHNICAL REQUIREMENTS

**SAAS-TECH-001: Data Isolation**
- Priority: P0 (Must Have - CRITICAL)
- Phase: MVP
- Description: Complete tenant data separation
- Implementation:
  - Every table has tenant_id column
  - All queries filter by tenant_id
  - Row-level security (RLS) in PostgreSQL
  - JWT contains tenant_id (from user session, not input)
  - Unit tests for tenant isolation
- Testing:
  - Automated tests attempt cross-tenant access
  - Penetration testing
  - Security audit
- Success Criteria: Zero cross-tenant data leaks

**SAAS-TECH-002: Tenant Context**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Manage tenant scope in application
- Implementation:
  - Middleware sets tenant context from JWT
  - Global scope in Prisma (all queries auto-filtered)
  - Tenant_id validated on every request
  - No user input for tenant_id (always from JWT)
- Error handling:
  - 403 Forbidden if tenant_id mismatch
  - Clear error message (don't expose internals)

**SAAS-TECH-003: Tenant Provisioning**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Automate new tenant setup
- Process:
  1. Create tenant record
  2. Create admin user
  3. Generate subdomain
  4. Initialize chart of accounts (from template)
  5. Create default settings
  6. Send welcome email
  7. Start trial period
- Time: Complete in <30 seconds
- Rollback: If any step fails, rollback all changes

**SAAS-TECH-004: Tenant Deletion**
- Priority: P0 (Must Have)
- Phase: MVP
- Description: Safely remove tenant data
- Process:
  1. Export tenant data (offered to tenant)
  2. Mark tenant as deleted (soft delete)
  3. Retain for 30 days (recovery period)
  4. After 30 days: Anonymize/delete data
     - Delete user PII
     - Keep transactions (anonymized) for compliance
     - Delete files
  5. Mark tenant as purged
- GDPR: Right to erasure
- Compliance: Retain financial data 7 years (anonymized)

**SAAS-TECH-005: Database Performance per Tenant**
- Priority: P1 (Should Have)
- Phase: MVP
- Description: Monitor and optimize per tenant
- Metrics:
  - Query time per tenant
  - Storage size per tenant
  - Connection count per tenant
- Actions:
  - Alert if tenant using excessive resources
  - Slow query detection per tenant
  - Option to move large tenant to dedicated DB (Enterprise)
- Technology: Database monitoring tools

---

## SUCCESS CRITERIA

**SaaS Requirements Met When:**

1. Tenant can self-register and start trial in <30 seconds
2. Tenant can upgrade to paid plan with credit card
3. Billing automated (invoices generated, payments processed)
4. Usage limits enforced (hard and soft)
5. Tenant isolation validated (penetration test)
6. Admin portal functional (manage tenants, view metrics)
7. Trial to paid conversion >10%
8. Churn rate <5% monthly

---

**Document Status:** Complete  
**Total SaaS Requirements:** 50+  
**Next:** User Stories

---

**Related Documents:**
- Business Requirements
- Functional Requirements
- Non-Functional Requirements
- User Stories (next)