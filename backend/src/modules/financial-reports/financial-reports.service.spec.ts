// ============================================================================
// Unit tests for FinancialReportsService — spec-032-financial-reports
// PrismaService mocked; assert tenant-scoped queries, date validation, and the
// general-ledger unknown-account 404. Report math is exercised lightly (shape).
// ============================================================================
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinancialReportsService } from './financial-reports.service';
import { PrismaService } from '../../database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

const TENANT_A = 'tenant-a-uuid';

describe('FinancialReportsService', () => {
  let service: FinancialReportsService;
  let prisma: {
    journalEntryLine: Record<string, jest.Mock>;
    account: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    prisma = {
      journalEntryLine: { findMany: jest.fn().mockResolvedValue([]) },
      account: { findFirst: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [FinancialReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(FinancialReportsService);
  });

  // ── date validation ────────────────────────────────────────────────────────
  describe('date validation', () => {
    it('rejects a half-specified range (startDate only)', async () => {
      await expect(
        service.getTrialBalance(TENANT_A, { startDate: '2026-01-01' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a half-specified range (endDate only)', async () => {
      await expect(
        service.getProfitAndLoss(TENANT_A, { endDate: '2026-01-01' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an inverted range', async () => {
      await expect(
        service.getTrialBalance(TENANT_A, {
          startDate: '2026-03-31',
          endDate: '2026-01-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows no dates (all-time report)', async () => {
      const res = await service.getTrialBalance(TENANT_A, {} as any);
      expect(res.reportName).toBe('Trial Balance');
    });

    it('allows a valid range', async () => {
      const res = await service.getProfitAndLoss(TENANT_A, {
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      } as any);
      expect(res.reportName).toBe('Profit & Loss Statement');
    });
  });

  // ── tenant scoping ─────────────────────────────────────────────────────────
  describe('tenant scoping', () => {
    it('trial-balance scopes the line and nested journalEntry by tenantId + posted', async () => {
      await service.getTrialBalance(TENANT_A, {} as any);
      expect(prisma.journalEntryLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_A,
            deletedAt: null,
            journalEntry: expect.objectContaining({ tenantId: TENANT_A, status: 'posted' }),
          }),
        }),
      );
    });
  });

  // ── general ledger account check ───────────────────────────────────────────
  describe('getGeneralLedger', () => {
    it('throws NotFoundException when accountNumber does not exist in the tenant', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(
        service.getGeneralLedger(TENANT_A, { accountNumber: '9.9.99' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.account.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_A,
            accountNumber: '9.9.99',
            deletedAt: null,
          }),
        }),
      );
    });

    it('proceeds when the account exists', async () => {
      prisma.account.findFirst.mockResolvedValue({ id: 'a1' });
      const res = await service.getGeneralLedger(TENANT_A, { accountNumber: '1.1.01' } as any);
      expect(res.reportName).toBe('General Ledger');
    });

    it('does not check an account when no accountNumber is given', async () => {
      await service.getGeneralLedger(TENANT_A, {} as any);
      expect(prisma.account.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── balance sheet ──────────────────────────────────────────────────────────
  describe('getBalanceSheet', () => {
    it('returns a balanced report shape from empty data (as-of endDate only)', async () => {
      const res = await service.getBalanceSheet(TENANT_A, { endDate: '2026-03-31' } as any);
      expect(res.reportName).toBe('Balance Sheet');
      expect(res).toHaveProperty('isBalanced');
      expect(res.assets).toHaveProperty('total');
    });

    it('synthesizes current-period net income into equity', async () => {
      // revenue 1000 cr, expense 400 dr → NI 600 should appear as equity line 3.2.99
      prisma.journalEntryLine.findMany
        .mockResolvedValueOnce([]) // BS accounts
        .mockResolvedValueOnce([
          {
            account: { accountType: 'revenue' },
            creditAmount: new Decimal(1000),
            debitAmount: new Decimal(0),
          },
          {
            account: { accountType: 'expense' },
            creditAmount: new Decimal(0),
            debitAmount: new Decimal(400),
          },
        ]);
      const res = await service.getBalanceSheet(TENANT_A, {} as any);
      const ni = res.equity.accounts.find((a: any) => a.accountNumber === '3.2.99');
      expect(ni?.amount).toBe(600);
    });
  });
});
