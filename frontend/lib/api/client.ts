import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken } from './token-store';

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// Create axios instance. withCredentials so the httpOnly refresh cookie rides
// along on /auth/refresh and /auth/logout (spec-034).
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Request: attach the in-memory access token ──────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Single-flight refresh ───────────────────────────────────────────────────
// Many requests can 401 at once; they must share ONE /auth/refresh call, not
// stampede. A bare axios call avoids recursing through this interceptor.
let refreshPromise: Promise<string | null> | null = null;

const runRefresh = (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((r) => {
        const token = r.data?.access_token ?? null;
        setAccessToken(token);
        return token;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?next=${next}`;
};

// ── Response: on 401 refresh-and-retry once ─────────────────────────────────
// The access token lives its full 15m; renewal happens ONLY via /auth/refresh
// when a request 401s (spec-034 amendment — no per-response sliding token).
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const url = original?.url ?? '';

    // Never try to refresh the refresh/logout calls themselves.
    const isAuthFlow = url.includes('/auth/refresh') || url.includes('/auth/logout');

    if (status === 401 && original && !original._retried && !isAuthFlow) {
      original._retried = true;
      const token = await runRefresh();
      if (token) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;
        return apiClient(original); // retry exactly once
      }
      // Refresh failed → session is over.
      clearAccessToken();
      redirectToLogin();
    }

    return Promise.reject(error);
  },
);

export default apiClient;
