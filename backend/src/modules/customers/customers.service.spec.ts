// ============================================================================
// Unit tests for CustomersService — spec-013-customers
// (supersedes the spec-012 minimal auto-code scaffold)
// PrismaService is mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: { customer: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      customer: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [CustomersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(CustomersService);
  });

  // ── Auto-code CL-YYYY-NNNN (spec-012 contract, pinned) ───────────────────
  it('create auto-generates CL-YYYY-0001 when the tenant has no codes for the year', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.create(TENANT_A, USER, { name: 'Acme' } as any);
    const year = new Date().getFullYear();
    expect(result.code).toBe(`CL-${year}-0001`);
    expect(result.tenantId).toBe(TENANT_A);
  });

  it('create increments from the NUMERIC max code, spanning soft-deleted rows', async () => {
    const year = new Date().getFullYear();
    prisma.customer.findMany.mockResolvedValue([
      { code: `CL-${year}-99` },
      { code: `CL-${year}-104` },
    ]);
    prisma.customer.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.create(TENANT_A, USER, { name: 'Acme' } as any);
    expect(result.code).toBe(`CL-${year}-0105`);
    const [arg] = prisma.customer.findMany.mock.calls[0];
    expect(arg.where.tenantId).toBe(TENANT_A);
    expect(arg.where).not.toHaveProperty('deletedAt');
  });

  it('create defaults creditLimit 0, creditStatus good, isActive true + audit columns', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.create(TENANT_A, USER, { name: 'Acme' } as any);
    expect(result.creditLimit).toBe(0);
    expect(result.creditStatus).toBe('good');
    expect(result.isActive).toBe(true);
    expect(result.createdBy).toBe(USER);
  });

  // ── Reads ────────────────────────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null, ordered by code asc', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
        orderBy: expect.objectContaining({ code: 'asc' }),
      }),
    );
  });

  it('[GAP] findAll returns { customers, count } envelope (spec §Endpoints)', async () => {
    prisma.customer.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ customers: expect.any(Array), count: 2 }));
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  // ── Update ───────────────────────────────────────────────────────────────
  it('update throws NotFoundException for an unknown / other-tenant id', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, 'id', {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] update writes are tenant-scoped at the write itself (currently where:{id})', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'id' });
    prisma.customer.update.mockResolvedValue({ id: 'id' });
    prisma.customer.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, 'id', { name: 'X' } as any);
    const scoped =
      prisma.customer.updateMany.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A) ||
      prisma.customer.update.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A);
    expect(scoped).toBe(true);
  });

  // ── Remove ───────────────────────────────────────────────────────────────
  it('remove throws NotFoundException for an unknown / other-tenant id', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.remove(TENANT_B, USER, 'id')).rejects.toThrow(NotFoundException);
  });

  it('[GAP] remove is blocked while active sales orders reference the customer', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'id', _count: { salesOrders: 2 } });
    prisma.customer.update.mockResolvedValue({ id: 'id' });
    prisma.customer.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.remove(TENANT_A, USER, 'id')).rejects.toThrow(BadRequestException);
  });

  it('remove performs a soft delete (deletedAt + deletedBy) and returns { message, id }', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'id', _count: { salesOrders: 0 } });
    prisma.customer.update.mockResolvedValue({ id: 'id' });
    prisma.customer.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.remove(TENANT_A, USER, 'id');
    const writeCall =
      prisma.customer.updateMany.mock.calls[0] ?? prisma.customer.update.mock.calls[0];
    const [arg] = writeCall;
    expect(arg.data).toEqual(expect.objectContaining({ deletedBy: USER }));
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(result).toEqual(expect.objectContaining({ message: expect.any(String), id: 'id' }));
  });

  it('[GAP] remove soft-delete write is tenant-scoped at the write itself', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'id', _count: { salesOrders: 0 } });
    prisma.customer.update.mockResolvedValue({ id: 'id' });
    prisma.customer.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    const scoped =
      prisma.customer.updateMany.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A) ||
      prisma.customer.update.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A);
    expect(scoped).toBe(true);
  });
});
