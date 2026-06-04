// --- macro-categories/macro-categories.service.ts ---
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { CreateMacroCategoryDto } from './dto/create-macro-category.dto';
import { UpdateMacroCategoryDto } from './dto/update-macro-category.dto';

@Injectable()
export class MacroCategoriesService {
  constructor(
    private prisma: PrismaService,
    private categoriesService: CategoriesService,
  ) {}

  // ── Auto-code MC-YYYY-NNNN (spec-012: codes are system-assigned, immutable) ──
  private async generateCode(tenantId: string): Promise<string> {
    const prefix = `MC-${new Date().getFullYear()}`;
    // Numeric max (never lexicographic), NaN-guarded, spanning soft-deleted rows —
    // @@unique([tenantId, code]) spans them (house convention).
    const rows = await this.prisma.macroCategory.findMany({
      where: { tenantId, code: { startsWith: prefix } },
      select: { code: true },
    });
    const max = rows.reduce((m, r) => {
      const n = parseInt(r.code.split('-')[2] ?? '', 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  async create(tenantId: string, userId: string, dto: CreateMacroCategoryDto) {
    return this.prisma.macroCategory.create({
      data: {
        ...dto,
        tenantId,
        code: await this.generateCode(tenantId),
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
      include: { _count: { select: { categories: true } } },
    });
  }

  async findAll(tenantId: string) {
    const macroCategories = await this.prisma.macroCategory.findMany({
      where: { tenantId, deletedAt: null },
      include: { _count: { select: { categories: true } } },
      orderBy: { code: 'asc' },
    });
    return { macroCategories, count: macroCategories.length };
  }

  async findOne(tenantId: string, id: string) {
    const mc = await this.prisma.macroCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        categories: {
          where: { deletedAt: null },
          orderBy: { code: 'asc' },
          include: { _count: { select: { items: true } } },
        },
      },
    });
    if (!mc) throw new NotFoundException(`MacroCategory ${id} not found`);
    return mc;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateMacroCategoryDto) {
    await this.findOne(tenantId, id);
    // Codes are immutable (spec-012) — the DTO no longer carries one.
    // Tenant scope enforced at the write itself (updateMany — Prisma update() only
    // accepts unique wheres), then re-fetch to preserve the response shape.
    await this.prisma.macroCategory.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { ...dto, updatedBy: userId },
    });
    return this.prisma.macroCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { _count: { select: { categories: true } } },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    // Category is owned by the categories module — count via its service (spec-006).
    const catCount = await this.categoriesService.countByMacroCategory(tenantId, id);
    if (catCount > 0)
      throw new BadRequestException(
        `Cannot delete: ${catCount} categories still assigned to this macro category`,
      );
    await this.prisma.macroCategory.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Macro category deleted successfully', id };
  }
}
