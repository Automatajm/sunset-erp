import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  CreateWarehouseLocationDto,
  UpdateWarehouseLocationDto,
  QueryWarehousesDto,
} from './dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // WAREHOUSES CRUD
  // ============================================

  async create(tenantId: string, userId: string, dto: CreateWarehouseDto) {
    // Verificar código único
    const existing = await this.prisma.warehouse.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code } },
    });

    if (existing) {
      throw new ConflictException(`Warehouse with code ${dto.code} already exists`);
    }

    return this.prisma.warehouse.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        warehouseType: dto.warehouseType,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        postalCode: dto.postalCode,
        phone: dto.phone,
        email: dto.email,
        managerId: dto.managerId,
        isActive: true,
        createdBy: userId,
      },
      include: {
        locations: {
          where: { isActive: true },
          orderBy: { code: 'asc' },
          take: 10,
        },
      },
    });
  }

  async findAll(tenantId: string, query: QueryWarehousesDto) {
    const { page = 1, limit = 10, search, warehouseType, city, isActive } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.WarehouseWhereInput = {
      tenantId,
      deletedAt: null,
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(warehouseType && { warehouseType }),
      ...(city && { city: { contains: city, mode: 'insensitive' } }),
      ...(isActive !== undefined && { isActive }),
    };

    const [data, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              locations: { where: { isActive: true } },
              stockLevels: true,
            },
          },
        },
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        locations: {
          where: { isActive: true },
          orderBy: { locationPath: 'asc' },
        },
        _count: {
          select: {
            stockLevels: true,
            receipts: true,
            issues: true,
            transfersFrom: true,
            transfersTo: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }

    return warehouse;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.findOne(tenantId, id);

    // Si cambia el código, verificar que no exista
    if (dto.code && dto.code !== warehouse.code) {
      const existing = await this.prisma.warehouse.findUnique({
        where: { tenantId_code: { tenantId, code: dto.code } },
      });

      if (existing) {
        throw new ConflictException(`Warehouse with code ${dto.code} already exists`);
      }
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: {
        ...dto,
        updatedAt: new Date(),
      },
      include: {
        locations: {
          where: { isActive: true },
          orderBy: { code: 'asc' },
          take: 10,
        },
      },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    const warehouse = await this.findOne(tenantId, id);

    // Verificar que no tenga stock
    const stockCount = await this.prisma.stockLevel.count({
      where: {
        warehouseId: id,
        quantityOnHand: { gt: 0 },
      },
    });

    if (stockCount > 0) {
      throw new BadRequestException(
        `Cannot delete warehouse with ${stockCount} items in stock. Transfer or remove stock first.`,
      );
    }

    // Soft delete
    return this.prisma.warehouse.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });
  }

  // ============================================
  // WAREHOUSE LOCATIONS
  // ============================================

  async createLocation(tenantId: string, warehouseId: string, dto: CreateWarehouseLocationDto) {
    // Verificar que el warehouse existe
    await this.findOne(tenantId, warehouseId);

    // Verificar código único en este warehouse
    const existing = await this.prisma.warehouseLocation.findUnique({
      where: { warehouseId_code: { warehouseId, code: dto.code } },
    });

    if (existing) {
      throw new ConflictException(`Location with code ${dto.code} already exists in this warehouse`);
    }

    // Generar locationPath
    const locationPath = [dto.aisle, dto.rack, dto.shelf, dto.bin]
      .filter(Boolean)
      .join('-');

    return this.prisma.warehouseLocation.create({
      data: {
        tenantId,
        warehouseId,
        code: dto.code,
        name: dto.name,
        aisle: dto.aisle,
        rack: dto.rack,
        shelf: dto.shelf,
        bin: dto.bin,
        locationPath: locationPath || dto.code,
        isActive: true,
      },
    });
  }

  async findAllLocations(tenantId: string, warehouseId: string) {
    // Verificar que el warehouse existe
    await this.findOne(tenantId, warehouseId);

    return this.prisma.warehouseLocation.findMany({
      where: {
        tenantId,
        warehouseId,
        isActive: true,
      },
      orderBy: { locationPath: 'asc' },
      include: {
        _count: {
          select: {
            stockLevels: true,
          },
        },
      },
    });
  }

  async findOneLocation(tenantId: string, warehouseId: string, locationId: string) {
    const location = await this.prisma.warehouseLocation.findFirst({
      where: {
        id: locationId,
        tenantId,
        warehouseId,
        isActive: true,
      },
      include: {
        warehouse: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        stockLevels: {
          include: {
            item: {
              select: {
                id: true,
                code: true,
                name: true,
                baseUnit: true,
              },
            },
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    return location;
  }

  async updateLocation(
    tenantId: string,
    warehouseId: string,
    locationId: string,
    dto: UpdateWarehouseLocationDto,
  ) {
    const location = await this.findOneLocation(tenantId, warehouseId, locationId);

    // Si cambia el código, verificar que no exista
    if (dto.code && dto.code !== location.code) {
      const existing = await this.prisma.warehouseLocation.findUnique({
        where: { warehouseId_code: { warehouseId, code: dto.code } },
      });

      if (existing) {
        throw new ConflictException(`Location with code ${dto.code} already exists`);
      }
    }

    // Actualizar locationPath si cambian componentes
    const locationPath = [
      dto.aisle ?? location.aisle,
      dto.rack ?? location.rack,
      dto.shelf ?? location.shelf,
      dto.bin ?? location.bin,
    ]
      .filter(Boolean)
      .join('-');

    return this.prisma.warehouseLocation.update({
      where: { id: locationId },
      data: {
        ...dto,
        locationPath: locationPath || location.locationPath,
        updatedAt: new Date(),
      },
    });
  }

  async removeLocation(tenantId: string, warehouseId: string, locationId: string) {
    const location = await this.findOneLocation(tenantId, warehouseId, locationId);

    // Verificar que no tenga stock
    const stockCount = await this.prisma.stockLevel.count({
      where: {
        locationId,
        quantityOnHand: { gt: 0 },
      },
    });

    if (stockCount > 0) {
      throw new BadRequestException(
        `Cannot delete location with ${stockCount} items in stock. Transfer or remove stock first.`,
      );
    }

    // Soft delete (cambiar isActive)
    return this.prisma.warehouseLocation.update({
      where: { id: locationId },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  async getWarehouseStats(tenantId: string, warehouseId: string) {
    await this.findOne(tenantId, warehouseId);

    const [
      totalLocations,
      occupiedLocations,
      totalItems,
      totalValue,
      recentReceipts,
      recentIssues,
    ] = await Promise.all([
      this.prisma.warehouseLocation.count({
        where: { warehouseId, isActive: true },
      }),
      this.prisma.warehouseLocation.count({
        where: {
          warehouseId,
          isActive: true,
          stockLevels: {
            some: {
              quantityOnHand: { gt: 0 },
            },
          },
        },
      }),
      this.prisma.stockLevel.count({
        where: {
          warehouseId,
          quantityOnHand: { gt: 0 },
        },
      }),
      this.prisma.stockLevel.aggregate({
        where: {
          warehouseId,
          quantityOnHand: { gt: 0 },
        },
        _sum: {
          totalValue: true,
        },
      }),
      this.prisma.receipt.count({
        where: {
          warehouseId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      }),
      this.prisma.issue.count({
        where: {
          warehouseId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      locations: {
        total: totalLocations,
        occupied: occupiedLocations,
        available: totalLocations - occupiedLocations,
        occupancyRate: totalLocations > 0 ? (occupiedLocations / totalLocations) * 100 : 0,
      },
      inventory: {
        totalItems,
        totalValue: totalValue._sum.totalValue || 0,
      },
      activity: {
        receiptsLast30Days: recentReceipts,
        issuesLast30Days: recentIssues,
      },
    };
  }
}