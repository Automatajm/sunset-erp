import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createWarehouseDto: CreateWarehouseDto) {
    const existing = await this.prisma.warehouse.findFirst({
      where: {
        tenantId,
        code: createWarehouseDto.code,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(`Warehouse with code ${createWarehouseDto.code} already exists`);
    }

    const warehouse = await this.prisma.warehouse.create({
      data: {
        tenantId,
        code: createWarehouseDto.code,
        name: createWarehouseDto.name,
        warehouseType: createWarehouseDto.warehouseType || 'regular',
        address: createWarehouseDto.address,
        isActive: createWarehouseDto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return warehouse;
  }

  async findAll(tenantId: string) {
    return this.prisma.warehouse.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: {
        code: 'asc',
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            stock: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }

    return warehouse;
  }

  async update(tenantId: string, userId: string, id: string, updateWarehouseDto: UpdateWarehouseDto) {
    await this.findOne(tenantId, id);

    if (updateWarehouseDto.code) {
      const existing = await this.prisma.warehouse.findFirst({
        where: {
          tenantId,
          code: updateWarehouseDto.code,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(`Warehouse with code ${updateWarehouseDto.code} already exists`);
      }
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: {
        ...updateWarehouseDto,
        updatedBy: userId,
      },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.prisma.warehouse.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'Warehouse deleted successfully',
      id,
    };
  }
}
