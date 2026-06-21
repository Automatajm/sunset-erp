'use client';

// ============================================================================
// FILE: frontend/components/print/PrintButton.tsx
// spec-frontend-005 — one-click print: opens the standalone /print route in a
// new tab. Drop into any detail view (matches the ghost-button idiom).
// ============================================================================
import React from 'react';

export function PrintButton({
  doc,
  id,
  query,
  label = 'Print',
  style,
}: {
  doc: string;
  id: string;
  query?: Record<string, string | undefined>;
  label?: string;
  style?: React.CSSProperties;
}) {
  const open = () => {
    const qs = query
      ? '?' + Object.entries(query).filter(([, v]) => v != null).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&')
      : '';
    window.open(`/print/${doc}/${id}${qs}`, '_blank', 'noopener');
  };
  return (
    <button
      onClick={open}
      style={{
        border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        fontFamily: "'IBM Plex Sans',sans-serif", background: 'var(--l06, rgba(255,255,255,0.06))', color: 'var(--w60, rgba(255,255,255,0.6))',
        display: 'inline-flex', alignItems: 'center', gap: 7, ...style,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      {label}
    </button>
  );
}
