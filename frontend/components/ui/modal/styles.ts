// ============================================================================
// spec-frontend-002 — ONE modal style language.
// These tokens are the single source of truth for every modal in the app:
// the ConfirmModal/FormModal/DetailModal system AND the InactivityGuard session
// warning all import from here, so the app has one overlay/panel/button look,
// not two. Derived from the original InactivityGuard styling. Colors are grouped
// here as literals so a later token swap (spec-frontend-001) is mechanical.
// ============================================================================
import type { CSSProperties } from 'react';

export const MODAL_Z = 1000;

export const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: MODAL_Z,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(2px)',
  padding: 20,
};

export const panelStyle = (width = 420): CSSProperties => ({
  width,
  maxWidth: '100%',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--surface-raised, #14101f)',
  border: '0.5px solid rgba(251,146,60,0.25)',
  borderRadius: 12,
  boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
  fontFamily: "'IBM Plex Sans',sans-serif",
});

export const headerStyle: CSSProperties = {
  padding: '20px 24px 0',
  flexShrink: 0,
};

export const titleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--text-strong, #f1ede8)',
  margin: 0,
};

export const descriptionStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--w50)',
  lineHeight: 1.5,
  marginTop: 6,
};

// Scrollable body so tall forms/details never push the footer off-screen.
export const bodyStyle: CSSProperties = {
  padding: '16px 24px',
  overflowY: 'auto',
  flex: 1,
};

export const footerStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
  alignItems: 'center',
  padding: '0 24px 20px',
  flexShrink: 0,
};

// Inline error line shown inside a modal (FormModal/ConfirmModal) — absorbed,
// never relayed via window.alert.
export const errorLineStyle: CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: 'var(--danger, #f87171)',
  textAlign: 'left',
};

type Variant = 'primary' | 'ghost' | 'danger';
export const btn = (variant: Variant = 'ghost', disabled = false): CSSProperties => ({
  border: 'none',
  borderRadius: 7,
  padding: '8px 18px',
  fontSize: 12,
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  fontFamily: "'IBM Plex Sans',sans-serif",
  color:
    variant === 'primary' ? 'white' : variant === 'danger' ? 'var(--danger, #f87171)' : 'var(--w60)',
  background:
    variant === 'primary'
      ? 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))'
      : variant === 'danger'
        ? 'rgba(239,68,68,0.1)'
        : 'var(--l06)',
  outline: variant === 'danger' ? '0.5px solid rgba(239,68,68,0.25)' : 'none',
});
