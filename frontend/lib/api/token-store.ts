// ============================================================================
// spec-034 — in-memory access token store.
// The access token lives ONLY in this module variable — never localStorage /
// sessionStorage — so an injected script cannot read it (XSS hardening). The
// refresh token is an httpOnly cookie the JS never touches.
// ============================================================================

let accessToken: string | null = null;

export const getAccessToken = (): string | null => accessToken;
export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const clearAccessToken = (): void => {
  accessToken = null;
};

// ── Cross-tab signalling (non-sensitive only) ───────────────────────────────
// We broadcast a last-activity epoch and a logout ping through localStorage so
// multiple tabs share one inactivity timer and one logout. NEVER the token.
export const ACTIVITY_KEY = 'last_activity';
export const LOGOUT_KEY = 'auth_logout';

export const broadcastActivity = (): void => {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — single-tab still works via the local timer */
  }
};

export const broadcastLogout = (): void => {
  try {
    localStorage.setItem(LOGOUT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
};
