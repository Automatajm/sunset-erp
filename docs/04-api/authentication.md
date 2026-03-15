# API AUTHENTICATION

## JWT Tokens
- Access: 15min, Refresh: 7 days
- Header: `Authorization: Bearer {token}`
- Payload: `{userId, tenantId, roles}`

## Endpoints
- POST /auth/login
- POST /auth/refresh
- POST /auth/select-tenant

## RBAC
Permission format: `MODULE:ACTION` (e.g., `PROCUREMENT:CREATE`)
