// ============================================================================
// Unit tests for RfqsService — spec-020-procurement-cluster
// PrismaService (and PurchaseOrdersService once injected) are mocked.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { RfqsService } from './rfqs.service';
import { PrismaService } from '../../database/prisma.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const SUP = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type ModelMock = Record<string, jest.Mock>;
const model = (): ModelMock => ({
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  count: jest.fn().mockResolvedValue(0),
  upsert: jest.fn().mockResolvedValue({}),
});

const rfqRecord = (over: Record<string, unknown> = {}) => ({
  id: 'rfq-1',
  tenantId: TENANT_A,
  rfqNumber: 'RFQ-2026-0001',
  status: 'draft',
  currency: 'USD',
  rfqSuppliers: [{ id: 'rs-1', supplierId: SUP, status: 'invited' }],
  lines: [
    {
      id: 'rl-1',
      itemId: null,
      status: 'open',
      quantity: 10,
      uom: 'PCS',
      genericDescription: 'Widget',
      requiredDate: new Date('2026-07-01'),
    },
  ],
  ...over,
});

describe('RfqsService', () => {
  let service: RfqsService;
  let prisma: Record<string, any>;
  let poService: { generatePoNumber: jest.Mock };

  beforeEach(async () => {
    prisma = {
      rfq: model(),
      rfqLine: model(),
      rfqSupplier: model(),
      rfqResponseLine: model(),
      purchaseOrder: model(),
      supplier: model(),
      item: model(),
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    poService = { generatePoNumber: jest.fn().mockResolvedValue('PO-2026-0099') };
    const mod = await Test.createTestingModule({
      providers: [
        RfqsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PurchaseOrdersService, useValue: poService },
      ],
    }).compile();
    service = mod.get(RfqsService);
  });

  const writesOf = (m: ModelMock) => [
    ...m.update.mock.calls.map(([a]: [any]) => a),
    ...m.updateMany.mock.calls.map(([a]: [any]) => a),
  ];

  // ── envelope / P2002 ────────────────────────────────────────────────────────
  it('[GAP] findAll returns the { rfqs, count } envelope', async () => {
    prisma.rfq.findMany.mockResolvedValue([rfqRecord()]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ rfqs: expect.any(Array), count: 1 }));
  });

  it('[GAP] create maps Prisma P2002 (rfqNumber race) to ConflictException', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.rfq.findFirst.mockResolvedValue(null);
    prisma.rfq.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(
      service.create(TENANT_A, USER, {
        title: 'Q',
        supplierIds: [SUP],
        lines: [{ genericDescription: 'W', quantity: 1, uom: 'PCS', requiredDate: '2026-07-01' }],
      } as never),
    ).rejects.toThrow(ConflictException);
  });

  // ── send ────────────────────────────────────────────────────────────────────
  it('[GAP] send: rfqSupplier bulk update and rfq write are tenant-scoped', async () => {
    prisma.rfq.findFirst.mockResolvedValue(rfqRecord({ status: 'draft' }));
    prisma.rfq.update.mockResolvedValue(rfqRecord({ status: 'sent' }));
    await service.send(TENANT_A, USER, 'rfq-1');
    expect(
      prisma.rfqSupplier.updateMany.mock.calls.some(
        ([a]: [any]) => a?.where?.tenantId === TENANT_A,
      ),
    ).toBe(true);
    expect(writesOf(prisma.rfq).some((c: any) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  // ── submitResponse ([GAP] guards + scoping) ─────────────────────────────────
  const respondedRfq = (status: string) =>
    rfqRecord({ status, rfqSuppliers: [{ id: 'rs-1', supplierId: SUP, status: 'sent' }] });

  const responseDto = () =>
    ({
      rfqSupplierId: 'rs-1',
      lines: [{ rfqLineId: 'rl-1', offeredQty: 10, uom: 'PCS', unitPrice: 5, leadTimeDays: 7 }],
    }) as never;

  const happyResponseMocks = (rfqStatus = 'sent') => {
    prisma.rfq.findFirst.mockResolvedValue(respondedRfq(rfqStatus));
    prisma.rfqSupplier.findFirst.mockResolvedValue({ id: 'rs-1', supplierId: SUP, status: 'sent' });
    prisma.rfqLine.findFirst.mockResolvedValue({ id: 'rl-1', rfqId: 'rfq-1' });
    prisma.rfqResponseLine.upsert.mockResolvedValue({ unitPrice: 5, offeredQty: 10 });
    prisma.rfqResponseLine.findMany.mockResolvedValue([]);
    prisma.rfqSupplier.update.mockResolvedValue({});
    prisma.rfq.update.mockResolvedValue({});
  };

  it('[GAP] submitResponse is accepted while RFQ is partial_response (no supplier lock-out)', async () => {
    happyResponseMocks('partial_response');
    await expect(
      service.submitResponse(TENANT_A, USER, 'rfq-1', responseDto()),
    ).resolves.toBeDefined();
  });

  it('[GAP] submitResponse rejects a supplier already awarded/declined with 400', async () => {
    happyResponseMocks('sent');
    prisma.rfqSupplier.findFirst.mockResolvedValue({
      id: 'rs-1',
      supplierId: SUP,
      status: 'awarded',
    });
    await expect(
      service.submitResponse(TENANT_A, USER, 'rfq-1', responseDto()),
    ).rejects.toThrow(BadRequestException);
  });

  it('[GAP] submitResponse runs in a $transaction and its counts/writes carry tenantId', async () => {
    happyResponseMocks('sent');
    await service.submitResponse(TENANT_A, USER, 'rfq-1', responseDto());
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(
      prisma.rfqSupplier.count.mock.calls.some(
        ([a]: [any]) => a?.where?.tenantId === TENANT_A,
      ),
    ).toBe(true);
  });

  // ── award ([GAP] — the cross-tenant injection fix + tx + guards) ────────────
  const awardableRfq = () =>
    rfqRecord({
      status: 'fully_responded',
      rfqSuppliers: [{ id: 'rs-1', supplierId: SUP, status: 'responded' }],
    });

  const awardDto = () =>
    ({
      awards: [{ rfqLineId: 'rl-1', rfqResponseLineId: 'resp-1', awardedQty: 10 }],
    }) as never;

  const responseLine = (over: Record<string, unknown> = {}) => ({
    id: 'resp-1',
    rfqLineId: 'rl-1',
    rfqSupplierId: 'rs-1',
    unitPrice: 5,
    offeredQty: 10,
    leadTimeDays: 7,
    rfqLine: { id: 'rl-1', rfqId: 'rfq-1', itemId: null, status: 'open', quantity: 10, uom: 'PCS', genericDescription: 'W' },
    ...over,
  });

  const happyAwardMocks = () => {
    prisma.rfq.findFirst.mockResolvedValue(awardableRfq());
    prisma.rfqResponseLine.findFirst.mockResolvedValue(responseLine());
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP, deletedAt: null });
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    prisma.purchaseOrder.create.mockImplementation(({ data }: any) => ({
      id: 'po-1',
      ...data,
      lines: [{ id: 'pol-1' }],
    }));
    prisma.rfqSupplier.findFirst.mockResolvedValue({ id: 'rs-1', supplierId: SUP, status: 'responded' });
  };

  it('[GAP] award validates rfqResponseLineId in-tenant AND in-RFQ (404 on foreign ids)', async () => {
    prisma.rfq.findFirst.mockResolvedValue(awardableRfq());
    prisma.rfqResponseLine.findFirst.mockResolvedValue(null); // tenant-scoped lookup finds nothing
    await expect(service.award(TENANT_A, USER, 'rfq-1', awardDto())).rejects.toThrow(
      NotFoundException,
    );
    // and the lookup itself must carry tenant scope through the rfqLine relation
    const calls = prisma.rfqResponseLine.findFirst.mock.calls;
    expect(JSON.stringify(calls)).toContain(TENANT_A);
  });

  it("[GAP] award checks the supplier with deletedAt: null", async () => {
    happyAwardMocks();
    await service.award(TENANT_A, USER, 'rfq-1', awardDto());
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] award rejects an rfqLine that is already awarded with 409', async () => {
    prisma.rfq.findFirst.mockResolvedValue(awardableRfq());
    prisma.rfqResponseLine.findFirst.mockResolvedValue(
      responseLine({ rfqLine: { id: 'rl-1', rfqId: 'rfq-1', status: 'awarded' } }),
    );
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    await expect(service.award(TENANT_A, USER, 'rfq-1', awardDto())).rejects.toThrow(
      ConflictException,
    );
  });

  it('[GAP] award runs in one $transaction, uses the injected PO number generator, and scopes its writes', async () => {
    happyAwardMocks();
    await service.award(TENANT_A, USER, 'rfq-1', awardDto());
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(poService.generatePoNumber).toHaveBeenCalledWith(TENANT_A, expect.anything());
    for (const m of [prisma.rfqLine, prisma.rfq]) {
      expect(writesOf(m).some((c: any) => c?.where?.tenantId === TENANT_A)).toBe(true);
    }
    const po = prisma.purchaseOrder.create.mock.calls[0][0].data;
    expect(po.tenantId).toBe(TENANT_A);
    expect(po.rfqId).toBe('rfq-1');
  });

  // ── state machine ([GAP] — none exists today) ───────────────────────────────
  it('[GAP] award on a draft RFQ → 400 (map-enforced)', async () => {
    prisma.rfq.findFirst.mockResolvedValue(rfqRecord({ status: 'draft' }));
    await expect(service.award(TENANT_A, USER, 'rfq-1', awardDto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] cancel on an awarded RFQ → 400 (terminal)', async () => {
    prisma.rfq.findFirst.mockResolvedValue(rfqRecord({ status: 'awarded' }));
    await expect(service.cancel(TENANT_A, USER, 'rfq-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] update/cancel/remove writes are tenant-scoped at the write itself', async () => {
    prisma.rfq.findFirst.mockResolvedValue(rfqRecord({ status: 'draft' }));
    prisma.rfq.update.mockResolvedValue(rfqRecord());
    await service.update(TENANT_A, USER, 'rfq-1', { title: 'X' } as never);
    await service.cancel(TENANT_A, USER, 'rfq-1');
    await service.remove(TENANT_A, USER, 'rfq-1');
    const scoped = writesOf(prisma.rfq).filter((c: any) => c?.where?.tenantId === TENANT_A);
    expect(scoped.length).toBeGreaterThanOrEqual(3);
  });
});
