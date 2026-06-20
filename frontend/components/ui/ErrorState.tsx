"use client";
// ============================================================================
// spec-frontend-002 §5 — in-place error state. Renders in place of the data
// when an API call fails — never a browser alert(). Three variants derived from
// the normalized status. In development a technical panel (status, endpoint,
// body snippet, copy-to-clipboard) is rendered; in production the panel is
// stripped by the NODE_ENV check (dead-code-eliminated, not CSS-hidden).
// ============================================================================
import { useState } from 'react';
import { ErrorResponse, ErrorVariant, variantForStatus } from '@/lib/api/errors';

const COPY: Record<ErrorVariant, { title: string; hint: string; color: string }> = {
  'unauthorized': {
    title: "You don't have access to this data",
    hint: 'Your role is missing the permission this page needs. Contact an administrator if you believe this is wrong.',
    color: 'var(--warning)',
  },
  'not-found': {
    title: 'Not found',
    hint: 'The data you requested no longer exists or was moved.',
    color: 'var(--accent-blue)',
  },
  'server-error': {
    title: 'Something went wrong',
    hint: 'The server could not complete the request. Please try again in a moment.',
    color: 'var(--danger)',
  },
};

export interface ErrorStateProps {
  error: ErrorResponse;
  variant?: ErrorVariant;
  onRetry?: () => void;
}

function IconAlert({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12.5" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function ErrorState({ error, variant, onRetry }: ErrorStateProps) {
  const v = variant ?? variantForStatus(error.status);
  const cfg = COPY[v];
  const [copied, setCopied] = useState(false);

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(error, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 14, padding: '48px 24px', textAlign: 'center', fontFamily: "'IBM Plex Sans',sans-serif",
    }}>
      <IconAlert color={cfg.color} />
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)' }}>{cfg.title}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6, maxWidth: 420, lineHeight: 1.5 }}>
          {cfg.hint}
        </div>
      </div>

      {/* Always-visible, non-sensitive identifiers for support */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono',monospace" }}>
        {error.status ? `Error ${error.status}` : 'Network error'}
        {' · '}
        {new Date(error.timestamp).toLocaleString('en-US')}
        {error.requestId ? ` · ${error.requestId}` : ''}
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", color: 'white',
            background: 'linear-gradient(135deg,var(--accent-pressed),var(--accent),var(--accent-mid))',
          }}
        >
          Try again
        </button>
      )}

      {/* Dev-only technical panel — stripped from production builds by the
          NODE_ENV check (process.env.NODE_ENV is statically inlined by Next, so
          this whole block becomes dead code and is eliminated in prod). */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          marginTop: 8, width: '100%', maxWidth: 520, textAlign: 'left',
          background: 'rgba(0,0,0,0.35)', border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
              Technical details (dev only)
            </span>
            <button
              onClick={copyDetails}
              style={{
                border: 'none', borderRadius: 5, padding: '3px 9px', fontSize: 10, cursor: 'pointer',
                fontFamily: "'IBM Plex Sans',sans-serif",
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre style={{
            margin: 0, fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,0.55)',
            fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 200, overflow: 'auto',
          }}>
{`status:   ${error.status}
endpoint: ${error.endpoint}
message:  ${error.message}
${error.requestId ? `requestId: ${error.requestId}\n` : ''}body:     ${JSON.stringify(error.body, null, 2)}`}
          </pre>
        </div>
      )}
    </div>
  );
}
