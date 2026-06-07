import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { UpdateRfqDto } from './dto/update-rfq.dto';
import { SubmitRfqResponseDto } from './dto/submit-rfq-response.dto';
import { AwardRfqDto } from './dto/award-rfq.dto';

// RFQ lifecycle state machine (spec-020) — the single status authority.
// send/submitResponse/award/cancel all move along these edges only.
const RFQ_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['partial_response', 'fully_responded', 'cancelled'],
  partial_response: ['partial_response', 'fully_responded', 'awarded', 'cancelled'],
  fully_responded: ['awarded', 'cancelled'],
  // awarded / cancelled are terminal
};

@Injectable()
export class RfqsService {
  constructor(
    private prisma: PrismaService,
    private purchaseOrders: PurchaseOrdersService,
    private notifications: NotificationsService,
  ) {}

  private assertTransition(current: string, target: string) {
    const allowed = RFQ_TRANSITIONS[current] ?? [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Cannot transition RFQ from '${current}' to '${target}'. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }
  }

  // ── Auto-generate RFQ number ───────────────────────────────────────────────

  // Public shared API (spec-020): PurchaseRequisitionsService injects this for
  // convert-to-rfq. Numeric max over findMany; spans soft-deleted rows (spec-012).
  async generateRfqNumber(tenantId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const db = tx ?? this.prisma;
    const year = new Date().getFullYear();
    const prefix = `RFQ-${year}`;
    const existing = await db.rfq.findMany({
      where: { tenantId, rfqNumber: { startsWith: prefix } },
      select: { rfqNumber: true },
    });
    const max = existing.reduce((m, r) => {
      const parts = r.rfqNumber.split('-');
      const n = parseInt(parts[parts.length - 1], 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${(max + 1).toString().padStart(4, '0')}`;
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

    try {
      return await this.prisma.rfq.create({
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
    } catch (e) {
      // @@unique([tenantId, rfqNumber]) can race on concurrent creates.
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          `RFQ number ${rfqNumber} was just taken by a concurrent request. Please retry.`,
        );
      }
      throw e;
    }
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, status?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (status) where.status = status;

    const rfqs = await this.prisma.rfq.findMany({
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

    return { rfqs, count: rfqs.length };
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

    await this.prisma.rfq.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...dto,
        responseDeadline: dto.responseDeadline ? new Date(dto.responseDeadline) : undefined,
        updatedBy: userId,
      },
    });

    return this.findOne(tenantId, id);
  }

  // ── Send RFQ to suppliers ──────────────────────────────────────────────────

  async send(tenantId: string, userId: string, id: string) {
    const rfq = await this.findOne(tenantId, id);
    this.assertTransition(rfq.status, 'sent');
    if ((rfq as any).rfqSuppliers.length === 0) {
      throw new BadRequestException('RFQ must have at least one supplier invited');
    }
    if ((rfq as any).lines.length === 0) {
      throw new BadRequestException('RFQ must have at least one line');
    }

    // Mark all invited suppliers as sent
    await this.prisma.rfqSupplier.updateMany({
      where: { rfqId: id, tenantId, status: 'invited' },
      data: { status: 'sent', sentAt: new Date(), updatedBy: userId },
    });

    await this.prisma.rfq.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { status: 'sent', updatedBy: userId },
    });

    // spec-022 — fire-and-forget: invite every supplier with an email on file.
    const invited = await this.prisma.rfqSupplier.findMany({
      where: { rfqId: id, tenantId },
      include: { supplier: { select: { name: true, email: true, contactEmail: true } } },
    });
    const dueDate = (rfq as any).responseDeadline
      ? new Date((rfq as any).responseDeadline).toISOString().split('T')[0]
      : 'TBD';
    for (const inv of invited) {
      const email = inv.supplier?.contactEmail ?? inv.supplier?.email;
      if (!email) continue;
      this.notifications.safeQueue(
        tenantId,
        'rfq_sent',
        { email, name: inv.supplier?.name },
        {
          rfqNumber: rfq.rfqNumber,
          rfqTitle: (rfq as any).title,
          supplierName: inv.supplier?.name,
          dueDate,
        },
        { createdBy: userId },
      );
    }

    return {
      message: `RFQ ${rfq.rfqNumber} sent to ${(rfq as any).rfqSuppliers.length} suppliers`,
      rfq: await this.findOne(tenantId, id),
    };
  }

  // ── Submit supplier response ───────────────────────────────────────────────

  async submitResponse(tenantId: string, userId: string, rfqId: string, dto: SubmitRfqResponseDto) {
    const rfq = await this.findOne(tenantId, rfqId);
    // Responses are valid while sent OR partial_response — the old sent-only
    // guard locked out every remaining supplier after the first response.
    if (!['sent', 'partial_response'].includes(rfq.status)) {
      throw new BadRequestException(
        'Responses can only be submitted while the RFQ is sent or partially responded',
      );
    }

    const rfqSupplier = await this.prisma.rfqSupplier.findFirst({
      where: { id: dto.rfqSupplierId, rfqId, tenantId },
    });
    if (!rfqSupplier) throw new NotFoundException(`RFQ Supplier ${dto.rfqSupplierId} not found`);
    // Re-submission is fine (responded), but awarded/declined suppliers are done.
    if (!['invited', 'sent', 'responded'].includes(rfqSupplier.status)) {
      throw new BadRequestException(
        `Supplier in status '${rfqSupplier.status}' can no longer submit a response`,
      );
    }

    // Validate all rfqLineIds exist on this RFQ
    for (const responseLine of dto.lines) {
      const rfqLine = await this.prisma.rfqLine.findFirst({
        where: { id: responseLine.rfqLineId, rfqId, tenantId },
      });
      if (!rfqLine) throw new NotFoundException(`RFQ Line ${responseLine.rfqLineId} not found`);
    }

    let linesRecorded = 0;
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Upsert response lines (allow re-submission)
      const responseLines = await Promise.all(
        dto.lines.map((line) =>
          tx.rfqResponseLine.upsert({
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
      linesRecorded = responseLines.length;

      // Calculate total offered amount
      const totalOfferedAmount = responseLines.reduce(
        (sum, rl) => sum + Number(rl.unitPrice) * Number(rl.offeredQty),
        0,
      );

      // Mark supplier as responded (tenant-scoped at the write itself)
      await tx.rfqSupplier.updateMany({
        where: { id: dto.rfqSupplierId, tenantId },
        data: {
          status: 'responded',
          respondedAt: new Date(),
          totalOfferedAmount,
          updatedBy: userId,
        },
      });

      // All suppliers responded → fully_responded, else partial_response —
      // both along map edges from sent/partial_response.
      const pendingSuppliers = await tx.rfqSupplier.count({
        where: { rfqId, tenantId, status: { in: ['invited', 'sent'] } },
      });
      const target = pendingSuppliers === 0 ? 'fully_responded' : 'partial_response';
      this.assertTransition(rfq.status, target);

      await tx.rfq.updateMany({
        where: { id: rfqId, tenantId, deletedAt: null },
        data: { status: target, updatedBy: userId },
      });
    });

    return { message: 'Response submitted successfully', linesRecorded };
  }

  // ── Award lines and generate POs ──────────────────────────────────────────

  async award(tenantId: string, userId: string, rfqId: string, dto: AwardRfqDto) {
    const rfq = await this.findOne(tenantId, rfqId);
    this.assertTransition(rfq.status, 'awarded');

    // Validate every award id in-tenant AND in-RFQ before any write (the DTO ids
    // were previously trusted verbatim — a cross-tenant injection hole).
    const validated: Array<{ award: (typeof dto.awards)[number]; responseLine: any }> = [];
    for (const a of dto.awards) {
      const responseLine = await this.prisma.rfqResponseLine.findFirst({
        where: { id: a.rfqResponseLineId, rfqLineId: a.rfqLineId, tenantId },
        include: { rfqLine: true },
      });
      if (!responseLine || responseLine.rfqLine.rfqId !== rfqId) {
        throw new NotFoundException(`Response line ${a.rfqResponseLineId} not found on this RFQ`);
      }
      if (responseLine.rfqLine.status === 'awarded') {
        throw new ConflictException(
          `RFQ line ${responseLine.rfqLine.lineNumber ?? a.rfqLineId} is already awarded`,
        );
      }
      validated.push({ award: a, responseLine });
    }

    // Group awards by supplier (via the tenant-scoped rfqSupplier) — the awarded
    // response must come from a supplier that actually responded.
    const awardsBySupplier = new Map<
      string,
      Array<{ award: (typeof dto.awards)[number]; responseLine: any }>
    >();
    for (const v of validated) {
      const rfqSupplier = await this.prisma.rfqSupplier.findFirst({
        where: { id: v.responseLine.rfqSupplierId, rfqId, tenantId },
      });
      if (!rfqSupplier) {
        throw new NotFoundException(`RFQ supplier for response ${v.responseLine.id} not found`);
      }
      if (rfqSupplier.status !== 'responded') {
        throw new BadRequestException(
          `Supplier in status '${rfqSupplier.status}' cannot be awarded — it has not responded`,
        );
      }
      const supplierId = rfqSupplier.supplierId;
      if (!awardsBySupplier.has(supplierId)) awardsBySupplier.set(supplierId, []);
      awardsBySupplier.get(supplierId)!.push(v);
    }

    const createdPos: any[] = [];

    // Atomic: POs + response/line/supplier/RFQ updates commit together. PO
    // numbers come from the owning module's shared tx-aware generator.
    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const [supplierId, awards] of awardsBySupplier) {
          const supplier = await tx.supplier.findFirst({
            where: { id: supplierId, tenantId, deletedAt: null },
          });
          if (!supplier) throw new NotFoundException(`Supplier ${supplierId} not found`);

          const poNumber = await this.purchaseOrders.generatePoNumber(tenantId, tx);

          // Build PO lines from awarded response lines
          const poLines: any[] = [];
          let subtotal = 0;

          for (let i = 0; i < awards.length; i++) {
            const { award: a, responseLine } = awards[i];

            const qty = a.awardedQty ?? Number(responseLine.offeredQty);
            const lineTotal = qty * Number(responseLine.unitPrice);
            subtotal += lineTotal;

            poLines.push({
              tenantId,
              lineNumber: i + 1,
              itemId: responseLine.rfqLine.itemId!,
              orderedQuantity: qty,
              receivedQuantity: 0,
              uom: responseLine.uom,
              unitPrice: responseLine.unitPrice,
              discountPercent: 0,
              lineTotal,
              expectedDate: responseLine.rfqLine.requiredDate,
              status: 'open',
              createdBy: userId,
              updatedBy: userId,
            });

            // Mark response line as awarded
            await tx.rfqResponseLine.updateMany({
              where: { id: a.rfqResponseLineId, tenantId },
              data: { isAwarded: true, awardedQty: qty, updatedBy: userId },
            });

            // Update RFQ line with award info
            await tx.rfqLine.updateMany({
              where: { id: a.rfqLineId, tenantId, deletedAt: null },
              data: {
                status: 'awarded',
                awardedSupplierId: supplierId,
                awardedResponseLineId: a.rfqResponseLineId,
                awardedUnitPrice: responseLine.unitPrice,
                awardedQty: qty,
                updatedBy: userId,
              },
            });
          }

          // Create PO (PurchaseOrder is owned by purchase-orders — direct write
          // inside the cluster tx is a documented spec-020 exception).
          const po = await tx.purchaseOrder.create({
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
              paymentTerms: supplier.paymentTerms,
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
            await tx.rfqLine.updateMany({
              where: { id: awards[i].award.rfqLineId, tenantId, deletedAt: null },
              data: { poLineId: po.lines[i].id, updatedBy: userId },
            });
          }

          // Mark RFQ supplier as awarded
          const rfqSupplier = await tx.rfqSupplier.findFirst({
            where: { rfqId, supplierId, tenantId },
          });
          if (rfqSupplier) {
            await tx.rfqSupplier.updateMany({
              where: { id: rfqSupplier.id, tenantId },
              data: { status: 'awarded', updatedBy: userId },
            });
          }

          createdPos.push(po);
        }

        // Update RFQ status to awarded (map edge asserted above)
        await tx.rfq.updateMany({
          where: { id: rfqId, tenantId, deletedAt: null },
          data: { status: 'awarded', awardedAt: new Date(), awardedBy: userId, updatedBy: userId },
        });
      });
    } catch (e) {
      // PO-number unique can race with concurrent awards/creates.
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          'A purchase-order number was just taken by a concurrent request. Please retry the award.',
        );
      }
      throw e;
    }

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
    this.assertTransition(rfq.status, 'cancelled');

    await this.prisma.rfq.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { status: 'cancelled', updatedBy: userId },
    });

    return {
      message: `RFQ ${rfq.rfqNumber} cancelled`,
      rfq: await this.findOne(tenantId, id),
    };
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    const rfq = await this.findOne(tenantId, id);
    if (rfq.status !== 'draft') {
      throw new BadRequestException('Can only delete draft RFQs');
    }

    await this.prisma.rfq.updateMany({
      where: { id, tenantId, deletedAt: null },
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
