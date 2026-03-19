import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ReportParametersDto } from './dto/report-parameters.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class FinancialReportsService {
  constructor(private prisma: PrismaService) {}

  async getTrialBalance(tenantId: string, params: ReportParametersDto) {
    const where: any = { tenantId, deletedAt: null, status: 'posted' };
    if (params.fiscalPeriod) {
      where.fiscalPeriod = params.fiscalPeriod;
    } else if (params.startDate && params.endDate) {
      where.entryDate = { gte: new Date(params.startDate), lte: new Date(params.endDate) };
    }

    const lines = await this.prisma.journalEntryLine.findMany({
      where: { tenantId, deletedAt: null, journalEntry: where },
      include: {
        account: { select: { accountNumber: true, name: true, accountType: true } },
      },
    });

    const accountBalances = new Map<string, any>();
    for (const line of lines) {
      if (!accountBalances.has(line.accountId)) {
        accountBalances.set(line.accountId, {
          accountNumber: line.account.accountNumber,
          accountName: line.account.name,
          accountType: line.account.accountType,
          totalDebits: new Decimal(0),
          totalCredits: new Decimal(0),
        });
      }
      const b = accountBalances.get(line.accountId);
      b.totalDebits  = b.totalDebits.plus(line.debitAmount);
      b.totalCredits = b.totalCredits.plus(line.creditAmount);
    }

    const balances = Array.from(accountBalances.values())
      .map(acc => ({
        accountNumber: acc.accountNumber,
        accountName:   acc.accountName,
        accountType:   acc.accountType,
        totalDebits:   acc.totalDebits.toNumber(),
        totalCredits:  acc.totalCredits.toNumber(),
        netBalance:    acc.totalDebits.minus(acc.totalCredits).toNumber(),
      }))
      .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

    const totalDebits  = balances.reduce((s, a) => s + a.totalDebits,  0);
    const totalCredits = balances.reduce((s, a) => s + a.totalCredits, 0);

    return {
      reportName: 'Trial Balance',
      parameters: params,
      asOfDate: params.endDate || new Date().toISOString().split('T')[0],
      accounts: balances,
      totals: {
        totalDebits,
        totalCredits,
        difference: totalDebits - totalCredits,
        isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
      },
    };
  }

  async getProfitAndLoss(tenantId: string, params: ReportParametersDto) {
    const where: any = { tenantId, deletedAt: null, status: 'posted' };
    if (params.fiscalPeriod) {
      where.fiscalPeriod = params.fiscalPeriod;
    } else if (params.startDate && params.endDate) {
      where.entryDate = { gte: new Date(params.startDate), lte: new Date(params.endDate) };
    }

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        tenantId,
        deletedAt: null,
        journalEntry: where,
        account: { accountType: { in: ['revenue', 'expense', 'cost'] } },
      },
      include: {
        account: {
          select: {
            accountNumber: true,
            name: true,
            accountType: true,
            accountCategory: true,
          },
        },
      },
    });

    const accountBalances = new Map<string, any>();
    for (const line of lines) {
      if (!accountBalances.has(line.accountId)) {
        accountBalances.set(line.accountId, {
          accountNumber: line.account.accountNumber,
          accountName:   line.account.name,
          accountType:   line.account.accountType,
          accountCategory: line.account.accountCategory,
          balance: new Decimal(0),
        });
      }
      const b = accountBalances.get(line.accountId);
      if (line.account.accountType === 'revenue') {
        b.balance = b.balance.plus(line.creditAmount).minus(line.debitAmount);
      } else {
        // expense and cost: debits increase
        b.balance = b.balance.plus(line.debitAmount).minus(line.creditAmount);
      }
    }

    const revenues:  any[] = [];
    const costOfSales: any[] = [];
    const expenses:  any[] = [];

    for (const [, acc] of accountBalances) {
      const item = {
        accountNumber:   acc.accountNumber,
        accountName:     acc.accountName,
        accountCategory: acc.accountCategory,
        amount: acc.balance.toNumber(),
      };
      if (acc.accountType === 'revenue') {
        revenues.push(item);
      } else if (acc.accountType === 'cost') {
        costOfSales.push(item);
      } else {
        expenses.push(item);
      }
    }

    revenues.sort((a, b)    => a.accountNumber.localeCompare(b.accountNumber));
    costOfSales.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
    expenses.sort((a, b)    => a.accountNumber.localeCompare(b.accountNumber));

    const totalRevenue     = revenues.reduce((s, a)    => s + a.amount, 0);
    const totalCostOfSales = costOfSales.reduce((s, a) => s + a.amount, 0);
    const totalExpenses    = expenses.reduce((s, a)    => s + a.amount, 0);
    const grossProfit      = totalRevenue - totalCostOfSales;
    const netIncome        = grossProfit  - totalExpenses;

    return {
      reportName: 'Profit & Loss Statement',
      parameters: params,
      period: {
        startDate: params.startDate || 'inception',
        endDate:   params.endDate   || new Date().toISOString().split('T')[0],
      },
      revenue: {
        accounts: revenues,
        total:    totalRevenue,
      },
      costOfSales: {
        accounts: costOfSales,
        total:    totalCostOfSales,
      },
      grossProfit,
      expenses: {
        accounts: expenses,
        total:    totalExpenses,
      },
      netIncome,
    };
  }

  async getBalanceSheet(tenantId: string, params: ReportParametersDto) {
    const where: any = { tenantId, deletedAt: null, status: 'posted' };
    if (params.endDate) {
      where.entryDate = { lte: new Date(params.endDate) };
    }

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        tenantId,
        deletedAt: null,
        journalEntry: where,
        account: { accountType: { in: ['asset', 'liability', 'equity'] } },
      },
      include: {
        account: {
          select: {
            accountNumber: true,
            name: true,
            accountType: true,
            accountCategory: true,
          },
        },
      },
    });

    const accountBalances = new Map<string, any>();
    for (const line of lines) {
      if (!accountBalances.has(line.accountId)) {
        accountBalances.set(line.accountId, {
          accountNumber:   line.account.accountNumber,
          accountName:     line.account.name,
          accountType:     line.account.accountType,
          accountCategory: line.account.accountCategory,
          balance: new Decimal(0),
        });
      }
      const b = accountBalances.get(line.accountId);
      if (line.account.accountType === 'asset') {
        b.balance = b.balance.plus(line.debitAmount).minus(line.creditAmount);
      } else {
        b.balance = b.balance.plus(line.creditAmount).minus(line.debitAmount);
      }
    }

    const assets: any[] = [], liabilities: any[] = [], equity: any[] = [];
    for (const [, acc] of accountBalances) {
      const item = {
        accountNumber:   acc.accountNumber,
        accountName:     acc.accountName,
        accountCategory: acc.accountCategory,
        amount: acc.balance.toNumber(),
      };
      if (acc.accountType === 'asset')           assets.push(item);
      else if (acc.accountType === 'liability')  liabilities.push(item);
      else                                       equity.push(item);
    }

    assets.sort((a, b)      => a.accountNumber.localeCompare(b.accountNumber));
    liabilities.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
    equity.sort((a, b)      => a.accountNumber.localeCompare(b.accountNumber));

    const totalAssets      = assets.reduce((s, a)      => s + a.amount, 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + a.amount, 0);
    const totalEquity      = equity.reduce((s, a)      => s + a.amount, 0);

    return {
      reportName: 'Balance Sheet',
      parameters: params,
      asOfDate: params.endDate || new Date().toISOString().split('T')[0],
      assets:      { accounts: assets,      total: totalAssets      },
      liabilities: { accounts: liabilities, total: totalLiabilities },
      equity:      { accounts: equity,      total: totalEquity      },
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
  }

  async getGeneralLedger(tenantId: string, params: ReportParametersDto) {
    const where: any = { tenantId, deletedAt: null, status: 'posted' };
    if (params.fiscalPeriod) {
      where.fiscalPeriod = params.fiscalPeriod;
    } else if (params.startDate && params.endDate) {
      where.entryDate = { gte: new Date(params.startDate), lte: new Date(params.endDate) };
    }

    const accountWhere: any = {};
    if (params.accountNumber) accountWhere.accountNumber = params.accountNumber;

    const lines = await this.prisma.journalEntryLine.findMany({
      where: { tenantId, deletedAt: null, journalEntry: where, account: accountWhere },
      include: {
        account: { select: { accountNumber: true, name: true, accountType: true } },
        journalEntry: { select: { entryNumber: true, entryDate: true, description: true } },
      },
      orderBy: [
        { account: { accountNumber: 'asc' } },
        { journalEntry: { entryDate: 'asc' } },
      ],
    });

    return {
      reportName: 'General Ledger',
      parameters: params,
      entries: lines.map(line => ({
        date:          line.journalEntry.entryDate,
        entryNumber:   line.journalEntry.entryNumber,
        accountNumber: line.account.accountNumber,
        accountName:   line.account.name,
        description:   line.description || line.journalEntry.description,
        debit:         line.debitAmount.toNumber(),
        credit:        line.creditAmount.toNumber(),
      })),
    };
  }
}
