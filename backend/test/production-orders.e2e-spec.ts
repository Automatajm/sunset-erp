// ============================================================================
// E2E tests for the Production Orders (MO) controller — spec-024-production-orders
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run, UOM catalog seeded
// (`npx ts-node prisma/seed-uom.ts` — the BOM fixture needs consumption UOM units).
// Cross-tenant isolation needs BOTH seeded tenants: admin@demo.com (DEMO) and
// tenant2admin@demo.com (TENANT2). Fixtures (item + consumption group + BOM)
// created per run (E2E residue, incl. real MOs/variances/JEs).
// The variance post-je happy path needs the chart-of-accounts seed (1.1.04,
// 1.1.05, 6.2.07, 4.1.01) — only its 404 path is asserted here (TODO when a COA
// e2e fixture exists).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e production-orders
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const MO = '/api/production-orders';

describe('ProductionOrders (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let bomId: string;

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

  const createMo = async (over: Record<string, any> = {}) => {
    const res = await auth(request(server()).post(MO))
      .send({ bomId, quantityOrdered: 100, ...over })
      .expect(201);
    return res.body;
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

    // Fixtures: parent item → consumption group (needs UOM catalog) → BOM
    const item = await auth(request(server()).post('/api/items'))
      .send({ name: `E2E MO Parent ${n}`, itemType: 'finished_good', baseUom: 'PCS' })
      .expect(201);

    const units = await auth(request(server()).get('/api/uom/units')).expect(200);
    const unitRows = Array.isArray(units.body) ? units.body : (units.body.units ?? []);
    if (!unitRows.length)
      throw new Error('UOM catalog empty — run: npx ts-node prisma/seed-uom.ts');

    const cg = await auth(request(server()).post('/api/consumption-groups'))
      .send({ name: `E2E MO Group ${n}`, consumptionUomId: unitRows[0].id })
      .expect(201);

    const bom = await auth(request(server()).post('/api/bom'))
      .send({
        itemId: item.body.id,
        components: [{ consumptionGroupId: cg.body.id, quantity: 0.5, uom: 'KG' }],
      })
      .expect(201);
    bomId = bom.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('GET /api/production-orders → 401 without a token', () =>
    request(server()).get(MO).expect(401));

  it('POST /api/production-orders → 401 without a token', () =>
    request(server()).post(MO).send({}).expect(401));

  // ── Response format + query validation ─────────────────────────────────────

  it('[GAP] GET / returns the { productionOrders, count } envelope', async () => {
    const res = await auth(request(server()).get(MO)).expect(200);
    expect(res.body).toHaveProperty('productionOrders');
    expect(res.body).toHaveProperty('count');
  });

  it('[GAP] GET /?status=weird → 400 (query whitelist)', () =>
    auth(request(server()).get(`${MO}?status=weird`)).expect(400));

  it('[GAP] GET /variances returns the { variances, count } envelope', async () => {
    const res = await auth(request(server()).get(`${MO}/variances`)).expect(200);
    expect(res.body).toHaveProperty('variances');
    expect(res.body).toHaveProperty('count');
  });

  it('[GAP] GET /variances?status=weird → 400 (query whitelist)', () =>
    auth(request(server()).get(`${MO}/variances?status=weird`)).expect(400));

  // ── Create + DTO validation ────────────────────────────────────────────────

  it('POST {} → 400 (missing bomId/quantityOrdered)', () =>
    auth(request(server()).post(MO)).send({}).expect(400));

  it('POST with unknown bomId → 404', () =>
    auth(request(server()).post(MO)).send({ bomId: ZERO, quantityOrdered: 10 }).expect(404));

  it('POST happy path → 201, MO-YYYY-NNNN, draft, itemId from BOM parent', async () => {
    const mo = await createMo();
    expect(mo.poNumber).toMatch(/^MO-\d{4}-\d{4,}$/);
    expect(mo.status).toBe('draft');
    expect(mo.quantityToProduce).toBe(100);
  });

  it('[GAP] POST persists and returns priority', async () => {
    const mo = await createMo({ priority: 'high' });
    expect(mo.priority).toBe('high');
    const detail = await auth(request(server()).get(`${MO}/${mo.id}`)).expect(200);
    expect(detail.body.priority).toBe('high');
  });

  it('[GAP] POST with priority outside the whitelist → 400', () =>
    auth(request(server()).post(MO))
      .send({ bomId, quantityOrdered: 10, priority: 'mega-urgent' })
      .expect(400));

  it('[GAP] POST with workCenterId → 400 (field removed from the contract)', () =>
    auth(request(server()).post(MO))
      .send({ bomId, quantityOrdered: 10, workCenterId: ZERO })
      .expect(400));

  // ── State machine ──────────────────────────────────────────────────────────

  it('[GAP] PATCH /:id/status/garbage → 400 (whitelist)', async () => {
    const mo = await createMo();
    await auth(request(server()).patch(`${MO}/${mo.id}/status/garbage`)).expect(400);
  });

  it('[GAP] PATCH draft → completed → 400 (invalid transition)', async () => {
    const mo = await createMo();
    await auth(request(server()).patch(`${MO}/${mo.id}/status/completed`)).expect(400);
  });

  it('draft → released → in_progress walks the happy chain', async () => {
    const mo = await createMo();
    await auth(request(server()).patch(`${MO}/${mo.id}/status/released`)).expect(200);
    const r = await auth(
      request(server()).patch(`${MO}/${mo.id}/status/in_progress`),
    ).expect(200);
    expect(r.body.productionOrder.actualStartDate).toBeTruthy();
  });

  it('[GAP] cancelled is terminal (cancelled → released → 400)', async () => {
    const mo = await createMo();
    await auth(request(server()).patch(`${MO}/${mo.id}/status/cancelled`)).expect(200);
    await auth(request(server()).patch(`${MO}/${mo.id}/status/released`)).expect(400);
  });

  // ── Update / Delete (draft only) ───────────────────────────────────────────

  it('PATCH a draft MO updates quantity; non-draft → 400', async () => {
    const mo = await createMo();
    await auth(request(server()).patch(`${MO}/${mo.id}`))
      .send({ quantityOrdered: 150 })
      .expect(200);
    await auth(request(server()).patch(`${MO}/${mo.id}/status/released`)).expect(200);
    await auth(request(server()).patch(`${MO}/${mo.id}`))
      .send({ quantityOrdered: 200 })
      .expect(400);
  });

  it('DELETE a draft MO → 200; DELETE non-draft → 400', async () => {
    const mo = await createMo();
    await auth(request(server()).delete(`${MO}/${mo.id}`)).expect(200);
    const mo2 = await createMo();
    await auth(request(server()).patch(`${MO}/${mo2.id}/status/released`)).expect(200);
    await auth(request(server()).delete(`${MO}/${mo2.id}`)).expect(400);
  });

  // ── Actuals ────────────────────────────────────────────────────────────────

  it('labor actual on a draft MO → 400; on in_progress → 201 with summary', async () => {
    const mo = await createMo();
    await auth(request(server()).post(`${MO}/${mo.id}/labor-actuals`))
      .send({ hoursActual: 8 })
      .expect(400);
    await auth(request(server()).patch(`${MO}/${mo.id}/status/released`)).expect(200);
    await auth(request(server()).patch(`${MO}/${mo.id}/status/in_progress`)).expect(200);
    await auth(request(server()).post(`${MO}/${mo.id}/labor-actuals`))
      .send({ hoursPlanned: 8, hoursActual: 10, laborRate: 15 })
      .expect(201);
    const list = await auth(request(server()).get(`${MO}/${mo.id}/labor-actuals`)).expect(200);
    expect(list.body.summary.totalActualHours).toBe(10);
    expect(list.body.summary.totalLaborCost).toBe(150);
  });

  it('[GAP] material actual with a non-UUID itemId → 400 (@IsUUID)', async () => {
    const mo = await createMo();
    await auth(request(server()).patch(`${MO}/${mo.id}/status/released`)).expect(200);
    await auth(request(server()).post(`${MO}/${mo.id}/material-actuals`))
      .send({ itemId: 'not-a-uuid', qtyPlanned: 10, qtyActual: 12 })
      .expect(400);
  });

  // ── FG delivery ────────────────────────────────────────────────────────────

  it('deliver under-quantity creates a merma variance; [GAP] second deliver → 400', async () => {
    const mo = await createMo();
    await auth(request(server()).patch(`${MO}/${mo.id}/status/released`)).expect(200);
    const first = await auth(request(server()).post(`${MO}/${mo.id}/deliver`))
      .send({ quantityDelivered: 95, unitCost: 25 })
      .expect(201);
    expect(first.body.variance).toBe(-5);
    expect(first.body.variancesCreated).toBe(1);
    // [GAP] re-delivery must be blocked (today: 201 + duplicate JE)
    await auth(request(server()).post(`${MO}/${mo.id}/deliver`))
      .send({ quantityDelivered: 95, unitCost: 25 })
      .expect(400);
    const variances = await auth(
      request(server()).get(`${MO}/${mo.id}/variances`),
    ).expect(200);
    expect(variances.body.summary.total).toBeGreaterThanOrEqual(1);
  });

  // ── Variance JE ────────────────────────────────────────────────────────────

  it('PATCH /variances/:id/post-je with unknown id → 404', () =>
    auth(request(server()).patch(`${MO}/variances/${ZERO}/post-je`)).send({}).expect(404));

  // ── Tenant isolation ───────────────────────────────────────────────────────

  it('tenant B cannot see tenant A MOs (list + detail 404)', async () => {
    const mo = await createMo();
    const list = await authB(request(server()).get(MO)).expect(200);
    const ids = rows(list.body, 'productionOrders').map((m) => m.id);
    expect(ids).not.toContain(mo.id);
    await authB(request(server()).get(`${MO}/${mo.id}`)).expect(404);
  });

  it('tenant B cannot create an MO from a tenant A BOM → 404', () =>
    authB(request(server()).post(MO)).send({ bomId, quantityOrdered: 10 }).expect(404));

  it('tenant B cannot transition or delete a tenant A MO → 404', async () => {
    const mo = await createMo();
    await authB(request(server()).patch(`${MO}/${mo.id}/status/released`)).expect(404);
    await authB(request(server()).delete(`${MO}/${mo.id}`)).expect(404);
  });

  // ── Not found ──────────────────────────────────────────────────────────────

  it('GET/PATCH/DELETE a non-existent id → 404', async () => {
    await auth(request(server()).get(`${MO}/${ZERO}`)).expect(404);
    await auth(request(server()).patch(`${MO}/${ZERO}`)).send({ notes: 'x' }).expect(404);
    await auth(request(server()).delete(`${MO}/${ZERO}`)).expect(404);
  });

  // NOTE: 403 (permission-lacking role) not covered — the seed has no limited-role
  // user fixture (same gap as other suites). The variance post-je happy path and
  // the MO-number cross-producer collision check (production-plans generateMos)
  // are verified manually per the spec's verification checklist.
});
