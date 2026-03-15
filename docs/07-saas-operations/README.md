# SAAS OPERATIONS DOCUMENTATION - SUNSET ERP

**Phase:** 2 - Architecture & Design  
**Section:** 07-saas-operations  
**Status:** In Progress  
**Date:** March 15, 2026

---

## OVERVIEW

Operational procedures for running Sunset ERP as a SaaS platform, including tenant management, billing, monitoring, and customer support.

---

## DOCUMENTS IN THIS SECTION

### 1. [Tenant Onboarding](./tenant-onboarding.md)
Signup flow, provisioning, initial setup.

### 2. [Billing & Subscriptions](./billing-subscriptions.md)
Stripe integration, subscription management, invoicing.

### 3. [Monitoring & Alerting](./monitoring-alerting.md)
Application monitoring, performance metrics, incident alerts.

### 4. [Customer Support](./customer-support.md)
Support tiers, SLA, ticketing system.

### 5. [Backup & Disaster Recovery](./backup-disaster-recovery.md)
Backup procedures, recovery time objectives.

---

## TENANT LIFECYCLE

### 1. Signup (Self-Service)
```
User visits /register
  → Enters email, password, company name
  → Clicks "Start Free Trial"
  → System creates:
     - User account
     - Tenant record
     - Default roles
     - 14-day trial subscription
  → User redirected to onboarding wizard
```

**Duration:** < 2 minutes  
**Automation:** 100% automated

### 2. Onboarding Wizard
```
Step 1: Company Details
  → Legal name, tax ID, industry, size

Step 2: Preferences
  → Fiscal year start, currency, language, timezone

Step 3: Invite Team
  → Add users, assign roles

Step 4: Import Data (Optional)
  → Upload suppliers, items, customers (CSV)

Step 5: Quick Tour
  → Interactive product tour
```

**Duration:** 10-30 minutes  
**Completion Rate Target:** 80%

### 3. Trial Period (14 Days)
```
- Full feature access
- No credit card required
- Email reminders: Day 7, Day 12, Day 14
- In-app upgrade prompts
- Usage tracking for conversion optimization
```

### 4. Conversion to Paid
```
User clicks "Upgrade"
  → Select plan (Pro / Enterprise)
  → Enter payment details (Stripe)
  → Subscription created
  → Trial ends immediately
  → Invoice generated
  → Welcome to paid tier email
```

### 5. Active Subscription
```
- Monthly/annual billing
- Auto-renewal
- Invoice sent 7 days before renewal
- Usage monitoring
- Feature access based on plan
```

### 6. Cancellation
```
User cancels subscription
  → End of billing period: downgrade to Free
  → OR: Immediate cancellation with prorated refund
  → Data retained for 90 days
  → Export option provided
  → Exit survey sent
```

### 7. Account Deletion
```
User requests deletion
  → 30-day grace period
  → Email confirmation required
  → Data exported and sent to user
  → After 30 days: permanent deletion
  → GDPR compliance
```

---

## SUBSCRIPTION PLANS

### Free Tier
- **Price:** $0/month
- **Users:** 1
- **Transactions:** 50/month
- **Storage:** 100 MB
- **Support:** Community only
- **Features:** Basic modules only

### Pro Tier
- **Price:** $49/user/month (billed monthly)
- **Price:** $39/user/month (billed annually - 20% discount)
- **Users:** Unlimited
- **Transactions:** Unlimited
- **Storage:** 10 GB
- **Support:** Email (24h response)
- **Features:** All modules + advanced reporting

### Enterprise Tier
- **Price:** Custom (starts at $499/month)
- **Users:** Unlimited
- **Transactions:** Unlimited
- **Storage:** Unlimited
- **Support:** Dedicated account manager, phone, 4h SLA
- **Features:** All features + custom integrations + SSO

---

## BILLING WORKFLOW

### Monthly Billing Cycle
```
Day 1: Subscription starts
Day 25: Invoice preview sent (email)
Day 28: Payment attempt (Stripe)
  → Success: Invoice marked paid
  → Failure: Retry in 3 days
Day 31: If still unpaid, retry
Day 34: If still unpaid, account suspended
  → Read-only access
  → Banner: "Payment failed, update card"
Day 44: If still unpaid (14 days), account deactivated
  → No access
  → Data retained 90 days
```

### Payment Retry Logic
```typescript
// Stripe automatic retry schedule
Retry 1: 3 days after failure
Retry 2: 5 days after failure
Retry 3: 7 days after failure
Final:   14 days after failure → deactivate
```

### Prorated Billing
```
// User upgrades mid-cycle
const daysRemaining = endDate - today;
const dailyRate = monthlyPrice / 30;
const credit = dailyRate * daysRemaining;
const newCharge = newMonthlyPrice - credit;

// Example: Upgrade from $49 to $99 with 15 days left
const credit = ($49 / 30) * 15 = $24.50
const newCharge = $99 - $24.50 = $74.50
```

---

## USAGE TRACKING

### Metrics to Track
```typescript
interface TenantUsage {
  tenantId: string;
  period: string; // YYYY-MM
  
  // User metrics
  activeUsers: number;
  totalLogins: number;
  
  // Transaction metrics
  purchaseOrders: number;
  salesOrders: number;
  journalEntries: number;
  stockMovements: number;
  
  // Storage metrics
  storageUsedMB: number;
  documentsCount: number;
  
  // API metrics
  apiCallsTotal: number;
  apiCallsSuccess: number;
  apiCallsError: number;
}
```

### Overage Charges (Future)
```
If usage exceeds plan limits:
- Soft limit: Warning email
- Hard limit: Feature disabled or overage charge
  Example: $0.10 per extra transaction
```

---

## MONITORING & ALERTING

### Application Monitoring
- **Tool:** Datadog / New Relic
- **Metrics:**
  - Request rate (requests/second)
  - Error rate (% of 5xx errors)
  - Response time (p50, p95, p99)
  - Database query time
  - CPU / Memory usage

### Uptime Monitoring
- **Tool:** Pingdom / UptimeRobot
- **Checks:** Every 1 minute
- **Locations:** 5+ global locations
- **Target:** 99.9% uptime

### Database Monitoring
```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Long-running queries
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '5 seconds';

-- Database size
SELECT pg_size_pretty(pg_database_size('sunset_erp'));

-- Table bloat
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
```

### Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Error Rate | > 1% | > 5% |
| Response Time | p95 > 500ms | p95 > 2s |
| CPU Usage | > 70% | > 90% |
| Memory Usage | > 80% | > 95% |
| Disk Usage | > 75% | > 90% |
| Failed Logins | > 100/min | > 500/min |

### On-Call Rotation
- **Primary:** 24/7 on-call engineer
- **Escalation:** Team lead → CTO
- **Response Time:**
  - Critical: 15 minutes
  - High: 1 hour
  - Medium: 4 hours

---

## CUSTOMER SUPPORT

### Support Channels
1. **Email:** support@sunset-erp.com
2. **In-App Chat:** For Pro and Enterprise
3. **Phone:** Enterprise only
4. **Community Forum:** All users

### Support SLA

| Plan | Channel | Response Time | Resolution Time |
|------|---------|---------------|-----------------|
| Free | Forum only | Best effort | N/A |
| Pro | Email + Chat | 24 hours | 5 business days |
| Enterprise | Email + Chat + Phone | 4 hours | 2 business days |

### Support Tiers
**Tier 1: Customer Success**
- First response
- Common questions
- Account issues
- Billing questions

**Tier 2: Technical Support**
- Complex technical issues
- Data import/export
- Integration issues
- Custom reports

**Tier 3: Engineering**
- Bug fixes
- Performance issues
- Data recovery
- Critical incidents

---

## BACKUP & DISASTER RECOVERY

### Backup Schedule
- **Full Backup:** Daily at 2 AM UTC
- **Incremental:** Every 6 hours
- **Transaction Logs:** Continuous (WAL archiving)
- **Retention:** 30 days

### Recovery Time Objective (RTO)
- **Critical:** 1 hour (full service restoration)
- **High:** 4 hours
- **Medium:** 24 hours

### Recovery Point Objective (RPO)
- **Maximum data loss:** 15 minutes
- **Achieved via:** Continuous WAL archiving

### Disaster Recovery Procedure
```
1. Incident detected (monitoring alert)
2. Assess scope and impact
3. Activate DR plan
4. Restore from backup:
   - Latest full backup
   - Apply WAL logs to specific point-in-time
5. Verify data integrity
6. Switch DNS to DR environment
7. Monitor closely for 24 hours
8. Post-mortem analysis
```

---

## TENANT DATA EXPORT

### On-Demand Export
```
User clicks "Export Data"
  → Select date range
  → Select modules (All, Procurement, Inventory, etc.)
  → Format: CSV or JSON
  → Job queued
  → Email sent when ready
  → Download link (expires in 7 days)
```

### Automated Exports
```
Enterprise tier can schedule:
- Daily/weekly/monthly exports
- Automatic upload to S3/SFTP
- Retention: 90 days
```

### Export Format
```json
{
  "tenant": {
    "code": "ACME",
    "name": "ACME Corporation"
  },
  "exportDate": "2026-03-15T12:00:00Z",
  "modules": {
    "procurement": {
      "suppliers": [...],
      "purchaseOrders": [...]
    },
    "inventory": {
      "items": [...],
      "stock": [...]
    }
  }
}
```

---

## COMPLIANCE & AUDITING

### Audit Log Retention
- **Active logs:** 2 years (database)
- **Archived logs:** 7 years (S3 Glacier)
- **Access:** Tenant admins can view own audit logs

### Compliance Reports
Available for Enterprise tier:
- **SOC 2 Report:** Annual
- **Security Assessment:** Quarterly
- **Uptime Report:** Monthly
- **Data Residency Confirmation:** On request

---

## COMMUNICATION

### Tenant Notifications

**Email Triggers:**
- Welcome email (signup)
- Trial expiring (Day 7, 12, 14)
- Payment succeeded/failed
- Invoice generated
- Account suspended
- Feature announcements
- Maintenance windows
- Security alerts

**In-App Notifications:**
- Payment issues
- Storage limits approaching
- User limit reached
- System updates
- New features

### Status Page
- **URL:** status.sunset-erp.com
- **Tool:** Statuspage.io
- **Updates:** Real-time incident updates
- **Subscribe:** Email/SMS notifications
- **History:** 90-day incident history

### Maintenance Windows
- **Schedule:** Sunday 2 AM - 6 AM UTC
- **Frequency:** Monthly (if needed)
- **Notice:** 7 days advance notice
- **Communication:** Email + status page + in-app banner

---

## PERFORMANCE OPTIMIZATION

### Quarterly Review
- Analyze slow queries (> 200ms)
- Review index usage
- Optimize database queries
- Scale infrastructure if needed
- Remove unused features

### Capacity Planning
```
Monthly review:
- Current tenant count
- Growth rate
- Database size growth
- Storage usage growth
- Predict when to scale (90 days forecast)
```

### Scaling Triggers
| Metric | Action |
|--------|--------|
| CPU > 80% for 24h | Add app server |
| DB connections > 80% | Increase pool size |
| DB size > 400 GB | Plan sharding |
| Tenants > 5,000 | Consider sharding |

---

**Status:** 5 documents outlined  
**Priority:** HIGH - Operational readiness  
**Owner:** Operations Team