"use client";
// spec-frontend-002 — imperative open/close helper for the common case.
import { useCallback, useState } from 'react';

export function useModal(initial = false): {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
} {
  const [open, setOpen] = useState(initial);
  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);
  return { open, openModal, closeModal };
}
