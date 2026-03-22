import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateAutomationConfigDto, ReviewQueueItemDto, RejectQueueItemDto } from './dto/automation.dto';
import { Decimal } from '@prisma/client/runtime/library';

export const AUTOMATION_MODULES = [
  'ar_invoice',
  'ar_payment',
  'ar_reversal',
  'fg_delivery',
  'production_variance',
  'po_receipt',
  'mo_issue',
] as const;

export type AutomationModule = typeof AUTOMATION_MODULES[number];

@Injectable()
export class AutomationService {
  constructor(private prisma: PrismaService) {}

  async getConfigs(tenantId: string) {
    const existing = await this.prisma.automationConfig.findMany({ where: { tenantId } });
    const existingModules = new Set(existing.map(c => c.module));
    const missing = AUTOMATION_MODULES.filter(m => !existingModules.has(m));
    if (missing.length > 0) {
      await this.prisma.automationConfig.createMany({
        data: missing.map(module => ({ tenantId, module, mode: 'full_auto', isEnabled: true })),
        skipDuplicates: true,
      });
    }
    return this.prisma.automationConfig.findMany({ where: { tenantId }, orderBy: { module: 'asc' } });
  }

  async updateConfig(tenantId: string, userId: string, module: string, dto: UpdateAutomationConfigDto) {
    if (!AUTOMATION_MODULES.includes(module as AutomationModule)) {
      throw new BadRequestException(`Unknown module: ${module}. Valid: ${AUTOMATION_MODULES.join(', ')}`);
    }
    return this.prisma.automationConfig.upsert({
      where: { tenantId_module: { tenantId, module } },
      create: { tenantId, module, mode: dto.mode, isEnabled: dto.isEnabled ?? true, notes: dto.notes ?? null, updatedBy: userId },
      update: { mode: dto.mode, isEnabled: dto.isEnabled ?? true, notes: dto.notes ?? null, updatedBy: userId },
    });
  }

  async getMode(tenantId: string, module: AutomationModule): Promise<'full_auto' | 'review_required' | 'manual'> {
    const config = await this.prisma.automationConfig.findFirst({ where: { tenantId, module } });
    if (!config || !config.isEnabled) return 'full_auto';
    return config.mode as 'full_auto' | 'review_required' | 'manual';
  }

  async handleAutoJe(params: {
    tenantId: string; userId: string; module: AutomationModule;
    eventType: string; sourceType: string; sourceId: string; sourceRef: string;
    jeData: {
      entryNumber: string; entryDate: Date; fiscalPeriod: string;
      journalType: string; reference: string; description: string;
      lines: { accountId: string; lineNumber: number; description: string; debitAmount: number; creditAmount: number }[];
    };
  }) {
    const mode = await this.getMode(params.tenantId, params.module);
    if (mode === 'manual') return { je: null, queued: false, mode };

    const jeStatus = mode === 'full_auto' ? 'posted' : 'draft';

    const je = await this.prisma.journalEntry.create({
      data: {
        tenantId:     params.tenantId,
        entryNumber:  params.jeData.entryNumber,
        entryDate:    params.jeData.entryDate,
        postingDate:  params.jeData.entryDate,
        fiscalPeriod: params.jeData.fiscalPeriod,
        journalType:  params.jeData.journalType,
        reference:    params.jeData.reference,
        description:  params.jeData.description,
        status:       jeStatus,
        createdBy:    params.userId,
        updatedBy:    params.userId,
        lines: {
          create: params.jeData.lines.map(line => ({
            tenantId:     params.tenantId,
            lineNumber:   line.lineNumber,
            accountId:    line.accountId,
            description:  line.description,
            debitAmount:  new Decimal(line.debitAmount),
            creditAmount: new Decimal(line.creditAmount),
            currency:     'USD',
            exchangeRate: new Decimal(1),
            createdBy:    params.userId,
            updatedBy:    params.userId,
          })),
        },
      },
      include: { lines: true },
    });

    if (mode === 'review_required') {
      await this.prisma.autoJeQueue.create({
        data: {
          tenantId:   params.tenantId,
          jeId:       je.id,
          eventType:  params.eventType,
          sourceType: params.sourceType,
          sourceId:   params.sourceId,
          sourceRef:  params.sourceRef,
          status:     'pending',
          createdBy:  params.userId,
        },
      });
    }

    return { je, queued: mode === 'review_required', mode };
  }

  async getQueue(tenantId: string, filters: { status?: string; eventType?: string }) {
    const where: any = { tenantId };
    if (filters.status)    where.status    = filters.status;
    if (filters.eventType) where.eventType = filters.eventType;

    const items = await this.prisma.autoJeQueue.findMany({
      where,
      include: {
        journalEntry: {
          include: {
            lines: {
              include: { account: { select: { id: true, accountNumber: true, name: true } } },
              orderBy: { lineNumber: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return items.map(item => ({
      ...item,
      journalEntry: {
        ...item.journalEntry,
        lines: item.journalEntry.lines.map(line => ({
          ...line,
          debitAmount:  Number(line.debitAmount),
          creditAmount: Number(line.creditAmount),
        })),
      },
    }));
  }

  async getQueueStats(tenantId: string) {
    const [pending, approved, rejected] = await Promise.all([
      this.prisma.autoJeQueue.count({ where: { tenantId, status: 'pending' } }),
      this.prisma.autoJeQueue.count({ where: { tenantId, status: 'approved' } }),
      this.prisma.autoJeQueue.count({ where: { tenantId, status: 'rejected' } }),
    ]);
    return { pending, approved, rejected, total: pending + approved + rejected };
  }

  async approveQueueItem(tenantId: string, userId: string, queueId: string, dto: ReviewQueueItemDto) {
    const item = await this.prisma.autoJeQueue.findFirst({
      where: { id: queueId, tenantId },
      include: { journalEntry: true },
    });
    if (!item) throw new NotFoundException(`Queue item ${queueId} not found`);
    if (item.status !== 'pending') throw new BadRequestException(`Item is already ${item.status}`);

    await this.prisma.journalEntry.update({ where: { id: item.jeId }, data: { status: 'posted', updatedBy: userId } });
    await this.prisma.autoJeQueue.update({
      where: { id: queueId },
      data: { status: 'approved', reviewedBy: userId, reviewedAt: new Date(), notes: dto.notes ?? null },
    });

    return { message: `JE ${item.journalEntry.entryNumber} approved and posted`, queueId, jeId: item.jeId };
  }

  async rejectQueueItem(tenantId: string, userId: string, queueId: string, dto: RejectQueueItemDto) {
    const item = await this.prisma.autoJeQueue.findFirst({
      where: { id: queueId, tenantId },
      include: { journalEntry: true },
    });
    if (!item) throw new NotFoundException(`Queue item ${queueId} not found`);
    if (item.status !== 'pending') throw new BadRequestException(`Item is already ${item.status}`);

    await this.prisma.journalEntryLine.deleteMany({ where: { journalEntryId: item.jeId } });
    await this.prisma.journalEntry.delete({ where: { id: item.jeId } });
    await this.prisma.autoJeQueue.update({
      where: { id: queueId },
      data: { status: 'rejected', reviewedBy: userId, reviewedAt: new Date(), rejectReason: dto.rejectReason, notes: dto.notes ?? null },
    });

    return { message: `JE rejected and deleted`, queueId, rejectReason: dto.rejectReason };
  }
}