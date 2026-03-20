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
        tenantId, deletedAt: null,
        journalEntry: where,
        account: { accountType: { in: ['revenue', 'cost', 'expense'] } },
      },
      include: {
        account: {
          select: {
            accountNumber: true, name: true,
            accountType: true, accountCategory: true,
          },
        },
      },
    });

    // Aggregate by account
    const accMap = new Map<string, any>();
    for (const line of lines) {
      if (!accMap.has(line.accountId)) {
        accMap.set(line.accountId, {
          accountNumber:   line.account.accountNumber,
          accountName:     line.account.name,
          accountType:     line.account.accountType,
          accountCategory: line.account.accountCategory,
          amount: new Decimal(0),
        });
      }
      const a = accMap.get(line.accountId);
      if (line.account.accountType === 'revenue') {
        a.amount = a.amount.plus(line.creditAmount).minus(line.debitAmount);
      } else {
        a.amount = a.amount.plus(line.debitAmount).minus(line.creditAmount);
      }
    }

    const toItem = (a: any) => ({
      accountNumber:   a.accountNumber,
      accountName:     a.accountName,
      accountCategory: a.accountCategory,
      amount:          a.amount.toNumber(),
    });

    // ── Categorize ────────────────────────────────────────────────────────────
    const revenue:    any[] = [];
    const foodCost:   any[] = [];  // 5.1.x cost_of_sales
    const laborCost:  any[] = [];  // 5.2.x manufacturing_cost
    const sgaSelling: any[] = [];  // 6.1.x selling_expense
    const sgaAdmin:   any[] = [];  // 6.2.x general_admin (excl depreciation)
    const depreciation: any[] = []; // 6.2.06
    const financial:  any[] = [];  // 6.3.x financial_expense
    const taxExp:     any[] = [];  // 6.4.x tax_expense

    for (const [, a] of accMap) {
      const n = a.accountNumber;
      if (a.accountType === 'revenue')          { revenue.push(toItem(a)); continue; }
      if (a.accountCategory === 'cost_of_sales') { foodCost.push(toItem(a)); continue; }
      if (a.accountCategory === 'manufacturing_cost') { laborCost.push(toItem(a)); continue; }
      if (n === '6.2.06')                        { depreciation.push(toItem(a)); continue; }
      if (a.accountCategory === 'selling_expense') { sgaSelling.push(toItem(a)); continue; }
      if (a.accountCategory === 'general_admin') { sgaAdmin.push(toItem(a)); continue; }
      if (a.accountCategory === 'financial_expense') { financial.push(toItem(a)); continue; }
      if (a.accountCategory === 'tax_expense')   { taxExp.push(toItem(a)); continue; }
    }

    const sum = (arr: any[]) => arr.reduce((s, i) => s + i.amount, 0);

    const totalRevenue    = sum(revenue);
    const totalFoodCost   = sum(foodCost);
    const totalLaborCost  = sum(laborCost);
    const totalCostOfSales = totalFoodCost + totalLaborCost;
    const grossProfit     = totalRevenue - totalCostOfSales;
    const totalSga        = sum(sgaSelling) + sum(sgaAdmin);
    const totalDepr       = sum(depreciation);
    const ebit            = grossProfit - totalSga;
    const ebitda          = ebit + totalDepr;
    const totalFinancial  = sum(financial);
    const ebt             = ebit - totalFinancial;
    const totalTax        = sum(taxExp);
    const netIncome       = ebt - totalTax;

    // Legacy flat expenses (backwards compat for dashboard)
    const allExpenses = [...sgaSelling, ...sgaAdmin, ...depreciation, ...financial, ...taxExp];

    const sort = (arr: any[]) => arr.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

    return {
      reportName: 'Profit & Loss Statement',
      parameters: params,
      period: { startDate: params.startDate, endDate: params.endDate },
      // ── Structured P&L ──────────────────────────────────────────────────────
      revenue:      { accounts: sort(revenue),     total: totalRevenue    },
      costOfSales:  {
        accounts: sort([...foodCost, ...laborCost]), total: totalCostOfSales,
        foodCost:  { accounts: sort(foodCost),  total: totalFoodCost  },
        laborCost: { accounts: sort(laborCost), total: totalLaborCost },
      },
      grossProfit,
      grossMarginPct: totalRevenue > 0 ? (grossProfit / totalRevenue * 100) : 0,
      sga: {
        accounts: sort([...sgaSelling, ...sgaAdmin]), total: totalSga,
        selling: { accounts: sort(sgaSelling), total: sum(sgaSelling) },
        admin:   { accounts: sort(sgaAdmin),   total: sum(sgaAdmin)   },
      },
      ebit,
      ebitMarginPct: totalRevenue > 0 ? (ebit / totalRevenue * 100) : 0,
      depreciation: { accounts: sort(depreciation), total: totalDepr },
      ebitda,
      ebitdaMarginPct: totalRevenue > 0 ? (ebitda / totalRevenue * 100) : 0,
      financial:    { accounts: sort(financial),    total: totalFinancial },
      ebt,
      tax:          { accounts: sort(taxExp),       total: totalTax       },
      netIncome,
      netMarginPct: totalRevenue > 0 ? (netIncome / totalRevenue * 100) : 0,
      // ── Legacy flat (dashboard compatibility) ─────────────────────────────
      expenses:     { accounts: sort(allExpenses),  total: sum(allExpenses) },
    };
  }


  async getBalanceSheet(tenantId: string, params: ReportParametersDto) {
    const where: any = { tenantId, deletedAt: null, status: 'posted' };
    if (params.endDate) {
      where.entryDate = { lte: new Date(params.endDate) };
    }

    // ── 1. Balance sheet accounts (asset/liability/equity) ──────────────────
    const bsLines = await this.prisma.journalEntryLine.findMany({
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
    for (const line of bsLines) {
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

    // ── 2. Net Income from P&L accounts (revenue/cost/expense) ──────────────
    // Sum all revenue credits minus all cost/expense debits = current period NI
    const plLines = await this.prisma.journalEntryLine.findMany({
      where: {
        tenantId,
        deletedAt: null,
        journalEntry: where,
        account: { accountType: { in: ['revenue', 'cost', 'expense'] } },
      },
      include: {
        account: { select: { accountType: true } },
      },
    });

    let revenueNet = new Decimal(0);
    let costExpenseNet = new Decimal(0);
    for (const line of plLines) {
      if (line.account.accountType === 'revenue') {
        revenueNet = revenueNet.plus(line.creditAmount).minus(line.debitAmount);
      } else {
        costExpenseNet = costExpenseNet.plus(line.debitAmount).minus(line.creditAmount);
      }
    }
    const currentNetIncome = revenueNet.minus(costExpenseNet);

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

    // Add current Net Income as equity line (if non-zero)
    // Use '3.2.99' as synthetic key to avoid duplicate with JE-based 3.2.02
    const niValue = currentNetIncome.toNumber();
    if (Math.abs(niValue) > 0.01) {
      equity.push({
        accountNumber:   '3.2.99',
        accountName:     'Current Period Net Income',
        accountCategory: 'retained_earnings',
        amount: niValue,
      });
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