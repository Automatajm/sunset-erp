// ============================================================================
// E2E tests for the StockTransactions controller — spec-016-stock-transactions
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation needs
// BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// Fixtures (item + 2 warehouses) are created per run (E2E residue).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e stock-transactions
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const BASE = '/api/stock-transactions';

describe('StockTransactions (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let itemId: string; // fresh stockable item (zero stock at start)
  let whA: string; // warehouse receiving the WAC flow
  let whB: string; // second warehouse for filter checks

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

  const txBody = (over: Record<string, unknown> = {}) => ({
    transactionType: 'receipt',
    itemId,
    warehouseId: whA,
    quantity: 100,
    uom: 'PCS',
    ...over,
  });

  const rows = (body: unknown): Array<{ id: string }> =>
    Array.isArray(body)
      ? (body as Array<{ id: string }>)
      : ((body as { movements?: Array<{ id: string }> }).movements ?? []);

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
    const item = await auth(request(server()).post('/api/items'))
      .send({ name: `E2E ST Item ${n}`, itemType: 'raw_material', baseUom: 'PCS' })
      .expect(201);
    itemId = item.body.id;
    const w1 = await auth(request(server()).post('/api/warehouses'))
      .send({ name: `E2E ST WH-A ${n}` })
      .expect(201);
    whA = w1.body.id;
    const w2 = await auth(request(server()).post('/api/warehouses'))
      .send({ name: `E2E ST WH-B ${n}` })
      .expect(201);
    whB = w2.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET / → 401 without a token', () => request(server()).get(BASE).expect(401));

  it('POST / → 401 with a junk token', () =>
    request(server()).post(BASE).set('Authorization', 'Bearer junk').send({}).expect(401));

  // NOTE: 403 (missing INVENTORY:* permission) is not covered — no limited-role fixture.

  // ── Create — validation gates ─────────────────────────────────────────────
  it('POST → 400 on an empty body', () =>
    auth(request(server()).post(BASE)).send({}).expect(400));

  it('[GAP] POST transactionType transfer/adjustment → 400 (manual endpoint is receipt|issue only)', async () => {
    await auth(request(server()).post(BASE))
      .send(txBody({ transactionType: 'transfer' }))
      .expect(400);
    await auth(request(server()).post(BASE))
      .send(txBody({ transactionType: 'adjustment' }))
      .expect(400);
  });

  it('[GAP] POST quantity 0 or negative → 400 (@IsPositive)', async () => {
    await auth(request(server()).post(BASE)).send(txBody({ quantity: 0 })).expect(400);
    await auth(request(server()).post(BASE)).send(txBody({ quantity: -10 })).expect(400);
  });

  it('[GAP] POST negative unitCost → 400 (WAC corruption guard)', () =>
    auth(request(server()).post(BASE))
      .send(txBody({ unitCost: -5 }))
      .expect(400));

  it('POST unknown item / warehouse → 404', async () => {
    await auth(request(server()).post(BASE)).send(txBody({ itemId: ZERO })).expect(404);
    await auth(request(server()).post(BASE)).send(txBody({ warehouseId: ZERO })).expect(404);
  });

  // ── Create — stock integrity ──────────────────────────────────────────────
  it('[GAP] issue with no stock on hand → 400 (insufficient stock)', () =>
    auth(request(server()).post(BASE))
      .send(txBody({ transactionType: 'issue', quantity: 10, warehouseId: whB }))
      .expect(400));

  // ── WAC + balance flow (sequential, order matters) ────────────────────────
  it('receipt 100 @ 10 → 201 with SM-YYYY-NNNN; receipt 100 @ 20 → WAC 15; issue 50 keeps WAC', async () => {
    const r1 = await auth(request(server()).post(BASE))
      .send(txBody({ quantity: 100, unitCost: 10 }))
      .expect(201);
    expect(r1.body.movementNumber).toMatch(/^SM-\d{4}-\d{4}$/);
    expect(r1.body.movementType).toBe('receipt');

    await auth(request(server()).post(BASE))
      .send(txBody({ quantity: 100, unitCost: 20 }))
      .expect(201);

    const afterReceipts = await auth(
      request(server()).get(`${BASE}/balance?itemId=${itemId}&warehouseId=${whA}`),
    ).expect(200);
    expect(afterReceipts.body[0].unitCost).toBe(15); // WAC of 100@10 + 100@20
    expect(afterReceipts.body[0].storageQty).toBe(200);

    await auth(request(server()).post(BASE))
      .send(txBody({ transactionType: 'issue', quantity: 50 }))
      .expect(201);

    const afterIssue = await auth(
      request(server()).get(`${BASE}/balance?itemId=${itemId}&warehouseId=${whA}`),
    ).expect(200);
    expect(afterIssue.body[0].storageQty).toBe(150);
    expect(afterIssue.body[0].unitCost).toBe(15); // issues never move WAC
  });

  it('[GAP] issue exceeding on-hand → 400 with available vs requested', async () => {
    const res = await auth(request(server()).post(BASE))
      .send(txBody({ transactionType: 'issue', quantity: 999999 }))
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('nsufficient');
  });

  it('ledger shows the signed flow with running balance and totals', async () => {
    const res = await auth(
      request(server()).get(`${BASE}/ledger?itemId=${itemId}`),
    ).expect(200);
    expect(res.body).toHaveProperty('rows');
    expect(res.body).toHaveProperty('totals');
    expect(res.body.totals.netMovement).toBe(150); // 100 + 100 − 50
    const last = res.body.rows[res.body.rows.length - 1];
    expect(last.closingBalance).toBe(150);
    const issueRow = res.body.rows.find((r: any) => r.movementType === 'issue');
    expect(issueRow.signedQuantity).toBe(-50);
  });

  // ── List ──────────────────────────────────────────────────────────────────
  it('[GAP] GET / → { movements, count } envelope', () =>
    auth(request(server()).get(BASE))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('movements');
        expect(r.body).toHaveProperty('count');
      }));

  it('[GAP] GET /?warehouseId= actually filters movements', async () => {
    const inA = await auth(
      request(server()).get(`${BASE}?itemId=${itemId}&warehouseId=${whA}`),
    ).expect(200);
    expect(rows(inA.body).length).toBeGreaterThanOrEqual(3);
    const inB = await auth(
      request(server()).get(`${BASE}?itemId=${itemId}&warehouseId=${whB}`),
    ).expect(200);
    expect(rows(inB.body)).toHaveLength(0); // whB never received this item
  });

  it('[GAP] GET /?transactionType=weird → 400 (query DTO whitelist)', () =>
    auth(request(server()).get(`${BASE}?transactionType=weird`)).expect(400));

  // ── Reports respond with their documented shapes ──────────────────────────
  it('valuation / planning / abc / aging / turnover → 200 with documented keys', async () => {
    const val = await auth(request(server()).get(`${BASE}/valuation`)).expect(200);
    expect(val.body).toHaveProperty('totalInventoryValue');
    const plan = await auth(request(server()).get(`${BASE}/planning`)).expect(200);
    expect(plan.body).toHaveProperty('summary');
    expect(plan.body.summary).toHaveProperty('doubleOrderRisk');
    const abc = await auth(request(server()).get(`${BASE}/abc`)).expect(200);
    expect(abc.body.summary).toHaveProperty('classA');
    const aging = await auth(request(server()).get(`${BASE}/aging`)).expect(200);
    expect(aging.body.summary).toHaveProperty('buckets');
    const turn = await auth(request(server()).get(`${BASE}/turnover`)).expect(200);
    expect(turn.body).toHaveProperty('period');
  });

  // ── findOne ───────────────────────────────────────────────────────────────
  it('GET /:id → 200 for an own movement, 404 for unknown', async () => {
    const list = await auth(request(server()).get(`${BASE}?itemId=${itemId}`)).expect(200);
    const first = rows(list.body)[0];
    const got = await auth(request(server()).get(`${BASE}/${first.id}`)).expect(200);
    expect(got.body.id).toBe(first.id);
    await auth(request(server()).get(`${BASE}/${ZERO}`)).expect(404);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  it("tenant A's movements, balances, and fixtures are invisible to tenant B", async () => {
    const list = await auth(request(server()).get(`${BASE}?itemId=${itemId}`)).expect(200);
    const movementId = rows(list.body)[0].id;

    await authB(request(server()).get(`${BASE}/${movementId}`)).expect(404);

    const listB = await authB(request(server()).get(`${BASE}?itemId=${itemId}`)).expect(200);
    expect(rows(listB.body)).toHaveLength(0);

    const balB = await authB(
      request(server()).get(`${BASE}/balance?itemId=${itemId}`),
    ).expect(200);
    expect(balB.body).toHaveLength(0);

    // tenant B cannot move stock against tenant A's item/warehouse
    await authB(request(server()).post(BASE)).send(txBody()).expect(404);
  });
});
