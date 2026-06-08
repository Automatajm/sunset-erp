import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateFiscalPeriodDto } from './dto/create-fiscal-period.dto';
import { UpdateFiscalPeriodDto } from './dto/update-fiscal-period.dto';

@Injectable()
export class FiscalPeriodsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createFiscalPeriodDto: CreateFiscalPeriodDto) {
    // Check for duplicate period code
    const existing = await this.prisma.fiscalPeriod.findFirst({
      where: {
        tenantId,
        periodCode: createFiscalPeriodDto.periodCode,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Fiscal period ${createFiscalPeriodDto.periodCode} already exists`,
      );
    }

    // If setting as current, unset other current periods
    if (createFiscalPeriodDto.isCurrent) {
      await this.prisma.fiscalPeriod.updateMany({
        where: {
          tenantId,
          isCurrent: true,
          deletedAt: null,
        },
        data: {
          isCurrent: false,
        },
      });
    }

    const fiscalPeriod = await this.prisma.fiscalPeriod.create({
      data: {
        tenantId,
        periodCode: createFiscalPeriodDto.periodCode,
        periodName: createFiscalPeriodDto.periodName,
        startDate: new Date(createFiscalPeriodDto.startDate),
        endDate: new Date(createFiscalPeriodDto.endDate),
        fiscalYear: createFiscalPeriodDto.fiscalYear,
        fiscalQuarter: createFiscalPeriodDto.fiscalQuarter,
        status: createFiscalPeriodDto.status || 'open',
        isCurrent: createFiscalPeriodDto.isCurrent ?? false,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return fiscalPeriod;
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

    const fiscalPeriods = await this.prisma.fiscalPeriod.findMany({
      where,
      orderBy: {
        startDate: 'asc',
      },
    });

    return { fiscalPeriods, count: fiscalPeriods.length };
  }

  async findOne(tenantId: string, id: string) {
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!period) {
      throw new NotFoundException(`Fiscal period with ID ${id} not found`);
    }

    return period;
  }

  async getCurrentPeriod(tenantId: string) {
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: {
        tenantId,
        isCurrent: true,
        deletedAt: null,
      },
    });

    if (!period) {
      throw new NotFoundException('No current fiscal period defined');
    }

    return period;
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    updateFiscalPeriodDto: UpdateFiscalPeriodDto,
  ) {
    await this.findOne(tenantId, id);

    if (updateFiscalPeriodDto.periodCode) {
      const existing = await this.prisma.fiscalPeriod.findFirst({
        where: {
          tenantId,
          periodCode: updateFiscalPeriodDto.periodCode,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(
          `Fiscal period ${updateFiscalPeriodDto.periodCode} already exists`,
        );
      }
    }

    // If setting as current, unset other current periods
    if (updateFiscalPeriodDto.isCurrent) {
      await this.prisma.fiscalPeriod.updateMany({
        where: {
          tenantId,
          isCurrent: true,
          id: { not: id },
          deletedAt: null,
        },
        data: {
          isCurrent: false,
        },
      });
    }

    const updateData: any = {
      updatedBy: userId,
    };

    if (updateFiscalPeriodDto.periodCode) updateData.periodCode = updateFiscalPeriodDto.periodCode;
    if (updateFiscalPeriodDto.periodName) updateData.periodName = updateFiscalPeriodDto.periodName;
    if (updateFiscalPeriodDto.startDate)
      updateData.startDate = new Date(updateFiscalPeriodDto.startDate);
    if (updateFiscalPeriodDto.endDate) updateData.endDate = new Date(updateFiscalPeriodDto.endDate);
    if (updateFiscalPeriodDto.fiscalYear) updateData.fiscalYear = updateFiscalPeriodDto.fiscalYear;
    if (updateFiscalPeriodDto.fiscalQuarter !== undefined)
      updateData.fiscalQuarter = updateFiscalPeriodDto.fiscalQuarter;
    if (updateFiscalPeriodDto.status) updateData.status = updateFiscalPeriodDto.status;
    if (updateFiscalPeriodDto.isCurrent !== undefined)
      updateData.isCurrent = updateFiscalPeriodDto.isCurrent;

    await this.prisma.fiscalPeriod.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: updateData,
    });

    return this.findOne(tenantId, id);
  }

  async closePeriod(tenantId: string, userId: string, id: string) {
    const period = await this.findOne(tenantId, id);

    if (period.status === 'closed' || period.status === 'locked') {
      throw new BadRequestException('Period is already closed or locked');
    }

    // Check for unposted journal entries in this period
    const unpostedEntries = await this.prisma.journalEntry.count({
      where: {
        tenantId,
        fiscalPeriod: period.periodCode,
        status: 'draft',
        deletedAt: null,
      },
    });

    if (unpostedEntries > 0) {
      throw new BadRequestException(
        `Cannot close period. ${unpostedEntries} unposted journal entries found. Please post or delete them first.`,
      );
    }

    await this.prisma.fiscalPeriod.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        status: 'closed',
        closedAt: new Date(),
        closedBy: userId,
        updatedBy: userId,
      },
    });

    return {
      message: `Fiscal period ${period.periodCode} closed successfully`,
      fiscalPeriod: await this.findOne(tenantId, id),
    };
  }

  async reopenPeriod(tenantId: string, userId: string, id: string) {
    const period = await this.findOne(tenantId, id);

    if (period.status === 'locked') {
      throw new BadRequestException('Locked periods cannot be reopened. Please unlock first.');
    }

    if (period.status !== 'closed') {
      throw new BadRequestException('Only closed periods can be reopened');
    }

    await this.prisma.fiscalPeriod.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        status: 'open',
        closedAt: null,
        closedBy: null,
        updatedBy: userId,
      },
    });

    return {
      message: `Fiscal period ${period.periodCode} reopened successfully`,
      fiscalPeriod: await this.findOne(tenantId, id),
    };
  }

  async lockPeriod(tenantId: string, userId: string, id: string) {
    const period = await this.findOne(tenantId, id);

    if (period.status !== 'closed') {
      throw new BadRequestException('Only closed periods can be locked');
    }

    await this.prisma.fiscalPeriod.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        status: 'locked',
        updatedBy: userId,
      },
    });

    return {
      message: `Fiscal period ${period.periodCode} locked successfully`,
      fiscalPeriod: await this.findOne(tenantId, id),
    };
  }

  async unlockPeriod(tenantId: string, userId: string, id: string) {
    const period = await this.findOne(tenantId, id);

    if (period.status !== 'locked') {
      throw new BadRequestException('Only locked periods can be unlocked');
    }

    await this.prisma.fiscalPeriod.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        status: 'closed',
        updatedBy: userId,
      },
    });

    return {
      message: `Fiscal period ${period.periodCode} unlocked successfully`,
      fiscalPeriod: await this.findOne(tenantId, id),
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const period = await this.findOne(tenantId, id);

    if (period.status === 'closed' || period.status === 'locked') {
      throw new BadRequestException('Cannot delete closed or locked periods');
    }

    // Check for journal entries in this period
    const entriesCount = await this.prisma.journalEntry.count({
      where: {
        tenantId,
        fiscalPeriod: period.periodCode,
        deletedAt: null,
      },
    });

    if (entriesCount > 0) {
      throw new BadRequestException(
        `Cannot delete period. ${entriesCount} journal entries exist for this period.`,
      );
    }

    await this.prisma.fiscalPeriod.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'Fiscal period deleted successfully',
      id,
    };
  }
}
