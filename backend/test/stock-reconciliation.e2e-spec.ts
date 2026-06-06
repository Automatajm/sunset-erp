// ============================================================================
// E2E tests for the StockReconciliation + StockCountAssignment controllers —
// spec-017-stock-reconciliation
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation needs
// BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// Fixtures (item + 2 warehouses + stock receipt) are created per run (E2E residue).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e stock-reconciliation
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const BASE = '/api/stock-reconciliation';

describe('StockReconciliation (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let adminId: string; // tenant A admin user id (assignment fixture)
  let itemId: string;
  let whStocked: string; // has 100 PCS @ 10
  let whEmpty: string; // never stocked

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

  const rows = (body: unknown): Array<{ id: string }> =>
    Array.isArray(body)
      ? (body as Array<{ id: string }>)
      : ((body as { sessions?: Array<{ id: string }> }).sessions ?? []);

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

    const profile = await auth(request(server()).get('/api/auth/profile')).expect(200);
    adminId = profile.body.user.id;

    const n = Math.floor(performance.now() * 1000);
    const item = await auth(request(server()).post('/api/items'))
      .send({ name: `E2E CC Item ${n}`, itemType: 'raw_material', baseUom: 'PCS' })
      .expect(201);
    itemId = item.body.id;
    const w1 = await auth(request(server()).post('/api/warehouses'))
      .send({ name: `E2E CC WH ${n}` })
      .expect(201);
    whStocked = w1.body.id;
    const w2 = await auth(request(server()).post('/api/warehouses'))
      .send({ name: `E2E CC WH-empty ${n}` })
      .expect(201);
    whEmpty = w2.body.id;

    // Stock the warehouse: 100 PCS @ 10 (spec-016 manual receipt)
    await auth(request(server()).post('/api/stock-transactions'))
      .send({
        transactionType: 'receipt',
        itemId,
        warehouseId: whStocked,
        quantity: 100,
        uom: 'PCS',
        unitCost: 10,
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET / → 401 without a token', () => request(server()).get(BASE).expect(401));

  it('POST / → 401 with a junk token', () =>
    request(server()).post(BASE).set('Authorization', 'Bearer junk').send({}).expect(401));

  // NOTE: 403 (e.g. INVENTORY:COUNT-only user posting) is not covered — no limited-role fixture.

  // ── Create ────────────────────────────────────────────────────────────────
  it('POST → 201 with CC-YYYY-NNNN, draft, snapshot lines (system qty + WAC)', async () => {
    const res = await auth(request(server()).post(BASE))
      .send({ warehouseId: whStocked, itemIds: [itemId] })
      .expect(201);
    expect(res.body.sessionNumber).toMatch(/^CC-\d{4}-\d{4}$/);
    expect(res.body.status).toBe('draft');
    expect(res.body.lines.length).toBeGreaterThanOrEqual(1);
    const line = res.body.lines.find((l: any) => l.item.id === itemId);
    expect(line.systemStorageQty).toBe(100);
    expect(line.unitCostSnapshot).toBe(10);
    expect(line.status).toBe('pending');
    // cleanup: cancel so it does not pollute later list-based tests
    await auth(request(server()).patch(`${BASE}/${res.body.id}/cancel`)).expect(200);
  });

  it('[GAP] POST against a warehouse with no stock → 400 (no empty sessions)', () =>
    auth(request(server()).post(BASE)).send({ warehouseId: whEmpty }).expect(400));

  it('POST unknown warehouse → 404; missing warehouseId → 400', async () => {
    await auth(request(server()).post(BASE)).send({ warehouseId: ZERO }).expect(404);
    await auth(request(server()).post(BASE)).send({}).expect(400);
  });

  // ── List ──────────────────────────────────────────────────────────────────
  it('[GAP] GET / → { sessions, count } envelope', () =>
    auth(request(server()).get(BASE))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('sessions');
        expect(r.body).toHaveProperty('count');
      }));

  it('[GAP] GET /?status=weird → 400 (query DTO whitelist)', () =>
    auth(request(server()).get(`${BASE}?status=weird`)).expect(400));

  // ── Full lifecycle: draft → count → submit → approve → post ──────────────
  it('drives the full lifecycle and posts a signed CYCLE_COUNT adjustment', async () => {
    const created = await auth(request(server()).post(BASE))
      .send({ warehouseId: whStocked, itemIds: [itemId], description: 'E2E lifecycle' })
      .expect(201);
    const id = created.body.id;
    const lineId = created.body.lines[0].id;

    // counting before start → 400 (still draft)
    await auth(request(server()).patch(`${BASE}/${id}/lines`))
      .send({ lineId, countedStorageQty: 95 })
      .expect(400);

    await auth(request(server()).patch(`${BASE}/${id}/start`)).expect(200);

    // submit with uncounted lines → 400
    await auth(request(server()).patch(`${BASE}/${id}/submit`)).expect(400);

    // [GAP] both quantities → 400 (mutual exclusivity)
    await auth(request(server()).patch(`${BASE}/${id}/lines`))
      .send({ lineId, countedStorageQty: 95, countedPurchaseQty: 95 })
      .expect(400);

    // neither quantity → 400
    await auth(request(server()).patch(`${BASE}/${id}/lines`)).send({ lineId }).expect(400);

    // negative → 400 (@Min(0))
    await auth(request(server()).patch(`${BASE}/${id}/lines`))
      .send({ lineId, countedStorageQty: -5 })
      .expect(400);

    // count 95 → signed variance -5 valued at WAC 10
    const counted = await auth(request(server()).patch(`${BASE}/${id}/lines`))
      .send({ lineId, countedStorageQty: 95 })
      .expect(200);
    const line = counted.body.lines.find((l: any) => l.id === lineId);
    expect(line.varianceStorageQty).toBe(-5);
    expect(line.varianceValue).toBe(-50);
    expect(line.status).toBe('counted');

    // submit → pending_approval with signed summary
    const submitted = await auth(request(server()).patch(`${BASE}/${id}/submit`)).expect(200);
    expect(submitted.body.status).toBe('pending_approval');
    expect(submitted.body.linesWithVariance).toBe(1);
    expect(submitted.body.totalVarianceValue).toBe(-50);

    // counting after submit → 400
    await auth(request(server()).patch(`${BASE}/${id}/lines`))
      .send({ lineId, countedStorageQty: 90 })
      .expect(400);

    // approve → approved
    const approved = await auth(request(server()).patch(`${BASE}/${id}/approve`))
      .send({ approvalNotes: 'E2E approved' })
      .expect(200);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.approvedBy).toBeTruthy();

    // post → posted, lines adjusted
    const posted = await auth(request(server()).patch(`${BASE}/${id}/post`)).expect(200);
    expect(posted.body.status).toBe('posted');
    expect(posted.body.lines[0].status).toBe('adjusted');
    expect(posted.body.lines[0].adjustmentMovementId).toBeTruthy();

    // stock balance moved 100 → 95
    const bal = await auth(
      request(server()).get(
        `/api/stock-transactions/balance?itemId=${itemId}&warehouseId=${whStocked}`,
      ),
    ).expect(200);
    expect(bal.body[0].storageQty).toBe(95);

    // ledger shows the CYCLE_COUNT adjustment with the CC number resolved
    const ledger = await auth(
      request(server()).get(`/api/stock-transactions/ledger?itemId=${itemId}`),
    ).expect(200);
    const adj = ledger.body.rows.find((r: any) => r.movementType === 'adjustment');
    expect(adj).toBeTruthy();
    expect(adj.movementValue).toBe(-50); // signed: shortage
    expect(adj.referenceNumber).toBe(created.body.sessionNumber);

    // posted is terminal
    await auth(request(server()).patch(`${BASE}/${id}/cancel`)).expect(400);
    await auth(request(server()).patch(`${BASE}/${id}/post`)).expect(400);
  });

  // ── Cancel ────────────────────────────────────────────────────────────────
  it('cancel works from draft and is terminal', async () => {
    const created = await auth(request(server()).post(BASE))
      .send({ warehouseId: whStocked, itemIds: [itemId] })
      .expect(201);
    const cancelled = await auth(
      request(server()).patch(`${BASE}/${created.body.id}/cancel`),
    ).expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    await auth(request(server()).patch(`${BASE}/${created.body.id}/cancel`)).expect(400);
    await auth(request(server()).patch(`${BASE}/${created.body.id}/start`)).expect(400);
  });

  it('GET/PATCH → 404 for unknown session ids', async () => {
    await auth(request(server()).get(`${BASE}/${ZERO}`)).expect(404);
    await auth(request(server()).patch(`${BASE}/${ZERO}/start`)).expect(404);
    await auth(request(server()).patch(`${BASE}/${ZERO}/approve`)).send({}).expect(404);
  });

  // ── Assignments ───────────────────────────────────────────────────────────
  it('assignment flow: preview (dry run), create, double-assign blocked, remove releases', async () => {
    const created = await auth(request(server()).post(BASE))
      .send({ warehouseId: whStocked, itemIds: [itemId] })
      .expect(201);
    const id = created.body.id;
    await auth(request(server()).patch(`${BASE}/${id}/start`)).expect(200);

    // [GAP] non-member userId → 404
    await auth(request(server()).post(`${BASE}/${id}/assignments`))
      .send({ userId: ZERO })
      .expect(404);

    // [GAP] preview returns the real matchedLines count, persisting nothing
    const preview = await auth(request(server()).post(`${BASE}/${id}/assignments/preview`))
      .send({ userId: adminId, itemIds: [itemId] })
      .expect(200);
    expect(preview.body.matchedLines).toBe(1);

    // create → resolvedCount matches the preview
    const assign = await auth(request(server()).post(`${BASE}/${id}/assignments`))
      .send({ userId: adminId, itemIds: [itemId] })
      .expect(201);
    expect(assign.body.resolvedCount).toBe(1);

    // everything already assigned → 400
    await auth(request(server()).post(`${BASE}/${id}/assignments`))
      .send({ userId: adminId })
      .expect(400);

    // list shows the assignment enriched with user
    const list = await auth(request(server()).get(`${BASE}/${id}/assignments`)).expect(200);
    expect(list.body[0].assignedCount).toBe(1);
    expect(list.body[0].user).toBeTruthy();

    // remove releases the lines
    const removed = await auth(
      request(server()).delete(`${BASE}/${id}/assignments/${list.body[0].id}`),
    ).expect(200);
    expect(removed.body.releasedLines).toBe(1);
    await auth(
      request(server()).delete(`${BASE}/${id}/assignments/${list.body[0].id}`),
    ).expect(404);

    await auth(request(server()).patch(`${BASE}/${id}/cancel`)).expect(200);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  it("tenant A's sessions are invisible and immutable for tenant B", async () => {
    const created = await auth(request(server()).post(BASE))
      .send({ warehouseId: whStocked, itemIds: [itemId] })
      .expect(201);
    const id = created.body.id;

    await authB(request(server()).get(`${BASE}/${id}`)).expect(404);
    await authB(request(server()).patch(`${BASE}/${id}/start`)).expect(404);
    await authB(request(server()).patch(`${BASE}/${id}/cancel`)).expect(404);

    const listB = await authB(request(server()).get(BASE)).expect(200);
    expect(rows(listB.body).map((s) => s.id)).not.toContain(id);

    // tenant B cannot create a session against tenant A's warehouse
    await authB(request(server()).post(BASE)).send({ warehouseId: whStocked }).expect(404);

    await auth(request(server()).patch(`${BASE}/${id}/cancel`)).expect(200);
  });
});
