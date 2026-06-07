// ============================================================================
// FILE: backend/src/modules/notifications/notification-templates.ts
// spec-022 — per-type subject/body templates with {{variable}} substitution
// from the notification payload. Unknown variables render empty + warn (the
// renderer never throws). English only (DESIGN-SYSTEM).
// ============================================================================

export const NOTIFICATION_TYPES = [
  'so_confirmed',
  'po_created',
  'rfq_sent',
  'invoice_overdue',
  'stock_below_reorder',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['email', 'in_app'] as const;
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'cancelled'] as const;

interface Template {
  subject: string;
  body: string;
}

export const TEMPLATES: Record<NotificationType, Template> = {
  so_confirmed: {
    subject: 'Your order {{soNumber}} is confirmed',
    body:
      'Hello {{customerName}},\n\n' +
      'Your sales order {{soNumber}} for {{total}} {{currency}} has been confirmed' +
      ' and is now being processed.\n\nThank you for your business.',
  },
  po_created: {
    subject: 'Purchase Order {{poNumber}}',
    body:
      'Hello {{supplierName}},\n\n' +
      'We have issued purchase order {{poNumber}} for {{total}} {{currency}}.' +
      ' Please confirm receipt and expected delivery.\n\nRegards.',
  },
  rfq_sent: {
    subject: 'Request for Quotation: {{rfqTitle}}',
    body:
      'Hello {{supplierName}},\n\n' +
      'You are invited to quote on RFQ {{rfqNumber}} — "{{rfqTitle}}".' +
      ' Please submit your response by {{dueDate}}.\n\nRegards.',
  },
  invoice_overdue: {
    subject: 'Invoice {{invoiceNumber}} is overdue',
    body:
      'Hello {{customerName}},\n\n' +
      'Invoice {{invoiceNumber}} for {{outstanding}} {{currency}} was due on' +
      ' {{dueDate}} and is now {{daysOverdue}} day(s) overdue.' +
      ' Please arrange payment at your earliest convenience.',
  },
  stock_below_reorder: {
    subject: 'Low stock: {{itemName}} ({{itemCode}})',
    body:
      'Stock for {{itemName}} ({{itemCode}}) has fallen to {{onHand}}, at or below' +
      ' its reorder point of {{reorderPoint}}. Suggested reorder quantity:' +
      ' {{reorderQuantity}}.',
  },
};

/**
 * Render a template against a payload. `{{var}}` is replaced by `payload[var]`;
 * unknown variables render as empty string and are collected as warnings.
 * Never throws.
 */
export function renderTemplate(
  type: NotificationType,
  payload: Record<string, unknown>,
): { subject: string; body: string; warnings: string[] } {
  const tpl = TEMPLATES[type];
  if (!tpl) {
    return { subject: `[${type}]`, body: '', warnings: [`Unknown template type: ${type}`] };
  }
  const warnings: string[] = [];
  const substitute = (text: string): string =>
    text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
      const val = payload?.[key];
      if (val === undefined || val === null) {
        warnings.push(`Missing template variable: ${key}`);
        return '';
      }
      return String(val);
    });
  return {
    subject: substitute(tpl.subject),
    body: substitute(tpl.body),
    warnings,
  };
}
