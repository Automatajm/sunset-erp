// --- categories/categories.service.ts ---
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChartOfAccountsService } from '../chart-of-accounts/chart-of-accounts.service';
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
  constructor(
    private prisma: PrismaService,
    private chartOfAccountsService: ChartOfAccountsService,
  ) {}

  // GL accounts must resolve IN the tenant (Prisma FKs are not tenant-composite) —
  // delegate to the owning module's scoped findOne, which throws the 404 (spec-009).
  private async validateAccounts(
    tenantId: string,
    dto: { inventoryAccountId?: string; cogsAccountId?: string },
  ) {
    if (dto.inventoryAccountId)
      await this.chartOfAccountsService.findOne(tenantId, dto.inventoryAccountId);
    if (dto.cogsAccountId) await this.chartOfAccountsService.findOne(tenantId, dto.cogsAccountId);
  }

  // Scoped MacroCategory lookup — direct query is the documented exception
  // (MacroCategoriesModule imports CategoriesModule since spec-006; the reverse
  // import would cycle).
  private async validateMacroCategory(tenantId: string, macroCategoryId: string) {
    const mc = await this.prisma.macroCategory.findFirst({
      where: { id: macroCategoryId, tenantId, deletedAt: null },
    });
    if (!mc) throw new NotFoundException(`MacroCategory ${macroCategoryId} not found`);
  }

  // ── Auto-code CAT-YYYY-NNNN (spec-012: codes are system-assigned, immutable) ──
  private async generateCode(tenantId: string): Promise<string> {
    const prefix = `CAT-${new Date().getFullYear()}`;
    // Numeric max (never lexicographic), NaN-guarded, spanning soft-deleted rows —
    // @@unique([tenantId, code]) spans them (house convention).
    const rows = await this.prisma.category.findMany({
      where: { tenantId, code: { startsWith: prefix } },
      select: { code: true },
    });
    const max = rows.reduce((m, r) => {
      const n = parseInt(r.code.split('-')[2] ?? '', 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  async create(tenantId: string, userId: string, dto: CreateCategoryDto) {
    await this.validateMacroCategory(tenantId, dto.macroCategoryId);
    await this.validateAccounts(tenantId, dto);
    return this.prisma.category.create({
      data: {
        ...dto,
        tenantId,
        code: await this.generateCode(tenantId),
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
    const categories = await this.prisma.category.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ macroCategory: { code: 'asc' } }, { code: 'asc' }],
    });
    return { categories, count: categories.length };
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
    // Codes are immutable (spec-012). Re-parenting and GL mapping must resolve in-tenant (spec-009).
    if (dto.macroCategoryId !== undefined)
      await this.validateMacroCategory(tenantId, dto.macroCategoryId);
    await this.validateAccounts(tenantId, dto);
    // Tenant scope enforced at the write itself (updateMany — Prisma update() only
    // accepts unique wheres), then re-fetch to preserve the response shape.
    await this.prisma.category.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { ...dto, updatedBy: userId },
    });
    return this.prisma.category.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: INCLUDE,
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    // Own-relation filtered count — tenant safety follows from the scoped parent row;
    // no direct cross-module Item query (spec-009).
    const cat = await this.prisma.category.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    if (cat._count.items > 0)
      throw new BadRequestException(
        `Cannot delete: ${cat._count.items} items still assigned to this category`,
      );
    await this.prisma.category.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Category deleted successfully', id };
  }
}
