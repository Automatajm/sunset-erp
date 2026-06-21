"use client";
// ============================================================================
// spec-frontend-002 — ConfirmModal: yes/no with a destructive variant.
// async onConfirm shows a pending state and auto-closes on success; on reject
// it surfaces the error inline (absorbed, never window.alert) and stays open.
// ============================================================================
import { useState } from 'react';
import { ModalShell } from './ModalShell';
import { btn, errorLineStyle } from './styles';

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  variant = 'default',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
}: ConfirmModalProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (pending) return;
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setPending(false);
      onClose();
    } catch (e: any) {
      setPending(false);
      setError(e?.response?.data?.message ?? e?.message ?? 'Action failed. Please try again.');
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={close}
      title={title}
      description={description}
      width={420}
      blockClose={pending}
      footer={
        <>
          {error && <span style={errorLineStyle}>{error}</span>}
          <button style={btn('ghost', pending)} disabled={pending} onClick={close}>
            {cancelLabel}
          </button>
          <button
            style={btn(variant === 'destructive' ? 'danger' : 'primary', pending)}
            disabled={pending}
            onClick={handleConfirm}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--w60)', lineHeight: 1.5 }}>
        {variant === 'destructive'
          ? 'This action cannot be undone.'
          : 'Please confirm you want to proceed.'}
      </div>
    </ModalShell>
  );
}
