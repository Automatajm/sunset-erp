// ============================================================================
// Unit tests for CustomersService — spec-012 scope ONLY (auto-code policy).
// The module's full contract gets its own spec per the cascade (customers is
// next); these tests pin the CL-YYYY-NNNN generator and code immutability.
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

describe('CustomersService (spec-012 auto-code scope)', () => {
  let service: CustomersService;
  let prisma: { customer: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      customer: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [CustomersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(CustomersService);
  });

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

  it('update throws NotFoundException for an unknown / other-tenant id', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, 'id', {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });
});
