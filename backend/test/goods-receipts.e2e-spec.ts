// ============================================================================
// E2E tests for the Goods Receipts (GRN) controller — spec-023-goods-receipts
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run, UOM catalog seeded
// (`npx ts-node prisma/seed-uom.ts` — GRN posting calls UomService.calcAllQties).
// Cross-tenant isolation needs BOTH seeded tenants: admin@demo.com (DEMO) and
// tenant2admin@demo.com (TENANT2). Fixtures (supplier + item + warehouse + PO,
// for both tenants) created per run (E2E residue, incl. real GRN/stock rows).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e goods-receipts
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const GRN = '/api/goods-receipts';

describe('GoodsReceipts (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2

  // Tenant A fixtures
  let supA: string;
  let itemA: string;
  let whA: string;
  let poA: string;
  let poLineA: string;
  // Tenant B fixtures (for the cross-tenant write test)
  let supB: string;
  let itemB: string;
  let whB: string;

  const login = async (email: string) => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Admin123!' });
    if (!r.body.requiresTenantSelection) return r.body.access_token;
    const tenant =
      r.body.tenants.find((t: { isDefault: boolean }) => t.isDefault) ?? r.body.tenants[0];
    const s = await request(app.getHttpServer())
      .post('/api/auth/select-tenant')
      .set('Authorization', `Bearer ${r.body.access_token}`)
      .send({ tenantId: tenant.id });
    return s.body.access_token;
  };

  const server = () => app.getHttpServer();
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const authB = (req: request.Test) => req.set('Authorization', `Bearer ${tokenB}`);

  const rows = (body: unknown, key: string): any[] =>
    Array.isArray(body) ? (body as any[]) : ((body as Record<string, any>)[key] ?? []);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    token = await login('admin@demo.com');
    tokenB = await login('tenant2admin@demo.com');

    const n = Math.floor(performance.now() * 1000);

    // Tenant A fixtures
    supA = (
      await auth(request(server()).post('/api/suppliers'))
        .send({ name: `E2E GRN Supplier ${n}` })
        .expect(201)
    ).body.id;
    itemA = (
      await auth(request(server()).post('/api/items'))
        .send({ name: `E2E GRN Item ${n}`, itemType: 'raw_material', baseUom: 'PCS' })
        .expect(201)
    ).body.id;
    whA = (
      await auth(request(server()).post('/api/warehouses'))
        .send({ name: `E2E GRN WH ${n}` })
        .expect(201)
    ).body.id;
    const po = await auth(request(server()).post('/api/purchase-orders'))
      .send({
        supplierId: supA,
        lines: [{ itemId: itemA, orderedQuantity: 100, uom: 'PCS', unitPrice: 10 }],
      })
      .expect(201);
    poA = po.body.id;
    poLineA = po.body.lines[0].id;

    // Tenant B fixtures
    supB = (
      await authB(request(server()).post('/api/suppliers'))
        .send({ name: `E2E GRN SupplierB ${n}` })
        .expect(201)
    ).body.id;
    itemB = (
      await authB(request(server()).post('/api/items'))
        .send({ name: `E2E GRN ItemB ${n}`, itemType: 'raw_material', baseUom: 'PCS' })
        .expect(201)
    ).body.id;
    whB = (
      await authB(request(server()).post('/api/warehouses'))
        .send({ name: `E2E GRN WHB ${n}` })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('GET /api/goods-receipts → 401 without a token', () =>
    request(server()).get(GRN).expect(401));

  it('POST /api/goods-receipts → 401 without a token', () =>
    request(server()).post(GRN).send({}).expect(401));

  // ── Response format ────────────────────────────────────────────────────────

  it('[GAP] GET / returns the { goodsReceipts, count } envelope', async () => {
    const res = await auth(request(server()).get(GRN)).expect(200);
    expect(res.body).toHaveProperty('goodsReceipts');
    expect(res.body).toHaveProperty('count');
  });

  it('[GAP] GET /by-po/:poId returns the { goodsReceipts, count } envelope', async () => {
    const res = await auth(request(server()).get(`${GRN}/by-po/${poA}`)).expect(200);
    expect(res.body).toHaveProperty('goodsReceipts');
    expect(res.body).toHaveProperty('count');
  });

  it('GET /stats returns the stats shape', async () => {
    const res = await auth(request(server()).get(`${GRN}/stats`)).expect(200);
    for (const k of ['total', 'posted', 'cancelled', 'today', 'totalValue']) {
      expect(res.body).toHaveProperty(k);
    }
  });

  // ── DTO validation ─────────────────────────────────────────────────────────

  it('POST {} → 400 (missing warehouseId/lines)', () =>
    auth(request(server()).post(GRN)).send({}).expect(400));

  it('[GAP] POST with empty lines [] → 400 (@ArrayMinSize)', () =>
    auth(request(server()).post(GRN))
      .send({ warehouseId: whA, supplierId: supA, lines: [] })
      .expect(400));

  it('[GAP] POST with condition outside the whitelist → 400 (@IsIn)', () =>
    auth(request(server()).post(GRN))
      .send({
        warehouseId: whA,
        supplierId: supA,
        condition: 'pristine',
        lines: [{ itemId: itemA, receivedQuantity: 1, uom: 'PCS', unitCost: 1 }],
      })
      .expect(400));

  it('[GAP] POST with receivedDate "not-a-date" → 400 (@IsDateString)', () =>
    auth(request(server()).post(GRN))
      .send({
        warehouseId: whA,
        supplierId: supA,
        receivedDate: 'not-a-date',
        lines: [{ itemId: itemA, receivedQuantity: 1, uom: 'PCS', unitCost: 1 }],
      })
      .expect(400));

  it('POST with receivedQuantity 0 → 400 (@IsPositive)', () =>
    auth(request(server()).post(GRN))
      .send({
        warehouseId: whA,
        supplierId: supA,
        lines: [{ itemId: itemA, receivedQuantity: 0, uom: 'PCS' }],
      })
      .expect(400));

  // ── Happy path: manual GRN + detail + update + cancel ─────────────────────

  let manualGrnId: string;

  it('POST a manual GRN (supplier, no PO) → 201, GRN-YYYY-NNNN, posted', async () => {
    const res = await auth(request(server()).post(GRN))
      .send({
        supplierId: supA,
        warehouseId: whA,
        condition: 'complete',
        supplierRef: 'E2E-INV-001',
        lines: [{ itemId: itemA, receivedQuantity: 5, uom: 'PCS', unitCost: 2 }],
      })
      .expect(201);
    expect(res.body.grnNumber).toMatch(/^GRN-\d{4}-\d{4}$/);
    expect(res.body.status).toBe('posted');
    manualGrnId = res.body.id;
  });

  it('GET /:id returns the detail with lines and stock movement refs', async () => {
    const res = await auth(request(server()).get(`${GRN}/${manualGrnId}`)).expect(200);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].stockMovement).toBeTruthy();
    expect(res.body.supplierName).toBeTruthy();
    expect(res.body.warehouseCode).toBeTruthy();
  });

  it('PATCH /:id updates condition + notes', async () => {
    await auth(request(server()).patch(`${GRN}/${manualGrnId}`))
      .send({ condition: 'damaged', notes: 'E2E: two boxes crushed' })
      .expect(200);
  });

  it('POST /:id/cancel → 200, then 409 on re-cancel', async () => {
    const res = await auth(
      request(server()).post(`${GRN}/${manualGrnId}/cancel`),
    ).expect(200);
    expect(res.body.message).toContain('cancelled');
    await auth(request(server()).post(`${GRN}/${manualGrnId}/cancel`)).expect(409);
  });

  it('PATCH a cancelled GRN → 400', () =>
    auth(request(server()).patch(`${GRN}/${manualGrnId}`))
      .send({ notes: 'should fail' })
      .expect(400));

  // ── PO-linked flow ─────────────────────────────────────────────────────────

  it('POST a PO-linked GRN rolls the PO to partial', async () => {
    await auth(request(server()).post(GRN))
      .send({
        poId: poA,
        warehouseId: whA,
        lines: [
          { itemId: itemA, poLineId: poLineA, receivedQuantity: 10, uom: 'PCS', unitCost: 9.5 },
        ],
      })
      .expect(201);
    const po = await auth(
      request(server()).get(`/api/purchase-orders/${poA}`),
    ).expect(200);
    expect(po.body.status).toBe('partial');
  });

  it('[GAP] POST rejects over-receipt beyond orderedQuantity → 400', () =>
    // PO line ordered 100, received 10 — 200 more must be rejected.
    auth(request(server()).post(GRN))
      .send({
        poId: poA,
        warehouseId: whA,
        lines: [
          { itemId: itemA, poLineId: poLineA, receivedQuantity: 200, uom: 'PCS', unitCost: 9.5 },
        ],
      })
      .expect(400));

  it('[GAP] POST rejects a poLineId without its header poId → 400', () =>
    auth(request(server()).post(GRN))
      .send({
        supplierId: supA,
        warehouseId: whA,
        lines: [
          { itemId: itemA, poLineId: poLineA, receivedQuantity: 1, uom: 'PCS', unitCost: 9.5 },
        ],
      })
      .expect(400));

  // ── Tenant isolation ───────────────────────────────────────────────────────

  it('tenant B cannot see tenant A GRNs (list + detail 404)', async () => {
    const list = await authB(request(server()).get(GRN)).expect(200);
    const ids = rows(list.body, 'goodsReceipts').map((g) => g.id);
    expect(ids).not.toContain(manualGrnId);
    await authB(request(server()).get(`${GRN}/${manualGrnId}`)).expect(404);
  });

  it('tenant B cannot cancel a tenant A GRN → 404', () =>
    authB(request(server()).post(`${GRN}/${manualGrnId}/cancel`)).expect(404));

  it('[GAP] tenant B cannot post against a tenant A poLineId (the spec-023 write leak)', async () => {
    // Today this returns 201 and increments tenant A's PO line — the critical bug.
    // Target: 400 (poLineId requires poId; cross-tenant lookup finds nothing → 404).
    const res = await authB(request(server()).post(GRN)).send({
      supplierId: supB,
      warehouseId: whB,
      lines: [
        { itemId: itemB, poLineId: poLineA, receivedQuantity: 1, uom: 'PCS', unitCost: 1 },
      ],
    });
    expect([400, 404]).toContain(res.status);
    // Tenant A's PO line must be untouched (10 received from the PO-linked test).
    const po = await auth(request(server()).get(`/api/purchase-orders/${poA}`)).expect(200);
    expect(Number(po.body.lines[0].receivedQuantity)).toBe(10);
  });

  // ── Not found ──────────────────────────────────────────────────────────────

  it('GET/PATCH/cancel a non-existent id → 404', async () => {
    await auth(request(server()).get(`${GRN}/${ZERO}`)).expect(404);
    await auth(request(server()).patch(`${GRN}/${ZERO}`)).send({ notes: 'x' }).expect(404);
    await auth(request(server()).post(`${GRN}/${ZERO}/cancel`)).expect(404);
  });

  // NOTE: 403 (permission-lacking role) not covered — the seed has no limited-role
  // user fixture. TODO when a VIEWER-role seed exists (same gap as other suites).
});
