// ============================================================================
// E2E tests for the production cluster (SalesOrders + ProductionPlans) —
// spec-019-production-cluster
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation needs
// BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// Fixtures (customer + item) created per run (E2E residue, incl. real MO rows).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e production-cluster
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const SO = '/api/sales-orders';
const PP = '/api/production-plans';

describe('ProductionCluster (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let custId: string;
  let itemId: string;

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

  const soRows = (body: unknown): Array<{ id: string }> =>
    Array.isArray(body)
      ? (body as Array<{ id: string }>)
      : ((body as { salesOrders?: Array<{ id: string }> }).salesOrders ?? []);
  const ppRows = (body: unknown): Array<{ id: string }> =>
    Array.isArray(body)
      ? (body as Array<{ id: string }>)
      : ((body as { productionPlans?: Array<{ id: string }> }).productionPlans ?? []);

  const soBody = (over: Record<string, unknown> = {}) => ({
    customerId: custId,
    lines: [{ itemId, orderedQuantity: 10, uom: 'PCS', unitPrice: 100, discountPercent: 10 }],
    ...over,
  });

  const ppBody = (over: Record<string, unknown> = {}) => ({
    title: 'E2E plan',
    horizon: 'monthly',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    lines: [
      {
        itemId,
        plannedQty: 100,
        uom: 'PCS',
        plannedStart: '2026-07-07',
        plannedEnd: '2026-07-14',
      },
    ],
    ...over,
  });

  const createConfirmedPlan = async () => {
    const plan = await auth(request(server()).post(PP)).send(ppBody()).expect(201);
    await auth(request(server()).patch(`${PP}/${plan.body.id}/status/confirmed`)).expect(200);
    return plan.body;
  };

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
    const cust = await auth(request(server()).post('/api/customers'))
      .send({ name: `E2E PC Customer ${n}` })
      .expect(201);
    custId = cust.body.id;
    const item = await auth(request(server()).post('/api/items'))
      .send({ name: `E2E PC Item ${n}`, itemType: 'finished_good', baseUom: 'PCS' })
      .expect(201);
    itemId = item.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET both list routes → 401 without a token', async () => {
    await request(server()).get(SO).expect(401);
    await request(server()).get(PP).expect(401);
  });

  // NOTE: 403 (missing SALES:*/MFG:* permission) is not covered — no limited-role fixture.

  // ── Sales orders — create + totals ─────────────────────────────────────────
  it('POST SO → 201 with SO-YYYY-NNNN, draft, derived totals (qty 10 × 100 − 10% = 900)', async () => {
    const res = await auth(request(server()).post(SO)).send(soBody()).expect(201);
    expect(res.body.soNumber).toMatch(/^SO-\d{4}-\d{4}$/);
    expect(res.body.status).toBe('draft');
    expect(Number(res.body.subtotal)).toBe(900);
    expect(Number(res.body.total)).toBe(900);
    expect(res.body.lines[0].lineNumber).toBe(1);
  });

  it('[GAP] POST SO with discountPercent 200 → 400 (no negative totals)', () =>
    auth(request(server()).post(SO))
      .send(
        soBody({
          lines: [
            { itemId, orderedQuantity: 1, uom: 'PCS', unitPrice: 100, discountPercent: 200 },
          ],
        }),
      )
      .expect(400));

  it('POST SO with unknown customer/item → 404; empty body → 400', async () => {
    await auth(request(server()).post(SO)).send(soBody({ customerId: ZERO })).expect(404);
    await auth(request(server()).post(SO))
      .send(soBody({ lines: [{ itemId: ZERO, orderedQuantity: 1, uom: 'PCS', unitPrice: 1 }] }))
      .expect(404);
    await auth(request(server()).post(SO)).send({}).expect(400);
  });

  // ── Sales orders — list envelope + query DTO ───────────────────────────────
  it('[GAP] GET SO → { salesOrders, count }; ?status=weird → 400', async () => {
    const res = await auth(request(server()).get(SO)).expect(200);
    expect(res.body).toHaveProperty('salesOrders');
    expect(res.body).toHaveProperty('count');
    await auth(request(server()).get(`${SO}?status=weird`)).expect(400);
  });

  // ── Sales orders — state machine ([GAP] — none exists today) ───────────────
  it('[GAP] SO status machine: legal chain passes, illegal jumps and unknown targets → 400', async () => {
    const so = await auth(request(server()).post(SO)).send(soBody()).expect(201);
    const id = so.body.id;

    await auth(request(server()).patch(`${SO}/${id}/status/shipped`)).expect(400); // draft→shipped illegal
    await auth(request(server()).patch(`${SO}/${id}/status/banana`)).expect(400); // unknown target
    await auth(request(server()).patch(`${SO}/${id}/status/confirmed`)).expect(200);
    await auth(request(server()).patch(`${SO}/${id}/status/draft`)).expect(400); // no going back
    await auth(request(server()).patch(`${SO}/${id}/status/shipped`)).expect(200);
    await auth(request(server()).patch(`${SO}/${id}/status/delivered`)).expect(200);
    await auth(request(server()).patch(`${SO}/${id}/status/closed`)).expect(200);
    await auth(request(server()).patch(`${SO}/${id}/status/cancelled`)).expect(400); // terminal
  });

  it('SO update/delete are draft-only; [GAP] foreign customerId on update → 404', async () => {
    const so = await auth(request(server()).post(SO)).send(soBody()).expect(201);
    const id = so.body.id;

    await auth(request(server()).patch(`${SO}/${id}`))
      .send({ customerId: ZERO })
      .expect(404); // [GAP] re-validation

    await auth(request(server()).patch(`${SO}/${id}`)).send({ notes: 'ok' }).expect(200);
    await auth(request(server()).patch(`${SO}/${id}/status/confirmed`)).expect(200);
    await auth(request(server()).patch(`${SO}/${id}`)).send({ notes: 'no' }).expect(400);
    await auth(request(server()).delete(`${SO}/${id}`)).expect(400); // not draft

    const draft = await auth(request(server()).post(SO)).send(soBody()).expect(201);
    const deleted = await auth(request(server()).delete(`${SO}/${draft.body.id}`)).expect(200);
    expect(deleted.body).toEqual(
      expect.objectContaining({ message: expect.any(String), id: draft.body.id }),
    );
    await auth(request(server()).get(`${SO}/${draft.body.id}`)).expect(404);
  });

  // ── Production plans — create with SO peg + auto-BOM ──────────────────────
  it('POST PP pegged to a SO line → 201 PP-YYYY-NNNN draft; [GAP] inverted dates → 400', async () => {
    const so = await auth(request(server()).post(SO)).send(soBody()).expect(201);
    const soFull = await auth(request(server()).get(`${SO}/${so.body.id}`)).expect(200);
    const soLineId = soFull.body.lines[0].id;

    const plan = await auth(request(server()).post(PP))
      .send(
        ppBody({
          lines: [
            {
              itemId,
              plannedQty: 100,
              uom: 'PCS',
              plannedStart: '2026-07-07',
              plannedEnd: '2026-07-14',
              soLineId,
            },
          ],
        }),
      )
      .expect(201);
    expect(plan.body.planNumber).toMatch(/^PP-\d{4}-\d{4}$/);
    expect(plan.body.status).toBe('draft');
    expect(plan.body.lines[0].status).toBe('pending');

    // [GAP] periodEnd < periodStart → 400
    await auth(request(server()).post(PP))
      .send(ppBody({ periodStart: '2026-07-31', periodEnd: '2026-07-01' }))
      .expect(400);
  });

  it('[GAP] GET PP → { productionPlans, count }; ?horizon=weird → 400', async () => {
    const res = await auth(request(server()).get(PP)).expect(200);
    expect(res.body).toHaveProperty('productionPlans');
    expect(res.body).toHaveProperty('count');
    await auth(request(server()).get(`${PP}?horizon=weird`)).expect(400);
  });

  it('PP status machine (preserved): draft→completed → 400; draft→confirmed → 200', async () => {
    const plan = await auth(request(server()).post(PP)).send(ppBody()).expect(201);
    await auth(request(server()).patch(`${PP}/${plan.body.id}/status/completed`)).expect(400);
    await auth(request(server()).patch(`${PP}/${plan.body.id}/status/confirmed`)).expect(200);
  });

  // ── generate-mos + link-mo (the supply edge) ───────────────────────────────
  it('generate-mos creates the MO, flips the line, promotes the plan; rerun creates 0', async () => {
    const plan = await createConfirmedPlan();

    const gen = await auth(request(server()).post(`${PP}/${plan.id}/generate-mos`))
      .send({})
      .expect(201);
    expect(gen.body.created).toBe(1);
    expect(gen.body.mos[0].poNumber).toMatch(/^MO-\d{4}-\d{4}$/);

    const after = await auth(request(server()).get(`${PP}/${plan.id}`)).expect(200);
    expect(after.body.status).toBe('in_progress');
    expect(after.body.lines[0].status).toBe('mo_created');
    expect(after.body.lines[0].productionOrders).toHaveLength(1);

    const rerun = await auth(request(server()).post(`${PP}/${plan.id}/generate-mos`))
      .send({})
      .expect(201);
    expect(rerun.body.created).toBe(0);
  });

  it('[GAP] generate-mos body validated; link-mo guards steal + already-linked', async () => {
    // invalid lineIds type → 400 (GenerateMosDto)
    const planA = await createConfirmedPlan();
    await auth(request(server()).post(`${PP}/${planA.id}/generate-mos`))
      .send({ lineIds: ['not-a-uuid'] })
      .expect(400);

    // generate a real MO on plan A
    const gen = await auth(request(server()).post(`${PP}/${planA.id}/generate-mos`))
      .send({})
      .expect(201);
    const moId = gen.body.mos[0].id;
    const lineA = planA.lines[0].id;

    // link-mo body validation → 400 ([GAP] LinkMoDto)
    const planB = await createConfirmedPlan();
    const lineB = planB.lines[0].id;
    await auth(request(server()).post(`${PP}/${planB.id}/lines/${lineB}/link-mo`))
      .send({ moId: 'not-a-uuid' })
      .expect(400);

    // [GAP] stealing an MO already linked to plan A's line → 409
    await auth(request(server()).post(`${PP}/${planB.id}/lines/${lineB}/link-mo`))
      .send({ moId })
      .expect(409);

    // [GAP] linking onto a line that is already mo_created → 400
    await auth(request(server()).post(`${PP}/${planA.id}/lines/${lineA}/link-mo`))
      .send({ moId })
      .expect(400);
  });

  it('actual-vs-planned aggregates variance and MO summary', async () => {
    const plan = await createConfirmedPlan();
    await auth(request(server()).post(`${PP}/${plan.id}/generate-mos`)).send({}).expect(201);
    const avp = await auth(
      request(server()).get(`${PP}/${plan.id}/actual-vs-planned`),
    ).expect(200);
    expect(avp.body.summary[0].plannedQty).toBe(100);
    expect(avp.body.summary[0].moSummary.total).toBe(1);
    expect(avp.body.totals.totalPlanned).toBe(100);
    expect(avp.body.totals.linesMoCreated).toBe(1);
  });

  // ── 404s ──────────────────────────────────────────────────────────────────
  it('unknown ids → 404 across both modules', async () => {
    await auth(request(server()).get(`${SO}/${ZERO}`)).expect(404);
    await auth(request(server()).patch(`${SO}/${ZERO}/status/confirmed`)).expect(404);
    await auth(request(server()).get(`${PP}/${ZERO}`)).expect(404);
    await auth(request(server()).post(`${PP}/${ZERO}/generate-mos`)).send({}).expect(404);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  it("tenant A's SOs and plans are invisible and immutable for tenant B", async () => {
    const so = await auth(request(server()).post(SO)).send(soBody()).expect(201);
    const plan = await auth(request(server()).post(PP)).send(ppBody()).expect(201);

    await authB(request(server()).get(`${SO}/${so.body.id}`)).expect(404);
    await authB(request(server()).patch(`${SO}/${so.body.id}/status/confirmed`)).expect(404);
    await authB(request(server()).delete(`${SO}/${so.body.id}`)).expect(404);
    await authB(request(server()).get(`${PP}/${plan.body.id}`)).expect(404);
    await authB(
      request(server()).post(`${PP}/${plan.body.id}/generate-mos`),
    )
      .send({})
      .expect(404);

    const soListB = await authB(request(server()).get(SO)).expect(200);
    expect(soRows(soListB.body).map((r) => r.id)).not.toContain(so.body.id);
    const ppListB = await authB(request(server()).get(PP)).expect(200);
    expect(ppRows(ppListB.body).map((r) => r.id)).not.toContain(plan.body.id);

    // tenant B cannot build on tenant A's fixtures
    await authB(request(server()).post(SO)).send(soBody()).expect(404);
  });
});
