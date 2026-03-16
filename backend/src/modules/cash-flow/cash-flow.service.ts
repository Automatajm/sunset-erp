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

    const projection = await this.prisma.cashFlowProjection.create({
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

    return projection;
  }

  async findAll(tenantId: string, scenario?: string) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (scenario) {
      where.scenario = scenario;
    }

    const projections = await this.prisma.cashFlowProjection.findMany({
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

    return projections;
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
    if (
      updateCashFlowProjectionDto.projectionCode &&
      updateCashFlowProjectionDto.projectionCode
    ) {
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

    const updated = await this.prisma.cashFlowProjection.update({
      where: { id },
      data: dataToUpdate,
      include: {
        cashFlowLines: {
          include: {
            account: true,
          },
          orderBy: { lineDate: 'asc' },
        },
      },
    });

    return updated;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const projection = await this.findOne(tenantId, id);

    await this.prisma.cashFlowProjection.update({
      where: { id },
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

    const updated = await this.prisma.cashFlowLine.update({
      where: { id: lineId },
      data: dataToUpdate,
      include: {
        account: true,
      },
    });

    return updated;
  }

  async removeCashFlowLine(
    tenantId: string,
    userId: string,
    projectionId: string,
    lineId: string,
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

    await this.prisma.cashFlowLine.update({
      where: { id: lineId },
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
}
