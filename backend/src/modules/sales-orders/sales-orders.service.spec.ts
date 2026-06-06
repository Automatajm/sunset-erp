// ============================================================================
// Unit tests for SalesOrdersService — spec-019-production-cluster
// PrismaService is mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { SalesOrdersService } from './sales-orders.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const CUST = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ITEM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

type ModelMock = Record<string, jest.Mock>;

const model = (): ModelMock => ({
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
});

const soRecord = (over: Record<string, unknown> = {}) => ({
  id: 'so-1',
  tenantId: TENANT_A,
  soNumber: 'SO-2026-0001',
  status: 'draft',
  customerId: CUST,
  customer: { id: CUST, code: 'CL-2026-0001', name: 'Acme' },
  lines: [],
  ...over,
});

const createDto = (over: Record<string, unknown> = {}) =>
  ({
    customerId: CUST,
    lines: [
      { itemId: ITEM, orderedQuantity: 50, uom: 'PCS', unitPrice: 99.99, discountPercent: 10 },
    ],
    ...over,
  }) as never;

describe('SalesOrdersService', () => {
  let service: SalesOrdersService;
  let prisma: {
    salesOrder: ModelMock;
    customer: ModelMock;
    item: ModelMock;
  };

  beforeEach(async () => {
    prisma = { salesOrder: model(), customer: model(), item: model() };
    const mod = await Test.createTestingModule({
      providers: [SalesOrdersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(SalesOrdersService);
  });

  const writesOf = (m: ModelMock) => [
    ...m.update.mock.calls.map(([a]) => a),
    ...m.updateMany.mock.calls.map(([a]) => a),
  ];

  // ── create ──────────────────────────────────────────────────────────────────
  it('create throws 404 when the customer is not in the tenant', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_B, USER, createDto())).rejects.toThrow(NotFoundException);
    expect(prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_B, deletedAt: null }),
      }),
    );
  });

  it('create throws 404 when a line item is not in the tenant', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: CUST });
    prisma.item.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(NotFoundException);
  });

  it('create derives SO-YYYY-0001, totals with line discount, numbered lines, tenantId', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: CUST });
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.salesOrder.findFirst.mockResolvedValue(null); // number gen
    prisma.salesOrder.create.mockImplementation(({ data }) => soRecord(data));
    const result: any = await service.create(TENANT_A, USER, createDto());
    const year = new Date().getFullYear();
    const created = prisma.salesOrder.create.mock.calls[0][0].data;
    expect(created.soNumber).toBe(`SO-${year}-0001`);
    expect(created.tenantId).toBe(TENANT_A);
    expect(created.status).toBe('draft');
    // 50 × 99.99 = 4999.50, −10% = 4499.55
    expect(created.subtotal).toBeCloseTo(4499.55, 2);
    expect(created.total).toBeCloseTo(4499.55, 2);
    expect(created.lines.create[0]).toEqual(
      expect.objectContaining({ tenantId: TENANT_A, lineNumber: 1, status: 'open' }),
    );
    expect(result.soNumber).toBeDefined();
  });

  it('[GAP] create maps Prisma P2002 (soNumber race) to ConflictException', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: CUST });
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.salesOrder.findFirst.mockResolvedValue(null);
    prisma.salesOrder.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(ConflictException);
  });

  // ── reads ───────────────────────────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    await service.findAll(TENANT_A);
    expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] findAll returns the { salesOrders, count } envelope', async () => {
    prisma.salesOrder.findMany.mockResolvedValue([soRecord()]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ salesOrders: expect.any(Array), count: 1 }));
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  it('[GAP] findOne lines include filters deletedAt: null', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(soRecord());
    await service.findOne(TENANT_A, 'so-1');
    const [arg] = prisma.salesOrder.findFirst.mock.calls[0];
    expect(arg.include.lines.where).toEqual(expect.objectContaining({ deletedAt: null }));
  });

  // ── update ──────────────────────────────────────────────────────────────────
  it('update throws 400 when the SO is not draft', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(soRecord({ status: 'confirmed' }));
    await expect(service.update(TENANT_A, USER, 'so-1', {} as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] update re-validates a changed customerId in-tenant (404 on foreign customer)', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(soRecord());
    prisma.customer.findFirst.mockResolvedValue(null); // foreign / bogus customer
    prisma.salesOrder.update.mockResolvedValue(soRecord());
    await expect(
      service.update(TENANT_A, USER, 'so-1', { customerId: 'foreign-cust' } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('[GAP] the update write is tenant-scoped at the write itself', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(soRecord());
    prisma.salesOrder.update.mockResolvedValue(soRecord());
    await service.update(TENANT_A, USER, 'so-1', { notes: 'X' } as never);
    expect(writesOf(prisma.salesOrder).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  // ── status state machine ([GAP] — none exists today) ───────────────────────
  it('[GAP] updateStatus rejects an unknown target status with 400', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(soRecord({ status: 'draft' }));
    prisma.salesOrder.update.mockResolvedValue(soRecord());
    await expect(service.updateStatus(TENANT_A, USER, 'so-1', 'banana')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] updateStatus rejects an illegal transition (draft → shipped) with 400', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(soRecord({ status: 'draft' }));
    prisma.salesOrder.update.mockResolvedValue(soRecord());
    await expect(service.updateStatus(TENANT_A, USER, 'so-1', 'shipped')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] updateStatus allows draft → confirmed and writes tenant-scoped', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(soRecord({ status: 'draft' }));
    prisma.salesOrder.update.mockResolvedValue(soRecord({ status: 'confirmed' }));
    const result: any = await service.updateStatus(TENANT_A, USER, 'so-1', 'confirmed');
    expect(result.message).toContain('confirmed');
    expect(writesOf(prisma.salesOrder).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  it('[GAP] terminal states reject any transition (cancelled → confirmed)', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(soRecord({ status: 'cancelled' }));
    prisma.salesOrder.update.mockResolvedValue(soRecord());
    await expect(service.updateStatus(TENANT_A, USER, 'so-1', 'confirmed')).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── remove ──────────────────────────────────────────────────────────────────
  it('remove throws 400 when the SO is not draft', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(soRecord({ status: 'confirmed' }));
    await expect(service.remove(TENANT_A, USER, 'so-1')).rejects.toThrow(BadRequestException);
  });

  it('[GAP] the soft-delete write is tenant-scoped at the write itself', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue(soRecord());
    prisma.salesOrder.update.mockResolvedValue({});
    const result = await service.remove(TENANT_A, USER, 'so-1');
    const write = writesOf(prisma.salesOrder).find((c) => c?.data?.deletedAt);
    expect(write.where.tenantId).toBe(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ message: expect.any(String), id: 'so-1' }));
  });
});
