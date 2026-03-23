import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { CreateBudgetLineDto } from './dto/create-budget-line.dto';
import { GenerateBudgetFromSoDto } from './dto/generate-budget.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // BUDGET CRUD
  // ============================================================================

  async create(tenantId: string, userId: string, createBudgetDto: CreateBudgetDto) {
    const existing = await this.prisma.budget.findFirst({
      where: { tenantId, budgetCode: createBudgetDto.budgetCode, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Budget code ${createBudgetDto.budgetCode} already exists`);

    return this.prisma.budget.create({
      data: {
        tenantId,
        budgetCode: createBudgetDto.budgetCode,
        budgetName: createBudgetDto.budgetName,
        fiscalYear: createBudgetDto.fiscalYear,
        description: createBudgetDto.description,
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
      },
      include: { budgetLines: { include: { account: true } } },
    });
  }

  async findAll(tenantId: string, fiscalYear?: string, status?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (fiscalYear) where.fiscalYear = fiscalYear;
    if (status)     where.status     = status;

    return this.prisma.budget.findMany({
      where,
      include: {
        budgetLines: {
          include: { account: { select: { accountNumber: true, name: true, accountType: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        budgetLines: {
          include: { account: { select: { accountNumber: true, name: true, accountType: true } } },
          orderBy: [{ fiscalPeriod: 'asc' }, { account: { accountNumber: 'asc' } }],
        },
      },
    });
    if (!budget) throw new NotFoundException(`Budget with ID ${id} not found`);
    return budget;
  }

  async update(tenantId: string, userId: string, id: string, updateBudgetDto: UpdateBudgetDto) {
    const budget = await this.findOne(tenantId, id);
    if (budget.status === 'approved') throw new BadRequestException('Cannot edit approved budgets');

    if (updateBudgetDto.budgetCode && updateBudgetDto.budgetCode !== budget.budgetCode) {
      const existing = await this.prisma.budget.findFirst({
        where: { tenantId, budgetCode: updateBudgetDto.budgetCode, id: { not: id }, deletedAt: null },
      });
      if (existing) throw new ConflictException(`Budget code ${updateBudgetDto.budgetCode} already exists`);
    }

    return this.prisma.budget.update({
      where: { id },
      data: { ...updateBudgetDto, updatedBy: userId },
      include: { budgetLines: { include: { account: true } } },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    const budget = await this.findOne(tenantId, id);
    if (budget.status !== 'draft') throw new BadRequestException('Can only delete draft budgets');
    await this.prisma.budget.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: userId } });
    return { message: `Budget ${budget.budgetCode} deleted successfully` };
  }

  // ============================================================================
  // BUDGET LINES
  // ============================================================================

  async addBudgetLine(tenantId: string, userId: string, budgetId: string, dto: CreateBudgetLineDto) {
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status === 'approved') throw new BadRequestException('Cannot add lines to approved budgets');

    const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, tenantId, deletedAt: null } });
    if (!account) throw new NotFoundException('Account not found');

    const existing = await this.prisma.budgetLine.findFirst({
      where: { budgetId, accountId: dto.accountId, fiscalPeriod: dto.fiscalPeriod, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Budget line for account ${account.accountNumber} in period ${dto.fiscalPeriod} already exists`);

    return this.prisma.budgetLine.create({
      data: {
        tenantId, budgetId,
        accountId: dto.accountId,
        fiscalPeriod: dto.fiscalPeriod,
        budgetAmount: new Decimal(dto.budgetAmount),
        notes: dto.notes,
        createdBy: userId, updatedBy: userId,
      },
      include: { account: { select: { accountNumber: true, name: true, accountType: true } } },
    });
  }

  async updateBudgetLine(tenantId: string, userId: string, budgetId: string, lineId: string, updateData: Partial<CreateBudgetLineDto>) {
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status === 'approved') throw new BadRequestException('Cannot edit lines in approved budgets');

    const line = await this.prisma.budgetLine.findFirst({ where: { id: lineId, budgetId, tenantId, deletedAt: null } });
    if (!line) throw new NotFoundException('Budget line not found');

    return this.prisma.budgetLine.update({
      where: { id: lineId },
      data: {
        budgetAmount: updateData.budgetAmount ? new Decimal(updateData.budgetAmount) : undefined,
        notes: updateData.notes,
        updatedBy: userId,
      },
      include: { account: true },
    });
  }

  async removeBudgetLine(tenantId: string, userId: string, budgetId: string, lineId: string) {
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status === 'approved') throw new BadRequestException('Cannot delete lines from approved budgets');

    const line = await this.prisma.budgetLine.findFirst({ where: { id: lineId, budgetId, tenantId, deletedAt: null } });
    if (!line) throw new NotFoundException('Budget line not found');

    await this.prisma.budgetLine.update({ where: { id: lineId }, data: { deletedAt: new Date(), deletedBy: userId } });
    return { message: 'Budget line deleted successfully' };
  }

  // ============================================================================
  // BUDGET APPROVAL
  // ============================================================================

  async approveBudget(tenantId: string, userId: string, id: string) {
    const budget = await this.findOne(tenantId, id);
    if (budget.status === 'approved') throw new BadRequestException('Budget is already approved');
    if (budget.budgetLines.length === 0) throw new BadRequestException('Cannot approve budget with no lines');

    const approved = await this.prisma.budget.update({
      where: { id },
      data: { status: 'approved', approvedAt: new Date(), approvedBy: userId, updatedBy: userId },
      include: { budgetLines: { include: { account: true } } },
    });
    return { message: `Budget ${approved.budgetCode} approved successfully`, budget: approved };
  }

  // ============================================================================
  // BUDGET VS ACTUAL REPORT
  // ============================================================================

  async getBudgetVsActual(tenantId: string, budgetId: string, startPeriod?: string, endPeriod?: string) {
    const budget = await this.findOne(tenantId, budgetId);
    const periodFilter: any = {};
    if (startPeriod && endPeriod) periodFilter.fiscalPeriod = { gte: startPeriod, lte: endPeriod };

    const budgetLines = await this.prisma.budgetLine.findMany({
      where: { budgetId, tenantId, deletedAt: null, ...periodFilter },
      include: { account: { select: { id: true, accountNumber: true, name: true, accountType: true } } },
      orderBy: [{ fiscalPeriod: 'asc' }, { account: { accountNumber: 'asc' } }],
    });

    const results = await Promise.all(budgetLines.map(async (line) => {
      const actuals = await this.prisma.journalEntryLine.aggregate({
        where: {
          tenantId, accountId: line.accountId,
          journalEntry: { fiscalPeriod: line.fiscalPeriod, status: 'posted', deletedAt: null },
          deletedAt: null,
        },
        _sum: { debitAmount: true, creditAmount: true },
      });
      const debit  = actuals._sum.debitAmount  || new Decimal(0);
      const credit = actuals._sum.creditAmount || new Decimal(0);
      const actualAmount = debit.minus(credit);
      const variance = actualAmount.minus(line.budgetAmount);
      const variancePercent = line.budgetAmount.equals(0) ? new Decimal(0) : variance.dividedBy(line.budgetAmount).times(100);

      return {
        accountNumber:   line.account.accountNumber,
        accountName:     line.account.name,
        accountType:     line.account.accountType,
        fiscalPeriod:    line.fiscalPeriod,
        budgetAmount:    line.budgetAmount.toNumber(),
        actualAmount:    actualAmount.toNumber(),
        variance:        variance.toNumber(),
        variancePercent: variancePercent.toNumber(),
      };
    }));

    return { budgetCode: budget.budgetCode, budgetName: budget.budgetName, fiscalYear: budget.fiscalYear, lines: results };
  }

  // ============================================================================
  // SPRINT 8 — GENERATE BUDGET FROM SALES ORDERS (MRP)
  // ============================================================================

  async generateFromSalesOrders(tenantId: string, userId: string, budgetId: string, dto: GenerateBudgetFromSoDto) {
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status === 'approved') throw new BadRequestException('Cannot generate lines for approved budgets');

    // ── Resolve default GL accounts ──────────────────────────────────────────
    const resolveAccount = async (accountNumber: string) => {
      const acct = await this.prisma.account.findFirst({
        where: { tenantId, accountNumber, deletedAt: null, isActive: true },
      });
      if (!acct) throw new BadRequestException(`GL account ${accountNumber} not found or inactive`);
      return acct;
    };

    const defaultMaterialAcct = await resolveAccount(dto.defaultMaterialAccount ?? '5.1.02');
    const defaultLaborAcct    = await resolveAccount(dto.defaultLaborAccount    ?? '5.1.03');
    const defaultRevenueAcct  = await resolveAccount(dto.defaultRevenueAccount  ?? '4.1.01');

    // ── Load Sales Orders ─────────────────────────────────────────────────────
    const salesOrders = await this.prisma.salesOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: dto.soStatuses },
      },
      include: {
        lines: {
          where: { deletedAt: null },
          include: {
            item: {
              include: {
                boms: {
                  where: { isActive: true, deletedAt: null },
                  include: {
                    components: {
                      where: { deletedAt: null },
                      include: { componentItem: true },
                    },
                    routings: {
                      where: { isActive: true, deletedAt: null },
                      include: { workCenter: true },
                    },
                  },
                  orderBy: { version: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (salesOrders.length === 0) {
      return {
        message: `No Sales Orders found with status: ${dto.soStatuses.join(', ')}`,
        linesGenerated: 0,
        linesSkipped: 0,
        detail: [],
      };
    }

    // ── Accumulate budget amounts by account + period ─────────────────────────
    // Map key: `${accountId}|${fiscalPeriod}`
    const accumulator = new Map<string, { accountId: string; fiscalPeriod: string; amount: number; label: string }>();

    const addAmount = (accountId: string, fiscalPeriod: string, amount: number, label: string) => {
      const key = `${accountId}|${fiscalPeriod}`;
      if (accumulator.has(key)) {
        accumulator.get(key)!.amount += amount;
      } else {
        accumulator.set(key, { accountId, fiscalPeriod, amount, label });
      }
    };

    const toFiscalPeriod = (date: Date): string =>
      `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

    const detail: any[] = [];

    for (const so of salesOrders) {
      for (const line of so.lines) {
        const qty = Number(line.orderedQuantity);
        if (qty <= 0) continue;

        // ── Date calculation with backward scheduling ──────────────────────
        const promisedDate = line.deliveryDate
          ? new Date(line.deliveryDate)
          : so.promisedDate
          ? new Date(so.promisedDate)
          : new Date(so.orderDate);

        const leadTimeDays   = line.item?.leadTimeDays ?? 0;
        const productionStartDate = new Date(promisedDate);
        productionStartDate.setDate(productionStartDate.getDate() - leadTimeDays);

        const revenuePeriod  = toFiscalPeriod(promisedDate);
        const costPeriod     = toFiscalPeriod(productionStartDate);

        // ── 1. Revenue budget line ──────────────────────────────────────────
        const revenueAmount = Number(line.lineTotal);
        if (revenueAmount > 0) {
          addAmount(defaultRevenueAcct.id, revenuePeriod, revenueAmount, 'Revenue');
          detail.push({
            so: so.soNumber, line: line.lineNumber, item: line.item?.code,
            type: 'revenue', period: revenuePeriod, amount: revenueAmount,
          });
        }

        // ── 2. Material budget lines (from BOM) ────────────────────────────
        const bom = line.item?.boms?.[0];
        if (bom) {
          for (const comp of bom.components) {
            const compItem    = comp.componentItem;
            const qtyRequired = Number(comp.quantityPer) * qty;
            const scrapFactor = 1 + Number(comp.scrapPercent) / 100;
            const totalQty    = qtyRequired * scrapFactor;
            const unitCost    = compItem.standardCost ? Number(compItem.standardCost) : 0;
            const matAmount   = totalQty * unitCost;

            if (matAmount <= 0) continue;

            // Use item-level cost account if configured, else default
            // (Item doesn't have a direct costAccountId — use default)
            const matAcctId = defaultMaterialAcct.id;

            addAmount(matAcctId, costPeriod, matAmount, `Material: ${compItem.code}`);
            detail.push({
              so: so.soNumber, line: line.lineNumber, item: line.item?.code,
              type: 'material', component: compItem.code,
              period: costPeriod, qty: totalQty, unitCost, amount: matAmount,
            });
          }

          // ── 3. Labor budget lines (from BOM Routing) ─────────────────────
          for (const step of bom.routings) {
            const setupHours  = Number(step.setupTime);
            const runHours    = Number(step.runTimePerUnit) * qty;
            const totalHours  = setupHours + runHours;
            const costPerHour = step.workCenter.costPerHour ? Number(step.workCenter.costPerHour) : 0;
            const laborAmount = totalHours * costPerHour;

            if (laborAmount <= 0) continue;

            // Use work center cost account if configured, else default
            const laborAcctId = defaultLaborAcct.id;

            addAmount(laborAcctId, costPeriod, laborAmount, `Labor: ${step.workCenter.code} step ${step.stepNumber}`);
            detail.push({
              so: so.soNumber, line: line.lineNumber, item: line.item?.code,
              type: 'labor', workCenter: step.workCenter.code, step: step.stepNumber,
              period: costPeriod, hours: totalHours, costPerHour, amount: laborAmount,
            });
          }
        }
      }
    }

    if (accumulator.size === 0) {
      return {
        message: 'No budget amounts calculated — check that items have BOMs with components and routing, and standardCost is set',
        linesGenerated: 0,
        linesSkipped: 0,
        detail,
      };
    }

    // ── Upsert budget lines ──────────────────────────────────────────────────
    let linesGenerated = 0;
    let linesSkipped   = 0;
    const upsertedLines: any[] = [];

    for (const [, entry] of accumulator) {
      const existing = await this.prisma.budgetLine.findFirst({
        where: {
          budgetId, accountId: entry.accountId,
          fiscalPeriod: entry.fiscalPeriod, deletedAt: null,
        },
      });

      if (existing) {
        if (dto.overwrite) {
          await this.prisma.budgetLine.update({
            where: { id: existing.id },
            data: { budgetAmount: new Decimal(entry.amount), updatedBy: userId },
          });
          linesGenerated++;
          upsertedLines.push({ action: 'updated', ...entry });
        } else {
          linesSkipped++;
        }
      } else {
        await this.prisma.budgetLine.create({
          data: {
            tenantId, budgetId,
            accountId:    entry.accountId,
            fiscalPeriod: entry.fiscalPeriod,
            budgetAmount: new Decimal(entry.amount),
            notes:        `Auto-generated from Sales Orders — ${entry.label}`,
            createdBy: userId, updatedBy: userId,
          },
        });
        linesGenerated++;
        upsertedLines.push({ action: 'created', ...entry });
      }
    }

    // ── Return summary ────────────────────────────────────────────────────────
    const updatedBudget = await this.findOne(tenantId, budgetId);

    return {
      message:        `Budget generation complete — ${linesGenerated} lines generated, ${linesSkipped} skipped`,
      linesGenerated,
      linesSkipped,
      salesOrdersProcessed: salesOrders.length,
      soLineItems:    detail.length,
      upsertedLines,
      detail,
      budget:         updatedBudget,
    };
  }
}