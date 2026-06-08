# spec-034 — Session Security (Sliding Tokens, Inactivity Timeout, Login-First, Secure Storage)

Status: **Complete**
Owner: Axiom Systems
Sprint: security hardening (cross-cutting: auth backend + frontend apiClient/ERPShell/layout)
Module(s): auth (backend), frontend apiClient, AuthContext, ERPShell, app/layout.tsx
Last updated: 2026-06-07

## Problem

Current session handling is minimal and has real security gaps (audited
2026-06-07):

- **Access token expiry is already `15m`** (`backend/src/modules/auth/
  auth.module.ts:19` — `signOptions.expiresIn: '15m'`). Good baseline, but…
- **There is no refresh mechanism** — no `POST /api/auth/refresh`, no
  `RefreshToken` model, no logout endpoint (`auth.controller.ts` has only
  register / login / select-tenant / tenants / users). When the 15-minute access
  token expires the user is hard-bounced to `/login` mid-task.
- **Tokens live in `localStorage`** (`frontend/lib/api/client.ts:18,39` and
  `lib/contexts/AuthContext.tsx:57,75`): `access_token`, `user`, `tenant_name`.
  `localStorage` is readable by any injected script → XSS can exfiltrate the
  token. There is no httpOnly cookie.
- **`localStorage` restore = implicit "remember me"** (`AuthContext.tsx:29-34`
  restores the session on load), so a browser reopened days later lands
  authenticated rather than at `/login`.
- **401 handling is a dead-end** (`client.ts:39`): on 401 it clears tokens and
  (implicitly) redirects — no silent refresh, no retry of the original request.
- **No inactivity timeout** — an unattended authenticated tab stays usable
  indefinitely until the 15m token lapses, with no warning.

This spec makes sessions sliding, secure, and login-first.

## Acceptance criteria

### 1. Sliding session tokens
- [ ] Access token expiry stays **15 minutes** (already configured — keep).
- [ ] A **refresh token** with **8-hour** expiry is issued at login and
      `select-tenant`, stored as an **httpOnly, Secure, SameSite=Strict cookie**
      set by the backend (never returned in the JSON body, never readable by JS).
- [ ] The access token lives its full **15 minutes**; renewal happens ONLY via
      `POST /api/auth/refresh` when a request 401s. (AMENDED 2026-06-07: the
      original per-response sliding `X-Access-Token` header was removed as
      unnecessary noise — a new JWT on every 2xx is wasteful. The refresh cookie
      rotates on each `/auth/refresh` call.)
- [ ] Frontend `apiClient` intercepts **401**, calls `POST /api/auth/refresh`
      once (cookie sent automatically), and on success **retries the original
      request exactly once** with the new access token; concurrent 401s share a
      single in-flight refresh (no stampede).
- [ ] If refresh fails (expired/revoked refresh token) → clear in-memory token,
      drop any client state, redirect to `/login`.

### 2. Inactivity timeout
- [ ] After **15 minutes** with no user interaction (mousemove, keydown,
      click, touchstart, scroll), show a warning modal: "Your session expires in
      2 minutes."
- [ ] If no interaction within the following **2 minutes**, clear tokens +
      redirect to `/login` (and revoke the refresh token server-side).
- [ ] Any interaction resets the inactivity timer (debounced) and dismisses the
      warning if shown.
- [ ] The timer is shared **across tabs** via a `localStorage` `storage` event
      (last-interaction timestamp broadcast) so activity in one tab keeps the
      others alive, and logout in one tab logs out all.
      NOTE: only a non-sensitive `last_activity` epoch is written to
      `localStorage` for this — never the token.

### 3. Always start at login
- [ ] `/` and any protected route with no valid in-memory access token →
      immediate redirect to `/login` (route protection in `app/layout.tsx` /
      an auth gate, not per-page).
- [ ] **No "remember me"**: nothing that authenticates the user is restored from
      `localStorage`/`sessionStorage` on load. A fresh browser session starts at
      `/login`. (On first paint with no access token in memory, the app may
      still attempt one silent `refresh` using the httpOnly cookie — if the
      8-hour refresh window is alive the user resumes; otherwise `/login`. This
      is the ONLY persistence, and it is server-controlled + httpOnly, not
      "remember me" in storage.)
- [ ] After successful login, redirect to the **originally requested path**
      (captured as a `?next=` param or in-memory) or `/dashboard` by default.

### 4. Token storage
- [ ] **Access token: memory only** — a module-level variable / React context,
      never `localStorage` or `sessionStorage`. `apiClient` reads it from memory.
- [ ] **Refresh token: httpOnly cookie** set by the backend; never readable by
      JS, never in the JSON body.
- [ ] Migration: remove `localStorage.getItem/setItem('access_token')`,
      `'user'`, `'tenant_name'` (`client.ts:18,39-40`,
      `AuthContext.tsx:29-34,57-76`). Non-sensitive display data (user name,
      tenant name) may be re-fetched after refresh or kept in memory; if any
      must persist for first-paint UX, it must NOT include the token.

### 5. Backend changes
- [ ] `POST /api/auth/refresh` — reads the httpOnly refresh cookie, validates it
      against the `RefreshToken` table (exists, not revoked, not expired),
      issues a new 15m access token (in body or header), rotates the refresh
      cookie when near expiry. 401 if invalid/revoked/expired.
- [ ] `RefreshToken` Prisma model — `id`, `tenantId`, `userId`, `tokenHash`
      (store a hash, never the raw token), `expiresAt`, `revokedAt?`,
      `createdAt`, `userAgent?`/`ip?` (optional audit). Indexed by `userId` and
      `tokenHash`. Supports revocation (logout / inactivity / admin).
- [ ] `POST /api/auth/logout` — revokes the current refresh token
      (`revokedAt = now`), clears the cookie. Idempotent.
- [ ] Login + select-tenant set the refresh cookie and persist the
      `RefreshToken` row.

### Non-functional
- [ ] No access token ever written to `localStorage`/`sessionStorage` (grep-clean).
- [ ] Refresh-token raw value never stored server-side (hash only) nor logged.
- [ ] Refreshed access tokens carry the correct tenant claim (the refresh row
      stores `tenantId`, copied into the new JWT payload).
- [ ] ux-reviewer pass on the warning modal + login-redirect flow (friction ≤ 2;
      the happy path must feel like the session never drops within 8h of use).

## Out of scope

- Multi-device session management UI (list/revoke active sessions) — the
  `RefreshToken` model supports it; the UI is a follow-up.
- "Remember this device" / long-lived trusted devices.
- OAuth / SSO / MFA.
- CSRF token plumbing beyond `SameSite=Strict` on the refresh cookie (revisit if
  cross-site POST is ever needed).
- Rate-limiting the refresh endpoint (general API rate-limiting is its own spec).
- Changing the access-token TTL (stays 15m) or the JWT signing scheme.

## Data model

New model (additive migration — no destructive change):

```prisma
model RefreshToken {
  id         String    @id @default(uuid()) @db.Uuid
  tenantId   String    @map("tenant_id") @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  tokenHash  String    @map("token_hash") @db.VarChar(255)  // SHA-256 of the raw token
  expiresAt  DateTime  @map("expires_at")
  revokedAt  DateTime? @map("revoked_at")
  userAgent  String?   @map("user_agent") @db.VarChar(255)
  ip         String?   @db.VarChar(64)
  createdAt  DateTime  @default(now()) @map("created_at")
  user       User      @relation(fields: [userId], references: [id])
  @@index([userId])
  @@index([tokenHash])
  @@map("auth_refresh_tokens")
}
```

(Additive migration via the spec-024 shadow-DB workaround: `migrate diff
--script` + `migrate deploy`, since `sunset_user` lacks CREATEDB.)

## API contracts

### POST /api/auth/login  (modified)
```jsonc
// Response 200: { access_token, token_type, user, tenant?, requiresTenantSelection }
// + Set-Cookie: refresh_token=<raw>; HttpOnly; Secure; SameSite=Strict; Max-Age=28800; Path=/api/auth
// (raw refresh token ONLY in the cookie; its SHA-256 persisted to auth_refresh_tokens)
```

### POST /api/auth/select-tenant  (modified)
```jsonc
// Same as login: new access token in body + refresh cookie set/rotated.
```

### POST /api/auth/refresh  (NEW)
```jsonc
// Request: (no body) — refresh_token cookie sent automatically
// Response 200: { access_token, token_type } + rotated refresh cookie when near expiry
// Errors: 401 missing/invalid/expired/revoked refresh token
```

### POST /api/auth/logout  (NEW)
```jsonc
// Request: (no body) — refresh cookie identifies the token
// Response 200: { message: 'Logged out' } + Set-Cookie clearing refresh_token
// Idempotent: 200 even if already logged out. Revokes the RefreshToken row.
```

### Access-token renewal  (AMENDED — no sliding header)
```jsonc
// The access token is renewed ONLY by POST /api/auth/refresh, which the frontend
// calls on a 401. No per-response X-Access-Token header (removed 2026-06-07 as
// unnecessary noise). The 15m token simply lives out its lifetime between refreshes.
```

## Implementation notes

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | + `RefreshToken` model (additive migration) |
| `backend/src/modules/auth/auth.controller.ts` | + `refresh`, `logout`; set/clear cookie on login/select-tenant |
| `backend/src/modules/auth/auth.service.ts` | issue/rotate/validate/revoke refresh tokens (hash on store) |
| `frontend/lib/api/client.ts` | in-memory access token; 401 → single-flight refresh + one retry |
| `frontend/lib/contexts/AuthContext.tsx` | drop localStorage token/user/tenant; memory + silent-refresh-on-load |
| `frontend/components/layout/ERPShell.tsx` | inactivity timer + 2-min warning modal + cross-tab `storage` sync |
| `frontend/app/layout.tsx` (or an AuthGate) | route protection: no in-memory token + failed silent refresh → `/login?next=` |

Cross-cutting: this changes the auth contract (cookie + header). Coordinate the
backend + frontend changes in one rollout — a half-deployed state (backend
expects cookie, frontend still on localStorage) breaks login. The
`frontend-sync` discipline applies but this is bidirectional, not just a list
envelope.

## Verification checklist

```bash
# 1. Login → refresh_token is an HttpOnly cookie (not in JSON, not in localStorage)
# 2. grep -rn "localStorage" frontend/lib/api frontend/lib/contexts → no access_token
# 3. Let access token lapse (>15m or force 401) → next call silently refreshes + retries, no /login bounce
# 4. Kill the refresh token (logout in another tab) → next call → /login
# 5. Idle 15m → warning modal; idle 2 more min → /login; interaction resets timer
# 6. Activity in tab A keeps tab B alive; logout in A logs out B (storage event)
# 7. Fresh browser (no cookie) hits / → /login; deep link /inventory/items → /login?next=/inventory/items → after login lands there
# 8. POST /api/auth/refresh with no/invalid cookie → 401
# 9. cd backend && pnpm build && pnpm test auth && pnpm test:e2e ; cd frontend && pnpm build
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-07 | Spec drafted (spec-only, no implementation). Current-state audit: access TTL already 15m (auth.module:19); NO refresh endpoint / RefreshToken model / logout; tokens in localStorage (client.ts, AuthContext) = XSS exposure + implicit remember-me. Spec defines sliding tokens (15m access + 8h httpOnly refresh, sliding header + single-flight 401 retry), inactivity timeout (15m → 2-min warning → logout, cross-tab), login-first (no localStorage restore, ?next= redirect), memory/httpOnly storage, and backend refresh/logout/RefreshToken. | Draft — pending approval; implementation deferred |
| 2026-06-07 | Implemented (backend + frontend, one rollout): RefreshToken model + additive migration; /auth/refresh + /auth/logout + httpOnly SameSite=Strict 8h refresh cookie on login/select-tenant; SlidingTokenInterceptor (X-Access-Token on every authed 2xx); frontend in-memory token store, withCredentials apiClient with single-flight 401 refresh+retry, AuthContext silent-refresh-on-load, AuthGate route protection (?next=, cross-tab logout), InactivityGuard (15m→2-min warning→logout, cross-tab). No new deps (manual cookie parse + crypto). Live curl-verified: cookie set httpOnly, sliding header present, refresh 200, no-cookie/garbage/post-logout refresh 401, rotation revokes old. | Implemented |
| 2026-06-07 | Ship gates: 8 unit (refresh lifecycle) + 8 e2e (auth-session) green; full e2e 470/470 across 31 suites (every suite logs in — auth contract intact); backend + frontend prod builds green; lint clean on new files (pre-existing passwordHash/any idioms excluded). Shipped to origin; marked Complete and moved to specs/completed/ | All acceptance criteria met (100%) |
| 2026-06-07 | AMENDED — removed the SlidingTokenInterceptor (X-Access-Token on every 2xx was unnecessary noise). Access token now lives its full 15m; renewal happens ONLY via POST /auth/refresh on a 401. Deleted sliding-token.interceptor.ts + its app.module registration + JwtModule re-export; apiClient no longer swaps the header; auth-session e2e now asserts the header is ABSENT. Full e2e 470/470; live-verified no X-Access-Token header. | Amended — shipped |
