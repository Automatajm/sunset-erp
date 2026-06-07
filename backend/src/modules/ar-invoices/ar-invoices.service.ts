import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateArInvoiceDto } from './dto/create-ar-invoice.dto';
import { UpdateArInvoiceDto, ApplyPaymentDto } from './dto/update-ar-invoice.dto';
import { AutomationService } from '../automation/automation.service';
import { StockTransactionsService } from '../stock-transactions/stock-transactions.service';
import { CurrencyService } from '../currency/currency.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ArInvoicesService {
  constructor(
    private prisma: PrismaService,
    private automation: AutomationService,
    private stockService: StockTransactionsService,
    private currency: CurrencyService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreateArInvoiceDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, tenantId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (dto.soId) {
      const so = await this.prisma.salesOrder.findFirst({
        where: { id: dto.soId, tenantId, deletedAt: null },
      });
      if (!so) throw new NotFoundException('Sales Order not found');
    }

    // Frozen-rate pattern (spec-021): default to the tenant base currency,
    // freeze the rate at the invoice date — never recalculated afterwards.
    const baseCurrency = await this.currency.getBaseCurrency(tenantId);
    const invCurrency = dto.currency ?? baseCurrency;
    const catalogCurrency = await this.prisma.currency.findFirst({
      where: { code: invCurrency },
    });
    if (!catalogCurrency) throw new NotFoundException(`Currency ${invCurrency} not in the catalog`);
    const invoiceDate = new Date(dto.invoiceDate);
    const exchangeRate = await this.currency.getRate(
      tenantId,
      invCurrency,
      baseCurrency,
      invoiceDate,
    );

    // Decimal-safe money math — no float drift
    let subtotal = new Decimal(0);
    const linesData: any[] = [];

    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i];
      if (line.itemId) {
        const item = await this.prisma.item.findFirst({
          where: { id: line.itemId, tenantId, deletedAt: null },
        });
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
      }
      const gross = new Decimal(line.unitPrice).mul(line.quantity);
      const discountAmt = gross.mul(line.discountPercent ?? 0).div(100);
      const lineTotal = gross.sub(discountAmt).toDecimalPlaces(2);
      subtotal = subtotal.add(lineTotal);
      linesData.push({
        tenantId,
        lineNumber: i + 1,
        itemId: line.itemId ?? null,
        description: line.description ?? null,
        quantity: line.quantity,
        uom: line.uom ?? null,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent ?? 0,
        lineTotal,
        cogsAmount: line.cogsAmount ?? null,
        revenueAccountId: line.revenueAccountId ?? null,
        cogsAccountId: line.cogsAccountId ?? null,
        createdBy: userId,
        updatedBy: userId,
      });
    }

    const invoiceNumber = await this.generateInvoiceNumber(tenantId, invoiceDate);

    try {
      return await this.prisma.arInvoice.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          soId: dto.soId ?? null,
          invoiceNumber,
          invoiceDate,
          dueDate: new Date(dto.dueDate),
          status: 'draft',
          subtotal,
          taxAmount: 0,
          totalAmount: subtotal,
          paidAmount: 0,
          currency: invCurrency,
          exchangeRate,
          amountBase: subtotal.mul(exchangeRate).toDecimalPlaces(2),
          baseCurrency,
          notes: dto.notes ?? null,
          createdBy: userId,
          updatedBy: userId,
          lines: { create: linesData },
        },
        include: this.defaultInclude(),
      });
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new ConflictException('Invoice number collision — please retry the request');
      throw e;
    }
  }

  async createFromSalesOrder(tenantId: string, userId: string, soId: string) {
    const so = await this.prisma.salesOrder.findFirst({
      where: { id: soId, tenantId, deletedAt: null },
      include: { lines: { include: { item: true } }, customer: true },
    });
    if (!so) throw new NotFoundException('Sales Order not found');

    if (!['confirmed', 'shipped', 'delivered'].includes(so.status)) {
      throw new BadRequestException(
        `Cannot invoice SO in status "${so.status}". Needs confirmed, shipped, or delivered.`,
      );
    }

    const existing = await this.prisma.arInvoice.findFirst({
      where: { tenantId, soId, deletedAt: null, status: { not: 'void' } },
    });
    if (existing) {
      throw new BadRequestException(
        `Invoice ${existing.invoiceNumber} already exists for this Sales Order`,
      );
    }

    // ── Use SO orderDate as invoiceDate (retroactive support) ───────────────
    const invoiceDate = new Date(so.orderDate);

    // ── Guard: cannot invoice beyond end of current month ───────────────────
    const now = new Date();
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    if (invoiceDate > endOfCurrentMonth) {
      throw new BadRequestException(
        `Cannot invoice SO with date ${invoiceDate.toISOString().slice(0, 10)} — beyond end of current month (${endOfCurrentMonth.toISOString().slice(0, 10)})`,
      );
    }

    // ── Due date: orderDate + 30 days ────────────────────────────────────────
    const dueDate = new Date(so.orderDate);
    dueDate.setDate(dueDate.getDate() + 30);

    // spec-026: BOM standard costing was a dead stub (always returned null
    // after burning two queries per line) — removed. cogsAmount stays null on
    // from-SO lines; the manual cogsAmount path on POST / drives CoGS JE pairs.
    const linesData: any[] = so.lines.map((line, i) => ({
      tenantId,
      lineNumber: i + 1,
      itemId: line.itemId,
      description: line.description ?? line.item?.name ?? null,
      quantity: Number(line.orderedQuantity),
      uom: line.uom,
      unitPrice: Number(line.unitPrice),
      discountPercent: Number(line.discountPercent),
      lineTotal: Number(line.lineTotal),
      cogsAmount: null,
      revenueAccountId: null,
      cogsAccountId: null,
      createdBy: userId,
      updatedBy: userId,
    }));

    const invoiceNumber = await this.generateInvoiceNumber(tenantId, invoiceDate);

    // Frozen-rate pattern (spec-021): SO currency (or tenant base), rate frozen
    // at the RETROACTIVE invoice date — historical SO invoicing picks the
    // historically correct rate.
    const baseCurrency = await this.currency.getBaseCurrency(tenantId);
    const invCurrency = so.currency ?? baseCurrency;
    const exchangeRate = await this.currency.getRate(
      tenantId,
      invCurrency,
      baseCurrency,
      invoiceDate,
    );
    const totalAmount = new Decimal(so.total);

    try {
      return await this.prisma.arInvoice.create({
        data: {
          tenantId,
          customerId: so.customerId,
          soId: so.id,
          invoiceNumber,
          invoiceDate,
          dueDate,
          status: 'draft',
          subtotal: Number(so.subtotal),
          taxAmount: Number(so.taxAmount),
          totalAmount,
          paidAmount: 0,
          currency: invCurrency,
          exchangeRate,
          amountBase: totalAmount.mul(exchangeRate).toDecimalPlaces(2),
          baseCurrency,
          notes: `Auto-generated from Sales Order ${so.soNumber}`,
          createdBy: userId,
          updatedBy: userId,
          lines: { create: linesData },
        },
        include: this.defaultInclude(),
      });
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new ConflictException('Invoice number collision — please retry the request');
      throw e;
    }
  }

  async findAll(
    tenantId: string,
    filters: { status?: string; customerId?: string; from?: string; to?: string },
  ) {
    const where: any = { tenantId, deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.from || filters.to) {
      where.invoiceDate = {};
      if (filters.from) where.invoiceDate.gte = new Date(filters.from);
      if (filters.to) where.invoiceDate.lte = new Date(filters.to);
    }
    const arInvoices = await this.prisma.arInvoice.findMany({
      where,
      include: {
        customer: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true, payments: true } },
      },
      orderBy: { invoiceDate: 'desc' },
    });
    return { arInvoices, count: arInvoices.length };
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.arInvoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.defaultInclude(),
    });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    return invoice;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateArInvoiceDto) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft invoices can be edited');
    }
    await this.prisma.arInvoice.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        updatedBy: userId,
      },
    });
    return this.findOne(tenantId, id);
  }

  async send(tenantId: string, userId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException(`Cannot send invoice in status "${invoice.status}"`);
    }
    // FG shipment FIRST and failures ABORT the send (spec-026, mirror of
    // spec-025) — the ledger and inventory must never diverge silently.
    // Invoices with no item lines skip the stock path entirely.
    const itemLines = invoice.lines.filter((l: any) => l.itemId);
    if (itemLines.length > 0) {
      try {
        await this.stockService.shipFromArInvoice(tenantId, userId, {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          lines: itemLines.map((l: any) => ({
            itemId: l.itemId,
            quantity: Number(l.quantity),
            uom: l.uom,
            description: l.description,
          })),
        });
      } catch (err: any) {
        throw new BadRequestException(`FG shipment failed - send aborted: ${err?.message ?? err}`);
      }
    }

    const je = await this.createInvoiceJe(tenantId, userId, invoice);

    await this.prisma.arInvoice.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        status: 'sent',
        jeId: je?.id ?? null,
        updatedBy: userId,
      },
    });
    const updated = await this.findOne(tenantId, id);
    return {
      message: `Invoice ${invoice.invoiceNumber} sent`,
      invoice: updated,
      journalEntry: je,
    };
  }

  async void(tenantId: string, userId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status === 'void') throw new BadRequestException('Invoice already voided');
    if (invoice.status === 'paid')
      throw new BadRequestException('Cannot void a fully paid invoice');
    // spec-026: payments and their JEs would survive the void — block until a
    // payment-reversal flow exists.
    if (new Decimal(invoice.paidAmount).gt(0))
      throw new ConflictException(
        'Cannot void an invoice with applied payments — reverse payments first',
      );
    if (invoice.jeId) await this.createReversalJe(tenantId, userId, invoice);
    await this.prisma.arInvoice.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { status: 'void', updatedBy: userId },
    });
    const updated = await this.findOne(tenantId, id);
    return { message: `Invoice ${invoice.invoiceNumber} voided`, invoice: updated };
  }

  async applyPayment(tenantId: string, userId: string, invoiceId: string, dto: ApplyPaymentDto) {
    const invoice = await this.findOne(tenantId, invoiceId);
    if (['draft', 'void'].includes(invoice.status)) {
      throw new BadRequestException(
        `Cannot apply payment to invoice in status "${invoice.status}"`,
      );
    }
    // Decimal-safe — exact at 2dp, no float epsilons
    const total = new Decimal(invoice.totalAmount);
    const paid = new Decimal(invoice.paidAmount);
    const amount = new Decimal(dto.amount);
    const remaining = total.sub(paid);
    if (amount.gt(remaining)) {
      throw new BadRequestException(
        `Payment $${dto.amount} exceeds outstanding balance $${remaining.toFixed(2)}`,
      );
    }

    // Frozen-rate pattern (spec-021): the payment freezes its OWN rate at the
    // payment date (may differ from the invoice rate).
    const paymentDate = new Date(dto.paymentDate);
    const baseCurrency = await this.currency.getBaseCurrency(tenantId);
    const payCurrency = (invoice as any).currency ?? baseCurrency;
    const exchangeRate = await this.currency.getRate(
      tenantId,
      payCurrency,
      baseCurrency,
      paymentDate,
    );

    const paymentNumber = await this.generatePaymentNumber(tenantId, paymentDate);
    const je = await this.createPaymentJe(tenantId, userId, invoice, dto);

    let payment;
    try {
      payment = await this.prisma.arPayment.create({
        data: {
          tenantId,
          invoiceId,
          paymentNumber,
          paymentDate,
          amount: dto.amount,
          exchangeRate,
          amountBase: amount.mul(exchangeRate).toDecimalPlaces(2),
          baseCurrency,
          paymentMethod: dto.paymentMethod ?? null,
          reference: dto.reference ?? null,
          jeId: je?.id ?? null,
          notes: dto.notes ?? null,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new ConflictException('Payment number collision — please retry the request');
      throw e;
    }

    const newPaidAmount = paid.add(amount);
    const newStatus = newPaidAmount.gte(total) ? 'paid' : 'partial';
    await this.prisma.arInvoice.updateMany({
      where: { id: invoiceId, tenantId, deletedAt: null },
      data: { paidAmount: newPaidAmount, status: newStatus, updatedBy: userId },
    });
    return {
      message: `Payment of $${dto.amount} applied to invoice ${invoice.invoiceNumber}`,
      payment,
      journalEntry: je,
      newStatus,
      remaining: Decimal.max(0, total.sub(newPaidAmount)).toNumber(),
    };
  }

  async getAging(tenantId: string) {
    const today = new Date();
    const invoices = await this.prisma.arInvoice.findMany({
      where: { tenantId, deletedAt: null, status: { in: ['sent', 'partial', 'overdue'] } },
      include: { customer: { select: { id: true, code: true, name: true } } },
    });

    const buckets = {
      current: [] as any[],
      days30: [] as any[],
      days60: [] as any[],
      days90plus: [] as any[],
    };

    for (const inv of invoices) {
      const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
      if (outstanding <= 0) continue;
      const daysOverdue = Math.floor(
        (today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      // Base-currency outstanding via the FROZEN rate (spec-021 pattern)
      const rate = Number((inv as any).exchangeRate ?? 1);
      const row = {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customer: inv.customer,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        outstanding,
        outstandingBase: Math.round(outstanding * rate * 100) / 100,
        daysOverdue,
      };
      if (daysOverdue <= 0) buckets.current.push(row);
      else if (daysOverdue <= 30) buckets.days30.push(row);
      else if (daysOverdue <= 60) buckets.days60.push(row);
      else buckets.days90plus.push(row);
    }

    const sum = (arr: any[]) => arr.reduce((acc, r) => acc + r.outstanding, 0);
    const sumBase = (arr: any[]) => arr.reduce((acc, r) => acc + r.outstandingBase, 0);
    const bucket = (arr: any[]) => ({
      count: arr.length,
      amount: sum(arr),
      amountBase: Math.round(sumBase(arr) * 100) / 100,
    });
    const all = [...buckets.current, ...buckets.days30, ...buckets.days60, ...buckets.days90plus];
    return {
      asOf: today,
      summary: {
        current: bucket(buckets.current),
        days1to30: bucket(buckets.days30),
        days31to60: bucket(buckets.days60),
        days90plus: bucket(buckets.days90plus),
        total: {
          count: invoices.length,
          amount: sum(all),
          amountBase: Math.round(sumBase(all) * 100) / 100,
        },
      },
      detail: {
        current: buckets.current,
        days1to30: buckets.days30,
        days31to60: buckets.days60,
        days90plus: buckets.days90plus,
      },
    };
  }

  async getKpis(tenantId: string) {
    const invoices = await this.prisma.arInvoice.findMany({
      where: { tenantId, deletedAt: null, status: { not: 'void' } },
      select: {
        status: true,
        totalAmount: true,
        paidAmount: true,
        dueDate: true,
        exchangeRate: true,
      },
    });
    const today = new Date();
    let totalInvoiced = 0,
      totalCollected = 0,
      totalPending = 0,
      totalOverdue = 0,
      invoicedBase = 0,
      pendingBase = 0;
    for (const inv of invoices) {
      const total = Number(inv.totalAmount);
      const paid = Number(inv.paidAmount);
      const rate = Number(inv.exchangeRate ?? 1);
      const outstanding = total - paid;
      totalInvoiced += total;
      invoicedBase += total * rate;
      totalCollected += paid;
      if (outstanding > 0) {
        totalPending += outstanding;
        pendingBase += outstanding * rate;
        if (new Date(inv.dueDate) < today) totalOverdue += outstanding;
      }
    }
    return {
      invoiced: totalInvoiced,
      collected: totalCollected,
      pending: totalPending,
      overdue: totalOverdue,
      collectionRate: totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0,
      invoicedBase: Math.round(invoicedBase * 100) / 100,
      pendingBase: Math.round(pendingBase * 100) / 100,
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft invoices can be deleted');
    }
    await this.prisma.arInvoice.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Invoice deleted', id };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async assertPeriodOpen(tenantId: string, fiscalPeriod: string): Promise<void> {
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { tenantId, periodCode: fiscalPeriod, deletedAt: null },
    });
    if (period && ['closed', 'locked'].includes(period.status)) {
      throw new BadRequestException(
        `Fiscal period ${fiscalPeriod} is ${period.status} — cannot post journal entries`,
      );
    }
  }

  private async createInvoiceJe(tenantId: string, userId: string, invoice: any) {
    const arAccount = await this.prisma.account.findFirst({
      where: { tenantId, accountNumber: '1.1.03', deletedAt: null },
    });
    const revenueAccount = await this.prisma.account.findFirst({
      where: { tenantId, accountNumber: '4.1.01', deletedAt: null },
    });
    if (!arAccount || !revenueAccount) {
      throw new BadRequestException('Accounts 1.1.03 (AR) and 4.1.01 (Revenue) required for JE');
    }

    const entryNumber = await this.generateJeNumber(tenantId);
    const fiscalPeriod = this.toFiscalPeriod(new Date(invoice.invoiceDate));
    const totalAmount = Number(invoice.totalAmount);

    // ── Guard: fiscal period must be open ────────────────────────────────────
    await this.assertPeriodOpen(tenantId, fiscalPeriod);

    const lines: any[] = [
      {
        lineNumber: 1,
        accountId: arAccount.id,
        description: `AR — Invoice ${invoice.invoiceNumber}`,
        debitAmount: totalAmount,
        creditAmount: 0,
      },
      {
        lineNumber: 2,
        accountId: revenueAccount.id,
        description: `Revenue — Invoice ${invoice.invoiceNumber}`,
        debitAmount: 0,
        creditAmount: totalAmount,
      },
    ];

    let lineNumber = 3;
    for (const line of invoice.lines) {
      if (!line.cogsAmount || Number(line.cogsAmount) === 0) continue;
      const cogsAcct = line.cogsAccountId
        ? await this.prisma.account.findFirst({
            where: { id: line.cogsAccountId, tenantId, deletedAt: null },
          })
        : await this.prisma.account.findFirst({
            where: { tenantId, accountNumber: '5.1.01', deletedAt: null },
          });
      const fgAcct = await this.prisma.account.findFirst({
        where: { tenantId, accountNumber: '1.1.05', deletedAt: null },
      });
      if (cogsAcct && fgAcct) {
        lines.push(
          {
            lineNumber: lineNumber++,
            accountId: cogsAcct.id,
            description: `CoGS — ${line.description ?? 'line'}`,
            debitAmount: Number(line.cogsAmount),
            creditAmount: 0,
          },
          {
            lineNumber: lineNumber++,
            accountId: fgAcct.id,
            description: `FG Inv — ${line.description ?? 'line'}`,
            debitAmount: 0,
            creditAmount: Number(line.cogsAmount),
          },
        );
      }
    }

    const result = await this.automation.handleAutoJe({
      tenantId,
      userId,
      module: 'ar_invoice',
      eventType: 'ar_invoice',
      sourceType: 'ar_invoice',
      sourceId: invoice.id,
      sourceRef: invoice.invoiceNumber,
      jeData: {
        entryNumber,
        entryDate: new Date(invoice.invoiceDate),
        fiscalPeriod,
        journalType: 'ar_invoice',
        reference: invoice.invoiceNumber,
        description: `AR Invoice — ${invoice.invoiceNumber} — ${invoice.customer?.name ?? ''}`,
        lines,
      },
    });

    return result.je;
  }

  private async createPaymentJe(
    tenantId: string,
    userId: string,
    invoice: any,
    dto: ApplyPaymentDto,
  ) {
    const cashAccount = await this.prisma.account.findFirst({
      where: { tenantId, accountNumber: '1.1.02', deletedAt: null },
    });
    const arAccount = await this.prisma.account.findFirst({
      where: { tenantId, accountNumber: '1.1.03', deletedAt: null },
    });
    if (!cashAccount || !arAccount) {
      throw new BadRequestException(
        'Accounts 1.1.02 (Cash) and 1.1.03 (AR) required for payment JE',
      );
    }

    const entryNumber = await this.generateJeNumber(tenantId);
    const fiscalPeriod = this.toFiscalPeriod(new Date(dto.paymentDate));

    // ── Guard: fiscal period must be open ────────────────────────────────────
    await this.assertPeriodOpen(tenantId, fiscalPeriod);

    const result = await this.automation.handleAutoJe({
      tenantId,
      userId,
      module: 'ar_payment',
      eventType: 'ar_payment',
      sourceType: 'ar_invoice',
      sourceId: invoice.id,
      sourceRef: invoice.invoiceNumber,
      jeData: {
        entryNumber,
        entryDate: new Date(dto.paymentDate),
        fiscalPeriod,
        journalType: 'ar_payment',
        reference: dto.reference ?? invoice.invoiceNumber,
        description: `Payment received — Invoice ${invoice.invoiceNumber}`,
        lines: [
          {
            lineNumber: 1,
            accountId: cashAccount.id,
            description: `Cash received — Inv ${invoice.invoiceNumber}`,
            debitAmount: dto.amount,
            creditAmount: 0,
          },
          {
            lineNumber: 2,
            accountId: arAccount.id,
            description: `AR cleared — Inv ${invoice.invoiceNumber}`,
            debitAmount: 0,
            creditAmount: dto.amount,
          },
        ],
      },
    });

    return result.je;
  }

  private async createReversalJe(tenantId: string, userId: string, invoice: any) {
    const original = await this.prisma.journalEntry.findFirst({
      where: { id: invoice.jeId, tenantId },
      include: { lines: true },
    });
    if (!original) return;

    const entryNumber = await this.generateJeNumber(tenantId);
    const fiscalPeriod = this.toFiscalPeriod(new Date());
    const reversedLines = original.lines.map((line, i) => ({
      lineNumber: i + 1,
      accountId: line.accountId,
      description: `REVERSAL — ${line.description}`,
      debitAmount: Number(line.creditAmount),
      creditAmount: Number(line.debitAmount),
    }));

    const result = await this.automation.handleAutoJe({
      tenantId,
      userId,
      module: 'ar_reversal',
      eventType: 'ar_reversal',
      sourceType: 'ar_invoice',
      sourceId: invoice.id,
      sourceRef: invoice.invoiceNumber,
      jeData: {
        entryNumber,
        entryDate: new Date(),
        fiscalPeriod,
        journalType: 'ar_reversal',
        reference: invoice.invoiceNumber,
        description: `VOID reversal — Invoice ${invoice.invoiceNumber}`,
        lines: reversedLines,
      },
    });

    return result.je;
  }

  private defaultInclude() {
    return {
      customer: { select: { id: true, code: true, name: true, email: true } },
      salesOrder: { select: { id: true, soNumber: true } },
      lines: {
        include: { item: { select: { id: true, code: true, name: true } } },
        orderBy: { lineNumber: 'asc' as const },
      },
      payments: { orderBy: { paymentDate: 'asc' as const } },
    };
  }

  // ── Number generators — date-aware ──────────────────────────────────────────

  // Numeric max — string orderBy breaks past -9999. Deliberately spans
  // soft-deleted rows (spec-012 exception); unique constraints backstop races
  // via P2002 → 409.
  private numericMax(rows: Array<Record<string, any>>, field: string): number {
    return rows.reduce((m, r) => {
      const n = parseInt(String(r[field]).split('-').pop() ?? '', 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
  }

  private async generateInvoiceNumber(tenantId: string, date?: Date): Promise<string> {
    const prefix = `INV-${(date ?? new Date()).getFullYear()}`;
    const rows = await this.prisma.arInvoice.findMany({
      where: { tenantId, invoiceNumber: { startsWith: prefix } },
      select: { invoiceNumber: true },
    });
    return `${prefix}-${(this.numericMax(rows, 'invoiceNumber') + 1).toString().padStart(4, '0')}`;
  }

  private async generatePaymentNumber(tenantId: string, date?: Date): Promise<string> {
    const prefix = `PAY-${(date ?? new Date()).getFullYear()}`;
    const rows = await this.prisma.arPayment.findMany({
      where: { tenantId, paymentNumber: { startsWith: prefix } },
      select: { paymentNumber: true },
    });
    return `${prefix}-${(this.numericMax(rows, 'paymentNumber') + 1).toString().padStart(4, '0')}`;
  }

  private async generateJeNumber(tenantId: string): Promise<string> {
    const now = new Date();
    const prefix = `JE-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    const rows = await this.prisma.journalEntry.findMany({
      where: { tenantId, entryNumber: { startsWith: prefix } },
      select: { entryNumber: true },
    });
    return `${prefix}-${(this.numericMax(rows, 'entryNumber') + 1).toString().padStart(4, '0')}`;
  }

  private toFiscalPeriod(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }
}
