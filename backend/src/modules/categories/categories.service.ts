// --- categories/categories.service.ts ---
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const INCLUDE = {
  macroCategory: { select: { id: true, code: true, name: true } },
  inventoryAccount: { select: { accountNumber: true, name: true } },
  cogsAccount: { select: { accountNumber: true, name: true } },
  _count: { select: { items: true } },
};

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { tenantId, code: dto.code, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Category code ${dto.code} already exists`);
    const mc = await this.prisma.macroCategory.findFirst({
      where: { id: dto.macroCategoryId, tenantId, deletedAt: null },
    });
    if (!mc) throw new NotFoundException(`MacroCategory ${dto.macroCategoryId} not found`);
    return this.prisma.category.create({
      data: {
        tenantId,
        ...dto,
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
      include: INCLUDE,
    });
  }

  async findAll(tenantId: string, macroCategoryId?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (macroCategoryId) where.macroCategoryId = macroCategoryId;
    return this.prisma.category.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ macroCategory: { code: 'asc' } }, { code: 'asc' }],
    });
  }

  // Cross-module count for MacroCategoriesService.remove's delete guard (spec-006) —
  // keeps Category queries owned by this module.
  async countByMacroCategory(tenantId: string, macroCategoryId: string): Promise<number> {
    return this.prisma.category.count({
      where: { tenantId, macroCategoryId, deletedAt: null },
    });
  }

  async findOne(tenantId: string, id: string) {
    const cat = await this.prisma.category.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        macroCategory: true,
        inventoryAccount: true,
        cogsAccount: true,
        _count: { select: { items: true } },
      },
    });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    return cat;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOne(tenantId, id);
    if (dto.code) {
      const conflict = await this.prisma.category.findFirst({
        where: { tenantId, code: dto.code, id: { not: id }, deletedAt: null },
      });
      if (conflict) throw new ConflictException(`Category code ${dto.code} already exists`);
    }
    return this.prisma.category.update({
      where: { id },
      data: { ...dto, updatedBy: userId },
      include: INCLUDE,
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    const itemCount = await this.prisma.item.count({ where: { categoryId: id, deletedAt: null } });
    if (itemCount > 0)
      throw new BadRequestException(
        `Cannot delete: ${itemCount} items still assigned to this category`,
      );
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Category deleted successfully', id };
  }
}
