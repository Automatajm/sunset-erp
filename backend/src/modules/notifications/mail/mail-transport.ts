// ============================================================================
// FILE: backend/src/modules/notifications/mail/mail-transport.ts
// spec-022 — pluggable mail transport. The default LogMailTransport writes the
// would-be email to the log and resolves (no external dependency). A real
// NodemailerTransport / ResendTransport drops in behind this same interface
// once a provider account exists, gated by TenantSettings.emailProvider.
// ============================================================================
import { Injectable, Logger } from '@nestjs/common';

export interface MailMessage {
  to: string;
  toName?: string;
  subject: string;
  body: string;
  from?: string;
  fromName?: string;
}

/** Tenant email provider config (emailApiKey stays server-side, never serialized). */
export interface TenantMailConfig {
  emailProvider?: string | null;
  emailHost?: string | null;
  emailPort?: number | null;
  emailApiKey?: string | null;
  emailFromAddress?: string | null;
  emailFromName?: string | null;
}

export interface MailTransport {
  /** Deliver the message or throw — the worker maps throws to retry/failed. */
  send(msg: MailMessage, config: TenantMailConfig): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/**
 * Default transport: logs the message and resolves. Lets the entire queue-first
 * pipeline run end-to-end (queue → worker → 'sent') with zero mail dependency.
 * Swap the provider binding in NotificationsModule to deliver for real.
 */
@Injectable()
export class LogMailTransport implements MailTransport {
  private readonly logger = new Logger('LogMailTransport');

  // config intentionally unused — the log transport delivers nowhere.
  async send(msg: MailMessage): Promise<void> {
    this.logger.log(
      `[email:log] to=${msg.to} subject="${msg.subject}" ` +
        `(${msg.body.length} chars) — not actually sent (LogMailTransport)`,
    );
  }
}
