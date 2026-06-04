// ============================================================================
// Unit tests for CategoriesService — spec-009-categories
// PrismaService (and ChartOfAccountsService) are mocked; these assert behavior.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { ChartOfAccountsService } from '../chart-of-accounts/chart-of-accounts.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const MC_ID = '44444444-4444-4444-4444-444444444444';
const ACC_ID = '55555555-5555-5555-5555-555555555555';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    category: Record<string, jest.Mock>;
    macroCategory: Record<string, jest.Mock>;
    item: Record<string, jest.Mock>;
  };
  let coaService: { findOne: jest.Mock };

  beforeEach(async () => {
    prisma = {
      category: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      macroCategory: { findFirst: jest.fn() },
      item: { count: jest.fn() },
    };
    coaService = { findOne: jest.fn().mockResolvedValue({ id: ACC_ID }) };
    const mod = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChartOfAccountsService, useValue: coaService },
      ],
    }).compile();
    service = mod.get(CategoriesService);
  });

  // ── Tenant scoping — reads ───────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    prisma.category.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('findAll applies the macroCategoryId filter when provided', async () => {
    prisma.category.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A, MC_ID);
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, macroCategoryId: MC_ID }),
      }),
    );
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  it('countByMacroCategory is tenant-scoped (spec-006 contract, unchanged)', async () => {
    prisma.category.count.mockResolvedValue(0);
    await service.countByMacroCategory(TENANT_A, MC_ID);
    expect(prisma.category.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A, macroCategoryId: MC_ID, deletedAt: null },
      }),
    );
  });

  // ── Create + auto-code CAT-YYYY-NNNN (spec-012) ──────────────────────────
  it('create auto-generates CAT-YYYY-NNNN from the NUMERIC max, spanning soft-deleted rows', async () => {
    const year = new Date().getFullYear();
    prisma.macroCategory.findFirst.mockResolvedValue({ id: MC_ID });
    prisma.category.findMany.mockResolvedValue([
      { code: `CAT-${year}-99` },
      { code: `CAT-${year}-104` },
    ]);
    prisma.category.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.create(TENANT_A, USER, {
      macroCategoryId: MC_ID,
      name: 'X',
    } as any);
    expect(result.code).toBe(`CAT-${year}-0105`);
    const [arg] = prisma.category.findMany.mock.calls[0];
    expect(arg.where.tenantId).toBe(TENANT_A);
    expect(arg.where).not.toHaveProperty('deletedAt');
  });

  it('create validates macroCategoryId with a tenant-scoped lookup and 404s when missing', async () => {
    prisma.macroCategory.findFirst.mockResolvedValue(null); // macro not in tenant
    await expect(
      service.create(TENANT_A, USER, { macroCategoryId: MC_ID, name: 'X' } as any),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.macroCategory.findFirst).toHaveBeenCalledWith({
      where: { id: MC_ID, tenantId: TENANT_A, deletedAt: null },
    });
  });

  it('create writes tenantId from the JWT, audit columns, isActive default', async () => {
    prisma.category.findMany.mockResolvedValue([]);
    prisma.macroCategory.findFirst.mockResolvedValue({ id: MC_ID });
    prisma.category.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    await service.create(TENANT_A, USER, { macroCategoryId: MC_ID, name: 'X' } as any);
    expect(prisma.category.create).toHaveBeenCalledWith(
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

  it('[GAP] create validates GL accounts via ChartOfAccountsService.findOne (in-tenant) and 404s', async () => {
    prisma.category.findMany.mockResolvedValue([]);
    prisma.macroCategory.findFirst.mockResolvedValue({ id: MC_ID });
    prisma.category.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    coaService.findOne.mockRejectedValue(new NotFoundException('Account not found'));
    await expect(
      service.create(TENANT_A, USER, {
        macroCategoryId: MC_ID,
        name: 'X',
        inventoryAccountId: ACC_ID,
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(coaService.findOne).toHaveBeenCalledWith(TENANT_A, ACC_ID);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  // ── Update ────────────────────────────────────────────────────────────────
  it('update throws NotFoundException when the category is in another tenant', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, 'id', {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] update writes are tenant-scoped at the write itself (currently where:{id})', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'id' });
    prisma.category.update.mockResolvedValue({ id: 'id' });
    prisma.category.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, 'id', { name: 'X' } as any);
    const scopedUpdateMany = prisma.category.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.category.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  it('[GAP] update validates macroCategoryId re-parenting in-tenant and 404s (currently unchecked FK)', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'id' });
    prisma.category.update.mockResolvedValue({ id: 'id' });
    prisma.category.updateMany.mockResolvedValue({ count: 1 });
    prisma.macroCategory.findFirst.mockResolvedValue(null); // other-tenant / missing macro
    await expect(
      service.update(TENANT_A, USER, 'id', { macroCategoryId: MC_ID } as any),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.macroCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: MC_ID, tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] update validates GL accounts via ChartOfAccountsService.findOne and 404s', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'id' });
    prisma.category.update.mockResolvedValue({ id: 'id' });
    prisma.category.updateMany.mockResolvedValue({ count: 1 });
    coaService.findOne.mockRejectedValue(new NotFoundException('Account not found'));
    await expect(
      service.update(TENANT_A, USER, 'id', { cogsAccountId: ACC_ID } as any),
    ).rejects.toThrow(NotFoundException);
    expect(coaService.findOne).toHaveBeenCalledWith(TENANT_A, ACC_ID);
  });

  // ── Remove ────────────────────────────────────────────────────────────────
  it('remove throws NotFoundException for an unknown / other-tenant id', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    await expect(service.remove(TENANT_B, USER, 'id')).rejects.toThrow(NotFoundException);
  });

  it('[GAP] remove delete guard uses the own-relation count, not prisma.item.count', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'id', _count: { items: 2 } });
    prisma.item.count.mockResolvedValue(2);
    prisma.category.update.mockResolvedValue({ id: 'id' });
    prisma.category.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.remove(TENANT_A, USER, 'id')).rejects.toThrow(BadRequestException);
    // The guard must come from the scoped category read's filtered _count —
    // no direct cross-module Item query (which also lacked tenantId).
    expect(prisma.item.count).not.toHaveBeenCalled();
  });

  it('remove performs a soft delete (deletedAt + deletedBy) and returns { message, id }', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'id', _count: { items: 0 } });
    prisma.item.count.mockResolvedValue(0);
    prisma.category.update.mockResolvedValue({ id: 'id' });
    prisma.category.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.remove(TENANT_A, USER, 'id');
    const writeCall =
      prisma.category.updateMany.mock.calls[0] ?? prisma.category.update.mock.calls[0];
    const [arg] = writeCall;
    expect(arg.data).toEqual(expect.objectContaining({ deletedBy: USER }));
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(result).toEqual(expect.objectContaining({ message: expect.any(String), id: 'id' }));
  });

  it('[GAP] remove soft-delete write is tenant-scoped at the write itself', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'id', _count: { items: 0 } });
    prisma.item.count.mockResolvedValue(0);
    prisma.category.update.mockResolvedValue({ id: 'id' });
    prisma.category.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    const scopedUpdateMany = prisma.category.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.category.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  // ── Response format ───────────────────────────────────────────────────────
  it('[GAP] findAll returns { categories, count } envelope (spec §Endpoints)', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ categories: expect.any(Array), count: 2 }));
  });
});
