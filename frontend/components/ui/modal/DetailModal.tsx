"use client";
// ============================================================================
// spec-frontend-002 — DetailModal: read-only view. No submit; a single Close
// affordance; optional footer actions slot. Built on the shared ModalShell.
// ============================================================================
import { ReactNode } from 'react';
import { ModalShell } from './ModalShell';
import { btn } from './styles';

export interface DetailModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  width?: number;
  closeLabel?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function DetailModal({
  open,
  onClose,
  title,
  description,
  width = 560,
  closeLabel = 'Close',
  footer,
  children,
}: DetailModalProps) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width={width}
      footer={
        <>
          {footer}
          <button style={btn('ghost')} onClick={onClose}>
            {closeLabel}
          </button>
        </>
      }
    >
      {children}
    </ModalShell>
  );
}

// Convenience: a label/value row for sectioned read-only bodies.
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}
