// ============================================================================
// FILE: backend/src/modules/ar-invoices/ar-invoices.overdue.worker.ts
// spec-022 — daily scan that queues 'invoice_overdue' notifications. Dedup is
// handled by NotificationsService.safeQueueOnce (one per invoice). Overlap-guarded.
// ============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ArInvoicesService } from './ar-invoices.service';

@Injectable()
export class ArInvoicesOverdueWorker {
  private readonly logger = new Logger('ArInvoicesOverdueWorker');
  private running = false;

  constructor(private readonly service: ArInvoicesService) {}

  // Every 6 hours — safeQueueOnce dedup makes re-runs idempotent.
  @Interval('ar-overdue-scan', 6 * 60 * 60 * 1000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const res = await this.service.scanOverdue();
      if (res.queued > 0) {
        this.logger.log(`overdue scan: scanned=${res.scanned} queued=${res.queued}`);
      }
    } catch (e: any) {
      this.logger.error(`overdue scan failed: ${e?.message ?? e}`);
    } finally {
      this.running = false;
    }
  }
}
