import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { UpdateRfqDto } from './dto/update-rfq.dto';
import { SubmitRfqResponseDto } from './dto/submit-rfq-response.dto';
import { AwardRfqDto } from './dto/award-rfq.dto';

@Injectable()
export class RfqsService {
  constructor(private prisma: PrismaService) {}

  // ── Auto-generate RFQ number ───────────────────────────────────────────────

  private async generateRfqNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RFQ-${year}`;
    const last = await this.prisma.rfq.findFirst({
      where: { tenantId, rfqNumber: { startsWith: prefix } },
      orderBy: { rfqNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts = last.rfqNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  }

  private async generatePoNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}`;
    const last = await this.prisma.purchaseOrder.findFirst({
      where: { tenantId, poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts = last.poNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateRfqDto) {
    // Validate suppliers
    for (const supplierId of dto.supplierIds) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: supplierId, tenantId, deletedAt: null },
      });
      if (!supplier) throw new NotFoundException(`Supplier ${supplierId} not found`);
    }

    // Validate items
    for (const line of dto.lines) {
      if (line.itemId) {
        const item = await this.prisma.item.findFirst({
          where: { id: line.itemId, tenantId, deletedAt: null },
        });
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
      }
    }

    const rfqNumber = await this.generateRfqNumber(tenantId);

    return this.prisma.rfq.create({
      data: {
        tenantId,
        rfqNumber,
        title: dto.title,
        currency: dto.currency ?? 'USD',
        responseDeadline: dto.responseDeadline ? new Date(dto.responseDeadline) : null,
        prId: dto.prId,
        gnId: dto.gnId,
        status: 'draft',
        notes: dto.notes,
        createdBy: userId,
        updatedBy: userId,
        // Create supplier invitations
        rfqSuppliers: {
          create: dto.supplierIds.map((supplierId) => ({
            tenantId,
            supplierId,
            status: 'invited',
            createdBy: userId,
            updatedBy: userId,
          })),
        },
        // Create lines
        lines: {
          create: dto.lines.map((line, index) => ({
            tenantId,
            lineNumber: index + 1,
            itemId: line.itemId,
            genericDescription: line.genericDescription,
            quantity: line.quantity,
            uom: line.uom,
            requiredDate: new Date(line.requiredDate),
            prLineId: line.prLineId,
            gnLineId: line.gnLineId,
            status: 'open',
            notes: line.notes,
            createdBy: userId,
            updatedBy: userId,
          })),
        },
      },
      include: this.rfqInclude(),
    });
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, status?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (status) where.status = status;

    return this.prisma.rfq.findMany({
      where,
      include: {
        _count: { select: { lines: true, rfqSuppliers: true } },
        rfqSuppliers: {
          select: {
            id: true,
            status: true,
            supplier: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { issueDate: 'desc' },
    });
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const rfq = await this.prisma.rfq.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.rfqInclude(),
    });
    if (!rfq) throw new NotFoundException(`RFQ ${id} not found`);
    return rfq;
  }

  // ── Update header ──────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateRfqDto) {
    const rfq = await this.findOne(tenantId, id);
    if (!['draft', 'sent'].includes(rfq.status)) {
      throw new BadRequestException('Can only update draft or sent RFQs');
    }

    return this.prisma.rfq.update({
      where: { id },
      data: {
        ...dto,
        responseDeadline: dto.responseDeadline ? new Date(dto.responseDeadline) : undefined,
        updatedBy: userId,
      },
      include: this.rfqInclude(),
    });
  }

  // ── Send RFQ to suppliers ──────────────────────────────────────────────────

  async send(tenantId: string, userId: string, id: string) {
    const rfq = await this.findOne(tenantId, id);
    if (rfq.status !== 'draft') {
      throw new BadRequestException('Only draft RFQs can be sent');
    }
    if ((rfq as any).rfqSuppliers.length === 0) {
      throw new BadRequestException('RFQ must have at least one supplier invited');
    }
    if ((rfq as any).lines.length === 0) {
      throw new BadRequestException('RFQ must have at least one line');
    }

    // Mark all invited suppliers as sent
    await this.prisma.rfqSupplier.updateMany({
      where: { rfqId: id, status: 'invited' },
      data: { status: 'sent', sentAt: new Date(), updatedBy: userId },
    });

    const updated = await this.prisma.rfq.update({
      where: { id },
      data: { status: 'sent', updatedBy: userId },
      include: this.rfqInclude(),
    });

    return {
      message: `RFQ ${rfq.rfqNumber} sent to ${(rfq as any).rfqSuppliers.length} suppliers`,
      rfq: updated,
    };
  }

  // ── Submit supplier response ───────────────────────────────────────────────

  async submitResponse(tenantId: string, userId: string, rfqId: string, dto: SubmitRfqResponseDto) {
    const rfq = await this.findOne(tenantId, rfqId);
    if (rfq.status !== 'sent') {
      throw new BadRequestException('Responses can only be submitted for sent RFQs');
    }

    const rfqSupplier = await this.prisma.rfqSupplier.findFirst({
      where: { id: dto.rfqSupplierId, rfqId, tenantId },
    });
    if (!rfqSupplier) throw new NotFoundException(`RFQ Supplier ${dto.rfqSupplierId} not found`);

    // Validate all rfqLineIds exist on this RFQ
    for (const responseLine of dto.lines) {
      const rfqLine = await this.prisma.rfqLine.findFirst({
        where: { id: responseLine.rfqLineId, rfqId, tenantId },
      });
      if (!rfqLine) throw new NotFoundException(`RFQ Line ${responseLine.rfqLineId} not found`);
    }

    // Upsert response lines (allow re-submission)
    const responseLines = await Promise.all(
      dto.lines.map((line) =>
        this.prisma.rfqResponseLine.upsert({
          where: {
            rfqSupplierId_rfqLineId: {
              rfqSupplierId: dto.rfqSupplierId,
              rfqLineId: line.rfqLineId,
            },
          },
          create: {
            tenantId,
            rfqSupplierId: dto.rfqSupplierId,
            rfqLineId: line.rfqLineId,
            offeredQty: line.offeredQty,
            uom: line.uom,
            unitPrice: line.unitPrice,
            leadTimeDays: line.leadTimeDays,
            validUntil: line.validUntil ? new Date(line.validUntil) : null,
            packSize: line.packSize,
            moq: line.moq,
            notes: line.notes,
            createdBy: userId,
            updatedBy: userId,
          },
          update: {
            offeredQty: line.offeredQty,
            uom: line.uom,
            unitPrice: line.unitPrice,
            leadTimeDays: line.leadTimeDays,
            validUntil: line.validUntil ? new Date(line.validUntil) : null,
            packSize: line.packSize,
            moq: line.moq,
            notes: line.notes,
            updatedBy: userId,
          },
        }),
      ),
    );

    // Calculate total offered amount
    const totalOfferedAmount = responseLines.reduce(
      (sum, rl) => sum + Number(rl.unitPrice) * Number(rl.offeredQty),
      0,
    );

    // Mark supplier as responded
    await this.prisma.rfqSupplier.update({
      where: { id: dto.rfqSupplierId },
      data: { status: 'responded', respondedAt: new Date(), totalOfferedAmount, updatedBy: userId },
    });

    // Check if all suppliers responded → update RFQ status
    const pendingSuppliers = await this.prisma.rfqSupplier.count({
      where: { rfqId, status: { in: ['invited', 'sent'] } },
    });

    await this.prisma.rfq.update({
      where: { id: rfqId },
      data: {
        status: pendingSuppliers === 0 ? 'fully_responded' : 'partial_response',
        updatedBy: userId,
      },
    });

    return { message: 'Response submitted successfully', linesRecorded: responseLines.length };
  }

  // ── Award lines and generate POs ──────────────────────────────────────────

  async award(tenantId: string, userId: string, rfqId: string, dto: AwardRfqDto) {
    const rfq = await this.findOne(tenantId, rfqId);
    if (!['partial_response', 'fully_responded'].includes(rfq.status)) {
      throw new BadRequestException('RFQ must have at least partial responses to award');
    }

    // Validate all awards reference valid response lines on this RFQ
    for (const a of dto.awards) {
      const responseLine = await this.prisma.rfqResponseLine.findFirst({
        where: { id: a.rfqResponseLineId, rfqLineId: a.rfqLineId },
        include: { rfqSupplier: { select: { supplierId: true } } },
      });
      if (!responseLine) {
        throw new NotFoundException(`Response line ${a.rfqResponseLineId} not found`);
      }
    }

    // Group awards by supplier to create one PO per supplier
    const awardsBySupplier = new Map<string, typeof dto.awards>();

    for (const a of dto.awards) {
      const responseLine = await this.prisma.rfqResponseLine.findFirst({
        where: { id: a.rfqResponseLineId },
        include: { rfqSupplier: { select: { supplierId: true } } },
      });
      const supplierId = responseLine!.rfqSupplier.supplierId;

      if (!awardsBySupplier.has(supplierId)) awardsBySupplier.set(supplierId, []);
      awardsBySupplier.get(supplierId)!.push(a);
    }

    const createdPos: any[] = [];

    for (const [supplierId, awards] of awardsBySupplier) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: supplierId, tenantId },
      });

      const poNumber = await this.generatePoNumber(tenantId);

      // Build PO lines from awarded response lines
      const poLines: any[] = [];
      let subtotal = 0;

      for (let i = 0; i < awards.length; i++) {
        const a = awards[i];
        const responseLine = await this.prisma.rfqResponseLine.findFirst({
          where: { id: a.rfqResponseLineId },
          include: { rfqLine: true },
        });

        const qty = a.awardedQty ?? Number(responseLine!.offeredQty);
        const lineTotal = qty * Number(responseLine!.unitPrice);
        subtotal += lineTotal;

        poLines.push({
          tenantId,
          lineNumber: i + 1,
          itemId: responseLine!.rfqLine.itemId!,
          orderedQuantity: qty,
          receivedQuantity: 0,
          uom: responseLine!.uom,
          unitPrice: responseLine!.unitPrice,
          discountPercent: 0,
          lineTotal,
          expectedDate: responseLine!.rfqLine.requiredDate,
          status: 'open',
          createdBy: userId,
          updatedBy: userId,
        });

        // Mark response line as awarded
        await this.prisma.rfqResponseLine.update({
          where: { id: a.rfqResponseLineId },
          data: { isAwarded: true, awardedQty: qty, updatedBy: userId },
        });

        // Update RFQ line with award info
        await this.prisma.rfqLine.update({
          where: { id: a.rfqLineId },
          data: {
            status: 'awarded',
            awardedSupplierId: supplierId,
            awardedResponseLineId: a.rfqResponseLineId,
            awardedUnitPrice: responseLine!.unitPrice,
            awardedQty: qty,
            updatedBy: userId,
          },
        });
      }

      // Create PO
      const po = await this.prisma.purchaseOrder.create({
        data: {
          tenantId,
          poNumber,
          supplierId,
          rfqId,
          poDate: new Date(),
          currency: rfq.currency,
          exchangeRate: 1,
          subtotal,
          discountAmount: 0,
          taxAmount: 0,
          total: subtotal,
          paymentTerms: supplier!.paymentTerms,
          status: 'draft',
          notes: `Generated from RFQ ${rfq.rfqNumber}`,
          createdBy: userId,
          updatedBy: userId,
          lines: { create: poLines },
        },
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          lines: { include: { item: { select: { id: true, code: true, name: true } } } },
        },
      });

      // Link RFQ lines to PO lines
      for (let i = 0; i < awards.length; i++) {
        await this.prisma.rfqLine.update({
          where: { id: awards[i].rfqLineId },
          data: { poLineId: po.lines[i].id, updatedBy: userId },
        });
      }

      // Mark RFQ supplier as awarded
      const rfqSupplier = await this.prisma.rfqSupplier.findFirst({
        where: { rfqId, supplierId },
      });
      if (rfqSupplier) {
        await this.prisma.rfqSupplier.update({
          where: { id: rfqSupplier.id },
          data: { status: 'awarded', updatedBy: userId },
        });
      }

      createdPos.push(po);
    }

    // Update RFQ status to awarded
    await this.prisma.rfq.update({
      where: { id: rfqId },
      data: { status: 'awarded', awardedAt: new Date(), awardedBy: userId, updatedBy: userId },
    });

    return {
      message: `RFQ ${rfq.rfqNumber} awarded — ${createdPos.length} PO(s) created`,
      purchaseOrders: createdPos.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
      })),
    };
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  async cancel(tenantId: string, userId: string, id: string) {
    const rfq = await this.findOne(tenantId, id);
    if (rfq.status === 'awarded') {
      throw new BadRequestException(
        'Cannot cancel an awarded RFQ — cancel the generated POs instead',
      );
    }

    const updated = await this.prisma.rfq.update({
      where: { id },
      data: { status: 'cancelled', updatedBy: userId },
    });

    return { message: `RFQ ${rfq.rfqNumber} cancelled`, rfq: updated };
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    const rfq = await this.findOne(tenantId, id);
    if (rfq.status !== 'draft') {
      throw new BadRequestException('Can only delete draft RFQs');
    }

    await this.prisma.rfq.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    return { message: 'RFQ deleted successfully', id };
  }

  // ── Comparison view ────────────────────────────────────────────────────────
  // Returns a matrix: line × supplier → response

  async getComparison(tenantId: string, id: string) {
    const rfq = await this.findOne(tenantId, id);

    const lines = (rfq as any).lines;
    const suppliers = (rfq as any).rfqSuppliers;

    const matrix = lines.map((line: any) => ({
      lineId: line.id,
      lineNumber: line.lineNumber,
      itemId: line.itemId,
      itemName: line.item?.name ?? line.genericDescription,
      quantity: line.quantity,
      uom: line.uom,
      requiredDate: line.requiredDate,
      status: line.status,
      offers: suppliers.map((rs: any) => {
        const responseLine = line.responseLines?.find((rl: any) => rl.rfqSupplierId === rs.id);
        return {
          supplierId: rs.supplier.id,
          supplierName: rs.supplier.name,
          supplierCode: rs.supplier.code,
          rfqSupplierId: rs.id,
          supplierStatus: rs.status,
          responseLineId: responseLine?.id ?? null,
          offeredQty: responseLine?.offeredQty ?? null,
          unitPrice: responseLine?.unitPrice ?? null,
          leadTimeDays: responseLine?.leadTimeDays ?? null,
          validUntil: responseLine?.validUntil ?? null,
          moq: responseLine?.moq ?? null,
          isAwarded: responseLine?.isAwarded ?? false,
          notes: responseLine?.notes ?? null,
        };
      }),
    }));

    return {
      rfqId: rfq.id,
      rfqNumber: rfq.rfqNumber,
      status: rfq.status,
      currency: rfq.currency,
      matrix,
    };
  }

  // ── Private include helper ─────────────────────────────────────────────────

  private rfqInclude() {
    return {
      purchaseRequisition: { select: { id: true, prNumber: true } },
      generalNeed: { select: { id: true, gnNumber: true } },
      lines: {
        where: { deletedAt: null },
        include: {
          item: { select: { id: true, code: true, name: true } },
          awardedSupplier: { select: { id: true, code: true, name: true } },
          responseLines: {
            include: {
              rfqSupplier: {
                select: {
                  id: true,
                  supplierId: true,
                  supplier: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { lineNumber: 'asc' as const },
      },
      rfqSuppliers: {
        include: {
          supplier: {
            select: { id: true, code: true, name: true, contactName: true, contactEmail: true },
          },
          responseLines: {
            select: {
              id: true,
              rfqLineId: true,
              unitPrice: true,
              offeredQty: true,
              isAwarded: true,
            },
          },
        },
      },
    };
  }
}
