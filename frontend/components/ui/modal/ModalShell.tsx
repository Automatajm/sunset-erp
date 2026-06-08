"use client";
// ============================================================================
// spec-frontend-002 — the shared Radix-backed shell every modal composes.
// Built on @radix-ui/react-dialog (a direct dependency): focus-trap, ESC,
// overlay-click, scroll-lock, and aria roles come from Radix; the look comes
// from modal/styles.ts (one modal language). ConfirmModal / FormModal /
// DetailModal are thin compositions of this.
// ============================================================================
import * as Dialog from '@radix-ui/react-dialog';
import { ReactNode } from 'react';
import {
  overlayStyle,
  panelStyle,
  headerStyle,
  titleStyle,
  descriptionStyle,
  bodyStyle,
  footerStyle,
} from './styles';

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  width?: number;
  /** When true, ESC + overlay click do not close (e.g. mid-submit). */
  blockClose?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export function ModalShell({
  open,
  onClose,
  title,
  description,
  width,
  blockClose = false,
  children,
  footer,
}: ModalShellProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !blockClose) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle}>
          <Dialog.Content
            style={panelStyle(width)}
            onEscapeKeyDown={(e) => blockClose && e.preventDefault()}
            onPointerDownOutside={(e) => blockClose && e.preventDefault()}
            onInteractOutside={(e) => blockClose && e.preventDefault()}
          >
            <div style={headerStyle}>
              <Dialog.Title style={titleStyle}>{title}</Dialog.Title>
              {description ? (
                <Dialog.Description style={descriptionStyle}>{description}</Dialog.Description>
              ) : (
                // Radix warns if a Dialog has no Description; provide a hidden one.
                <Dialog.Description style={{ display: 'none' }}>{title}</Dialog.Description>
              )}
            </div>
            <div style={bodyStyle}>{children}</div>
            {footer ? <div style={footerStyle}>{footer}</div> : null}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
