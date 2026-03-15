# MULTI-TENANT SECURITY

## Defense Layers
1. Application: Prisma middleware filters by tenant_id
2. Database: PostgreSQL Row-Level Security
3. Testing: Automated cross-tenant access tests

## Never Trust Client
- Never accept tenant_id from user input
- Always extract from JWT token
- Validate user has access to tenant

## Testing
- Automated tests for cross-tenant isolation
- Penetration testing focuses on tenant boundaries
