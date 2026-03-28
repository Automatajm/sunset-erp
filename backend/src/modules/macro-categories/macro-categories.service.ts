// --- macro-categories/macro-categories.service.ts ---
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateMacroCategoryDto } from './dto/create-macro-category.dto';
import { UpdateMacroCategoryDto } from './dto/update-macro-category.dto';
 
@Injectable()
export class MacroCategoriesService {
  constructor(private prisma: PrismaService) {}
 
  async create(tenantId: string, userId: string, dto: CreateMacroCategoryDto) {
    const existing = await this.prisma.macroCategory.findFirst({ where: { tenantId, code: dto.code, deletedAt: null } });
    if (existing) throw new ConflictException(`MacroCategory code ${dto.code} already exists`);
    return this.prisma.macroCategory.create({
      data:    { tenantId, ...dto, isActive: dto.isActive ?? true, createdBy: userId, updatedBy: userId },
      include: { _count: { select: { categories: true } } },
    });
  }
 
  async findAll(tenantId: string) {
    return this.prisma.macroCategory.findMany({
      where:   { tenantId, deletedAt: null },
      include: { _count: { select: { categories: true } } },
      orderBy: { code: 'asc' },
    });
  }
 
  async findOne(tenantId: string, id: string) {
    const mc = await this.prisma.macroCategory.findFirst({
      where:   { id, tenantId, deletedAt: null },
      include: { categories: { where: { deletedAt: null }, orderBy: { code: 'asc' }, include: { _count: { select: { items: true } } } } },
    });
    if (!mc) throw new NotFoundException(`MacroCategory ${id} not found`);
    return mc;
  }
 
  async update(tenantId: string, userId: string, id: string, dto: UpdateMacroCategoryDto) {
    await this.findOne(tenantId, id);
    if (dto.code) {
      const conflict = await this.prisma.macroCategory.findFirst({ where: { tenantId, code: dto.code, id: { not: id }, deletedAt: null } });
      if (conflict) throw new ConflictException(`MacroCategory code ${dto.code} already exists`);
    }
    return this.prisma.macroCategory.update({
      where:   { id },
      data:    { ...dto, updatedBy: userId },
      include: { _count: { select: { categories: true } } },
    });
  }
 
  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    const catCount = await this.prisma.category.count({ where: { macroCategoryId: id, deletedAt: null } });
    if (catCount > 0) throw new BadRequestException(`Cannot delete: ${catCount} categories still assigned to this macro category`);
    await this.prisma.macroCategory.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: userId } });
    return { message: 'Macro category deleted successfully', id };
  }
}