import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCashFlowProjectionDto } from './dto/create-cash-flow-projection.dto';
import { UpdateCashFlowProjectionDto } from './dto/update-cash-flow-projection.dto';
import { CreateCashFlowLineDto } from './dto/create-cash-flow-line.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CashFlowService {
  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // CASH FLOW PROJECTION CRUD
  // ============================================================================

  async create(
    tenantId: string,
    userId: string,
    createCashFlowProjectionDto: CreateCashFlowProjectionDto,
  ) {
    // Check if projection code already exists
    const existing = await this.prisma.cashFlowProjection.findFirst({
      where: {
        tenantId,
        projectionCode: createCashFlowProjectionDto.projectionCode,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Projection code ${createCashFlowProjectionDto.projectionCode} already exists`,
      );
    }

    try {
      return await this.prisma.cashFlowProjection.create({
        data: {
          tenantId,
          projectionCode: createCashFlowProjectionDto.projectionCode,
          projectionName: createCashFlowProjectionDto.projectionName,
          startDate: new Date(createCashFlowProjectionDto.startDate),
          endDate: new Date(createCashFlowProjectionDto.endDate),
          scenario: createCashFlowProjectionDto.scenario || 'realistic',
          description: createCashFlowProjectionDto.description,
          createdBy: userId,
          updatedBy: userId,
        },
        include: {
          cashFlowLines: {
            include: {
              account: {
                select: {
                  accountNumber: true,
                  name: true,
                },
              },
            },
            orderBy: { lineDate: 'asc' },
          },
        },
      });
    } catch (e) {
      // @@unique([tenantId, projectionCode]) can race past the pre-check.
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          `Projection code ${createCashFlowProjectionDto.projectionCode} was just taken by a concurrent request. Please retry.`,
        );
      }
      throw e;
    }
  }

  async findAll(tenantId: string, scenario?: string) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (scenario) {
      where.scenario = scenario;
    }

    const cashFlowProjections = await this.prisma.cashFlowProjection.findMany({
      where,
      include: {
        cashFlowLines: {
          include: {
            account: {
              select: {
                accountNumber: true,
                name: true,
              },
            },
          },
          orderBy: { lineDate: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { cashFlowProjections, count: cashFlowProjections.length };
  }

  async findOne(tenantId: string, id: string) {
    const projection = await this.prisma.cashFlowProjection.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        cashFlowLines: {
          include: {
            account: {
              select: {
                accountNumber: true,
                name: true,
              },
            },
          },
          orderBy: { lineDate: 'asc' },
        },
      },
    });

    if (!projection) {
      throw new NotFoundException(`Cash flow projection with ID ${id} not found`);
    }

    return projection;
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    updateCashFlowProjectionDto: UpdateCashFlowProjectionDto,
  ) {
    await this.findOne(tenantId, id);

    // Check projection code uniqueness if changing
    if (updateCashFlowProjectionDto.projectionCode && updateCashFlowProjectionDto.projectionCode) {
      const existing = await this.prisma.cashFlowProjection.findFirst({
        where: {
          tenantId,
          projectionCode: updateCashFlowProjectionDto.projectionCode,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(
          `Projection code ${updateCashFlowProjectionDto.projectionCode} already exists`,
        );
      }
    }

    const dataToUpdate: any = {
      ...updateCashFlowProjectionDto,
      updatedBy: userId,
    };

    if (updateCashFlowProjectionDto.startDate) {
      dataToUpdate.startDate = new Date(updateCashFlowProjectionDto.startDate);
    }

    if (updateCashFlowProjectionDto.endDate) {
      dataToUpdate.endDate = new Date(updateCashFlowProjectionDto.endDate);
    }

    await this.prisma.cashFlowProjection.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: dataToUpdate,
    });

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, userId: string, id: string) {
    const projection = await this.findOne(tenantId, id);

    await this.prisma.cashFlowProjection.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: `Cash flow projection ${projection.projectionCode} deleted successfully`,
    };
  }

  // ============================================================================
  // CASH FLOW LINES
  // ============================================================================

  async addCashFlowLine(
    tenantId: string,
    userId: string,
    projectionId: string,
    createCashFlowLineDto: CreateCashFlowLineDto,
  ) {
    const projection = await this.findOne(tenantId, projectionId);

    // Verify account exists if provided
    if (createCashFlowLineDto.accountId) {
      const account = await this.prisma.account.findFirst({
        where: {
          id: createCashFlowLineDto.accountId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!account) {
        throw new NotFoundException('Account not found');
      }
    }

    const cashFlowLine = await this.prisma.cashFlowLine.create({
      data: {
        tenantId,
        cashFlowProjectionId: projectionId,
        lineDate: new Date(createCashFlowLineDto.lineDate),
        lineType: createCashFlowLineDto.lineType,
        category: createCashFlowLineDto.category,
        amount: new Decimal(createCashFlowLineDto.amount),
        description: createCashFlowLineDto.description,
        accountId: createCashFlowLineDto.accountId,
        createdBy: userId,
        updatedBy: userId,
      },
      include: {
        account: {
          select: {
            accountNumber: true,
            name: true,
          },
        },
      },
    });

    return cashFlowLine;
  }

  async updateCashFlowLine(
    tenantId: string,
    userId: string,
    projectionId: string,
    lineId: string,
    updateData: Partial<CreateCashFlowLineDto>,
  ) {
    await this.findOne(tenantId, projectionId);

    const line = await this.prisma.cashFlowLine.findFirst({
      where: {
        id: lineId,
        cashFlowProjectionId: projectionId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!line) {
      throw new NotFoundException('Cash flow line not found');
    }

    const dataToUpdate: any = {
      updatedBy: userId,
    };

    if (updateData.lineDate) {
      dataToUpdate.lineDate = new Date(updateData.lineDate);
    }
    if (updateData.lineType) dataToUpdate.lineType = updateData.lineType;
    if (updateData.category) dataToUpdate.category = updateData.category;
    if (updateData.amount !== undefined) {
      dataToUpdate.amount = new Decimal(updateData.amount);
    }
    if (updateData.description !== undefined) {
      dataToUpdate.description = updateData.description;
    }
    if (updateData.accountId !== undefined) {
      dataToUpdate.accountId = updateData.accountId;
    }

    await this.prisma.cashFlowLine.updateMany({
      where: { id: lineId, tenantId, deletedAt: null },
      data: dataToUpdate,
    });

    return this.prisma.cashFlowLine.findFirst({
      where: { id: lineId, tenantId, deletedAt: null },
      include: { account: true },
    });
  }

  async removeCashFlowLine(tenantId: string, userId: string, projectionId: string, lineId: string) {
    await this.findOne(tenantId, projectionId);

    const line = await this.prisma.cashFlowLine.findFirst({
      where: {
        id: lineId,
        cashFlowProjectionId: projectionId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!line) {
      throw new NotFoundException('Cash flow line not found');
    }

    await this.prisma.cashFlowLine.updateMany({
      where: { id: lineId, tenantId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return { message: 'Cash flow line deleted successfully' };
  }

  // ============================================================================
  // CASH FLOW SUMMARY REPORT
  // ============================================================================

  async getCashFlowSummary(tenantId: string, projectionId: string) {
    const projection = await this.findOne(tenantId, projectionId);

    // Group lines by month and type
    const lines = projection.cashFlowLines;

    const summary: any = {
      projectionCode: projection.projectionCode,
      projectionName: projection.projectionName,
      scenario: projection.scenario,
      startDate: projection.startDate,
      endDate: projection.endDate,
      periods: [],
    };

    // Group by month
    const monthlyData = new Map<string, any>();

    for (const line of lines) {
      const month = line.lineDate.toISOString().substring(0, 7); // YYYY-MM

      if (!monthlyData.has(month)) {
        monthlyData.set(month, {
          period: month,
          totalInflows: new Decimal(0),
          totalOutflows: new Decimal(0),
          netCashFlow: new Decimal(0),
          inflows: [],
          outflows: [],
        });
      }

      const monthData = monthlyData.get(month);

      if (line.lineType === 'inflow') {
        monthData.totalInflows = monthData.totalInflows.plus(line.amount);
        monthData.inflows.push({
          category: line.category,
          amount: line.amount.toNumber(),
          description: line.description,
        });
      } else {
        monthData.totalOutflows = monthData.totalOutflows.plus(line.amount);
        monthData.outflows.push({
          category: line.category,
          amount: line.amount.toNumber(),
          description: line.description,
        });
      }
    }

    // Calculate net cash flow and running balance
    let runningBalance = new Decimal(0);

    for (const [month, data] of Array.from(monthlyData.entries()).sort()) {
      data.netCashFlow = data.totalInflows.minus(data.totalOutflows);
      runningBalance = runningBalance.plus(data.netCashFlow);

      summary.periods.push({
        period: data.period,
        totalInflows: data.totalInflows.toNumber(),
        totalOutflows: data.totalOutflows.toNumber(),
        netCashFlow: data.netCashFlow.toNumber(),
        runningBalance: runningBalance.toNumber(),
        inflows: data.inflows,
        outflows: data.outflows,
      });
    }

    // Calculate totals
    summary.totals = {
      totalInflows: summary.periods.reduce((sum, p) => sum + p.totalInflows, 0),
      totalOutflows: summary.periods.reduce((sum, p) => sum + p.totalOutflows, 0),
      netCashFlow: summary.periods.reduce((sum, p) => sum + p.netCashFlow, 0),
      endingBalance: runningBalance.toNumber(),
    };

    return summary;
  }
  // ============================================================================
  // GENERATE FROM DATA — auto-populate from AR invoices, POs, budget lines
  // ============================================================================
  async generateFromData(
    tenantId: string,
    userId: string,
    projectionId: string,
    options: {
      startDate?: string;
      endDate?: string;
      includeAR?: boolean;
      includePO?: boolean;
      includeBudget?: boolean;
    } = {},
  ) {
    const projection = await this.findOne(tenantId, projectionId);
    const { includeAR = true, includePO = true, includeBudget = true } = options;

    const startDate = options.startDate ? new Date(options.startDate) : projection.startDate;
    const endDate = options.endDate ? new Date(options.endDate) : projection.endDate;

    const linesToCreate: any[] = [];

    // ── AR Invoices → inflows ─────────────────────────────────────────────────
    if (includeAR) {
      const arInvoices = await this.prisma.arInvoice.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: ['sent', 'paid', 'partial'] },
          invoiceDate: { gte: startDate, lte: endDate },
        },
        include: { customer: { select: { name: true } } },
      });

      for (const inv of arInvoices) {
        linesToCreate.push({
          tenantId,
          cashFlowProjectionId: projectionId,
          lineDate: new Date(inv.invoiceDate),
          lineType: 'inflow',
          category: 'ar_collection',
          amount: new Decimal(inv.totalAmount),
          description: `AR ${inv.invoiceNumber} - ${inv.customer?.name ?? ''}`,
          createdBy: userId,
          updatedBy: userId,
        });
      }
    }

    // ── Purchase Orders → outflows ────────────────────────────────────────────
    if (includePO) {
      const pos = await this.prisma.purchaseOrder.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: ['confirmed', 'received', 'partial'] },
          poDate: { gte: startDate, lte: endDate },
        },
        include: { supplier: { select: { name: true } } },
      });

      for (const po of pos) {
        const payDate = po.expectedDate
          ? new Date(po.expectedDate)
          : new Date(new Date(po.poDate).getTime() + 30 * 24 * 60 * 60 * 1000);

        linesToCreate.push({
          tenantId,
          cashFlowProjectionId: projectionId,
          lineDate: payDate,
          lineType: 'outflow',
          category: 'ap_payment',
          amount: new Decimal(po.total),
          description: `PO ${po.poNumber} - ${po.supplier?.name ?? ''}`,
          createdBy: userId,
          updatedBy: userId,
        });
      }
    }

    // ── Budget lines (expense accounts 5.x.xx) → outflows ────────────────────
    if (includeBudget) {
      const budgetLines = await this.prisma.budgetLine.findMany({
        where: {
          tenantId,
          deletedAt: null,
          account: { accountNumber: { startsWith: '5' } },
          fiscalPeriod: {
            gte: startDate.toISOString().substring(0, 7),
            lte: endDate.toISOString().substring(0, 7),
          },
        },
        include: {
          account: { select: { accountNumber: true, name: true } },
          budget: { select: { budgetCode: true } },
        },
      });

      for (const bl of budgetLines) {
        const [year, month] = bl.fiscalPeriod.split('-').map(Number);
        const lineDate = new Date(year, month - 1, 1);

        linesToCreate.push({
          tenantId,
          cashFlowProjectionId: projectionId,
          lineDate,
          lineType: 'outflow',
          category: 'opex_budget',
          amount: new Decimal(bl.budgetAmount),
          description: `Budget ${bl.account.accountNumber} ${bl.account.name} ${bl.fiscalPeriod}`,
          accountId: bl.accountId,
          createdBy: userId,
          updatedBy: userId,
        });
      }
    }

    // Bulk insert
    if (linesToCreate.length === 0) {
      return { message: 'No data found for the given date range', linesCreated: 0 };
    }

    await this.prisma.cashFlowLine.createMany({ data: linesToCreate });

    return {
      message: `Cash flow populated from data`,
      linesCreated: linesToCreate.length,
      breakdown: {
        arInflows: includeAR
          ? linesToCreate.filter((l) => l.category === 'ar_collection').length
          : 0,
        poOutflows: includePO ? linesToCreate.filter((l) => l.category === 'ap_payment').length : 0,
        budgetOutflows: includeBudget
          ? linesToCreate.filter((l) => l.category === 'opex_budget').length
          : 0,
      },
    };
  }
}
