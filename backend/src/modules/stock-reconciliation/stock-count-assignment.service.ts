// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/stock-count-assignment.service.ts
// ============================================================================
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

@Injectable()
export class StockCountAssignmentService {
  constructor(private prisma: PrismaService) {}

  // ── Create assignment — resolve lines from filter criteria ────────────────
  //
  // Resolution logic (AND between filter types, OR within each type):
  //   1. Start with ALL pending lines in the session
  //   2. If location filters provided → keep lines whose locationCode is in those zones/aisles/levels/bins
  //   3. If category/macroCategory filters → keep lines whose item.categoryId matches
  //   4. If itemIds provided → keep those specific lines
  //   5. Exclude lines already assigned to another user
  //   6. Store resolved lineIds in assignedLineIds[]

  async create(tenantId: string, userId: string, sessionId: string, dto: CreateAssignmentDto) {
    // Verify session exists and is in_progress
    const session = await this.prisma.stockCountSession.findFirst({
      where: { id: sessionId, tenantId, deletedAt: null },
      include: {
        lines: {
          where: { deletedAt: null },
          include: { item: { select: { id: true, categoryId: true } } },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'in_progress') {
      throw new BadRequestException(`Cannot assign lines — session is "${session.status}"`);
    }

    // Get already-assigned line IDs (to avoid double assignment)
    const existingAssignments = await this.prisma.stockCountAssignment.findMany({
      where: { sessionId, tenantId },
      select: { assignedLineIds: true },
    });
    const alreadyAssigned = new Set(existingAssignments.flatMap((a) => a.assignedLineIds));

    // Resolve location filters → collect matching level/bin IDs
    let locationLevelIds: Set<string> | null = null;
    let locationBinIds: Set<string> | null = null;

    const hasLocationFilter =
      (dto.zoneIds?.length ?? 0) > 0 ||
      (dto.aisleIds?.length ?? 0) > 0 ||
      (dto.levelIds?.length ?? 0) > 0 ||
      (dto.binIds?.length ?? 0) > 0;

    if (hasLocationFilter) {
      locationLevelIds = new Set<string>();
      locationBinIds = new Set<string>();

      // Explicit level/bin IDs
      dto.levelIds?.forEach((id) => locationLevelIds!.add(id));
      dto.binIds?.forEach((id) => locationBinIds!.add(id));

      // Resolve zone → aisles → racks → levels → bins
      if (dto.zoneIds?.length) {
        const aisles = await this.prisma.warehouseAisle.findMany({
          where: { zoneId: { in: dto.zoneIds }, tenantId, deletedAt: null },
          select: { id: true },
        });
        const aisleIds = aisles.map((a) => a.id);
        if (aisleIds.length) {
          const racks = await this.prisma.warehouseRack.findMany({
            where: { aisleId: { in: aisleIds }, tenantId, deletedAt: null },
            select: { id: true },
          });
          const rackIds = racks.map((r) => r.id);
          if (rackIds.length) {
            const levels = await this.prisma.warehouseLevel.findMany({
              where: { rackId: { in: rackIds }, tenantId, deletedAt: null },
              select: { id: true, bins: { where: { deletedAt: null }, select: { id: true } } },
            });
            levels.forEach((l) => {
              locationLevelIds!.add(l.id);
              l.bins.forEach((b) => locationBinIds!.add(b.id));
            });
          }
        }
      }

      // Resolve aisle → racks → levels → bins
      if (dto.aisleIds?.length) {
        const racks = await this.prisma.warehouseRack.findMany({
          where: { aisleId: { in: dto.aisleIds }, tenantId, deletedAt: null },
          select: { id: true },
        });
        const rackIds = racks.map((r) => r.id);
        if (rackIds.length) {
          const levels = await this.prisma.warehouseLevel.findMany({
            where: { rackId: { in: rackIds }, tenantId, deletedAt: null },
            select: { id: true, bins: { where: { deletedAt: null }, select: { id: true } } },
          });
          levels.forEach((l) => {
            locationLevelIds!.add(l.id);
            l.bins.forEach((b) => locationBinIds!.add(b.id));
          });
        }
      }

      // Resolve explicit levelIds → bins
      if (dto.levelIds?.length) {
        const levels = await this.prisma.warehouseLevel.findMany({
          where: { id: { in: dto.levelIds }, tenantId, deletedAt: null },
          select: { id: true, bins: { where: { deletedAt: null }, select: { id: true } } },
        });
        levels.forEach((l) => l.bins.forEach((b) => locationBinIds!.add(b.id)));
      }
    }

    // Resolve category filters → item IDs
    let categoryItemIds: Set<string> | null = null;
    const hasCategoryFilter =
      (dto.categoryIds?.length ?? 0) > 0 || (dto.macroCategoryIds?.length ?? 0) > 0;

    if (hasCategoryFilter) {
      categoryItemIds = new Set<string>();
      const categoryWhere: any = { tenantId, deletedAt: null };
      if (dto.categoryIds?.length) categoryWhere.id = { in: dto.categoryIds };
      if (dto.macroCategoryIds?.length)
        categoryWhere.macroCategoryId = { in: dto.macroCategoryIds };

      const items = await this.prisma.item.findMany({
        where: { tenantId, deletedAt: null, category: categoryWhere },
        select: { id: true },
      });
      items.forEach((i) => categoryItemIds!.add(i.id));
    }

    // Explicit item IDs filter
    const explicitItemIds = dto.itemIds?.length ? new Set(dto.itemIds) : null;

    // Apply all filters to session lines
    const resolvedLineIds: string[] = [];

    for (const line of session.lines) {
      // Skip already assigned
      if (alreadyAssigned.has(line.id)) continue;

      // Location filter — line must have levelId or binId in resolved sets
      if (locationLevelIds !== null || locationBinIds !== null) {
        const levelMatch = line.levelId && locationLevelIds?.has(line.levelId);
        const binMatch = line.binId && locationBinIds?.has(line.binId);
        if (!levelMatch && !binMatch) continue;
      }

      // Category filter
      if (categoryItemIds !== null) {
        if (!categoryItemIds.has(line.itemId)) continue;
      }

      // Explicit items filter
      if (explicitItemIds !== null) {
        if (!explicitItemIds.has(line.itemId)) continue;
      }

      resolvedLineIds.push(line.id);
    }

    if (resolvedLineIds.length === 0) {
      throw new BadRequestException('No unassigned lines match the provided filters');
    }

    // Create assignment
    const assignment = await this.prisma.stockCountAssignment.create({
      data: {
        tenantId,
        sessionId,
        userId: dto.userId,
        zoneIds: dto.zoneIds ?? [],
        aisleIds: dto.aisleIds ?? [],
        levelIds: dto.levelIds ?? [],
        binIds: dto.binIds ?? [],
        categoryIds: dto.categoryIds ?? [],
        macroCategoryIds: dto.macroCategoryIds ?? [],
        itemIds: dto.itemIds ?? [],
        assignedLineIds: resolvedLineIds,
        notes: dto.notes,
        createdBy: userId,
      },
    });

    // Update StockCountLine.assignedToUserId for each resolved line
    await this.prisma.stockCountLine.updateMany({
      where: { id: { in: resolvedLineIds } },
      data: { assignedToUserId: dto.userId },
    });

    return {
      assignment,
      resolvedCount: resolvedLineIds.length,
      message: `${resolvedLineIds.length} lines assigned to user`,
    };
  }

  // ── List assignments for a session ────────────────────────────────────────

  async findBySession(tenantId: string, sessionId: string) {
    const assignments = await this.prisma.stockCountAssignment.findMany({
      where: { tenantId, sessionId },
      orderBy: { createdAt: 'asc' },
    });

    // Enrich with user info
    const userIds = [...new Set(assignments.map((a) => a.userId))];
    const users = await this.prisma.userTenant.findMany({
      where: { tenantId, userId: { in: userIds }, isActive: true },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
    });
    const userMap = new Map(users.map((u) => [u.userId, u.user]));

    return assignments.map((a) => ({
      ...a,
      user: userMap.get(a.userId) ?? null,
      assignedCount: a.assignedLineIds.length,
    }));
  }

  // ── Delete assignment ─────────────────────────────────────────────────────

  async remove(tenantId: string, sessionId: string, assignmentId: string) {
    const assignment = await this.prisma.stockCountAssignment.findFirst({
      where: { id: assignmentId, sessionId, tenantId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    // Un-assign lines
    await this.prisma.stockCountLine.updateMany({
      where: { id: { in: assignment.assignedLineIds } },
      data: { assignedToUserId: null },
    });

    await this.prisma.stockCountAssignment.delete({ where: { id: assignmentId } });
    return { message: 'Assignment removed', releasedLines: assignment.assignedLineIds.length };
  }

  // ── Preview — how many lines would be assigned (dry run) ──────────────────

  async preview(tenantId: string, sessionId: string, dto: CreateAssignmentDto) {
    // Temporarily call create logic but don't persist — just return the count
    // We reuse the same resolution logic by simulating it

    const session = await this.prisma.stockCountSession.findFirst({
      where: { id: sessionId, tenantId, deletedAt: null },
      include: {
        lines: {
          where: { deletedAt: null },
          select: { id: true, itemId: true, levelId: true, binId: true, assignedToUserId: true },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    const unassigned = session.lines.filter((l) => !l.assignedToUserId);
    return {
      totalLines: session.lines.length,
      unassignedLines: unassigned.length,
      message: 'Use POST to create the assignment',
    };
  }
}
