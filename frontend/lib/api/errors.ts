// ============================================================================
// spec-frontend-002 §5 — one normalized error shape for the whole frontend.
// The apiClient response interceptor attaches `error.normalized: ErrorResponse`
// to every failure; components branch only on `status` and never parse raw
// axios/fetch errors.
// ============================================================================
import type { AxiosError } from 'axios';

export interface ErrorResponse {
  status: number; // HTTP status; 0 for network/timeout (no response)
  message: string; // human-readable, from the response body when present
  endpoint: string; // request URL (path + query)
  timestamp: string; // ISO-8601, client-side capture time
  requestId?: string; // from a response header when the backend provides one
  body?: unknown; // response-body snippet — dev panel only
}

export type ErrorVariant = 'unauthorized' | 'not-found' | 'server-error';

/** Map an HTTP status to the ErrorState variant. */
export function variantForStatus(status: number): ErrorVariant {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not-found';
  return 'server-error'; // 5xx, 0 (network), and anything else unexpected
}

/** Normalize any axios/unknown error into the single ErrorResponse shape. */
export function normalizeError(err: unknown): ErrorResponse {
  const timestamp = new Date().toISOString();
  const ax = err as AxiosError | undefined;
  const resp = ax?.response;
  const status = resp?.status ?? 0;

  // Pull a human message from the body when present, else the axios message.
  const bodyMessage =
    resp && typeof resp.data === 'object' && resp.data !== null
      ? (resp.data as Record<string, unknown>).message
      : undefined;

  const message =
    (typeof bodyMessage === 'string' && bodyMessage) ||
    (status === 0 ? 'Network error — could not reach the server.' : null) ||
    ax?.message ||
    'Something went wrong.';

  const endpoint =
    [ax?.config?.baseURL, ax?.config?.url].filter(Boolean).join('') ||
    ax?.config?.url ||
    'unknown';

  const headers = resp?.headers as Record<string, string> | undefined;
  const requestId = headers?.['x-request-id'] ?? headers?.['x-requestid'] ?? undefined;

  return { status, message, endpoint, timestamp, requestId, body: resp?.data };
}

/** Read the interceptor-attached normalized error, falling back to normalizing. */
export function asErrorResponse(err: unknown): ErrorResponse {
  const attached = (err as { normalized?: ErrorResponse })?.normalized;
  return attached ?? normalizeError(err);
}
