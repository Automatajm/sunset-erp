// ============================================================================
// Unit tests for FiscalPeriodsService — spec-033-fiscal-periods
// PrismaService fully mocked; assert tenant-scoped writes, the state machine,
// and the { fiscalPeriods, count } envelope.
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { FiscalPeriodsService } from './fiscal-periods.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';
const USER = 'user-uuid';

describe('FiscalPeriodsService', () => {
  let service: FiscalPeriodsService;
  let prisma: {
    fiscalPeriod: Record<string, jest.Mock>;
    journalEntry: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    prisma = {
      fiscalPeriod: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      journalEntry: { count: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [FiscalPeriodsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(FiscalPeriodsService);
  });

  // ── create ──────────────────────────────────────────────────────────────
  describe('create', () => {
    it('throws ConflictException on a duplicate period code', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 'p1' });
      await expect(
        service.create(TENANT_A, USER, { periodCode: '2026-03' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a period stamped with tenantId', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue(null);
      prisma.fiscalPeriod.create.mockResolvedValue({ id: 'p1' });
      await service.create(TENANT_A, USER, {
        periodCode: '2026-03',
        periodName: 'Mar',
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        fiscalYear: '2026',
      } as any);
      expect(prisma.fiscalPeriod.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT_A }) }),
      );
    });

    it('unsets prior current periods (tenant-scoped) when isCurrent', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue(null);
      prisma.fiscalPeriod.create.mockResolvedValue({ id: 'p1' });
      await service.create(TENANT_A, USER, {
        periodCode: '2026-03',
        periodName: 'Mar',
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        fiscalYear: '2026',
        isCurrent: true,
      } as any);
      expect(prisma.fiscalPeriod.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A, isCurrent: true }),
        }),
      );
    });
  });

  // ── findAll envelope ──────────────────────────────────────────────────────
  describe('findAll', () => {
    it('scopes by tenantId and returns { fiscalPeriods, count }', async () => {
      prisma.fiscalPeriod.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      const res = await service.findAll(TENANT_A);
      expect(prisma.fiscalPeriod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
        }),
      );
      expect(res).toEqual({ fiscalPeriods: [{ id: 'p1' }, { id: 'p2' }], count: 2 });
    });
  });

  // ── findOne / current ─────────────────────────────────────────────────────
  describe('findOne', () => {
    it('throws NotFoundException for an id in another tenant', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update (tenant-scoped) ────────────────────────────────────────────────
  describe('update', () => {
    it('scopes the write by tenantId and refetches', async () => {
      prisma.fiscalPeriod.findFirst
        .mockResolvedValueOnce({ id: 'p1' }) // findOne
        .mockResolvedValueOnce({ id: 'p1', periodName: 'new' }); // refetch
      prisma.fiscalPeriod.updateMany.mockResolvedValue({ count: 1 });
      await service.update(TENANT_A, USER, 'p1', { periodName: 'new' } as any);
      expect(prisma.fiscalPeriod.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1', tenantId: TENANT_A, deletedAt: null } }),
      );
    });
  });

  // ── state machine ─────────────────────────────────────────────────────────
  describe('closePeriod', () => {
    it('rejects an already-closed period', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 'p1', status: 'closed' });
      await expect(service.closePeriod(TENANT_A, USER, 'p1')).rejects.toThrow(BadRequestException);
    });

    it('blocks closing when unposted JEs exist', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({
        id: 'p1',
        status: 'open',
        periodCode: '2026-03',
      });
      prisma.journalEntry.count.mockResolvedValue(3);
      await expect(service.closePeriod(TENANT_A, USER, 'p1')).rejects.toThrow(BadRequestException);
    });

    it('closes an open period with no unposted JEs (tenant-scoped write)', async () => {
      prisma.fiscalPeriod.findFirst
        .mockResolvedValueOnce({ id: 'p1', status: 'open', periodCode: '2026-03' })
        .mockResolvedValueOnce({ id: 'p1', status: 'closed', periodCode: '2026-03' });
      prisma.journalEntry.count.mockResolvedValue(0);
      prisma.fiscalPeriod.updateMany.mockResolvedValue({ count: 1 });
      const res = await service.closePeriod(TENANT_A, USER, 'p1');
      expect(prisma.fiscalPeriod.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1', tenantId: TENANT_A, deletedAt: null } }),
      );
      expect(res.message).toContain('closed');
    });
  });

  describe('reopenPeriod', () => {
    it('rejects reopening a locked period', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 'p1', status: 'locked' });
      await expect(service.reopenPeriod(TENANT_A, USER, 'p1')).rejects.toThrow(BadRequestException);
    });
    it('rejects reopening an open period', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 'p1', status: 'open' });
      await expect(service.reopenPeriod(TENANT_A, USER, 'p1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('lockPeriod', () => {
    it('locks only a closed period (tenant-scoped)', async () => {
      prisma.fiscalPeriod.findFirst
        .mockResolvedValueOnce({ id: 'p1', status: 'closed', periodCode: '2026-03' })
        .mockResolvedValueOnce({ id: 'p1', status: 'locked', periodCode: '2026-03' });
      prisma.fiscalPeriod.updateMany.mockResolvedValue({ count: 1 });
      await service.lockPeriod(TENANT_A, USER, 'p1');
      expect(prisma.fiscalPeriod.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1', tenantId: TENANT_A, deletedAt: null } }),
      );
    });
    it('rejects locking a non-closed period', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 'p1', status: 'open' });
      await expect(service.lockPeriod(TENANT_A, USER, 'p1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('unlockPeriod', () => {
    it('rejects unlocking a non-locked period', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 'p1', status: 'open' });
      await expect(service.unlockPeriod(TENANT_A, USER, 'p1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────
  describe('remove', () => {
    it('refuses to delete a closed period', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 'p1', status: 'closed' });
      await expect(service.remove(TENANT_A, USER, 'p1')).rejects.toThrow(BadRequestException);
    });

    it('refuses to delete a period that has JEs', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({
        id: 'p1',
        status: 'open',
        periodCode: '2026-03',
      });
      prisma.journalEntry.count.mockResolvedValue(2);
      await expect(service.remove(TENANT_A, USER, 'p1')).rejects.toThrow(BadRequestException);
    });

    it('soft-deletes an empty open period (tenant-scoped)', async () => {
      prisma.fiscalPeriod.findFirst.mockResolvedValue({
        id: 'p1',
        status: 'open',
        periodCode: '2026-03',
      });
      prisma.journalEntry.count.mockResolvedValue(0);
      prisma.fiscalPeriod.updateMany.mockResolvedValue({ count: 1 });
      await service.remove(TENANT_A, USER, 'p1');
      expect(prisma.fiscalPeriod.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1', tenantId: TENANT_A, deletedAt: null },
          data: expect.objectContaining({ deletedBy: USER }),
        }),
      );
    });
  });
});
