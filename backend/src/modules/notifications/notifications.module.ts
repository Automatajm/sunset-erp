// ============================================================================
// FILE: backend/src/modules/notifications/notifications.module.ts
// ============================================================================
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsWorker } from './notifications.worker';
import { LogMailTransport, MAIL_TRANSPORT } from './mail/mail-transport';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsWorker,
    // Default transport — swap to a real Nodemailer/Resend binding to deliver.
    { provide: MAIL_TRANSPORT, useClass: LogMailTransport },
  ],
  exports: [NotificationsService], // emitting modules inject this to queue()
})
export class NotificationsModule {}
