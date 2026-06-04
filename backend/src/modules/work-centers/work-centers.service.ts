import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWorkCenterDto } from './dto/create-work-center.dto';
import { UpdateWorkCenterDto } from './dto/update-work-center.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class WorkCentersService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createWorkCenterDto: CreateWorkCenterDto) {
    const existing = await this.prisma.workCenter.findFirst({
      where: {
        tenantId,
        code: createWorkCenterDto.code,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Work center with code ${createWorkCenterDto.code} already exists`,
      );
    }

    const workCenter = await this.prisma.workCenter.create({
      data: {
        tenantId,
        code: createWorkCenterDto.code,
        name: createWorkCenterDto.name,
        workCenterType: createWorkCenterDto.workCenterType || 'machine',
        capacityPerHour: createWorkCenterDto.capacityPerHour
          ? new Decimal(createWorkCenterDto.capacityPerHour)
          : new Decimal(0),
        efficiencyPercent: createWorkCenterDto.efficiencyPercent
          ? new Decimal(createWorkCenterDto.efficiencyPercent)
          : new Decimal(100),
        costPerHour: createWorkCenterDto.costPerHour
          ? new Decimal(createWorkCenterDto.costPerHour)
          : new Decimal(0),
        isActive: createWorkCenterDto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return this.formatWorkCenterResponse(workCenter);
  }

  async findAll(tenantId: string) {
    const rows = await this.prisma.workCenter.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: {
        code: 'asc',
      },
    });

    const workCenters = rows.map((wc) => this.formatWorkCenterResponse(wc));
    return { workCenters, count: workCenters.length };
  }

  async findOne(tenantId: string, id: string) {
    const workCenter = await this.prisma.workCenter.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!workCenter) {
      throw new NotFoundException(`Work center with ID ${id} not found`);
    }

    return this.formatWorkCenterResponse(workCenter);
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    updateWorkCenterDto: UpdateWorkCenterDto,
  ) {
    await this.findOne(tenantId, id);

    if (updateWorkCenterDto.code) {
      const existing = await this.prisma.workCenter.findFirst({
        where: {
          tenantId,
          code: updateWorkCenterDto.code,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(
          `Work center with code ${updateWorkCenterDto.code} already exists`,
        );
      }
    }

    const updateData: any = { updatedBy: userId };

    if (updateWorkCenterDto.code) updateData.code = updateWorkCenterDto.code;
    if (updateWorkCenterDto.name) updateData.name = updateWorkCenterDto.name;
    if (updateWorkCenterDto.workCenterType)
      updateData.workCenterType = updateWorkCenterDto.workCenterType;
    if (updateWorkCenterDto.capacityPerHour !== undefined)
      updateData.capacityPerHour = new Decimal(updateWorkCenterDto.capacityPerHour);
    if (updateWorkCenterDto.efficiencyPercent !== undefined)
      updateData.efficiencyPercent = new Decimal(updateWorkCenterDto.efficiencyPercent);
    if (updateWorkCenterDto.costPerHour !== undefined)
      updateData.costPerHour = new Decimal(updateWorkCenterDto.costPerHour);
    if (updateWorkCenterDto.isActive !== undefined)
      updateData.isActive = updateWorkCenterDto.isActive;

    // Tenant scope enforced at the write itself (updateMany — Prisma update() only
    // accepts unique wheres), then re-fetch to preserve the response shape.
    await this.prisma.workCenter.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: updateData,
    });
    const workCenter = await this.prisma.workCenter.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    return this.formatWorkCenterResponse(workCenter);
  }

  async remove(tenantId: string, userId: string, id: string) {
    // Own-relation filtered count — a work center referenced by active BOM routings
    // cannot be deleted (spec-010); no direct bom-module query.
    const wc = await this.prisma.workCenter.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { _count: { select: { routings: { where: { deletedAt: null } } } } },
    });
    if (!wc) {
      throw new NotFoundException(`Work center with ID ${id} not found`);
    }
    if (wc._count.routings > 0) {
      throw new BadRequestException(
        `Cannot delete: ${wc._count.routings} BOM routings still reference this work center`,
      );
    }

    await this.prisma.workCenter.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return { message: 'Work center deleted successfully', id };
  }

  private formatWorkCenterResponse(workCenter: any) {
    return {
      ...workCenter,
      capacityPerHour: workCenter.capacityPerHour ? workCenter.capacityPerHour.toNumber() : null,
      efficiencyPercent: workCenter.efficiencyPercent
        ? workCenter.efficiencyPercent.toNumber()
        : 100,
      costPerHour: workCenter.costPerHour ? workCenter.costPerHour.toNumber() : null,
    };
  }
}
