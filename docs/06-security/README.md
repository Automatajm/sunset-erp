# SECURITY DOCUMENTATION - SUNSET ERP

**Phase:** 2 - Architecture & Design  
**Section:** 06-security  
**Status:** In Progress  
**Date:** March 15, 2026

---

## OVERVIEW

Comprehensive security architecture, policies, and procedures for Sunset ERP multi-tenant SaaS platform.

**Security Principles:**
1. **Defense in Depth** - Multiple security layers
2. **Zero Trust** - Verify everything, trust nothing
3. **Least Privilege** - Minimum necessary permissions
4. **Data Encryption** - At rest and in transit
5. **Audit Everything** - Complete audit trail

---

## DOCUMENTS IN THIS SECTION

### 1. [Authentication & Authorization](./authentication-authorization.md)
JWT implementation, RBAC, password policies, 2FA.

### 2. [Data Encryption](./data-encryption.md)
Encryption at rest, in transit, key management.

### 3. [Multi-Tenant Security](./multi-tenant-security.md)
Tenant isolation, cross-tenant protection, RLS.

### 4. [API Security](./api-security.md)
Rate limiting, input validation, SQL injection prevention.

### 5. [Penetration Testing Plan](./penetration-testing.md)
Security testing schedule, scope, remediation.

### 6. [Incident Response](./incident-response.md)
Security incident procedures, breach notification.

---

## SECURITY LAYERS

### Layer 1: Network Security
- HTTPS only (TLS 1.3)
- WAF (Web Application Firewall)
- DDoS protection (Cloudflare)
- IP whitelisting for admin access

### Layer 2: Application Security
- Input validation (all user inputs)
- Output encoding (prevent XSS)
- CSRF protection
- SQL injection prevention (Prisma ORM)

### Layer 3: Authentication
- JWT tokens (short-lived access tokens)
- Secure password hashing (bcrypt, cost factor 12)
- 2FA/MFA support (TOTP)
- Session management

### Layer 4: Authorization
- Role-Based Access Control (RBAC)
- Granular permissions
- Tenant-level isolation
- Row-Level Security (PostgreSQL)

### Layer 5: Data Protection
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)
- Database backups encrypted
- PII data handling

### Layer 6: Monitoring & Logging
- Security event logging
- Anomaly detection
- Failed login tracking
- Audit trail (who, what, when)

---

## AUTHENTICATION FLOW

### User Login
```
1. User submits email + password
2. Server validates credentials
3. Server checks account status (active, not locked)
4. Server generates JWT tokens:
   - Access token (15 min, contains: userId)
   - Refresh token (7 days, stored in DB)
5. Return tokens to client
6. Client stores refresh token (httpOnly cookie)
7. Client uses access token in Authorization header
```

### Tenant Selection
```
1. User authenticated but no tenant selected
2. Client requests user's tenants: GET /auth/tenants
3. User selects tenant from list
4. Client requests new token: POST /auth/select-tenant
5. Server validates user has access to tenant
6. Server generates new access token with tenantId
7. Client uses new token for all API calls
```

### Token Refresh
```
1. Access token expires (15 min)
2. Client detects 401 Unauthorized
3. Client sends refresh token: POST /auth/refresh
4. Server validates refresh token
5. Server generates new access token
6. Client retries original request
```

---

## AUTHORIZATION (RBAC)

### Permission Format
```
MODULE:ACTION
```

**Examples:**
- `PROCUREMENT:CREATE` - Create purchase orders
- `INVENTORY:READ` - View inventory
- `ACCOUNTING:DELETE` - Delete journal entries
- `ADMIN:MANAGE_USERS` - User management

### Built-in Roles

**System Admin**
- Full system access
- Manage all tenants
- Cannot see tenant business data

**Tenant Admin**
- Full access within tenant
- User management
- Role management
- All business modules

**Manager**
- All business modules (read + write)
- Cannot manage users/roles
- Can approve transactions

**User**
- Assigned modules only
- Read + write access
- Cannot approve

**Read-Only**
- All modules (read only)
- No write access
- For auditors, consultants

### Permission Matrix

| Module | Admin | Manager | User | Read-Only |
|--------|-------|---------|------|-----------|
| Procurement | ✅ All | ✅ All | ✅ Create/Edit | 👁️ Read |
| Inventory | ✅ All | ✅ All | ✅ Create/Edit | 👁️ Read |
| Sales | ✅ All | ✅ All | ✅ Create/Edit | 👁️ Read |
| Accounting | ✅ All | ✅ All | ❌ No Access | 👁️ Read |
| Users | ✅ Manage | ❌ No | ❌ No | ❌ No |
| Settings | ✅ Manage | ⚙️ View | ❌ No | ❌ No |

---

## PASSWORD POLICY

### Requirements
- Minimum length: 12 characters
- Must contain: uppercase, lowercase, number, special character
- Cannot be common password (check against leaked DB)
- Cannot reuse last 5 passwords
- Expires every 90 days (optional, configurable)

### Storage
```typescript
// Never store plain text passwords
const hashedPassword = await bcrypt.hash(password, 12);

// Verify
const isValid = await bcrypt.compare(password, hashedPassword);
```

### Failed Login Protection
- Lock account after 5 failed attempts
- Lockout duration: 30 minutes
- Email notification on lockout
- CAPTCHA after 3 failed attempts

---

## TWO-FACTOR AUTHENTICATION (2FA)

### Supported Methods
1. **TOTP (Time-based One-Time Password)**
   - Google Authenticator
   - Authy
   - 1Password

2. **SMS (Optional)**
   - Via Twilio
   - Backup method only

### Enrollment Flow
```
1. User enables 2FA in settings
2. Server generates TOTP secret
3. Server returns QR code
4. User scans with authenticator app
5. User enters verification code
6. Server validates and enables 2FA
7. Server generates backup codes (10)
```

### Login with 2FA
```
1. User submits email + password
2. Server validates credentials
3. Server checks if 2FA enabled
4. Server returns: { requiresTwoFactor: true }
5. Client prompts for 2FA code
6. User enters TOTP code
7. Server validates code
8. Server generates JWT tokens
```

---

## DATA ENCRYPTION

### At Rest
- **Database:** PostgreSQL pgcrypto extension
- **Backups:** Encrypted with AES-256
- **File Storage:** AWS S3 server-side encryption
- **Secrets:** AWS Secrets Manager / HashiCorp Vault

### In Transit
- **HTTPS:** TLS 1.3 only
- **Certificate:** Let's Encrypt auto-renewal
- **HSTS:** Strict-Transport-Security header
- **Certificate Pinning:** Mobile apps

### Sensitive Fields Encryption
```sql
-- Encrypt sensitive columns
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Store encrypted data
UPDATE users 
SET ssn_encrypted = pgp_sym_encrypt(ssn, encryption_key);

-- Retrieve decrypted data
SELECT pgp_sym_decrypt(ssn_encrypted, encryption_key) AS ssn
FROM users;
```

---

## TENANT ISOLATION

### Application Layer
```typescript
// Middleware extracts tenant from JWT
app.use(tenantMiddleware);

// Prisma global middleware
prisma.$use(async (params, next) => {
  if (params.model && TENANT_MODELS.includes(params.model)) {
    params.args.where = {
      ...params.args.where,
      tenantId: currentTenant.id
    };
  }
  return next(params);
});
```

### Database Layer (Row-Level Security)
```sql
-- Enable RLS on all tenant tables
ALTER TABLE po_suppliers ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY tenant_isolation ON po_suppliers
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- Set tenant context per request
SET app.tenant_id = 'tenant-uuid-here';
```

### Testing Tenant Isolation
```typescript
test('cannot access other tenant data', async () => {
  const tenant1Token = await loginAs(tenant1User);
  const tenant2Data = await createSupplier(tenant2);
  
  const response = await request(app)
    .get(`/suppliers/${tenant2Data.id}`)
    .set('Authorization', `Bearer ${tenant1Token}`);
  
  expect(response.status).toBe(404); // Not 403, to prevent enumeration
});
```

---

## INPUT VALIDATION

### Validation Strategy
1. **Client-side:** UX, immediate feedback (Zod schemas)
2. **Server-side:** Security, cannot be bypassed (DTO validation)

### Example: NestJS DTO
```typescript
import { IsString, IsEmail, MinLength, MaxLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string;
}
```

### SQL Injection Prevention
- ✅ Use Prisma ORM (parameterized queries)
- ❌ Never concatenate SQL strings
- ✅ Validate all inputs
- ✅ Escape special characters

---

## XSS PREVENTION

### Output Encoding
```typescript
// React automatically escapes
<div>{userInput}</div>  // ✅ Safe

// Dangerous: dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: userInput }} />  // ❌ Unsafe

// Safe: Use DOMPurify
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ 
  __html: DOMPurify.sanitize(userInput) 
}} />  // ✅ Safe
```

### Content Security Policy (CSP)
```http
Content-Security-Policy: 
  default-src 'self'; 
  script-src 'self' 'unsafe-inline'; 
  style-src 'self' 'unsafe-inline'; 
  img-src 'self' data: https:; 
  font-src 'self' data:;
```

---

## CSRF PROTECTION

### Double Submit Cookie Pattern
```typescript
// Generate CSRF token
const csrfToken = generateRandomToken();
response.cookie('XSRF-TOKEN', csrfToken, { httpOnly: false });

// Client includes in request header
headers: {
  'X-XSRF-TOKEN': getCookie('XSRF-TOKEN')
}

// Server validates
if (req.headers['x-xsrf-token'] !== req.cookies['XSRF-TOKEN']) {
  throw new UnauthorizedException('Invalid CSRF token');
}
```

---

## RATE LIMITING

### Limits by Endpoint
| Endpoint | Anonymous | Authenticated | Admin |
|----------|-----------|---------------|-------|
| /auth/login | 5/min | N/A | N/A |
| /auth/register | 3/hour | N/A | N/A |
| /api/* | 60/min | 300/min | Unlimited |

### Implementation
```typescript
// Express rate limit
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5,
  message: 'Too many login attempts, please try again later'
});

app.post('/auth/login', loginLimiter, authController.login);
```

---

## SECURITY HEADERS

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true
}));
```

---

## AUDIT LOGGING

### What to Log
- Authentication events (login, logout, failed attempts)
- Authorization failures (permission denied)
- Data modifications (create, update, delete)
- Administrative actions (user management, role changes)
- Security events (password changes, 2FA enrollment)

### Audit Log Schema
```typescript
interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: string;          // LOGIN, CREATE_SUPPLIER, etc.
  resource: string;        // suppliers, purchase_orders
  resourceId?: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorMessage?: string;
  metadata?: object;       // Before/after values
  timestamp: Date;
}
```

---

## PENETRATION TESTING SCHEDULE

### Internal Testing
- **Frequency:** Monthly
- **Scope:** OWASP Top 10
- **Tools:** OWASP ZAP, Burp Suite
- **Team:** Security team

### External Testing
- **Frequency:** Quarterly
- **Scope:** Full application
- **Vendor:** Third-party security firm
- **Report:** Remediation within 30 days

### Bug Bounty Program
- **Launch:** After 6 months in production
- **Platform:** HackerOne
- **Scope:** Production environment only
- **Rewards:** $100 - $10,000 based on severity

---

## INCIDENT RESPONSE PLAN

### Severity Levels

**Critical (P0)**
- Data breach
- System compromise
- Complete service outage
- Response: Immediate (15 min)

**High (P1)**
- Potential breach
- Partial service outage
- Authentication bypass
- Response: 1 hour

**Medium (P2)**
- Non-critical vulnerability
- Limited impact
- Response: 4 hours

**Low (P3)**
- Minor issue
- No immediate threat
- Response: 24 hours

### Response Procedure
1. **Detection** - Alert triggered or reported
2. **Assessment** - Determine severity
3. **Containment** - Isolate affected systems
4. **Eradication** - Remove threat
5. **Recovery** - Restore normal operations
6. **Lessons Learned** - Post-mortem analysis

---

## COMPLIANCE

### GDPR (General Data Protection Regulation)
- Right to access (data export)
- Right to erasure (account deletion)
- Right to portability (data export)
- Breach notification (72 hours)

### SOC 2 Type II (Future)
- Security controls documentation
- Annual audit
- Third-party attestation

---

## SECURITY CHECKLIST

**Before Production Launch:**
- [ ] HTTPS enforced (redirect HTTP to HTTPS)
- [ ] Security headers configured (Helmet.js)
- [ ] CSRF protection enabled
- [ ] Rate limiting implemented
- [ ] Input validation on all endpoints
- [ ] SQL injection testing passed
- [ ] XSS testing passed
- [ ] Authentication tested (JWT, 2FA)
- [ ] Authorization tested (RBAC, RLS)
- [ ] Tenant isolation verified
- [ ] Passwords hashed with bcrypt
- [ ] Secrets in environment variables (not code)
- [ ] Database backups encrypted
- [ ] Audit logging enabled
- [ ] Error messages don't leak info
- [ ] Penetration test completed
- [ ] Security incident plan documented

---

**Status:** 6 documents outlined  
**Priority:** CRITICAL - Security is non-negotiable  
**Owner:** Security Team + All Developers