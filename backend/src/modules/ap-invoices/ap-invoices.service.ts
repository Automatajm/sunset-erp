// ============================================================================
// FILE: backend/src/modules/ap-invoices/ap-invoices.service.ts
// ============================================================================
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateApInvoiceDto } from './dto/create-ap-invoice.dto';
import { UpdateApInvoiceDto, ApplyApPaymentDto } from './dto/update-ap-invoice.dto';
import { AutomationService } from '../automation/automation.service';
import { StockTransactionsService } from '../stock-transactions/stock-transactions.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ApInvoicesService {
  constructor(
    private prisma: PrismaService,
    private automation: AutomationService,
    private stockService: StockTransactionsService,
  ) {}

  // ============================================================================
  // CREATE — manual (draft, no JE)
  // ============================================================================
  async create(tenantId: string, userId: string, dto: CreateApInvoiceDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    if (dto.poId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: dto.poId, tenantId, deletedAt: null },
      });
      if (!po) throw new NotFoundException('Purchase Order not found');
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

      let originalPoPrice: number | null = null;
      if (line.poLineId) {
        const poLine = await this.prisma.purchaseOrderLine.findFirst({
          where: { id: line.poLineId },
        });
        if (!poLine) throw new NotFoundException(`PO line ${line.poLineId} not found`);
        originalPoPrice = Number(poLine.unitPrice);
      }

      const discountAmt = (line.unitPrice * line.quantity * (line.discountPercent || 0)) / 100;
      const lineTotal   = line.unitPrice * line.quantity - discountAmt;
      const priceVariance = originalPoPrice !== null
        ? (line.unitPrice - originalPoPrice) * line.quantity
        : null;

      subtotal += lineTotal;

      linesData.push({
        tenantId,
        lineNumber:         i + 1,
        poLineId:           line.poLineId ?? null,
        itemId:             line.itemId ?? null,
        description:        line.description ?? null,
        quantity:           line.quantity,
        uom:                line.uom ?? null,
        unitPrice:          line.unitPrice,
        originalPoPrice,
        discountPercent:    line.discountPercent ?? 0,
        lineTotal,
        priceVariance,
        inventoryAccountId: line.inventoryAccountId ?? null,
        expenseAccountId:   line.expenseAccountId ?? null,
        createdBy:          userId,
        updatedBy:          userId,
      });
    }

    const invoiceNumber = await this.generateInvoiceNumber(tenantId, new Date(dto.invoiceDate));

    return this.prisma.apInvoice.create({
      data: {
        tenantId,
        supplierId:   dto.supplierId,
        poId:         dto.poId ?? null,
        invoiceNumber,
        supplierRef:  dto.supplierRef ?? null,
        invoiceDate:  new Date(dto.invoiceDate),
        dueDate:      new Date(dto.dueDate),
        status:       'draft',
        subtotal,
        taxAmount:    0,
        totalAmount:  subtotal,
        paidAmount:   0,
        currency:     dto.currency ?? 'USD',
        notes:        dto.notes ?? null,
        createdBy:    userId,
        updatedBy:    userId,
        lines: { create: linesData },
      },
      include: this.defaultInclude(),
    });
  }

  // ============================================================================
  // CREATE FROM PO
  // ============================================================================
  async createFromPo(tenantId: string, userId: string, poId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId, deletedAt: null },
      include: { lines: { include: { item: true } }, supplier: true },
    });
    if (!po) throw new NotFoundException('Purchase Order not found');

    if (!['confirmed', 'received', 'partial'].includes(po.status)) {
      throw new BadRequestException(
        `Cannot create AP Invoice from PO in status "${po.status}". Needs confirmed, received, or partial.`,
      );
    }

    const existing = await this.prisma.apInvoice.findFirst({
      where: { tenantId, poId, deletedAt: null, status: { not: 'void' } },
    });
    if (existing) {
      throw new BadRequestException(
        `AP Invoice ${existing.invoiceNumber} already exists for PO ${po.poNumber}`,
      );
    }

    const invoiceDate = new Date();
    const dueDate     = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const linesData = po.lines.map((line, i) => {
      const lineTotal       = Number(line.lineTotal);
      const originalPoPrice = Number(line.unitPrice);
      return {
        tenantId,
        lineNumber:         i + 1,
        poLineId:           line.id,
        itemId:             line.itemId,
        description:        line.description ?? line.item?.name ?? null,
        quantity:           Number(line.orderedQuantity),
        uom:                line.uom,
        unitPrice:          originalPoPrice,
        originalPoPrice,
        discountPercent:    Number(line.discountPercent),
        lineTotal,
        priceVariance:      0,
        inventoryAccountId: null,
        expenseAccountId:   null,
        createdBy:          userId,
        updatedBy:          userId,
      };
    });

    const invoiceNumber = await this.generateInvoiceNumber(tenantId, invoiceDate);

    return this.prisma.apInvoice.create({
      data: {
        tenantId,
        supplierId:   po.supplierId,
        poId:         po.id,
        invoiceNumber,
        supplierRef:  null,
        invoiceDate,
        dueDate,
        status:       'draft',
        subtotal:     Number(po.subtotal),
        taxAmount:    Number(po.taxAmount),
        totalAmount:  Number(po.total),
        paidAmount:   0,
        currency:     po.currency ?? 'USD',
        notes:        `Auto-generated from Purchase Order ${po.poNumber}`,
        createdBy:    userId,
        updatedBy:    userId,
        lines: { create: linesData },
      },
      include: this.defaultInclude(),
    });
  }

  // ============================================================================
  // FIND ALL
  // ============================================================================
  async findAll(
    tenantId: string,
    filters: { status?: string; supplierId?: string; from?: string; to?: string },
  ) {
    const where: any = { tenantId, deletedAt: null };
    if (filters.status)     where.status     = filters.status;
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.from || filters.to) {
      where.invoiceDate = {};
      if (filters.from) where.invoiceDate.gte = new Date(filters.from);
      if (filters.to)   where.invoiceDate.lte = new Date(filters.to);
    }
    return this.prisma.apInvoice.findMany({
      where,
      include: {
        supplier:      { select: { id: true, code: true, name: true } },
        purchaseOrder: { select: { id: true, poNumber: true } },
        goodsReceipt:  { select: { id: true, grnNumber: true, status: true } },
        _count:        { select: { lines: true, payments: true } },
      },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  // ============================================================================
  // FIND ONE
  // ============================================================================
  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.apInvoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.defaultInclude(),
    });
    if (!invoice) throw new NotFoundException(`AP Invoice ${id} not found`);
    return invoice;
  }

  // ============================================================================
  // UPDATE — draft only
  // ============================================================================
  async update(tenantId: string, userId: string, id: string, dto: UpdateApInvoiceDto) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft AP invoices can be edited');
    }
    return this.prisma.apInvoice.update({
      where: { id },
      data: {
        ...(dto.dueDate     && { dueDate:     new Date(dto.dueDate) }),
        ...(dto.supplierRef !== undefined && { supplierRef: dto.supplierRef }),
        ...(dto.notes       !== undefined && { notes:       dto.notes }),
        updatedBy: userId,
      },
      include: this.defaultInclude(),
    });
  }

  // ============================================================================
  // POST — draft → posted, generates JE
  // ============================================================================
  async post(tenantId: string, userId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException(`Cannot post AP invoice in status "${invoice.status}"`);
    }

    // ── 3-Way Match validation (if GRN linked) ────────────────────────────────
    if ((invoice as any).grnId) {
      await this.validateThreeWayMatch(tenantId, invoice);
    }

    const je = await this.createInvoiceJe(tenantId, userId, invoice);

    try {
      await this.stockService.receiveFromApInvoice(tenantId, userId, {
        id:            invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        lines:         invoice.lines.map((l: any) => ({
          itemId:      l.itemId,
          quantity:    Number(l.quantity),
          uom:         l.uom,
          unitPrice:   Number(l.unitPrice),
          description: l.description,
        })),
      });
    } catch (err) {
      console.error('❌ receiveFromApInvoice failed:', err.message);
    }

    const updated = await this.prisma.apInvoice.update({
      where: { id },
      data: { status: 'posted', jeId: je?.id ?? null, updatedBy: userId },
      include: this.defaultInclude(),
    });

    return {
      message:      `AP Invoice ${invoice.invoiceNumber} posted`,
      invoice:      updated,
      journalEntry: je,
    };
  }

  // ============================================================================
  // VOID
  // ============================================================================
  async void(tenantId: string, userId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status === 'void') throw new BadRequestException('Invoice already voided');
    if (invoice.status === 'paid') throw new BadRequestException('Cannot void a fully paid AP invoice');

    if (invoice.jeId) await this.createReversalJe(tenantId, userId, invoice);

    const updated = await this.prisma.apInvoice.update({
      where: { id },
      data: { status: 'void', updatedBy: userId },
      include: this.defaultInclude(),
    });

    return { message: `AP Invoice ${invoice.invoiceNumber} voided`, invoice: updated };
  }

  // ============================================================================
  // PAY
  // ============================================================================
  async applyPayment(tenantId: string, userId: string, invoiceId: string, dto: ApplyApPaymentDto) {
    const invoice = await this.findOne(tenantId, invoiceId);

    if (['draft', 'void'].includes(invoice.status)) {
      throw new BadRequestException(
        `Cannot apply payment to AP invoice in status "${invoice.status}". Post it first.`,
      );
    }

    const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException(
        `Payment $${dto.amount} exceeds outstanding balance $${remaining.toFixed(2)}`,
      );
    }

    const paymentNumber = await this.generatePaymentNumber(tenantId, new Date(dto.paymentDate));
    const je            = await this.createPaymentJe(tenantId, userId, invoice, dto);

    const payment = await this.prisma.apPayment.create({
      data: {
        tenantId,
        invoiceId,
        paymentNumber,
        paymentDate:   new Date(dto.paymentDate),
        amount:        dto.amount,
        paymentMethod: dto.paymentMethod ?? null,
        reference:     dto.reference     ?? null,
        jeId:          je?.id            ?? null,
        notes:         dto.notes         ?? null,
        createdBy:     userId,
        updatedBy:     userId,
      },
    });

    const newPaidAmount = Number(invoice.paidAmount) + dto.amount;
    const newStatus     = newPaidAmount >= Number(invoice.totalAmount) - 0.001 ? 'paid' : 'partial';

    await this.prisma.apInvoice.update({
      where: { id: invoiceId },
      data: { paidAmount: newPaidAmount, status: newStatus, updatedBy: userId },
    });

    return {
      message:      `Payment of $${dto.amount} applied to AP Invoice ${invoice.invoiceNumber}`,
      payment,
      journalEntry: je,
      newStatus,
      remaining:    Math.max(0, Number(invoice.totalAmount) - newPaidAmount),
    };
  }

  // ============================================================================
  // AP AGING
  // ============================================================================
  async getAging(tenantId: string) {
    const today    = new Date();
    const invoices = await this.prisma.apInvoice.findMany({
      where: { tenantId, deletedAt: null, status: { in: ['posted', 'partial'] } },
      include: { supplier: { select: { id: true, code: true, name: true } } },
    });

    const buckets = {
      current:    [] as any[],
      days30:     [] as any[],
      days60:     [] as any[],
      days90plus: [] as any[],
    };

    for (const inv of invoices) {
      const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
      if (outstanding <= 0) continue;
      const daysPastDue = Math.floor(
        (today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      const row = {
        invoiceId:     inv.id,
        invoiceNumber: inv.invoiceNumber,
        supplierRef:   inv.supplierRef,
        supplier:      inv.supplier,
        invoiceDate:   inv.invoiceDate,
        dueDate:       inv.dueDate,
        totalAmount:   Number(inv.totalAmount),
        paidAmount:    Number(inv.paidAmount),
        outstanding,
        daysPastDue,
      };
      if (daysPastDue <= 0)       buckets.current.push(row);
      else if (daysPastDue <= 30) buckets.days30.push(row);
      else if (daysPastDue <= 60) buckets.days60.push(row);
      else                        buckets.days90plus.push(row);
    }

    const sum = (arr: any[]) => arr.reduce((acc, r) => acc + r.outstanding, 0);
    return {
      asOf: today,
      summary: {
        current:    { count: buckets.current.length,    amount: sum(buckets.current) },
        days1to30:  { count: buckets.days30.length,     amount: sum(buckets.days30) },
        days31to60: { count: buckets.days60.length,     amount: sum(buckets.days60) },
        days90plus: { count: buckets.days90plus.length, amount: sum(buckets.days90plus) },
        total: {
          count:  invoices.length,
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

  // ============================================================================
  // AP KPIs
  // ============================================================================
  async getKpis(tenantId: string) {
    const invoices = await this.prisma.apInvoice.findMany({
      where: { tenantId, deletedAt: null, status: { not: 'void' } },
      select: { status: true, totalAmount: true, paidAmount: true, dueDate: true },
    });

    const today = new Date();
    let totalInvoiced = 0, totalPaid = 0, totalPending = 0, totalOverdue = 0;

    for (const inv of invoices) {
      const total       = Number(inv.totalAmount);
      const paid        = Number(inv.paidAmount);
      const outstanding = total - paid;
      totalInvoiced += total;
      totalPaid     += paid;
      if (outstanding > 0) {
        totalPending += outstanding;
        if (new Date(inv.dueDate) < today) totalOverdue += outstanding;
      }
    }

    return {
      totalInvoiced,
      totalPaid,
      totalPending,
      totalOverdue,
      paymentRate: totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0,
    };
  }

  // ============================================================================
  // DELETE — draft only
  // ============================================================================
  async remove(tenantId: string, userId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Only draft AP invoices can be deleted');
    }
    await this.prisma.apInvoice.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'AP Invoice deleted', id };
  }

  // ============================================================================
  // LINK GRN — associates a GRN with this AP Invoice (header + line auto-match)
  // ============================================================================
  async linkGrn(tenantId: string, userId: string, invoiceId: string, grnId: string) {
    const invoice = await this.findOne(tenantId, invoiceId);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Can only link GRN to a draft AP Invoice');
    }

    const grn = await this.prisma.goodsReceipt.findFirst({
      where: { id: grnId, tenantId, deletedAt: null },
      include: { lines: { where: { deletedAt: null }, include: { item: true } } },
    });
    if (!grn) throw new NotFoundException(`GRN ${grnId} not found`);
    if (grn.status === 'cancelled') throw new BadRequestException('Cannot link a cancelled GRN');

    if ((invoice as any).poId && grn.poId && (invoice as any).poId !== grn.poId) {
      throw new BadRequestException('GRN and AP Invoice are linked to different Purchase Orders');
    }

    // Auto-match lines by poLineId
    const lineUpdates: Promise<any>[] = [];
    for (const invoiceLine of (invoice as any).lines) {
      if (!invoiceLine.poLineId) continue;
      const matchingGrnLine = grn.lines.find((gl: any) => gl.poLineId === invoiceLine.poLineId);
      if (matchingGrnLine) {
        lineUpdates.push(
          this.prisma.apInvoiceLine.update({
            where: { id: invoiceLine.id },
            data: { grnLineId: matchingGrnLine.id, updatedBy: userId },
          })
        );
      }
    }

    const [updated] = await Promise.all([
      this.prisma.apInvoice.update({
        where: { id: invoiceId },
        data: { grnId, updatedBy: userId },
        include: this.defaultInclude(),
      }),
      ...lineUpdates,
    ]);

    return {
      message:      `GRN ${grn.grnNumber} linked to invoice ${invoice.invoiceNumber}`,
      matchedLines: lineUpdates.length,
      invoice:      updated,
    };
  }

  // ============================================================================
  // UNLINK GRN
  // ============================================================================
  async unlinkGrn(tenantId: string, userId: string, invoiceId: string) {
    const invoice = await this.findOne(tenantId, invoiceId);
    if (invoice.status !== 'draft') {
      throw new BadRequestException('Can only unlink GRN from a draft AP Invoice');
    }

    await this.prisma.apInvoiceLine.updateMany({
      where: { invoiceId, deletedAt: null },
      data: { grnLineId: null },
    });

    const updated = await this.prisma.apInvoice.update({
      where: { id: invoiceId },
      data: { grnId: null, updatedBy: userId },
      include: this.defaultInclude(),
    });

    return { message: 'GRN unlinked from invoice', invoice: updated };
  }

  // ============================================================================
  // GET MATCH STATUS — 3-Way Match analysis per line
  // ============================================================================
  async getMatchStatus(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.apInvoice.findFirst({
      where: { id: invoiceId, tenantId, deletedAt: null },
      include: {
        supplier:      { select: { code: true, name: true } },
        purchaseOrder: { select: { poNumber: true, status: true } },
        goodsReceipt:  { select: { grnNumber: true, status: true, receivedDate: true, condition: true } },
        lines: {
          where:   { deletedAt: null },
          orderBy: { lineNumber: 'asc' },
          include: {
            item:              { select: { code: true, name: true } },
            purchaseOrderLine: { select: { orderedQuantity: true, receivedQuantity: true, unitPrice: true } },
            goodsReceiptLine:  { select: { receivedQuantity: true, unitCost: true } },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException(`AP Invoice ${invoiceId} not found`);

    const PRICE_TOLERANCE_PCT = 2;
    const lineResults: any[] = [];
    let allLinesMatch = true;

    for (const line of invoice.lines) {
      const invoiceQty   = Number(line.quantity);
      const invoicePrice = Number(line.unitPrice);
      const poQty        = line.purchaseOrderLine ? Number(line.purchaseOrderLine.orderedQuantity) : null;
      const poPrice      = line.purchaseOrderLine ? Number(line.purchaseOrderLine.unitPrice)       : null;
      const grnQty       = line.goodsReceiptLine  ? Number(line.goodsReceiptLine.receivedQuantity) : null;

      const poQtyOk  = poQty  === null ? null : invoiceQty <= poQty  + 0.001;
      const grnQtyOk = grnQty === null ? null : invoiceQty <= grnQty + 0.001;
      const priceDiffPct = poPrice && poPrice > 0
        ? Math.abs((invoicePrice - poPrice) / poPrice) * 100
        : null;
      const priceOk = priceDiffPct === null ? null : priceDiffPct <= PRICE_TOLERANCE_PCT;

      const lineMatches = (poQtyOk !== false) && (grnQtyOk !== false) && (priceOk !== false);
      if (!lineMatches) allLinesMatch = false;

      lineResults.push({
        lineNumber:   line.lineNumber,
        itemCode:     (line.item as any)?.code ?? null,
        itemName:     (line.item as any)?.name ?? null,
        invoiceQty,
        invoicePrice,
        poQty,
        poPrice,
        grnQty,
        poQtyOk,
        grnQtyOk,
        priceOk,
        priceDiffPct: priceDiffPct ? Number(priceDiffPct.toFixed(2)) : null,
        lineMatches,
        issues: [
          !poQtyOk  && poQtyOk  !== null ? `Invoice qty (${invoiceQty}) exceeds PO qty (${poQty})`         : null,
          !grnQtyOk && grnQtyOk !== null ? `Invoice qty (${invoiceQty}) exceeds GRN received (${grnQty})`  : null,
          !priceOk  && priceOk  !== null ? `Price variance ${priceDiffPct?.toFixed(1)}% exceeds ${PRICE_TOLERANCE_PCT}% tolerance` : null,
        ].filter(Boolean),
      });
    }

    const hasGrn = !!(invoice as any).grnId;
    const hasPo  = !!(invoice as any).poId;

    const matchStatus =
      !hasPo && !hasGrn              ? 'no_match'           :
      hasPo  && !hasGrn              ? 'two_way'            :
      hasPo  && hasGrn && allLinesMatch ? 'three_way_matched' :
      hasPo  && hasGrn               ? 'three_way_failed'   :
      'two_way';

    return {
      invoiceId,
      invoiceNumber:  invoice.invoiceNumber,
      invoiceStatus:  invoice.status,
      supplier:       invoice.supplier,
      purchaseOrder:  invoice.purchaseOrder,
      goodsReceipt:   (invoice as any).goodsReceipt,
      matchStatus,
      allLinesMatch,
      priceTolerance: `${PRICE_TOLERANCE_PCT}%`,
      lines:          lineResults,
      summary: {
        total:   lineResults.length,
        matched: lineResults.filter(l => l.lineMatches).length,
        failed:  lineResults.filter(l => !l.lineMatches).length,
      },
      canPost: invoice.status === 'draft' &&
        (matchStatus === 'three_way_matched' || matchStatus === 'two_way' || matchStatus === 'no_match'),
    };
  }

  // ============================================================================
  // PRIVATE — validate 3-way match before posting
  // ============================================================================
  private async validateThreeWayMatch(tenantId: string, invoice: any): Promise<void> {
    const match = await this.getMatchStatus(tenantId, invoice.id);
    if (match.matchStatus === 'three_way_failed') {
      const failedLines = match.lines
        .filter((l: any) => !l.lineMatches)
        .map((l: any) => `Line ${l.lineNumber} (${l.itemCode}): ${l.issues.join('; ')}`)
        .join(' | ');
      throw new BadRequestException(
        `3-Way Match failed — cannot post invoice. Issues: ${failedLines}`,
      );
    }
  }

  // ============================================================================
  // PRIVATE — JE helpers
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
    const apAccount = await this.prisma.account.findFirst({
      where: { tenantId, accountNumber: '2.1.01', deletedAt: null },
    });
    if (!apAccount) {
      throw new BadRequestException('Account 2.1.01 (Accounts Payable) required for AP JE');
    }

    const entryNumber  = await this.generateJeNumber(tenantId);
    const fiscalPeriod = this.toFiscalPeriod(new Date(invoice.invoiceDate));
    const totalAmount  = Number(invoice.totalAmount);

    await this.assertPeriodOpen(tenantId, fiscalPeriod);

    const debitLines: any[] = [];
    let lineNum = 1;

    for (const line of invoice.lines) {
      const lineTotal = Number(line.lineTotal);
      if (lineTotal === 0) continue;

      let drAccountId = line.inventoryAccountId ?? line.expenseAccountId ?? null;
      if (!drAccountId) {
        const defaultAcct = await this.prisma.account.findFirst({
          where: { tenantId, accountNumber: '1.1.04', deletedAt: null },
        });
        if (!defaultAcct) throw new BadRequestException('Account 1.1.04 (Raw Material Inventory) not found');
        drAccountId = defaultAcct.id;
      }

      debitLines.push({
        lineNumber:   lineNum++,
        accountId:    drAccountId,
        description:  `AP Receipt — ${line.description ?? line.item?.name ?? 'line ' + line.lineNumber}`,
        debitAmount:  lineTotal,
        creditAmount: 0,
      });

      if (line.priceVariance && Math.abs(Number(line.priceVariance)) > 0.001) {
        const varianceAcct = await this.prisma.account.findFirst({
          where: { tenantId, accountNumber: '5.2.01', deletedAt: null },
        });
        if (varianceAcct) {
          const variance = Number(line.priceVariance);
          debitLines.push({
            lineNumber:   lineNum++,
            accountId:    varianceAcct.id,
            description:  `Price variance — ${line.description ?? 'line ' + line.lineNumber}`,
            debitAmount:  variance > 0 ? variance : 0,
            creditAmount: variance < 0 ? Math.abs(variance) : 0,
          });
        }
      }
    }

    const lines = [
      ...debitLines,
      {
        lineNumber:   lineNum,
        accountId:    apAccount.id,
        description:  `AP — Invoice ${invoice.invoiceNumber} — ${invoice.supplier?.name ?? ''}`,
        debitAmount:  0,
        creditAmount: totalAmount,
      },
    ];

    const result = await this.automation.handleAutoJe({
      tenantId, userId,
      module: 'ap_invoice', eventType: 'ap_invoice',
      sourceType: 'ap_invoice', sourceId: invoice.id, sourceRef: invoice.invoiceNumber,
      jeData: {
        entryNumber,
        entryDate:    new Date(invoice.invoiceDate),
        fiscalPeriod,
        journalType:  'ap_invoice',
        reference:    invoice.invoiceNumber,
        description:  `AP Invoice — ${invoice.invoiceNumber} — ${invoice.supplier?.name ?? ''}`,
        lines,
      },
    });

    return result.je;
  }

  private async createPaymentJe(tenantId: string, userId: string, invoice: any, dto: ApplyApPaymentDto) {
    const apAccount   = await this.prisma.account.findFirst({ where: { tenantId, accountNumber: '2.1.01', deletedAt: null } });
    const cashAccount = await this.prisma.account.findFirst({ where: { tenantId, accountNumber: '1.1.02', deletedAt: null } });
    if (!apAccount || !cashAccount) {
      throw new BadRequestException('Accounts 2.1.01 (AP) and 1.1.02 (Cash) required for payment JE');
    }

    const entryNumber  = await this.generateJeNumber(tenantId);
    const fiscalPeriod = this.toFiscalPeriod(new Date(dto.paymentDate));
    await this.assertPeriodOpen(tenantId, fiscalPeriod);

    const result = await this.automation.handleAutoJe({
      tenantId, userId,
      module: 'ap_payment', eventType: 'ap_payment',
      sourceType: 'ap_invoice', sourceId: invoice.id, sourceRef: invoice.invoiceNumber,
      jeData: {
        entryNumber,
        entryDate:    new Date(dto.paymentDate),
        fiscalPeriod,
        journalType:  'ap_payment',
        reference:    dto.reference ?? invoice.invoiceNumber,
        description:  `AP Payment — Invoice ${invoice.invoiceNumber} — ${invoice.supplier?.name ?? ''}`,
        lines: [
          { lineNumber: 1, accountId: apAccount.id,   description: `AP cleared — Inv ${invoice.invoiceNumber}`, debitAmount: dto.amount,    creditAmount: 0 },
          { lineNumber: 2, accountId: cashAccount.id, description: `Cash paid — Inv ${invoice.invoiceNumber}`,  debitAmount: 0,             creditAmount: dto.amount },
        ],
      },
    });

    return result.je;
  }

  private async createReversalJe(tenantId: string, userId: string, invoice: any) {
    const original = await this.prisma.journalEntry.findFirst({
      where: { id: invoice.jeId },
      include: { lines: true },
    });
    if (!original) return;

    const entryNumber   = await this.generateJeNumber(tenantId);
    const fiscalPeriod  = this.toFiscalPeriod(new Date());
    const reversedLines = original.lines.map((line, i) => ({
      lineNumber:   i + 1,
      accountId:    line.accountId,
      description:  `REVERSAL — ${line.description}`,
      debitAmount:  Number(line.creditAmount),
      creditAmount: Number(line.debitAmount),
    }));

    const result = await this.automation.handleAutoJe({
      tenantId, userId,
      module: 'ap_reversal', eventType: 'ap_reversal',
      sourceType: 'ap_invoice', sourceId: invoice.id, sourceRef: invoice.invoiceNumber,
      jeData: {
        entryNumber,
        entryDate:    new Date(),
        fiscalPeriod,
        journalType:  'ap_reversal',
        reference:    invoice.invoiceNumber,
        description:  `VOID reversal — AP Invoice ${invoice.invoiceNumber}`,
        lines: reversedLines,
      },
    });

    return result.je;
  }

  // ============================================================================
  // PRIVATE — includes & number generators
  // ============================================================================

  private defaultInclude() {
    return {
      supplier:      { select: { id: true, code: true, name: true, email: true } },
      purchaseOrder: { select: { id: true, poNumber: true } },
      goodsReceipt:  { select: { id: true, grnNumber: true, status: true, receivedDate: true } },
      lines: {
        include: {
          item:              { select: { id: true, code: true, name: true } },
          goodsReceiptLine:  { select: { id: true, receivedQuantity: true, unitCost: true } },
        },
        orderBy: { lineNumber: 'asc' as const },
      },
      payments: { orderBy: { paymentDate: 'asc' as const } },
    };
  }

  private async generateInvoiceNumber(tenantId: string, date?: Date): Promise<string> {
    const prefix = `APINV-${(date ?? new Date()).getFullYear()}`;
    const last   = await this.prisma.apInvoice.findFirst({
      where: { tenantId, invoiceNumber: { startsWith: prefix } }, orderBy: { invoiceNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts = last.invoiceNumber.split('-');
    return `${prefix}-${(parseInt(parts[parts.length - 1]) + 1).toString().padStart(4, '0')}`;
  }

  private async generatePaymentNumber(tenantId: string, date?: Date): Promise<string> {
    const prefix = `APPAY-${(date ?? new Date()).getFullYear()}`;
    const last   = await this.prisma.apPayment.findFirst({
      where: { tenantId, paymentNumber: { startsWith: prefix } }, orderBy: { paymentNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts = last.paymentNumber.split('-');
    return `${prefix}-${(parseInt(parts[parts.length - 1]) + 1).toString().padStart(4, '0')}`;
  }

  private async generateJeNumber(tenantId: string): Promise<string> {
    const now    = new Date();
    const prefix = `JE-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    const last   = await this.prisma.journalEntry.findFirst({
      where: { tenantId, entryNumber: { startsWith: prefix } }, orderBy: { entryNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts = last.entryNumber.split('-');
    return `${prefix}-${(parseInt(parts[parts.length - 1]) + 1).toString().padStart(4, '0')}`;
  }

  private toFiscalPeriod(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }
}