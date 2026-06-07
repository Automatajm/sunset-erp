// ============================================================================
// FILE: backend/src/modules/notifications/notifications.service.ts
// spec-022 — queue-first notifications. queue() renders + inserts a `pending`
// row and returns immediately (never sends inline). drainPending() is the
// worker body: per-tenant send via that tenant's transport config, with
// exponential backoff and a 3-attempt cap before `failed`.
// ============================================================================
import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MAIL_TRANSPORT, MailTransport } from './mail/mail-transport';
import { NotificationType, renderTemplate } from './notification-templates';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

const MAX_RETRIES = 3;
const DRAIN_BATCH = 50;

interface Recipient {
  email?: string | null;
  name?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(
    private prisma: PrismaService,
    @Inject(MAIL_TRANSPORT) private mail: MailTransport,
  ) {}

  // ── queue — render + insert pending, return immediately ───────────────────

  async queue(
    tenantId: string,
    type: NotificationType,
    recipient: Recipient,
    payload: Record<string, unknown>,
    opts?: { channel?: string; createdBy?: string },
  ): Promise<void> {
    const { subject, body, warnings } = renderTemplate(type, payload);
    if (warnings.length) {
      this.logger.warn(`Template ${type}: ${warnings.join('; ')}`);
    }
    await this.prisma.notification.create({
      data: {
        tenantId,
        type,
        channel: opts?.channel ?? 'email',
        status: 'pending',
        recipientEmail: recipient.email ?? null,
        recipientName: recipient.name ?? null,
        subject,
        body,
        payload: payload as any,
        createdBy: opts?.createdBy ?? null,
      },
    });
  }

  /**
   * Fire-and-forget wrapper for trigger points: a notification failure must
   * NEVER roll back or fail the business transaction (spec-022).
   */
  safeQueue(
    tenantId: string,
    type: NotificationType,
    recipient: Recipient,
    payload: Record<string, unknown>,
    opts?: { channel?: string; createdBy?: string },
  ): void {
    this.queue(tenantId, type, recipient, payload, opts).catch((e) =>
      this.logger.error(`safeQueue(${type}) failed: ${e?.message ?? e}`),
    );
  }

  /**
   * Queue once per dedupe key: skips if a non-cancelled notification of this
   * type already exists with the same `payload[dedupeKey]`. Used by recurring
   * scans (e.g. invoice-overdue) so a daily sweep does not re-spam. Fire-and-forget.
   */
  safeQueueOnce(
    tenantId: string,
    type: NotificationType,
    dedupeKey: string,
    recipient: Recipient,
    payload: Record<string, unknown>,
    opts?: { channel?: string; createdBy?: string },
  ): void {
    (async () => {
      const existing = await this.prisma.notification.findFirst({
        where: {
          tenantId,
          type,
          status: { not: 'cancelled' },
          payload: { path: [dedupeKey], equals: payload[dedupeKey] as any },
        },
      });
      if (existing) return;
      await this.queue(tenantId, type, recipient, payload, opts);
    })().catch((e) => this.logger.error(`safeQueueOnce(${type}) failed: ${e?.message ?? e}`));
  }

  // ── drainPending — the worker body ────────────────────────────────────────

  async drainPending(): Promise<{ attempted: number; sent: number; failed: number }> {
    const due = await this.prisma.notification.findMany({
      where: { status: 'pending', channel: 'email' },
      orderBy: { createdAt: 'asc' },
      take: DRAIN_BATCH,
    });

    let sent = 0;
    let failed = 0;
    // Cache tenant mail config within a single drain pass.
    const configCache = new Map<string, any>();

    for (const n of due) {
      // Exponential backoff: skip rows whose backoff window has not elapsed.
      if (n.retryCount > 0 && !this.backoffElapsed(n.retryCount, n.updatedAt)) continue;

      if (!n.recipientEmail) {
        await this.markFailed(n.id, n.tenantId, n.retryCount, 'No recipient email');
        failed++;
        continue;
      }

      let config = configCache.get(n.tenantId);
      if (config === undefined) {
        config =
          (await this.prisma.tenantSettings.findFirst({
            where: { tenantId: n.tenantId },
            select: {
              emailProvider: true,
              emailHost: true,
              emailPort: true,
              emailApiKey: true,
              emailFromAddress: true,
              emailFromName: true,
            },
          })) ?? {};
        configCache.set(n.tenantId, config);
      }

      try {
        await this.mail.send(
          {
            to: n.recipientEmail,
            toName: n.recipientName ?? undefined,
            subject: n.subject,
            body: n.body,
            from: config.emailFromAddress ?? undefined,
            fromName: config.emailFromName ?? undefined,
          },
          config,
        );
        await this.prisma.notification.updateMany({
          where: { id: n.id, tenantId: n.tenantId },
          data: { status: 'sent', sentAt: new Date(), lastError: null },
        });
        sent++;
      } catch (e: any) {
        await this.markFailed(n.id, n.tenantId, n.retryCount, e?.message ?? String(e));
        failed++;
      }
    }
    return { attempted: due.length, sent, failed };
  }

  private backoffElapsed(retryCount: number, since: Date): boolean {
    // 1 min, 2 min, 4 min, ... between attempts
    const waitMs = Math.pow(2, retryCount - 1) * 60_000;
    return Date.now() - new Date(since).getTime() >= waitMs;
  }

  private async markFailed(id: string, tenantId: string, retryCount: number, error: string) {
    const next = retryCount + 1;
    await this.prisma.notification.updateMany({
      where: { id, tenantId },
      data: {
        retryCount: next,
        lastError: error.slice(0, 1000),
        // Past the cap → terminal 'failed'; otherwise stay 'pending' for backoff.
        status: next >= MAX_RETRIES ? 'failed' : 'pending',
      },
    });
  }

  // ── Reads (apiKey never touched here) ─────────────────────────────────────

  async findAll(tenantId: string, filters: QueryNotificationsDto) {
    const where: any = { tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.channel) where.channel = filters.channel;
    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { notifications, count: notifications.length };
  }

  async findOne(tenantId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, tenantId } });
    if (!n) throw new NotFoundException(`Notification ${id} not found`);
    return n;
  }

  // ── retry / cancel — tenant-scoped state transitions ──────────────────────

  async retry(tenantId: string, id: string) {
    const n = await this.findOne(tenantId, id);
    if (!['failed', 'pending'].includes(n.status)) {
      throw new BadRequestException(`Cannot retry a notification in status "${n.status}"`);
    }
    await this.prisma.notification.updateMany({
      where: { id, tenantId },
      data: { status: 'pending', retryCount: 0, lastError: null },
    });
    return {
      message: `Notification ${id} re-queued`,
      notification: await this.findOne(tenantId, id),
    };
  }

  async cancel(tenantId: string, id: string) {
    const n = await this.findOne(tenantId, id);
    if (n.status === 'sent')
      throw new BadRequestException('Cannot cancel an already-sent notification');
    if (n.status === 'cancelled') throw new BadRequestException('Notification already cancelled');
    await this.prisma.notification.updateMany({
      where: { id, tenantId },
      data: { status: 'cancelled' },
    });
    return {
      message: `Notification ${id} cancelled`,
      notification: await this.findOne(tenantId, id),
    };
  }
}
