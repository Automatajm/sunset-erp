// ============================================================================
// Unit tests for BudgetsService — spec-029-budgets
// PrismaService is fully mocked; these assert behavior (tenant scoping, error
// paths, envelope), never a real DB.
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { PrismaService } from '../../database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';
const USER = 'user-uuid';

describe('BudgetsService', () => {
  let service: BudgetsService;
  let prisma: {
    budget: Record<string, jest.Mock>;
    budgetLine: Record<string, jest.Mock>;
    account: Record<string, jest.Mock>;
    journalEntryLine: Record<string, jest.Mock>;
    salesOrder: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      budget: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      budgetLine: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      account: { findFirst: jest.fn() },
      journalEntryLine: { aggregate: jest.fn() },
      salesOrder: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      providers: [BudgetsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(BudgetsService);
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates a draft budget when the code is free', async () => {
      prisma.budget.findFirst.mockResolvedValue(null);
      prisma.budget.create.mockResolvedValue({ id: 'b1', budgetCode: 'B-2026' });
      const res = await service.create(TENANT_A, USER, {
        budgetCode: 'B-2026',
        budgetName: '2026',
        fiscalYear: '2026',
      } as any);
      expect(prisma.budget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_A, status: 'draft' }),
        }),
      );
      expect(res).toEqual({ id: 'b1', budgetCode: 'B-2026' });
    });

    it('throws ConflictException on a live duplicate code', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'b1', deletedAt: null });
      await expect(service.create(TENANT_A, USER, { budgetCode: 'B-2026' } as any)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.budget.create).not.toHaveBeenCalled();
    });

    it('reclaims a soft-deleted code with tenant-scoped deletes', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'old', deletedAt: new Date() });
      prisma.budget.create.mockResolvedValue({ id: 'new' });
      await service.create(TENANT_A, USER, { budgetCode: 'B-2026' } as any);
      expect(prisma.budgetLine.deleteMany).toHaveBeenCalledWith({
        where: { budgetId: 'old', tenantId: TENANT_A },
      });
      expect(prisma.budget.deleteMany).toHaveBeenCalledWith({
        where: { id: 'old', tenantId: TENANT_A },
      });
    });

    it('maps a P2002 race to ConflictException', async () => {
      prisma.budget.findFirst.mockResolvedValue(null);
      prisma.budget.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.create(TENANT_A, USER, { budgetCode: 'B-2026' } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('scopes to tenantId + deletedAt: null and returns the { budgets, count } envelope', async () => {
      prisma.budget.findMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
      const res = await service.findAll(TENANT_A);
      expect(prisma.budget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
        }),
      );
      expect(res).toEqual({ budgets: [{ id: 'b1' }, { id: 'b2' }], count: 2 });
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('throws NotFoundException for an id owned by another tenant', async () => {
      prisma.budget.findFirst.mockResolvedValue(null); // wrong-tenant query returns nothing
      await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
      expect(prisma.budget.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'owned-by-A', tenantId: TENANT_B, deletedAt: null }),
        }),
      );
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('scopes the write by tenantId (updateMany) and refetches', async () => {
      prisma.budget.findFirst
        .mockResolvedValueOnce({ id: 'b1', status: 'draft', budgetCode: 'B-2026' }) // findOne
        .mockResolvedValueOnce({ id: 'b1', budgetName: 'new' }); // refetch
      prisma.budget.updateMany.mockResolvedValue({ count: 1 });
      await service.update(TENANT_A, USER, 'b1', { budgetName: 'new' } as any);
      expect(prisma.budget.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1', tenantId: TENANT_A, deletedAt: null },
        }),
      );
    });

    it('rejects edits to an approved budget', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'b1', status: 'approved' });
      await expect(service.update(TENANT_A, USER, 'b1', {} as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.budget.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────
  describe('remove', () => {
    it('soft-deletes a draft budget scoped by tenantId', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'b1', status: 'draft', budgetCode: 'B' });
      prisma.budget.updateMany.mockResolvedValue({ count: 1 });
      await service.remove(TENANT_A, USER, 'b1');
      expect(prisma.budget.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1', tenantId: TENANT_A, deletedAt: null },
          data: expect.objectContaining({ deletedBy: USER }),
        }),
      );
    });

    it('refuses to delete a non-draft budget', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'b1', status: 'approved' });
      await expect(service.remove(TENANT_A, USER, 'b1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── budget lines ──────────────────────────────────────────────────────────
  describe('addBudgetLine', () => {
    it('throws NotFoundException when the account is not in the tenant', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'b1', status: 'draft' });
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.addBudgetLine(TENANT_A, USER, 'b1', {
          accountId: 'a1',
          fiscalPeriod: '2026-01',
          budgetAmount: 100,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a duplicate account+period line', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'b1', status: 'draft' });
      prisma.account.findFirst.mockResolvedValue({ id: 'a1', accountNumber: '5.1' });
      prisma.budgetLine.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.addBudgetLine(TENANT_A, USER, 'b1', {
          accountId: 'a1',
          fiscalPeriod: '2026-01',
          budgetAmount: 100,
        } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateBudgetLine', () => {
    it('scopes the write by tenantId', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'b1', status: 'draft' });
      prisma.budgetLine.findFirst
        .mockResolvedValueOnce({ id: 'l1' }) // ownership check
        .mockResolvedValueOnce({ id: 'l1', notes: 'x' }); // refetch
      prisma.budgetLine.updateMany.mockResolvedValue({ count: 1 });
      await service.updateBudgetLine(TENANT_A, USER, 'b1', 'l1', { notes: 'x' } as any);
      expect(prisma.budgetLine.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'l1', tenantId: TENANT_A, deletedAt: null } }),
      );
    });

    it('throws NotFoundException for a line not in the tenant', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'b1', status: 'draft' });
      prisma.budgetLine.findFirst.mockResolvedValue(null);
      await expect(service.updateBudgetLine(TENANT_B, USER, 'b1', 'l1', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeBudgetLine', () => {
    it('soft-deletes scoped by tenantId', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'b1', status: 'draft' });
      prisma.budgetLine.findFirst.mockResolvedValue({ id: 'l1' });
      prisma.budgetLine.updateMany.mockResolvedValue({ count: 1 });
      await service.removeBudgetLine(TENANT_A, USER, 'b1', 'l1');
      expect(prisma.budgetLine.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'l1', tenantId: TENANT_A, deletedAt: null } }),
      );
    });
  });

  // ── approval ────────────────────────────────────────────────────────────────
  describe('approveBudget', () => {
    it('approves a draft budget with lines, scoped by tenantId', async () => {
      prisma.budget.findFirst
        .mockResolvedValueOnce({
          id: 'b1',
          status: 'draft',
          budgetCode: 'B',
          budgetLines: [{ id: 'l1' }],
        })
        .mockResolvedValueOnce({ id: 'b1', status: 'approved', budgetCode: 'B' });
      prisma.budget.updateMany.mockResolvedValue({ count: 1 });
      const res = await service.approveBudget(TENANT_A, USER, 'b1');
      expect(prisma.budget.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b1', tenantId: TENANT_A, deletedAt: null },
          data: expect.objectContaining({ status: 'approved' }),
        }),
      );
      expect(res.message).toContain('approved');
    });

    it('rejects approving a budget with no lines', async () => {
      prisma.budget.findFirst.mockResolvedValue({ id: 'b1', status: 'draft', budgetLines: [] });
      await expect(service.approveBudget(TENANT_A, USER, 'b1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects re-approving an approved budget', async () => {
      prisma.budget.findFirst.mockResolvedValue({
        id: 'b1',
        status: 'approved',
        budgetLines: [{ id: 'l1' }],
      });
      await expect(service.approveBudget(TENANT_A, USER, 'b1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── vs-actual ─────────────────────────────────────────────────────────────
  describe('getBudgetVsActual', () => {
    it('aggregates posted JE lines scoped by tenantId and computes variance', async () => {
      prisma.budget.findFirst.mockResolvedValue({
        id: 'b1',
        budgetCode: 'B',
        budgetName: 'N',
        fiscalYear: '2026',
        budgetLines: [],
      });
      prisma.budgetLine.findMany.mockResolvedValue([
        {
          accountId: 'a1',
          fiscalPeriod: '2026-01',
          budgetAmount: new Decimal(1000),
          account: { accountNumber: '5.1', name: 'Mat', accountType: 'expense' },
        },
      ]);
      prisma.journalEntryLine.aggregate.mockResolvedValue({
        _sum: { debitAmount: null, creditAmount: null },
      });
      await service.getBudgetVsActual(TENANT_A, 'b1');
      expect(prisma.budgetLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
        }),
      );
      expect(prisma.journalEntryLine.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
        }),
      );
    });
  });

  // ── rollForward ─────────────────────────────────────────────────────────────
  describe('rollForward', () => {
    const source = {
      id: 'src',
      budgetName: '2026 Budget',
      description: 'ops',
      status: 'approved',
      budgetLines: [
        {
          accountId: 'a1',
          fiscalPeriod: '2026-01',
          budgetAmount: new Decimal(1000),
          notes: 'n1',
          deletedAt: null,
        },
        {
          accountId: 'a1',
          fiscalPeriod: '2026-Q2',
          budgetAmount: new Decimal(200),
          notes: null,
          deletedAt: null,
        },
        {
          accountId: 'a2',
          fiscalPeriod: '2026-02',
          budgetAmount: new Decimal(999),
          notes: null,
          deletedAt: new Date(),
        }, // soft-deleted → skipped
      ],
    };

    beforeEach(() => {
      prisma.budgetLine.createMany = jest.fn().mockResolvedValue({ count: 2 });
      prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
      prisma.budget.create.mockResolvedValue({ id: 'new' });
    });

    it('copies active lines, remaps the period year and scales amounts by growthPercent', async () => {
      prisma.budget.findFirst
        .mockResolvedValueOnce(source) // findOne(source)
        .mockResolvedValueOnce(null) // target-code uniqueness
        .mockResolvedValueOnce({ id: 'new', budgetLines: [] }); // findOne(result)

      const res = await service.rollForward(TENANT_A, USER, 'src', {
        targetFiscalYear: '2027',
        targetBudgetCode: 'BUDGET-2027',
        growthPercent: 5,
      } as any);

      expect(prisma.budget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fiscalYear: '2027',
            status: 'draft',
            budgetCode: 'BUDGET-2027',
          }),
        }),
      );
      const lines = prisma.budgetLine.createMany.mock.calls[0][0].data;
      expect(lines).toHaveLength(2); // soft-deleted line excluded
      expect(lines.map((l: any) => l.fiscalPeriod)).toEqual(['2027-01', '2027-Q2']);
      expect(lines[0].budgetAmount.toString()).toBe('1050'); // 1000 * 1.05
      expect(lines[1].budgetAmount.toString()).toBe('210'); // 200 * 1.05
      expect(res.linesCopied).toBe(2);
      expect(res.growthPercent).toBe(5);
    });

    it('defaults growth to 0 (amounts unchanged) and names "<source> (FY<year>)"', async () => {
      prisma.budget.findFirst
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'new', budgetLines: [] });

      await service.rollForward(TENANT_A, USER, 'src', {
        targetFiscalYear: '2027',
        targetBudgetCode: 'BUDGET-2027',
      } as any);

      expect(prisma.budget.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ budgetName: '2026 Budget (FY2027)' }),
        }),
      );
      const lines = prisma.budgetLine.createMany.mock.calls[0][0].data;
      expect(lines[0].budgetAmount.toString()).toBe('1000');
    });

    it('throws ConflictException when the target code is taken', async () => {
      prisma.budget.findFirst.mockResolvedValueOnce(source).mockResolvedValueOnce({ id: 'dup' }); // code exists
      await expect(
        service.rollForward(TENANT_A, USER, 'src', {
          targetFiscalYear: '2027',
          targetBudgetCode: 'DUP',
        } as any),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the source has no active lines', async () => {
      prisma.budget.findFirst.mockResolvedValueOnce({ id: 'src', budgetLines: [] });
      await expect(
        service.rollForward(TENANT_A, USER, 'src', {
          targetFiscalYear: '2027',
          targetBudgetCode: 'X',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
