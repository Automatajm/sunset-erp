import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ReportParametersDto } from './dto/report-parameters.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class FinancialReportsService {
  constructor(private prisma: PrismaService) {}

  async getTrialBalance(tenantId: string, params: ReportParametersDto) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (params.fiscalPeriod) {
      where.fiscalPeriod = params.fiscalPeriod;
    } else if (params.startDate && params.endDate) {
      where.entryDate = {
        gte: new Date(params.startDate),
        lte: new Date(params.endDate),
      };
    }

    // Only get posted entries
    where.status = 'posted';

    // Get all posted journal entry lines
    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        tenantId,
        deletedAt: null,
        journalEntry: where,
      },
      include: {
        account: {
          select: {
            accountNumber: true,
            name: true,
            accountType: true,
          },
        },
      },
    });

    // Group by account and sum debits/credits
    const accountBalances = new Map<string, any>();

    for (const line of lines) {
      const key = line.accountId;
      
      if (!accountBalances.has(key)) {
        accountBalances.set(key, {
          accountNumber: line.account.accountNumber,
          accountName: line.account.name,
          accountType: line.account.accountType,
          totalDebits: new Decimal(0),
          totalCredits: new Decimal(0),
        });
      }

      const balance = accountBalances.get(key);
      balance.totalDebits = balance.totalDebits.plus(line.debitAmount);
      balance.totalCredits = balance.totalCredits.plus(line.creditAmount);
    }

    // Convert to array and calculate net
    const balances = Array.from(accountBalances.values()).map(acc => ({
      accountNumber: acc.accountNumber,
      accountName: acc.accountName,
      accountType: acc.accountType,
      totalDebits: acc.totalDebits.toNumber(),
      totalCredits: acc.totalCredits.toNumber(),
      netBalance: acc.totalDebits.minus(acc.totalCredits).toNumber(),
    }));

    // Sort by account number
    balances.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

    // Calculate totals
    const totalDebits = balances.reduce((sum, acc) => sum + acc.totalDebits, 0);
    const totalCredits = balances.reduce((sum, acc) => sum + acc.totalCredits, 0);

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
    const where: any = {
      tenantId,
      deletedAt: null,
      status: 'posted',
    };

    if (params.fiscalPeriod) {
      where.fiscalPeriod = params.fiscalPeriod;
    } else if (params.startDate && params.endDate) {
      where.entryDate = {
        gte: new Date(params.startDate),
        lte: new Date(params.endDate),
      };
    }

    // Get all posted journal entry lines
    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        tenantId,
        deletedAt: null,
        journalEntry: where,
        account: {
          accountType: {
            in: ['revenue', 'expense'],
          },
        },
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

    // Group by account
    const accountBalances = new Map<string, any>();

    for (const line of lines) {
      const key = line.accountId;
      
      if (!accountBalances.has(key)) {
        accountBalances.set(key, {
          accountNumber: line.account.accountNumber,
          accountName: line.account.name,
          accountType: line.account.accountType,
          accountCategory: line.account.accountCategory,
          balance: new Decimal(0),
        });
      }

      const balance = accountBalances.get(key);
      // Revenue: credits increase, debits decrease
      // Expense: debits increase, credits decrease
      if (line.account.accountType === 'revenue') {
        balance.balance = balance.balance.plus(line.creditAmount).minus(line.debitAmount);
      } else {
        balance.balance = balance.balance.plus(line.debitAmount).minus(line.creditAmount);
      }
    }

    // Separate revenue and expenses
    const revenues: any[] = [];
    const expenses: any[] = [];

    for (const [, acc] of accountBalances) {
      const item = {
        accountNumber: acc.accountNumber,
        accountName: acc.accountName,
        accountCategory: acc.accountCategory,
        amount: acc.balance.toNumber(),
      };

      if (acc.accountType === 'revenue') {
        revenues.push(item);
      } else {
        expenses.push(item);
      }
    }

    // Sort by account number
    revenues.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
    expenses.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

    const totalRevenue = revenues.reduce((sum, acc) => sum + acc.amount, 0);
    const totalExpenses = expenses.reduce((sum, acc) => sum + acc.amount, 0);
    const netIncome = totalRevenue - totalExpenses;

    return {
      reportName: 'Profit & Loss Statement',
      parameters: params,
      period: {
        startDate: params.startDate || 'inception',
        endDate: params.endDate || new Date().toISOString().split('T')[0],
      },
      revenue: {
        accounts: revenues,
        total: totalRevenue,
      },
      expenses: {
        accounts: expenses,
        total: totalExpenses,
      },
      netIncome,
    };
  }

  async getBalanceSheet(tenantId: string, params: ReportParametersDto) {
    const where: any = {
      tenantId,
      deletedAt: null,
      status: 'posted',
    };

    if (params.endDate) {
      where.entryDate = {
        lte: new Date(params.endDate),
      };
    }

    // Get all posted journal entry lines for balance sheet accounts
    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        tenantId,
        deletedAt: null,
        journalEntry: where,
        account: {
          accountType: {
            in: ['asset', 'liability', 'equity'],
          },
        },
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

    // Group by account
    const accountBalances = new Map<string, any>();

    for (const line of lines) {
      const key = line.accountId;
      
      if (!accountBalances.has(key)) {
        accountBalances.set(key, {
          accountNumber: line.account.accountNumber,
          accountName: line.account.name,
          accountType: line.account.accountType,
          accountCategory: line.account.accountCategory,
          balance: new Decimal(0),
        });
      }

      const balance = accountBalances.get(key);
      // Assets: debits increase, credits decrease
      // Liabilities & Equity: credits increase, debits decrease
      if (line.account.accountType === 'asset') {
        balance.balance = balance.balance.plus(line.debitAmount).minus(line.creditAmount);
      } else {
        balance.balance = balance.balance.plus(line.creditAmount).minus(line.debitAmount);
      }
    }

    // Separate by type
    const assets: any[] = [];
    const liabilities: any[] = [];
    const equity: any[] = [];

    for (const [, acc] of accountBalances) {
      const item = {
        accountNumber: acc.accountNumber,
        accountName: acc.accountName,
        accountCategory: acc.accountCategory,
        amount: acc.balance.toNumber(),
      };

      if (acc.accountType === 'asset') {
        assets.push(item);
      } else if (acc.accountType === 'liability') {
        liabilities.push(item);
      } else {
        equity.push(item);
      }
    }

    // Sort by account number
    assets.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
    liabilities.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
    equity.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

    const totalAssets = assets.reduce((sum, acc) => sum + acc.amount, 0);
    const totalLiabilities = liabilities.reduce((sum, acc) => sum + acc.amount, 0);
    const totalEquity = equity.reduce((sum, acc) => sum + acc.amount, 0);

    return {
      reportName: 'Balance Sheet',
      parameters: params,
      asOfDate: params.endDate || new Date().toISOString().split('T')[0],
      assets: {
        accounts: assets,
        total: totalAssets,
      },
      liabilities: {
        accounts: liabilities,
        total: totalLiabilities,
      },
      equity: {
        accounts: equity,
        total: totalEquity,
      },
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
  }

  async getGeneralLedger(tenantId: string, params: ReportParametersDto) {
    const where: any = {
      tenantId,
      deletedAt: null,
      status: 'posted',
    };

    if (params.fiscalPeriod) {
      where.fiscalPeriod = params.fiscalPeriod;
    } else if (params.startDate && params.endDate) {
      where.entryDate = {
        gte: new Date(params.startDate),
        lte: new Date(params.endDate),
      };
    }

    const accountWhere: any = {};
    if (params.accountNumber) {
      accountWhere.accountNumber = params.accountNumber;
    }

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        tenantId,
        deletedAt: null,
        journalEntry: where,
        account: accountWhere,
      },
      include: {
        account: {
          select: {
            accountNumber: true,
            name: true,
            accountType: true,
          },
        },
        journalEntry: {
          select: {
            entryNumber: true,
            entryDate: true,
            description: true,
          },
        },
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
        date: line.journalEntry.entryDate,
        entryNumber: line.journalEntry.entryNumber,
        accountNumber: line.account.accountNumber,
        accountName: line.account.name,
        description: line.description || line.journalEntry.description,
        debit: line.debitAmount.toNumber(),
        credit: line.creditAmount.toNumber(),
      })),
    };
  }
}
