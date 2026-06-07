// ============================================================================
// Unit tests for CashFlowService — spec-030-cash-flow
// PrismaService fully mocked; assert behavior (tenant scoping, error paths,
// envelope), never a real DB.
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CashFlowService } from './cash-flow.service';
import { PrismaService } from '../../database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';
const USER = 'user-uuid';

describe('CashFlowService', () => {
  let service: CashFlowService;
  let prisma: {
    cashFlowProjection: Record<string, jest.Mock>;
    cashFlowLine: Record<string, jest.Mock>;
    account: Record<string, jest.Mock>;
    arInvoice: Record<string, jest.Mock>;
    purchaseOrder: Record<string, jest.Mock>;
    budgetLine: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    prisma = {
      cashFlowProjection: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      cashFlowLine: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        createMany: jest.fn(),
      },
      account: { findFirst: jest.fn() },
      arInvoice: { findMany: jest.fn() },
      purchaseOrder: { findMany: jest.fn() },
      budgetLine: { findMany: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [CashFlowService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(CashFlowService);
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe('create', () => {
    const dto = {
      projectionCode: 'CFP-1',
      projectionName: 'P',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    } as any;

    it('creates a projection when the code is free', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue(null);
      prisma.cashFlowProjection.create.mockResolvedValue({ id: 'p1' });
      await service.create(TENANT_A, USER, dto);
      expect(prisma.cashFlowProjection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT_A }) }),
      );
    });

    it('throws ConflictException on a live duplicate code', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue({ id: 'p1' });
      await expect(service.create(TENANT_A, USER, dto)).rejects.toThrow(ConflictException);
      expect(prisma.cashFlowProjection.create).not.toHaveBeenCalled();
    });

    it('maps a P2002 race to ConflictException', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue(null);
      prisma.cashFlowProjection.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.create(TENANT_A, USER, dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('scopes to tenantId + deletedAt: null and returns { cashFlowProjections, count }', async () => {
      prisma.cashFlowProjection.findMany.mockResolvedValue([{ id: 'p1' }]);
      const res = await service.findAll(TENANT_A);
      expect(prisma.cashFlowProjection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
        }),
      );
      expect(res).toEqual({ cashFlowProjections: [{ id: 'p1' }], count: 1 });
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('throws NotFoundException for an id owned by another tenant', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
      expect(prisma.cashFlowProjection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'owned-by-A', tenantId: TENANT_B, deletedAt: null }),
        }),
      );
    });
  });

  // ── update / remove (tenant-scoped writes) ─────────────────────────────────
  describe('update', () => {
    it('scopes the write by tenantId (updateMany) and refetches', async () => {
      prisma.cashFlowProjection.findFirst
        .mockResolvedValueOnce({ id: 'p1' }) // findOne
        .mockResolvedValueOnce({ id: 'p1', projectionName: 'new' }); // refetch
      prisma.cashFlowProjection.updateMany.mockResolvedValue({ count: 1 });
      await service.update(TENANT_A, USER, 'p1', { projectionName: 'new' } as any);
      expect(prisma.cashFlowProjection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1', tenantId: TENANT_A, deletedAt: null } }),
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes scoped by tenantId', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue({ id: 'p1', projectionCode: 'C' });
      prisma.cashFlowProjection.updateMany.mockResolvedValue({ count: 1 });
      await service.remove(TENANT_A, USER, 'p1');
      expect(prisma.cashFlowProjection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1', tenantId: TENANT_A, deletedAt: null },
          data: expect.objectContaining({ deletedBy: USER }),
        }),
      );
    });
  });

  // ── lines ────────────────────────────────────────────────────────────────
  describe('addCashFlowLine', () => {
    it('throws NotFoundException when accountId is given but not in tenant', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.addCashFlowLine(TENANT_A, USER, 'p1', {
          lineDate: '2026-01-01',
          lineType: 'inflow',
          category: 'x',
          amount: 100,
          accountId: 'a1',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a tenant-stamped line', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.cashFlowLine.create.mockResolvedValue({ id: 'l1' });
      await service.addCashFlowLine(TENANT_A, USER, 'p1', {
        lineDate: '2026-01-01',
        lineType: 'inflow',
        category: 'x',
        amount: 100,
      } as any);
      expect(prisma.cashFlowLine.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_A, cashFlowProjectionId: 'p1' }),
        }),
      );
    });
  });

  describe('updateCashFlowLine', () => {
    it('scopes the write by tenantId', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.cashFlowLine.findFirst
        .mockResolvedValueOnce({ id: 'l1' }) // ownership
        .mockResolvedValueOnce({ id: 'l1', amount: new Decimal(5) }); // refetch
      prisma.cashFlowLine.updateMany.mockResolvedValue({ count: 1 });
      await service.updateCashFlowLine(TENANT_A, USER, 'p1', 'l1', { amount: 5 } as any);
      expect(prisma.cashFlowLine.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'l1', tenantId: TENANT_A, deletedAt: null } }),
      );
    });

    it('throws NotFoundException for a line not in the tenant', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.cashFlowLine.findFirst.mockResolvedValue(null);
      await expect(
        service.updateCashFlowLine(TENANT_B, USER, 'p1', 'l1', {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeCashFlowLine', () => {
    it('soft-deletes scoped by tenantId', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.cashFlowLine.findFirst.mockResolvedValue({ id: 'l1' });
      prisma.cashFlowLine.updateMany.mockResolvedValue({ count: 1 });
      await service.removeCashFlowLine(TENANT_A, USER, 'p1', 'l1');
      expect(prisma.cashFlowLine.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'l1', tenantId: TENANT_A, deletedAt: null } }),
      );
    });
  });

  // ── summary ──────────────────────────────────────────────────────────────
  describe('getCashFlowSummary', () => {
    it('groups lines by month with inflow/outflow totals and running balance', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue({
        id: 'p1',
        projectionCode: 'C',
        projectionName: 'N',
        scenario: 'realistic',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-28'),
        cashFlowLines: [
          {
            lineDate: new Date('2026-01-10'),
            lineType: 'inflow',
            category: 'ar',
            amount: new Decimal(1000),
            description: 'a',
          },
          {
            lineDate: new Date('2026-01-20'),
            lineType: 'outflow',
            category: 'ap',
            amount: new Decimal(400),
            description: 'b',
          },
        ],
      });
      const res = await service.getCashFlowSummary(TENANT_A, 'p1');
      expect(res.periods).toHaveLength(1);
      expect(res.periods[0].totalInflows).toBe(1000);
      expect(res.periods[0].totalOutflows).toBe(400);
      expect(res.periods[0].netCashFlow).toBe(600);
      expect(res.totals.endingBalance).toBe(600);
    });
  });

  // ── generate-from-data ─────────────────────────────────────────────────────
  describe('generateFromData', () => {
    it('scopes every source query to tenantId and bulk-inserts tenant-stamped lines', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue({
        id: 'p1',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
      });
      prisma.arInvoice.findMany.mockResolvedValue([
        {
          invoiceNumber: 'AR-1',
          invoiceDate: new Date('2026-01-15'),
          totalAmount: new Decimal(500),
          customer: { name: 'C' },
        },
      ]);
      prisma.purchaseOrder.findMany.mockResolvedValue([]);
      prisma.budgetLine.findMany.mockResolvedValue([]);
      prisma.cashFlowLine.createMany.mockResolvedValue({ count: 1 });
      await service.generateFromData(TENANT_A, USER, 'p1', {});
      expect(prisma.arInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
        }),
      );
      const inserted = prisma.cashFlowLine.createMany.mock.calls[0][0].data;
      expect(inserted[0]).toEqual(
        expect.objectContaining({ tenantId: TENANT_A, lineType: 'inflow' }),
      );
    });

    it('returns a no-op message when nothing matches', async () => {
      prisma.cashFlowProjection.findFirst.mockResolvedValue({
        id: 'p1',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
      });
      prisma.arInvoice.findMany.mockResolvedValue([]);
      prisma.purchaseOrder.findMany.mockResolvedValue([]);
      prisma.budgetLine.findMany.mockResolvedValue([]);
      const res = await service.generateFromData(TENANT_A, USER, 'p1', {});
      expect(res.linesCreated).toBe(0);
      expect(prisma.cashFlowLine.createMany).not.toHaveBeenCalled();
    });
  });
});
