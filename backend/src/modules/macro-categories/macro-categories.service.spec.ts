// ============================================================================
// Unit tests for MacroCategoriesService — spec-006-macro-categories
// PrismaService (and CategoriesService) are mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MacroCategoriesService } from './macro-categories.service';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

describe('MacroCategoriesService', () => {
  let service: MacroCategoriesService;
  let prisma: {
    macroCategory: Record<string, jest.Mock>;
    category: Record<string, jest.Mock>;
  };
  let categoriesService: { countByMacroCategory: jest.Mock };

  beforeEach(async () => {
    prisma = {
      macroCategory: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      category: {
        count: jest.fn(),
      },
    };
    categoriesService = { countByMacroCategory: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        MacroCategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CategoriesService, useValue: categoriesService },
      ],
    }).compile();
    service = mod.get(MacroCategoriesService);
  });

  // ── Tenant scoping — reads ───────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    prisma.macroCategory.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.macroCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('findAll orders by code asc and includes _count.categories', async () => {
    prisma.macroCategory.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.macroCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { code: 'asc' },
        include: { _count: { select: { categories: true } } },
      }),
    );
  });

  it('findOne scopes by id + tenantId + deletedAt: null and includes only active children', async () => {
    prisma.macroCategory.findFirst.mockResolvedValue({ id: 'x' });
    await service.findOne(TENANT_A, 'x');
    expect(prisma.macroCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'x', tenantId: TENANT_A, deletedAt: null },
        include: expect.objectContaining({
          categories: expect.objectContaining({
            where: { deletedAt: null },
            orderBy: { code: 'asc' },
          }),
        }),
      }),
    );
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.macroCategory.findFirst.mockResolvedValue(null); // wrong-tenant query returns nothing
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  // ── Create + auto-code MC-YYYY-NNNN (spec-012) ───────────────────────────
  it('create auto-generates MC-YYYY-0001 when the tenant has no codes for the year', async () => {
    prisma.macroCategory.findMany.mockResolvedValue([]); // generateCode lookup
    prisma.macroCategory.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.create(TENANT_A, USER, { name: 'Wood' } as any);
    const year = new Date().getFullYear();
    expect(result.code).toBe(`MC-${year}-0001`);
  });

  it('create increments from the NUMERIC max code (not lexicographic) and spans soft-deleted', async () => {
    const year = new Date().getFullYear();
    prisma.macroCategory.findMany.mockResolvedValue([
      { code: `MC-${year}-99` },
      { code: `MC-${year}-104` },
    ]);
    prisma.macroCategory.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.create(TENANT_A, USER, { name: 'Wood' } as any);
    expect(result.code).toBe(`MC-${year}-0105`);
    const [arg] = prisma.macroCategory.findMany.mock.calls[0];
    expect(arg.where.tenantId).toBe(TENANT_A);
    expect(arg.where).not.toHaveProperty('deletedAt'); // unique constraint spans soft-deleted
  });

  it('create writes tenantId from the JWT plus audit columns, isActive defaults true', async () => {
    prisma.macroCategory.findMany.mockResolvedValue([]);
    prisma.macroCategory.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    await service.create(TENANT_A, USER, { name: 'Wood' } as any);
    expect(prisma.macroCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_A,
          isActive: true,
          createdBy: USER,
          updatedBy: USER,
        }),
      }),
    );
  });

  // ── Update ────────────────────────────────────────────────────────────────
  it('update throws NotFoundException when the macro category is in another tenant', async () => {
    prisma.macroCategory.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, 'id', {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] update writes are tenant-scoped at the write itself (spec §Tenant scoping — currently where:{id})', async () => {
    prisma.macroCategory.findFirst.mockResolvedValue({ id: 'id' }); // findOne guard + re-fetch
    prisma.macroCategory.update.mockResolvedValue({ id: 'id' });
    prisma.macroCategory.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, 'id', { name: 'X' } as any);
    // Target: updateMany({ where: { id, tenantId, deletedAt: null } }) per suppliers/items convention.
    const scopedUpdateMany = prisma.macroCategory.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.macroCategory.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  // ── Remove ────────────────────────────────────────────────────────────────
  it('remove throws NotFoundException for an unknown / other-tenant id', async () => {
    prisma.macroCategory.findFirst.mockResolvedValue(null);
    await expect(service.remove(TENANT_B, USER, 'id')).rejects.toThrow(NotFoundException);
  });

  it('remove throws BadRequestException while active child categories exist', async () => {
    prisma.macroCategory.findFirst.mockResolvedValue({ id: 'id' });
    // Mock both the current path (direct count) and the target path (delegation),
    // so this behavior test stays green across the refactor.
    prisma.category.count.mockResolvedValue(2);
    categoriesService.countByMacroCategory.mockResolvedValue(2);
    await expect(service.remove(TENANT_A, USER, 'id')).rejects.toThrow(BadRequestException);
  });

  it('remove performs a soft delete (deletedAt + deletedBy), never a hard delete', async () => {
    prisma.macroCategory.findFirst.mockResolvedValue({ id: 'id' });
    prisma.category.count.mockResolvedValue(0);
    categoriesService.countByMacroCategory.mockResolvedValue(0);
    prisma.macroCategory.update.mockResolvedValue({ id: 'id' });
    prisma.macroCategory.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.remove(TENANT_A, USER, 'id');
    const writeCall =
      prisma.macroCategory.updateMany.mock.calls[0] ?? prisma.macroCategory.update.mock.calls[0];
    const [arg] = writeCall;
    expect(arg.data).toEqual(expect.objectContaining({ deletedBy: USER }));
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(result).toEqual(expect.objectContaining({ message: expect.any(String), id: 'id' }));
  });

  it('[GAP] remove soft-delete write is tenant-scoped at the write itself (spec §Tenant scoping)', async () => {
    prisma.macroCategory.findFirst.mockResolvedValue({ id: 'id' });
    prisma.category.count.mockResolvedValue(0);
    categoriesService.countByMacroCategory.mockResolvedValue(0);
    prisma.macroCategory.update.mockResolvedValue({ id: 'id' });
    prisma.macroCategory.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    const scopedUpdateMany = prisma.macroCategory.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.macroCategory.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  it('[GAP] remove delegates the child count to CategoriesService.countByMacroCategory (spec §Module interconnection)', async () => {
    prisma.macroCategory.findFirst.mockResolvedValue({ id: 'id' });
    prisma.category.count.mockResolvedValue(0);
    categoriesService.countByMacroCategory.mockResolvedValue(0);
    prisma.macroCategory.update.mockResolvedValue({ id: 'id' });
    prisma.macroCategory.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    // Target: no direct prisma.category access from this module — inject CategoriesService.
    expect(categoriesService.countByMacroCategory).toHaveBeenCalledWith(TENANT_A, 'id');
    expect(prisma.category.count).not.toHaveBeenCalled();
  });

  // ── Response format ───────────────────────────────────────────────────────
  it('[GAP] findAll returns { macroCategories, count } envelope (spec §Endpoints)', async () => {
    prisma.macroCategory.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(
      expect.objectContaining({ macroCategories: expect.any(Array), count: 2 }),
    );
  });
});
