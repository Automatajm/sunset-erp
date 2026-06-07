// ============================================================================
// FILE: backend/src/modules/notifications/notifications.worker.ts
// spec-022 — @Interval worker that drains pending notifications every 15s.
// Single-instance assumption (one dev/prod node); multi-instance dedup would
// need a row lock / queue — out of scope. Overlap-guarded so a slow drain
// never stacks.
// ============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsWorker {
  private readonly logger = new Logger('NotificationsWorker');
  private running = false;

  constructor(private readonly service: NotificationsService) {}

  @Interval('notifications-drain', 15_000)
  async tick() {
    if (this.running) return; // overlap guard
    this.running = true;
    try {
      const res = await this.service.drainPending();
      if (res.attempted > 0) {
        this.logger.log(`drain: attempted=${res.attempted} sent=${res.sent} failed=${res.failed}`);
      }
    } catch (e: any) {
      this.logger.error(`drain tick failed: ${e?.message ?? e}`);
    } finally {
      this.running = false;
    }
  }
}
