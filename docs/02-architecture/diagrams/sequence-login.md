# User Login Flow - Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant API
    participant AuthService
    participant Database
    participant JWT
    participant Redis

    User->>Frontend: Enter email & password
    Frontend->>Frontend: Validate input format
    
    Frontend->>API: POST /auth/login<br/>{email, password}
    
    API->>AuthService: login(email, password)
    
    AuthService->>Database: Find user by email
    Database-->>AuthService: User record
    
    alt User not found
        AuthService-->>API: 401 Unauthorized
        API-->>Frontend: Error: Invalid credentials
        Frontend-->>User: Show error message
    end
    
    AuthService->>AuthService: bcrypt.compare(password, hash)
    
    alt Password invalid
        AuthService->>Database: Increment failed attempts
        AuthService-->>API: 401 Unauthorized
        API-->>Frontend: Error: Invalid credentials
        Frontend-->>User: Show error message
    end
    
    alt Account locked (5 failed attempts)
        AuthService-->>API: 403 Forbidden
        API-->>Frontend: Error: Account locked
        Frontend-->>User: Account locked (30 min)
    end
    
    AuthService->>Database: Get user's tenants
    Database-->>AuthService: List of tenants
    
    alt No tenants found
        AuthService-->>API: 403 Forbidden
        API-->>Frontend: Error: No access
        Frontend-->>User: Contact administrator
    end
    
    AuthService->>JWT: Generate access token (15min)<br/>{userId}
    JWT-->>AuthService: accessToken
    
    AuthService->>JWT: Generate refresh token (7 days)
    JWT-->>AuthService: refreshToken
    
    AuthService->>Database: Save refresh token
    Database-->>AuthService: Success
    
    AuthService->>Redis: Cache user session
    Redis-->>AuthService: Success
    
    AuthService->>Database: Update last_login_at
    Database-->>AuthService: Success
    
    AuthService-->>API: {accessToken, refreshToken, tenants}
    API-->>Frontend: 200 OK + tokens + tenant list
    
    Frontend->>Frontend: Store refresh token (httpOnly cookie)
    Frontend->>Frontend: Store access token (memory)
    
    alt Single tenant only
        Frontend->>Frontend: Auto-select tenant
        Frontend->>API: POST /auth/select-tenant<br/>{tenantId}
        API->>AuthService: selectTenant(userId, tenantId)
        AuthService->>JWT: Generate new token<br/>{userId, tenantId}
        JWT-->>AuthService: newAccessToken
        AuthService-->>API: {accessToken}
        API-->>Frontend: 200 OK + new token
        Frontend->>User: Redirect to /dashboard
    else Multiple tenants
        Frontend->>User: Show tenant selection screen
        User->>Frontend: Select tenant
        Frontend->>API: POST /auth/select-tenant<br/>{tenantId}
        API->>AuthService: selectTenant(userId, tenantId)
        
        AuthService->>Database: Verify user has access to tenant
        Database-->>AuthService: UserTenant record
        
        alt No access to tenant
            AuthService-->>API: 403 Forbidden
            API-->>Frontend: Error: No access
            Frontend-->>User: Show error
        end
        
        AuthService->>JWT: Generate new token<br/>{userId, tenantId, roles}
        JWT-->>AuthService: newAccessToken
        
        AuthService->>Redis: Update session with tenantId
        Redis-->>AuthService: Success
        
        AuthService-->>API: {accessToken}
        API-->>Frontend: 200 OK + new token
        Frontend->>Frontend: Store new token
        Frontend->>User: Redirect to /dashboard
    end
```

**Key Security Features:**

1. **Password Security**
   - Hashed with bcrypt (cost factor 12)
   - Never transmitted or stored in plain text

2. **Account Lockout**
   - 5 failed attempts = 30-minute lockout
   - Prevents brute force attacks

3. **Token Strategy**
   - Short-lived access tokens (15 min)
   - Long-lived refresh tokens (7 days)
   - Refresh tokens stored in database (can be revoked)

4. **Multi-Tenant Isolation**
   - User must select tenant explicitly
   - Tenant ID embedded in JWT
   - Cannot be changed by client

5. **Session Management**
   - Session cached in Redis for performance
   - Last login tracked for auditing

**Error Handling:**
- Invalid credentials: Generic "Invalid email or password" (prevents enumeration)
- Account locked: Clear message with timeframe
- No access: Contact administrator message