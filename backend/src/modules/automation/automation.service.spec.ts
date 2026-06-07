// ============================================================================
// Unit tests for AutomationService — spec-031-automation
// PrismaService fully mocked; assert behavior (tenant scoping on GL writes,
// error paths, mode logic), never a real DB.
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';
const USER = 'user-uuid';

describe('AutomationService', () => {
  let service: AutomationService;
  let prisma: {
    automationConfig: Record<string, jest.Mock>;
    autoJeQueue: Record<string, jest.Mock>;
    journalEntry: Record<string, jest.Mock>;
    journalEntryLine: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    prisma = {
      automationConfig: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        createMany: jest.fn(),
        upsert: jest.fn(),
      },
      autoJeQueue: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      journalEntry: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      journalEntryLine: { deleteMany: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [AutomationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(AutomationService);
  });

  // ── config ──────────────────────────────────────────────────────────────
  describe('getConfigs', () => {
    it('scopes by tenantId and back-fills missing modules', async () => {
      prisma.automationConfig.findMany.mockResolvedValue([]); // none exist yet
      prisma.automationConfig.createMany.mockResolvedValue({ count: 10 });
      await service.getConfigs(TENANT_A);
      expect(prisma.automationConfig.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ tenantId: TENANT_A, mode: 'full_auto' }),
          ]),
        }),
      );
      expect(prisma.automationConfig.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_A } }),
      );
    });
  });

  describe('updateConfig', () => {
    it('rejects an unknown module', async () => {
      await expect(
        service.updateConfig(TENANT_A, USER, 'not_a_module', { mode: 'manual' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('upserts on the tenantId_module composite key', async () => {
      prisma.automationConfig.upsert.mockResolvedValue({});
      await service.updateConfig(TENANT_A, USER, 'ar_invoice', { mode: 'review_required' } as any);
      expect(prisma.automationConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_module: { tenantId: TENANT_A, module: 'ar_invoice' } },
        }),
      );
    });
  });

  describe('getMode', () => {
    it('defaults to full_auto when no config or disabled', async () => {
      prisma.automationConfig.findFirst.mockResolvedValue(null);
      expect(await service.getMode(TENANT_A, 'ar_invoice')).toBe('full_auto');
      prisma.automationConfig.findFirst.mockResolvedValue({ mode: 'manual', isEnabled: false });
      expect(await service.getMode(TENANT_A, 'ar_invoice')).toBe('full_auto');
    });

    it('returns the configured mode when enabled', async () => {
      prisma.automationConfig.findFirst.mockResolvedValue({ mode: 'manual', isEnabled: true });
      expect(await service.getMode(TENANT_A, 'ar_invoice')).toBe('manual');
    });
  });

  // ── handleAutoJe ──────────────────────────────────────────────────────────
  describe('handleAutoJe', () => {
    const base = {
      tenantId: TENANT_A,
      userId: USER,
      module: 'ar_invoice' as const,
      eventType: 'ar_invoice',
      sourceType: 'ar_invoice',
      sourceId: 's1',
      sourceRef: 'INV-1',
      jeData: {
        entryNumber: 'JE-1',
        entryDate: new Date(),
        fiscalPeriod: '2026-01',
        journalType: 'sales',
        reference: 'INV-1',
        description: 'x',
        lines: [
          { accountId: 'a1', lineNumber: 1, description: 'l', debitAmount: 100, creditAmount: 0 },
        ],
      },
    };

    it('manual mode creates no JE', async () => {
      prisma.automationConfig.findFirst.mockResolvedValue({ mode: 'manual', isEnabled: true });
      const res = await service.handleAutoJe(base);
      expect(res).toEqual({ je: null, queued: false, mode: 'manual' });
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it('full_auto posts the JE and does not queue', async () => {
      prisma.automationConfig.findFirst.mockResolvedValue({ mode: 'full_auto', isEnabled: true });
      prisma.journalEntry.create.mockResolvedValue({ id: 'je1', lines: [] });
      const res = await service.handleAutoJe(base);
      expect(prisma.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_A, status: 'posted' }),
        }),
      );
      expect(res.queued).toBe(false);
      expect(prisma.autoJeQueue.create).not.toHaveBeenCalled();
    });

    it('review_required drafts the JE and queues it', async () => {
      prisma.automationConfig.findFirst.mockResolvedValue({
        mode: 'review_required',
        isEnabled: true,
      });
      prisma.journalEntry.create.mockResolvedValue({ id: 'je1', lines: [] });
      prisma.autoJeQueue.create.mockResolvedValue({ id: 'q1' });
      const res = await service.handleAutoJe(base);
      expect(prisma.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'draft' }) }),
      );
      expect(prisma.autoJeQueue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_A, jeId: 'je1' }),
        }),
      );
      expect(res.queued).toBe(true);
    });
  });

  // ── approve (tenant-scoped GL writes) ──────────────────────────────────────
  describe('approveQueueItem', () => {
    it('posts the JE and approves the item, both tenant-scoped', async () => {
      prisma.autoJeQueue.findFirst.mockResolvedValue({
        id: 'q1',
        jeId: 'je1',
        status: 'pending',
        journalEntry: { entryNumber: 'JE-1' },
      });
      prisma.journalEntry.updateMany.mockResolvedValue({ count: 1 });
      prisma.autoJeQueue.updateMany.mockResolvedValue({ count: 1 });
      await service.approveQueueItem(TENANT_A, USER, 'q1', {} as any);
      expect(prisma.journalEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'je1', tenantId: TENANT_A } }),
      );
      expect(prisma.autoJeQueue.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'q1', tenantId: TENANT_A } }),
      );
    });

    it('throws NotFoundException for an item in another tenant', async () => {
      prisma.autoJeQueue.findFirst.mockResolvedValue(null);
      await expect(service.approveQueueItem(TENANT_B, USER, 'q1', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects an already-reviewed item', async () => {
      prisma.autoJeQueue.findFirst.mockResolvedValue({ id: 'q1', status: 'approved' });
      await expect(service.approveQueueItem(TENANT_A, USER, 'q1', {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── reject (tenant-scoped GL hard-delete) ──────────────────────────────────
  describe('rejectQueueItem', () => {
    it('hard-deletes JE + lines and rejects the item, all tenant-scoped', async () => {
      prisma.autoJeQueue.findFirst.mockResolvedValue({
        id: 'q1',
        jeId: 'je1',
        status: 'pending',
        journalEntry: { entryNumber: 'JE-1' },
      });
      prisma.journalEntryLine.deleteMany.mockResolvedValue({ count: 1 });
      prisma.journalEntry.deleteMany.mockResolvedValue({ count: 1 });
      prisma.autoJeQueue.updateMany.mockResolvedValue({ count: 1 });
      await service.rejectQueueItem(TENANT_A, USER, 'q1', { rejectReason: 'wrong' } as any);
      expect(prisma.journalEntryLine.deleteMany).toHaveBeenCalledWith({
        where: { journalEntryId: 'je1', tenantId: TENANT_A },
      });
      expect(prisma.journalEntry.deleteMany).toHaveBeenCalledWith({
        where: { id: 'je1', tenantId: TENANT_A },
      });
      expect(prisma.autoJeQueue.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'q1', tenantId: TENANT_A } }),
      );
    });

    it('throws NotFoundException for an item in another tenant', async () => {
      prisma.autoJeQueue.findFirst.mockResolvedValue(null);
      await expect(
        service.rejectQueueItem(TENANT_B, USER, 'q1', { rejectReason: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── stats ────────────────────────────────────────────────────────────────
  describe('getQueueStats', () => {
    it('counts each status scoped by tenantId', async () => {
      prisma.autoJeQueue.count.mockResolvedValue(2);
      const res = await service.getQueueStats(TENANT_A);
      expect(prisma.autoJeQueue.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
      );
      expect(res).toEqual({ pending: 2, approved: 2, rejected: 2, total: 6 });
    });
  });
});
