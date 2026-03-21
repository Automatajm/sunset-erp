import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateArInvoiceDto } from './dto/create-ar-invoice.dto';
import { UpdateArInvoiceDto, ApplyPaymentDto } from './dto/update-ar-invoice.dto';

@Injectable()
export class ArInvoicesService {
  constructor(private prisma: PrismaService) {}

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

    let subtotal = 0;
    const linesData: any[] = [];

    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i];
      if (line.itemId) {
        const item = await this.prisma.item.findFirst({
          where: { id: line.itemId, tenantId, deletedAt: null },
        });
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
      }
      const discountAmt = (line.unitPrice * line.quantity * (line.discountPercent || 0)) / 100;
      const lineTotal = line.unitPrice * line.quantity - discountAmt;
      subtotal += lineTotal;
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

    const invoiceNumber = await this.generateInvoiceNumber(tenantId);

    return this.prisma.arInvoice.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        soId: dto.soId ?? null,
        invoiceNumber,
        invoiceDate: new Date(dto.invoiceDate),
        dueDate: new Date(dto.dueDate),
        status: 'draft',
        subtotal,
        taxAmount: 0,
        totalAmount: subtotal,
        paidAmount: 0,
        currency: dto.currency ?? 'USD',
        notes: dto.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
        lines: { create: linesData },
      },
      include: this.defaultInclude(),
    });
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

    const invoiceDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const linesData = so.lines.map((line, i) => ({
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

    const invoiceNumber = await this.generateInvoiceNumber(tenantId);

    return this.prisma.arInvoice.create({
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
        totalAmount: Number(so.total),
        paidAmount: 0,
        currency: so.currency ?? 'USD',
        notes: `Auto-generated from Sales Order ${so.soNumber}`,
        createdBy: userId,
        updatedBy: userId,
        lines: { create: linesData },
      },
      include: this.defaultInclude(),
    });
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
    return this.prisma.arInvoice.findMany({
      where,
      include: {
        customer: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true, payments: true } },
      },
      orderBy: { invoiceDate: 'desc' },
    });
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
    return this.prisma.arInvoice.update({
      where: { id },
      data: {
        ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        updatedBy: userId,
      },
      include: this.defaultInclude(),
    });
  }

  async send(tenantId: string, userId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException(`Cannot send invoice in status "${invoice.status}"`);
    }
    const je = await this.createInvoiceJe(tenantId, userId, invoice);
    const updated = await this.prisma.arInvoice.update({
      where: { id },
      data: { status: 'sent', jeId: je.id, updatedBy: userId },
      include: this.defaultInclude(),
    });
    return { message: `Invoice ${invoice.invoiceNumber} sent`, invoice: updated, journalEntry: je };
  }

  async void(tenantId: string, userId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status === 'void') throw new BadRequestException('Invoice already voided');
    if (invoice.status === 'paid') throw new BadRequestException('Cannot void a fully paid invoice');
    if (invoice.jeId) await this.createReversalJe(tenantId, userId, invoice);
    const updated = await this.prisma.arInvoice.update({
      where: { id },
      data: { status: 'void', updatedBy: userId },
      include: this.defaultInclude(),
    });
    return { message: `Invoice ${invoice.invoiceNumber} voided`, invoice: updated };
  }

  async applyPayment(tenantId: string, userId: string, invoiceId: string, dto: ApplyPaymentDto) {
    const invoice = await this.findOne(tenantId, invoiceId);
    if (['draft', 'void'].includes(invoice.status)) {
      throw new BadRequestException(`Cannot apply payment to invoice in status "${invoice.status}"`);
    }
    const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException(
        `Payment $${dto.amount} exceeds outstanding balance $${remaining.toFixed(2)}`,
      );
    }
    const paymentNumber = await this.generatePaymentNumber(tenantId);
    const je = await this.createPaymentJe(tenantId, userId, invoice, dto);
    const payment = await this.prisma.arPayment.create({
      data: {
        tenantId,
        invoiceId,
        paymentNumber,
        paymentDate: new Date(dto.paymentDate),
        amount: dto.amount,
        paymentMethod: dto.paymentMethod ?? null,
        reference: dto.reference ?? null,
        jeId: je.id,
        notes: dto.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    const newPaidAmount = Number(invoice.paidAmount) + dto.amount;
    const newStatus = newPaidAmount >= Number(invoice.totalAmount) - 0.001 ? 'paid' : 'partial';
    await this.prisma.arInvoice.update({
      where: { id: invoiceId },
      data: { paidAmount: newPaidAmount, status: newStatus, updatedBy: userId },
    });
    return {
      message: `Payment of $${dto.amount} applied to invoice ${invoice.invoiceNumber}`,
      payment,
      journalEntry: je,
      newStatus,
      remaining: Math.max(0, Number(invoice.totalAmount) - newPaidAmount),
    };
  }

  async getAging(tenantId: string) {
    const today = new Date();
    const invoices = await this.prisma.arInvoice.findMany({
      where: { tenantId, deletedAt: null, status: { in: ['sent', 'partial', 'overdue'] } },
      include: { customer: { select: { id: true, code: true, name: true } } },
    });

    const buckets = { current: [] as any[], days30: [] as any[], days60: [] as any[], days90plus: [] as any[] };

    for (const inv of invoices) {
      const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
      if (outstanding <= 0) continue;
      const daysOverdue = Math.floor(
        (today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      const row = {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customer: inv.customer,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        outstanding,
        daysOverdue,
      };
      if (daysOverdue <= 0) buckets.current.push(row);
      else if (daysOverdue <= 30) buckets.days30.push(row);
      else if (daysOverdue <= 60) buckets.days60.push(row);
      else buckets.days90plus.push(row);
    }

    const sum = (arr: any[]) => arr.reduce((acc, r) => acc + r.outstanding, 0);
    return {
      asOf: today,
      summary: {
        current:    { count: buckets.current.length,   amount: sum(buckets.current) },
        days1to30:  { count: buckets.days30.length,    amount: sum(buckets.days30) },
        days31to60: { count: buckets.days60.length,    amount: sum(buckets.days60) },
        days90plus: { count: buckets.days90plus.length, amount: sum(buckets.days90plus) },
        total: {
          count: invoices.length,
          amount: sum([...buckets.current, ...buckets.days30, ...buckets.days60, ...buckets.days90plus]),
        },
      },
      detail: {
        current:    buckets.current,
        days1to30:  buckets.days30,
        days31to60: buckets.days60,
        days90plus: buckets.days90plus,
      },
    };
  }

  async getKpis(tenantId: string) {
    const invoices = await this.prisma.arInvoice.findMany({
      where: { tenantId, deletedAt: null, status: { not: 'void' } },
      select: { status: true, totalAmount: true, paidAmount: true, dueDate: true },
    });
    const today = new Date();
    let totalInvoiced = 0, totalCollected = 0, totalPending = 0, totalOverdue = 0;
    for (const inv of invoices) {
      const total = Number(inv.totalAmount);
      const paid = Number(inv.paidAmount);
      const outstanding = total - paid;
      totalInvoiced += total;
      totalCollected += paid;
      if (outstanding > 0) {
        totalPending += outstanding;
        if (new Date(inv.dueDate) < today) totalOverdue += outstanding;
      }
    }
    return {
      invoiced: totalInvoiced,
      collected: totalCollected,
      pending: totalPending,
      overdue: totalOverdue,
      collectionRate: totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0,
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft invoices can be deleted');
    }
    await this.prisma.arInvoice.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Invoice deleted', id };
  }

  // ── Private helpers ──────────────────────────────────────

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

    const lines: any[] = [
      { tenantId, lineNumber: 1, accountId: arAccount.id,      description: `AR — Invoice ${invoice.invoiceNumber}`,      debitAmount: totalAmount, creditAmount: 0,           createdBy: userId, updatedBy: userId },
      { tenantId, lineNumber: 2, accountId: revenueAccount.id, description: `Revenue — Invoice ${invoice.invoiceNumber}`, debitAmount: 0,           creditAmount: totalAmount, createdBy: userId, updatedBy: userId },
    ];

    let lineNumber = 3;
    for (const line of invoice.lines) {
      if (!line.cogsAmount || Number(line.cogsAmount) === 0) continue;
      const cogsAcct = line.cogsAccountId
        ? await this.prisma.account.findFirst({ where: { id: line.cogsAccountId, tenantId } })
        : await this.prisma.account.findFirst({ where: { tenantId, accountNumber: '5.1.01', deletedAt: null } });
      const fgAcct = await this.prisma.account.findFirst({ where: { tenantId, accountNumber: '1.1.05', deletedAt: null } });
      if (cogsAcct && fgAcct) {
        lines.push(
          { tenantId, lineNumber: lineNumber++, accountId: cogsAcct.id, description: `CoGS — ${line.description ?? 'line'}`, debitAmount: Number(line.cogsAmount), creditAmount: 0,                     createdBy: userId, updatedBy: userId },
          { tenantId, lineNumber: lineNumber++, accountId: fgAcct.id,   description: `FG Inv — ${line.description ?? 'line'}`, debitAmount: 0,                     creditAmount: Number(line.cogsAmount), createdBy: userId, updatedBy: userId },
        );
      }
    }

    return this.prisma.journalEntry.create({
      data: {
        tenantId, entryNumber,
        entryDate: new Date(invoice.invoiceDate),
        postingDate: new Date(invoice.invoiceDate),
        fiscalPeriod, journalType: 'ar_invoice',
        reference: invoice.invoiceNumber,
        description: `AR Invoice — ${invoice.invoiceNumber} — ${invoice.customer?.name ?? ''}`,
        status: 'posted', createdBy: userId, updatedBy: userId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
  }

  private async createPaymentJe(tenantId: string, userId: string, invoice: any, dto: ApplyPaymentDto) {
    const cashAccount = await this.prisma.account.findFirst({ where: { tenantId, accountNumber: '1.1.02', deletedAt: null } });
    const arAccount   = await this.prisma.account.findFirst({ where: { tenantId, accountNumber: '1.1.03', deletedAt: null } });
    if (!cashAccount || !arAccount) {
      throw new BadRequestException('Accounts 1.1.02 (Cash) and 1.1.03 (AR) required for payment JE');
    }
    const entryNumber  = await this.generateJeNumber(tenantId);
    const fiscalPeriod = this.toFiscalPeriod(new Date(dto.paymentDate));
    return this.prisma.journalEntry.create({
      data: {
        tenantId, entryNumber,
        entryDate: new Date(dto.paymentDate), postingDate: new Date(dto.paymentDate),
        fiscalPeriod, journalType: 'ar_payment',
        reference: dto.reference ?? invoice.invoiceNumber,
        description: `Payment received — Invoice ${invoice.invoiceNumber}`,
        status: 'posted', createdBy: userId, updatedBy: userId,
        lines: {
          create: [
            { tenantId, lineNumber: 1, accountId: cashAccount.id, description: `Cash received — Inv ${invoice.invoiceNumber}`, debitAmount: dto.amount, creditAmount: 0,          createdBy: userId, updatedBy: userId },
            { tenantId, lineNumber: 2, accountId: arAccount.id,   description: `AR cleared — Inv ${invoice.invoiceNumber}`,    debitAmount: 0,         creditAmount: dto.amount, createdBy: userId, updatedBy: userId },
          ],
        },
      },
      include: { lines: true },
    });
  }

  private async createReversalJe(tenantId: string, userId: string, invoice: any) {
    const original = await this.prisma.journalEntry.findFirst({
      where: { id: invoice.jeId }, include: { lines: true },
    });
    if (!original) return;
    const entryNumber  = await this.generateJeNumber(tenantId);
    const fiscalPeriod = this.toFiscalPeriod(new Date());
    const reversedLines = original.lines.map((line, i) => ({
      tenantId, lineNumber: i + 1, accountId: line.accountId,
      description: `REVERSAL — ${line.description}`,
      debitAmount: Number(line.creditAmount), creditAmount: Number(line.debitAmount),
      createdBy: userId, updatedBy: userId,
    }));
    return this.prisma.journalEntry.create({
      data: {
        tenantId, entryNumber, entryDate: new Date(), postingDate: new Date(),
        fiscalPeriod, journalType: 'ar_reversal',
        reference: invoice.invoiceNumber,
        description: `VOID reversal — Invoice ${invoice.invoiceNumber}`,
        status: 'posted', createdBy: userId, updatedBy: userId,
        lines: { create: reversedLines },
      },
    });
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

  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const prefix = `INV-${new Date().getFullYear()}`;
    const last = await this.prisma.arInvoice.findFirst({
      where: { tenantId, invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    return `${prefix}-${(parseInt(last.invoiceNumber.split('-')[2]) + 1).toString().padStart(4, '0')}`;
  }

  private async generatePaymentNumber(tenantId: string): Promise<string> {
    const prefix = `PAY-${new Date().getFullYear()}`;
    const last = await this.prisma.arPayment.findFirst({
      where: { tenantId, paymentNumber: { startsWith: prefix } },
      orderBy: { paymentNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    return `${prefix}-${(parseInt(last.paymentNumber.split('-')[2]) + 1).toString().padStart(4, '0')}`;
  }

  private async generateJeNumber(tenantId: string): Promise<string> {
    const prefix = `JE-${new Date().getFullYear()}`;
    const last = await this.prisma.journalEntry.findFirst({
      where: { tenantId, entryNumber: { startsWith: prefix } },
      orderBy: { entryNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    return `${prefix}-${(parseInt(last.entryNumber.split('-')[2]) + 1).toString().padStart(4, '0')}`;
  }

  private toFiscalPeriod(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }
}