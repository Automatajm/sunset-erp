"use client";
// ============================================================================
// spec-frontend-002 — FormModal: wraps arbitrary form content with a shared
// submit/validation state. Primary action disabled while invalid or submitting;
// submit errors render inline without closing; ESC/overlay-close blocked while
// submitting. Built on the shared ModalShell.
// ============================================================================
import { ReactNode } from 'react';
import { ModalShell } from './ModalShell';
import { btn, errorLineStyle } from './styles';

export interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
  submitting?: boolean;
  isValid?: boolean;
  error?: string | null;
  width?: number;
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
}

export function FormModal({
  open,
  onClose,
  title,
  description,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  submitting = false,
  isValid = true,
  error = null,
  width = 560,
  onSubmit,
  children,
}: FormModalProps) {
  const disabled = submitting || !isValid;
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width={width}
      blockClose={submitting}
      footer={
        <>
          {error && <span style={errorLineStyle}>{error}</span>}
          <button style={btn('ghost', submitting)} disabled={submitting} onClick={onClose}>
            {cancelLabel}
          </button>
          <button style={btn('primary', disabled)} disabled={disabled} onClick={() => onSubmit()}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </>
      }
    >
      {children}
    </ModalShell>
  );
}
