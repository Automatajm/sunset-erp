// ============================================================================
// Unit tests for SuppliersService — spec-002-suppliers
// PrismaService is mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let prisma: { supplier: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      supplier: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [SuppliersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(SuppliersService);
  });

  // ── Tenant scoping ────────────────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    prisma.supplier.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('findOne scopes by id + tenantId + deletedAt: null', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: 'x' });
    await service.findOne(TENANT_A, 'x');
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: 'x', tenantId: TENANT_A, deletedAt: null },
    });
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null); // wrong-tenant query returns nothing
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  // ── Create ────────────────────────────────────────────────────────────────
  it('create auto-generates a SUP-YYYY-NNNN code when none is supplied', async () => {
    prisma.supplier.findFirst
      .mockResolvedValueOnce(null) // generateCode: no prior code
      .mockResolvedValueOnce(null); // duplicate check
    prisma.supplier.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result = await service.create(TENANT_A, USER, { name: 'Acme' } as any);
    expect(result.code).toMatch(/^SUP-\d{4}-0001$/);
    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  it('create throws ConflictException on a duplicate code', async () => {
    prisma.supplier.findFirst.mockResolvedValueOnce({ id: 'dup', code: 'SUP-2026-0001' });
    await expect(
      service.create(TENANT_A, USER, { name: 'Dup', code: 'SUP-2026-0001' } as any),
    ).rejects.toThrow(ConflictException);
  });

  // ── Update / remove ───────────────────────────────────────────────────────
  it('update throws NotFoundException when the supplier is in another tenant', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, 'id', {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] update writes are tenant-scoped (spec §Data model — currently where:{id})', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: 'id' }); // findOne guard + re-fetch
    prisma.supplier.update.mockResolvedValue({ id: 'id' });
    prisma.supplier.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, 'id', { name: 'X' } as any);
    // Target: the write itself enforces tenancy (updateMany scoped, or update where includes tenantId).
    const scopedUpdateMany = prisma.supplier.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.supplier.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  it('remove performs a soft delete (deletedAt + deletedBy), not a hard delete', async () => {
    prisma.supplier.findFirst.mockResolvedValueOnce({ id: 'id' });
    prisma.supplier.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    const [arg] = prisma.supplier.updateMany.mock.calls[0];
    expect(arg.where).toEqual(expect.objectContaining({ tenantId: TENANT_A }));
    expect(arg.data).toEqual(expect.objectContaining({ deletedBy: USER }));
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
  });

  // ── Response format ───────────────────────────────────────────────────────
  it('[GAP] findAll returns { suppliers, count } envelope (spec §Response format)', async () => {
    prisma.supplier.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ suppliers: expect.any(Array), count: 2 }));
  });
});
