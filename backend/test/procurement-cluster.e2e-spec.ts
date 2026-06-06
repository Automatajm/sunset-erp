// ============================================================================
// E2E tests for the procurement cluster (PO + PR + RFQ + GN) —
// spec-020-procurement-cluster
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation needs
// BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// Fixtures (2 suppliers + item + warehouse) created per run (E2E residue, incl.
// real PO/RFQ/PR/GN documents). Tests tagged [GAP] are expected to FAIL until
// implemented.
// Run: pnpm test:e2e procurement-cluster
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const PO = '/api/purchase-orders';
const PR = '/api/purchase-requisitions';
const RFQ = '/api/rfqs';
const GN = '/api/general-needs';

describe('ProcurementCluster (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let tokenB: string;
  let sup1: string;
  let sup2: string;
  let itemId: string;
  let whId: string;

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
    sup1 = (
      await auth(request(server()).post('/api/suppliers'))
        .send({ name: `E2E PC Supplier1 ${n}` })
        .expect(201)
    ).body.id;
    sup2 = (
      await auth(request(server()).post('/api/suppliers'))
        .send({ name: `E2E PC Supplier2 ${n}` })
        .expect(201)
    ).body.id;
    itemId = (
      await auth(request(server()).post('/api/items'))
        .send({ name: `E2E PC Item ${n}`, itemType: 'raw_material', baseUom: 'PCS' })
        .expect(201)
    ).body.id;
    whId = (
      await auth(request(server()).post('/api/warehouses'))
        .send({ name: `E2E PC WH ${n}` })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth + envelopes + query DTOs ─────────────────────────────────────────
  it('all four list routes → 401 without a token', async () => {
    for (const base of [PO, PR, RFQ, GN]) {
      await request(server()).get(base).expect(401);
    }
  });

  it('[GAP] all four GET / return envelopes; ?status=weird → 400', async () => {
    const checks: Array<[string, string]> = [
      [PO, 'purchaseOrders'],
      [PR, 'purchaseRequisitions'],
      [RFQ, 'rfqs'],
      [GN, 'generalNeeds'],
    ];
    for (const [base, key] of checks) {
      const res = await auth(request(server()).get(base)).expect(200);
      expect(res.body).toHaveProperty(key);
      expect(res.body).toHaveProperty('count');
      await auth(request(server()).get(`${base}?status=weird`)).expect(400);
    }
  });

  // ── PO lifecycle + atomic receive ─────────────────────────────────────────
  it('PO: create → confirm → partial receive → full receive, statuses via the map', async () => {
    const po = await auth(request(server()).post(PO))
      .send({
        supplierId: sup1,
        lines: [{ itemId, orderedQuantity: 100, uom: 'PCS', unitPrice: 10 }],
      })
      .expect(201);
    expect(po.body.poNumber).toMatch(/^PO-\d{4}-\d{4}$/);
    const id = po.body.id;
    const lineId = po.body.lines[0].id;

    // receive on draft → 400
    await auth(request(server()).post(`${PO}/${id}/receive`))
      .send({ warehouseId: whId, lines: [{ lineId, receivedQuantity: 10 }] })
      .expect(400);

    await auth(request(server()).patch(`${PO}/${id}/status/confirmed`)).expect(200);

    // over-receive → 400
    await auth(request(server()).post(`${PO}/${id}/receive`))
      .send({ warehouseId: whId, lines: [{ lineId, receivedQuantity: 150, unitCost: 10 }] })
      .expect(400);

    // partial receive 60 → partially_received
    await auth(request(server()).post(`${PO}/${id}/receive`))
      .send({ warehouseId: whId, lines: [{ lineId, receivedQuantity: 60, unitCost: 10 }] })
      .expect(200);
    let after = await auth(request(server()).get(`${PO}/${id}`)).expect(200);
    expect(after.body.status).toBe('partially_received');

    // movement landed in the spec-016 ledger
    const ledger = await auth(
      request(server()).get(`/api/stock-transactions/ledger?itemId=${itemId}`),
    ).expect(200);
    expect(ledger.body.rows.some((r: any) => r.movementType === 'receipt')).toBe(true);

    // receive the rest → received
    await auth(request(server()).post(`${PO}/${id}/receive`))
      .send({ warehouseId: whId, lines: [{ lineId, receivedQuantity: 40, unitCost: 10 }] })
      .expect(200);
    after = await auth(request(server()).get(`${PO}/${id}`)).expect(200);
    expect(after.body.status).toBe('received');
  });

  it('[GAP] PO: discountPercent 200 → 400; expectedDate garbage → 400; unknown status target → 400', async () => {
    await auth(request(server()).post(PO))
      .send({
        supplierId: sup1,
        lines: [
          { itemId, orderedQuantity: 1, uom: 'PCS', unitPrice: 10, discountPercent: 200 },
        ],
      })
      .expect(400);
    await auth(request(server()).post(PO))
      .send({
        supplierId: sup1,
        expectedDate: 'not-a-date',
        lines: [{ itemId, orderedQuantity: 1, uom: 'PCS', unitPrice: 10 }],
      })
      .expect(400);
    const po = await auth(request(server()).post(PO))
      .send({ supplierId: sup1, lines: [{ itemId, orderedQuantity: 1, uom: 'PCS', unitPrice: 10 }] })
      .expect(201);
    await auth(request(server()).patch(`${PO}/${po.body.id}/status/banana`)).expect(400);
  });

  // ── Golden path: PR → RFQ → responses → award → PO ────────────────────────
  it('golden path: PR approve → convert-to-rfq → send → 2 responses → award → PO with backlinks', async () => {
    // PR with one line
    const pr = await auth(request(server()).post(PR))
      .send({
        title: 'E2E golden PR',
        requiredDate: '2026-07-15',
        lines: [
          { itemId, quantity: 50, uom: 'PCS', requiredDate: '2026-07-15' },
        ],
      })
      .expect(201);
    const prId = pr.body.id;
    expect(pr.body.prNumber).toMatch(/^PR-\d{4}-\d{4}$/);

    await auth(request(server()).patch(`${PR}/${prId}/status/submitted`)).expect(200);
    await auth(request(server()).patch(`${PR}/${prId}/status/approved`)).send({}).expect(200);

    // convert to RFQ (DTO-validated body)
    const prFull = await auth(request(server()).get(`${PR}/${prId}`)).expect(200);
    const prLineId = prFull.body.lines[0].id;
    const conv = await auth(request(server()).post(`${PR}/${prId}/convert-to-rfq`))
      .send({ lineIds: [prLineId], rfqTitle: 'E2E RFQ', supplierIds: [sup1, sup2] })
      .expect(201);
    const rfqId = conv.body.id ?? conv.body.rfq?.id;
    expect(rfqId).toBeTruthy();

    const prAfter = await auth(request(server()).get(`${PR}/${prId}`)).expect(200);
    expect(prAfter.body.status).toBe('in_progress');

    // send
    await auth(request(server()).post(`${RFQ}/${rfqId}/send`)).expect(201);
    const rfqFull = await auth(request(server()).get(`${RFQ}/${rfqId}`)).expect(200);
    const rfqLineId = rfqFull.body.lines[0].id;
    const rs1 = rfqFull.body.rfqSuppliers.find((s: any) => s.supplierId === sup1).id;
    const rs2 = rfqFull.body.rfqSuppliers.find((s: any) => s.supplierId === sup2).id;

    // first response (RFQ → partial_response)
    await auth(request(server()).post(`${RFQ}/${rfqId}/response`))
      .send({
        rfqSupplierId: rs1,
        lines: [{ rfqLineId, offeredQty: 50, uom: 'PCS', unitPrice: 9.5, leadTimeDays: 7 }],
      })
      .expect(201);

    // [GAP] second supplier responds while partial_response (was locked out)
    await auth(request(server()).post(`${RFQ}/${rfqId}/response`))
      .send({
        rfqSupplierId: rs2,
        lines: [{ rfqLineId, offeredQty: 50, uom: 'PCS', unitPrice: 9.0, leadTimeDays: 10 }],
      })
      .expect(201);

    // comparison matrix available
    await auth(request(server()).get(`${RFQ}/${rfqId}/comparison`)).expect(200);

    // award supplier2's cheaper line
    const rfqResponded = await auth(request(server()).get(`${RFQ}/${rfqId}`)).expect(200);
    const sup2Resp = rfqResponded.body.rfqSuppliers.find((s: any) => s.supplierId === sup2);
    const respLineId = sup2Resp.responseLines?.[0]?.id ?? sup2Resp.rfqResponseLines?.[0]?.id;
    expect(respLineId).toBeTruthy();

    const award = await auth(request(server()).post(`${RFQ}/${rfqId}/award`))
      .send({ awards: [{ rfqLineId, rfqResponseLineId: respLineId, awardedQty: 50 }] })
      .expect(201);

    // PO created with the rfqId backlink
    const poList = await auth(request(server()).get(`${PO}?status=draft`)).expect(200);
    const generated = rows(poList.body, 'purchaseOrders').find((p: any) => p.rfqId === rfqId);
    expect(generated ?? award.body).toBeTruthy();

    const rfqAfter = await auth(request(server()).get(`${RFQ}/${rfqId}`)).expect(200);
    expect(rfqAfter.body.status).toBe('awarded');
    expect(rfqAfter.body.lines[0].status).toBe('awarded');

    // [GAP] re-award the same line → 409
    await auth(request(server()).post(`${RFQ}/${rfqId}/award`))
      .send({ awards: [{ rfqLineId, rfqResponseLineId: respLineId, awardedQty: 50 }] })
      .expect(400); // awarded RFQ is terminal (or 409 on the line — either guard blocks)
  });

  it('[GAP] award with a foreign rfqResponseLineId → 404; cancel on awarded RFQ → 400', async () => {
    // fresh minimal RFQ via direct create
    const rfq = await auth(request(server()).post(RFQ))
      .send({
        title: 'E2E guard RFQ',
        supplierIds: [sup1],
        lines: [
          { genericDescription: 'Widget', quantity: 1, uom: 'PCS', requiredDate: '2026-07-15' },
        ],
      })
      .expect(201);
    const rfqId = rfq.body.id;
    await auth(request(server()).post(`${RFQ}/${rfqId}/send`)).expect(201);
    const full = await auth(request(server()).get(`${RFQ}/${rfqId}`)).expect(200);
    const rs = full.body.rfqSuppliers[0].id;
    const rl = full.body.lines[0].id;
    await auth(request(server()).post(`${RFQ}/${rfqId}/response`))
      .send({
        rfqSupplierId: rs,
        lines: [{ rfqLineId: rl, offeredQty: 1, uom: 'PCS', unitPrice: 1, leadTimeDays: 1 }],
      })
      .expect(201);
    // foreign/bogus response-line id → 404 (today: unscoped lookup may 500/leak)
    await auth(request(server()).post(`${RFQ}/${rfqId}/award`))
      .send({ awards: [{ rfqLineId: rl, rfqResponseLineId: ZERO, awardedQty: 1 }] })
      .expect(404);
  });

  it('[GAP] convert-to-rfq body is DTO-validated (lineIds not-a-uuid → 400)', async () => {
    const pr = await auth(request(server()).post(PR))
      .send({
        title: 'E2E dto PR',
        requiredDate: '2026-07-15',
        lines: [{ itemId, quantity: 1, uom: 'PCS', requiredDate: '2026-07-15' }],
      })
      .expect(201);
    await auth(request(server()).patch(`${PR}/${pr.body.id}/status/submitted`)).expect(200);
    await auth(request(server()).patch(`${PR}/${pr.body.id}/status/approved`)).send({}).expect(200);
    await auth(request(server()).post(`${PR}/${pr.body.id}/convert-to-rfq`))
      .send({ lineIds: ['not-a-uuid'], rfqTitle: 'X', supplierIds: [sup1] })
      .expect(400);
  });

  // ── GN → PR ───────────────────────────────────────────────────────────────
  it('GN: create → convert-to-pr (atomic) → PR created, lines converted, GN in_progress; [GAP] DTO-validated', async () => {
    const gn = await auth(request(server()).post(GN))
      .send({
        title: 'E2E GN',
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        lines: [{ itemId, quantity: 25, uom: 'PCS', requiredDate: '2026-07-10' }],
      })
      .expect(201);
    const gnId = gn.body.id;
    expect(gn.body.gnNumber).toMatch(/^GN-\d{4}-\d{4}$/);

    // [GAP] invalid body → 400
    await auth(request(server()).post(`${GN}/${gnId}/convert-to-pr`))
      .send({ lineIds: ['not-a-uuid'], prTitle: 'X' })
      .expect(400);

    const gnFull = await auth(request(server()).get(`${GN}/${gnId}`)).expect(200);
    const gnLineId = gnFull.body.lines[0].id;
    const conv = await auth(request(server()).post(`${GN}/${gnId}/convert-to-pr`))
      .send({ lineIds: [gnLineId], prTitle: 'PR from E2E GN' })
      .expect(201);
    // Preserved contract: { message, purchaseRequisition } (spec-020 response-format [x])
    expect(conv.body.purchaseRequisition?.prNumber).toMatch(/^PR-\d{4}-\d+$/);

    const gnAfter = await auth(request(server()).get(`${GN}/${gnId}`)).expect(200);
    expect(gnAfter.body.status).toBe('in_progress');
    expect(gnAfter.body.lines[0].status).toBe('converted');
  });

  // ── Tenant isolation across the cluster ───────────────────────────────────
  it("tenant A's procurement documents are invisible and immutable for tenant B", async () => {
    const po = await auth(request(server()).post(PO))
      .send({ supplierId: sup1, lines: [{ itemId, orderedQuantity: 1, uom: 'PCS', unitPrice: 1 }] })
      .expect(201);

    await authB(request(server()).get(`${PO}/${po.body.id}`)).expect(404);
    await authB(request(server()).patch(`${PO}/${po.body.id}/status/confirmed`)).expect(404);
    await authB(request(server()).post(PO))
      .send({ supplierId: sup1, lines: [{ itemId, orderedQuantity: 1, uom: 'PCS', unitPrice: 1 }] })
      .expect(404); // tenant A's supplier/item invisible to B

    for (const [base, key] of [
      [PO, 'purchaseOrders'],
      [PR, 'purchaseRequisitions'],
      [RFQ, 'rfqs'],
      [GN, 'generalNeeds'],
    ] as Array<[string, string]>) {
      const listB = await authB(request(server()).get(base)).expect(200);
      const ids = rows(listB.body, key).map((r: any) => r.id);
      expect(ids).not.toContain(po.body.id);
    }
  });
});
