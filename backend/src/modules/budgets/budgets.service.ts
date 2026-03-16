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
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // BUDGET CRUD
  // ============================================================================

  async create(tenantId: string, userId: string, createBudgetDto: CreateBudgetDto) {
    // Check if budget code already exists
    const existing = await this.prisma.budget.findFirst({
      where: {
        tenantId,
        budgetCode: createBudgetDto.budgetCode,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Budget code ${createBudgetDto.budgetCode} already exists`,
      );
    }

    const budget = await this.prisma.budget.create({
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
      include: {
        budgetLines: {
          include: {
            account: true,
          },
        },
      },
    });

    return budget;
  }

  async findAll(tenantId: string, fiscalYear?: string, status?: string) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (fiscalYear) {
      where.fiscalYear = fiscalYear;
    }

    if (status) {
      where.status = status;
    }

    const budgets = await this.prisma.budget.findMany({
      where,
      include: {
        budgetLines: {
          include: {
            account: {
              select: {
                accountNumber: true,
                name: true,
                accountType: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return budgets;
  }

  async findOne(tenantId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        budgetLines: {
          include: {
            account: {
              select: {
                accountNumber: true,
                name: true,
                accountType: true,
              },
            },
          },
          orderBy: [{ fiscalPeriod: 'asc' }, { account: { accountNumber: 'asc' } }],
        },
      },
    });

    if (!budget) {
      throw new NotFoundException(`Budget with ID ${id} not found`);
    }

    return budget;
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    updateBudgetDto: UpdateBudgetDto,
  ) {
    const budget = await this.findOne(tenantId, id);

    // Check if approved - can't edit approved budgets
    if (budget.status === 'approved') {
      throw new BadRequestException('Cannot edit approved budgets');
    }

    // Check budget code uniqueness if changing
    if (updateBudgetDto.budgetCode && updateBudgetDto.budgetCode !== budget.budgetCode) {
      const existing = await this.prisma.budget.findFirst({
        where: {
          tenantId,
          budgetCode: updateBudgetDto.budgetCode,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(
          `Budget code ${updateBudgetDto.budgetCode} already exists`,
        );
      }
    }

    const updated = await this.prisma.budget.update({
      where: { id },
      data: {
        ...updateBudgetDto,
        updatedBy: userId,
      },
      include: {
        budgetLines: {
          include: {
            account: true,
          },
        },
      },
    });

    return updated;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const budget = await this.findOne(tenantId, id);

    // Can only delete draft budgets
    if (budget.status !== 'draft') {
      throw new BadRequestException('Can only delete draft budgets');
    }

    await this.prisma.budget.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return { message: `Budget ${budget.budgetCode} deleted successfully` };
  }

  // ============================================================================
  // BUDGET LINES
  // ============================================================================

  async addBudgetLine(
    tenantId: string,
    userId: string,
    budgetId: string,
    createBudgetLineDto: CreateBudgetLineDto,
  ) {
    const budget = await this.findOne(tenantId, budgetId);

    if (budget.status === 'approved') {
      throw new BadRequestException('Cannot add lines to approved budgets');
    }

    // Verify account exists
    const account = await this.prisma.account.findFirst({
      where: {
        id: createBudgetLineDto.accountId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // Check if line already exists
    const existing = await this.prisma.budgetLine.findFirst({
      where: {
        budgetId,
        accountId: createBudgetLineDto.accountId,
        fiscalPeriod: createBudgetLineDto.fiscalPeriod,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Budget line for account ${account.accountNumber} in period ${createBudgetLineDto.fiscalPeriod} already exists`,
      );
    }

    const budgetLine = await this.prisma.budgetLine.create({
      data: {
        tenantId,
        budgetId,
        accountId: createBudgetLineDto.accountId,
        fiscalPeriod: createBudgetLineDto.fiscalPeriod,
        budgetAmount: new Decimal(createBudgetLineDto.budgetAmount),
        notes: createBudgetLineDto.notes,
        createdBy: userId,
        updatedBy: userId,
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

    return budgetLine;
  }

  async updateBudgetLine(
    tenantId: string,
    userId: string,
    budgetId: string,
    lineId: string,
    updateData: Partial<CreateBudgetLineDto>,
  ) {
    const budget = await this.findOne(tenantId, budgetId);

    if (budget.status === 'approved') {
      throw new BadRequestException('Cannot edit lines in approved budgets');
    }

    const line = await this.prisma.budgetLine.findFirst({
      where: {
        id: lineId,
        budgetId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!line) {
      throw new NotFoundException('Budget line not found');
    }

    const updated = await this.prisma.budgetLine.update({
      where: { id: lineId },
      data: {
        budgetAmount: updateData.budgetAmount
          ? new Decimal(updateData.budgetAmount)
          : undefined,
        notes: updateData.notes,
        updatedBy: userId,
      },
      include: {
        account: true,
      },
    });

    return updated;
  }

  async removeBudgetLine(
    tenantId: string,
    userId: string,
    budgetId: string,
    lineId: string,
  ) {
    const budget = await this.findOne(tenantId, budgetId);

    if (budget.status === 'approved') {
      throw new BadRequestException('Cannot delete lines from approved budgets');
    }

    const line = await this.prisma.budgetLine.findFirst({
      where: {
        id: lineId,
        budgetId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!line) {
      throw new NotFoundException('Budget line not found');
    }

    await this.prisma.budgetLine.update({
      where: { id: lineId },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return { message: 'Budget line deleted successfully' };
  }

  // ============================================================================
  // BUDGET APPROVAL
  // ============================================================================

  async approveBudget(tenantId: string, userId: string, id: string) {
    const budget = await this.findOne(tenantId, id);

    if (budget.status === 'approved') {
      throw new BadRequestException('Budget is already approved');
    }

    if (budget.budgetLines.length === 0) {
      throw new BadRequestException('Cannot approve budget with no lines');
    }

    const approved = await this.prisma.budget.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: userId,
        updatedBy: userId,
      },
      include: {
        budgetLines: {
          include: {
            account: true,
          },
        },
      },
    });

    return {
      message: `Budget ${approved.budgetCode} approved successfully`,
      budget: approved,
    };
  }

  // ============================================================================
  // BUDGET VS ACTUAL REPORT
  // ============================================================================

  async getBudgetVsActual(
    tenantId: string,
    budgetId: string,
    startPeriod?: string,
    endPeriod?: string,
  ) {
    const budget = await this.findOne(tenantId, budgetId);

    // Build period filter
    const periodFilter: any = {};
    if (startPeriod && endPeriod) {
      periodFilter.fiscalPeriod = {
        gte: startPeriod,
        lte: endPeriod,
      };
    }

    // Get budget lines
    const budgetLines = await this.prisma.budgetLine.findMany({
      where: {
        budgetId,
        tenantId,
        deletedAt: null,
        ...periodFilter,
      },
      include: {
        account: {
          select: {
            id: true,
            accountNumber: true,
            name: true,
            accountType: true,
          },
        },
      },
      orderBy: [{ fiscalPeriod: 'asc' }, { account: { accountNumber: 'asc' } }],
    });

    // Get actuals from journal entries
    const results = await Promise.all(
      budgetLines.map(async (line) => {
        const actuals = await this.prisma.journalEntryLine.aggregate({
          where: {
            tenantId,
            accountId: line.accountId,
            journalEntry: {
              fiscalPeriod: line.fiscalPeriod,
              status: 'posted',
              deletedAt: null,
            },
            deletedAt: null,
          },
          _sum: {
            debitAmount: true,
            creditAmount: true,
          },
        });

        const debit = actuals._sum.debitAmount || new Decimal(0);
        const credit = actuals._sum.creditAmount || new Decimal(0);
        const actualAmount = debit.minus(credit);
        const budgetAmount = line.budgetAmount;
        const variance = actualAmount.minus(budgetAmount);
        const variancePercent = budgetAmount.equals(0)
          ? new Decimal(0)
          : variance.dividedBy(budgetAmount).times(100);

        return {
          accountNumber: line.account.accountNumber,
          accountName: line.account.name,
          accountType: line.account.accountType,
          fiscalPeriod: line.fiscalPeriod,
          budgetAmount: budgetAmount.toNumber(),
          actualAmount: actualAmount.toNumber(),
          variance: variance.toNumber(),
          variancePercent: variancePercent.toNumber(),
        };
      }),
    );

    return {
      budgetCode: budget.budgetCode,
      budgetName: budget.budgetName,
      fiscalYear: budget.fiscalYear,
      lines: results,
    };
  }
}
