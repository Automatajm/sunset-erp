// ============================================================================
// Unit tests for ApInvoicesService — spec-025-ap-invoices
// PrismaService, AutomationService, StockTransactionsService and (spec-021)
// CurrencyService are mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ApInvoicesService } from './ap-invoices.service';
import { PrismaService } from '../../database/prisma.service';
import { AutomationService } from '../automation/automation.service';
import { StockTransactionsService } from '../stock-transactions/stock-transactions.service';
import { CurrencyService } from '../currency/currency.service';
import { Decimal } from '@prisma/client/runtime/library';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const SUP = '44444444-4444-4444-4444-444444444444';
const INV_ID = '55555555-5555-5555-5555-555555555555';
const POL = '66666666-6666-6666-6666-666666666666';

const YEAR = new Date().getFullYear();

type ModelMock = Record<string, jest.Mock>;

describe('ApInvoicesService', () => {
  let service: ApInvoicesService;
  let prisma: Record<string, any>;
  let automation: { handleAutoJe: jest.Mock };
  let stockService: { receiveFromApInvoice: jest.Mock };
  let currency: { getRate: jest.Mock; getBaseCurrency: jest.Mock; convert: jest.Mock };

  const model = (): ModelMock => ({
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  });

  beforeEach(async () => {
    prisma = {
      apInvoice: model(),
      apInvoiceLine: model(),
      apPayment: model(),
      supplier: model(),
      purchaseOrder: model(),
      purchaseOrderLine: model(),
      item: model(),
      goodsReceipt: model(),
      journalEntry: model(),
      account: model(),
      fiscalPeriod: model(),
      currency: model(),
    };
    automation = { handleAutoJe: jest.fn().mockResolvedValue({ je: { id: 'je-1' } }) };
    stockService = { receiveFromApInvoice: jest.fn().mockResolvedValue(undefined) };
    currency = {
      getRate: jest.fn().mockResolvedValue(new Decimal('59.5')),
      getBaseCurrency: jest.fn().mockResolvedValue('DOP'),
      convert: jest.fn(),
    };

    const mod = await Test.createTestingModule({
      providers: [
        ApInvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AutomationService, useValue: automation },
        { provide: StockTransactionsService, useValue: stockService },
        { provide: CurrencyService, useValue: currency },
      ],
    }).compile();
    service = mod.get(ApInvoicesService);
  });

  const setupCreateMocks = () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.currency.findFirst.mockResolvedValue({ code: 'ANY' }); // catalog validation
    prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1', status: 'confirmed' });
    prisma.item.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.purchaseOrderLine.findFirst.mockResolvedValue({
      id: POL,
      unitPrice: new Decimal('28.5'),
    });
    prisma.apInvoice.findFirst.mockResolvedValue(null); // number gen (legacy)
    prisma.apInvoice.findMany.mockResolvedValue([]); // number gen (numeric-max)
    prisma.apInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: INV_ID, ...data }),
    );
  };

  const createDto = (over: Record<string, any> = {}): any => ({
    supplierId: SUP,
    invoiceDate: '2026-06-06',
    dueDate: '2026-07-06',
    lines: [{ description: 'svc line', quantity: 10, unitPrice: 100 }],
    ...over,
  });

  const invoiceRow = (over: Record<string, any> = {}): any => ({
    id: INV_ID,
    invoiceNumber: `APINV-${YEAR}-0001`,
    status: 'draft',
    totalAmount: new Decimal('1000'),
    paidAmount: new Decimal('0'),
    invoiceDate: new Date('2026-06-06'),
    jeId: null,
    grnId: null,
    poId: null,
    supplier: { name: 'Sup' },
    lines: [],
    ...over,
  });

  // ── Reads: scoping + envelope ──────────────────────────────────────────────

  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    prisma.apInvoice.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A, {});
    expect(prisma.apInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] findAll returns the { apInvoices, count } envelope', async () => {
    prisma.apInvoice.findMany.mockResolvedValue([]);
    const res: any = await service.findAll(TENANT_A, {});
    expect(res).toHaveProperty('apInvoices');
    expect(res).toHaveProperty('count');
  });

  it('findOne throws NotFoundException for another tenant', async () => {
    prisma.apInvoice.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, INV_ID)).rejects.toThrow(NotFoundException);
  });

  it('[GAP] create scopes the poLineId lookup by tenantId + deletedAt', async () => {
    setupCreateMocks();
    await service.create(
      TENANT_A,
      USER,
      createDto({ lines: [{ quantity: 1, unitPrice: 10, poLineId: POL }] }),
    );
    expect(prisma.purchaseOrderLine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: POL, tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  // ── Frozen-rate pattern (spec-021 gate) ────────────────────────────────────

  it('[GAP] create defaults currency to the tenant base currency, not USD', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, createDto());
    expect(currency.getBaseCurrency).toHaveBeenCalledWith(TENANT_A);
    expect(prisma.apInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'DOP' }) }),
    );
  });

  it('[GAP] create freezes exchangeRate and amountBase at the invoice date', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, createDto({ currency: 'USD' }));
    expect(currency.getRate).toHaveBeenCalledWith(TENANT_A, 'USD', 'DOP', expect.any(Date));
    const data = prisma.apInvoice.create.mock.calls[0][0].data;
    expect(Number(data.exchangeRate)).toBe(59.5);
    expect(Number(data.amountBase)).toBeCloseTo(59500, 2); // 1000 × 59.5
    expect(data.baseCurrency).toBe('DOP');
  });

  it('[GAP] applyPayment freezes its OWN rate at the payment date', async () => {
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue(invoiceRow({ status: 'posted', currency: 'USD' }));
    prisma.account.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.fiscalPeriod.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.apPayment.findFirst.mockResolvedValue(null);
    prisma.apPayment.findMany.mockResolvedValue([]);
    prisma.apPayment.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'pay-1', ...data }),
    );
    prisma.apInvoice.update.mockResolvedValue({});
    prisma.apInvoice.updateMany.mockResolvedValue({ count: 1 });

    await service.applyPayment(TENANT_A, USER, INV_ID, {
      paymentDate: '2026-06-10',
      amount: 500,
    } as any);

    const data = prisma.apPayment.create.mock.calls[0][0].data;
    expect(Number(data.exchangeRate)).toBe(59.5);
    expect(Number(data.amountBase)).toBeCloseTo(29750, 2); // 500 × 59.5
    expect(data.baseCurrency).toBe('DOP');
  });

  // ── Decimal-safe money ─────────────────────────────────────────────────────

  it('[GAP] line totals are Decimal-exact (no float drift)', async () => {
    setupCreateMocks();
    await service.create(
      TENANT_A,
      USER,
      createDto({ lines: [{ description: 'x', quantity: 3, unitPrice: 0.1 }] }),
    );
    const data = prisma.apInvoice.create.mock.calls[0][0].data;
    // Float math gives 0.30000000000000004; Decimal gives exactly 0.3
    expect(Number(data.subtotal)).toBe(0.3);
    expect(Number(data.lines.create[0].lineTotal)).toBe(0.3);
  });

  // ── Posting integrity ──────────────────────────────────────────────────────

  it('post blocks a non-draft invoice with 400', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'posted' }));
    await expect(service.post(TENANT_A, USER, INV_ID)).rejects.toThrow(BadRequestException);
  });

  it('post blocks when the fiscal period is closed', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow());
    prisma.account.findFirst.mockResolvedValue({ id: 'acct-ap' });
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.fiscalPeriod.findFirst.mockResolvedValue({ status: 'closed' });
    await expect(service.post(TENANT_A, USER, INV_ID)).rejects.toThrow(/closed/);
  });

  it('[GAP] post ABORTS (400) when the stock receipt fails — no silent divergence', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(
      invoiceRow({
        lines: [{ itemId: 'item-1', quantity: 1, uom: 'PCS', unitPrice: 10, lineTotal: 10 }],
      }),
    );
    prisma.account.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.fiscalPeriod.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.apInvoice.update.mockResolvedValue({});
    prisma.apInvoice.updateMany.mockResolvedValue({ count: 1 });
    stockService.receiveFromApInvoice.mockRejectedValue(new Error('UOM missing'));

    await expect(service.post(TENANT_A, USER, INV_ID)).rejects.toThrow(BadRequestException);
    // The status flip must NOT have happened
    const flips = [
      ...prisma.apInvoice.update.mock.calls,
      ...prisma.apInvoice.updateMany.mock.calls,
    ].filter((c) => c[0]?.data?.status === 'posted');
    expect(flips).toHaveLength(0);
  });

  it('post validates the 3-way match when a GRN is linked', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ grnId: 'grn-1' }));
    jest.spyOn(service, 'getMatchStatus').mockResolvedValue({
      matchStatus: 'three_way_failed',
      lines: [{ lineNumber: 1, itemCode: 'X', lineMatches: false, issues: ['qty'] }],
    } as any);
    await expect(service.post(TENANT_A, USER, INV_ID)).rejects.toThrow(/3-Way Match failed/);
  });

  // ── Void ───────────────────────────────────────────────────────────────────

  it('void blocks an already-void invoice (400) and a paid invoice (400)', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'void' }));
    await expect(service.void(TENANT_A, USER, INV_ID)).rejects.toThrow(BadRequestException);
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'paid' }));
    await expect(service.void(TENANT_A, USER, INV_ID)).rejects.toThrow(BadRequestException);
  });

  it('[GAP] void of a partially paid invoice → 409 (reverse payments first)', async () => {
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue(invoiceRow({ status: 'partial', paidAmount: new Decimal('500') }));
    await expect(service.void(TENANT_A, USER, INV_ID)).rejects.toThrow(ConflictException);
  });

  it('[GAP] void scopes the original-JE lookup by tenantId', async () => {
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue(invoiceRow({ status: 'posted', jeId: 'je-9' }));
    prisma.journalEntry.findFirst.mockResolvedValue(null); // not found → reversal skipped
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.apInvoice.update.mockResolvedValue({});
    prisma.apInvoice.updateMany.mockResolvedValue({ count: 1 });
    await service.void(TENANT_A, USER, INV_ID);
    expect(prisma.journalEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'je-9', tenantId: TENANT_A }),
      }),
    );
  });

  // ── Payments ───────────────────────────────────────────────────────────────

  it('applyPayment blocks draft/void invoices and over-payments', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'draft' }));
    await expect(
      service.applyPayment(TENANT_A, USER, INV_ID, { paymentDate: '2026-06-10', amount: 1 } as any),
    ).rejects.toThrow(/Post it first/);

    jest.spyOn(service, 'findOne').mockResolvedValue(
      invoiceRow({
        status: 'posted',
        totalAmount: new Decimal('100'),
        paidAmount: new Decimal('90'),
      }),
    );
    await expect(
      service.applyPayment(TENANT_A, USER, INV_ID, {
        paymentDate: '2026-06-10',
        amount: 50,
      } as any),
    ).rejects.toThrow(/exceeds outstanding/);
  });

  it('[GAP] applyPayment writes the invoice via tenant-scoped updateMany', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'posted' }));
    prisma.account.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.fiscalPeriod.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.apPayment.findFirst.mockResolvedValue(null);
    prisma.apPayment.findMany.mockResolvedValue([]);
    prisma.apPayment.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'pay-1', ...data }),
    );
    prisma.apInvoice.updateMany.mockResolvedValue({ count: 1 });
    await service.applyPayment(TENANT_A, USER, INV_ID, {
      paymentDate: '2026-06-10',
      amount: 1000,
    } as any);
    expect(prisma.apInvoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: INV_ID, tenantId: TENANT_A, deletedAt: null }),
        data: expect.objectContaining({ status: 'paid' }),
      }),
    );
  });

  // ── Draft-only update/remove pattern ───────────────────────────────────────

  it('update/remove block non-draft invoices with 400', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'posted' }));
    await expect(service.update(TENANT_A, USER, INV_ID, { notes: 'x' } as any)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.remove(TENANT_A, USER, INV_ID)).rejects.toThrow(BadRequestException);
  });

  it('[GAP] update and remove write via tenant-scoped updateMany', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow());
    prisma.apInvoice.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, INV_ID, { notes: 'x' } as any);
    await service.remove(TENANT_A, USER, INV_ID);
    for (const call of prisma.apInvoice.updateMany.mock.calls) {
      expect(call[0].where).toEqual(
        expect.objectContaining({ id: INV_ID, tenantId: TENANT_A, deletedAt: null }),
      );
    }
  });

  // ── createFromPo guards ────────────────────────────────────────────────────

  it('createFromPo blocks wrong PO status and duplicate invoices', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: 'draft',
      poNumber: 'PO-1',
      lines: [],
    });
    await expect(service.createFromPo(TENANT_A, USER, 'po-1')).rejects.toThrow(
      /Cannot create AP Invoice/,
    );
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po-1',
      status: 'confirmed',
      poNumber: 'PO-1',
      lines: [],
      supplier: {},
      supplierId: SUP,
      subtotal: 0,
      taxAmount: 0,
      total: 0,
    });
    prisma.apInvoice.findFirst.mockResolvedValue({ invoiceNumber: 'APINV-1' });
    await expect(service.createFromPo(TENANT_A, USER, 'po-1')).rejects.toThrow(/already exists/);
  });

  // ── Document numbering ─────────────────────────────────────────────────────

  it('[GAP] invoiceNumber comes from the NUMERIC max', async () => {
    setupCreateMocks();
    prisma.apInvoice.findMany.mockResolvedValue([
      { invoiceNumber: `APINV-${YEAR}-999` },
      { invoiceNumber: `APINV-${YEAR}-1000` },
    ]);
    await service.create(TENANT_A, USER, createDto());
    expect(prisma.apInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceNumber: `APINV-${YEAR}-1001` }),
      }),
    );
  });

  it('[GAP] an invoiceNumber P2002 collision maps to 409 ConflictException', async () => {
    setupCreateMocks();
    prisma.apInvoice.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(ConflictException);
  });

  // ── Aging base amounts ─────────────────────────────────────────────────────

  it('[GAP] aging buckets include amountBase sums', async () => {
    prisma.apInvoice.findMany.mockResolvedValue([
      {
        id: INV_ID,
        invoiceNumber: 'APINV-1',
        supplierRef: null,
        supplier: {},
        invoiceDate: new Date(),
        dueDate: new Date(),
        totalAmount: new Decimal('100'),
        paidAmount: new Decimal('0'),
        amountBase: new Decimal('5950'),
        exchangeRate: new Decimal('59.5'),
        status: 'posted',
      },
    ]);
    const res: any = await service.getAging(TENANT_A);
    expect(res.summary.current.amountBase).toBeCloseTo(5950, 2);
  });
});
