// ============================================================================
// E2E tests for the BOM controller — spec-011-bom
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run, UOM catalog seeded
// (cfg_uom_units non-empty). Cross-tenant tests need BOTH tenants:
// admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e bom.e2e
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';

describe('BOM (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let itemId: string; // parent item fixture (DEMO)
  let cgId: string; // consumption group fixture (DEMO)
  let wcId: string; // work center fixture (DEMO)

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

    const authed = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

    // Fixtures: item, UOM unit → consumption group, work center.
    const item = await authed(request(app.getHttpServer()).post('/api/items'))
      .send({
        name: 'E2E BOM Parent ' + Math.floor(performance.now()),
        itemType: 'finished_good',
        baseUom: 'PCS',
      })
      .expect(201);
    itemId = item.body.id;

    const units = await authed(request(app.getHttpServer()).get('/api/uom/units')).expect(200);
    const unitRows = Array.isArray(units.body) ? units.body : (units.body.units ?? []);
    if (!unitRows.length)
      throw new Error('UOM catalog empty — run: npx ts-node prisma/seed-uom.ts');

    const cg = await authed(request(app.getHttpServer()).post('/api/consumption-groups'))
      .send({ name: 'E2E BOM Group ' + Math.floor(performance.now()), consumptionUomId: unitRows[0].id })
      .expect(201);
    cgId = cg.body.id;

    const wc = await authed(request(app.getHttpServer()).post('/api/work-centers'))
      .send({ code: 'E2EBWC-' + Math.floor(performance.now()), name: 'E2E BOM WC' })
      .expect(201);
    wcId = wc.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const authB = (req: request.Test) => req.set('Authorization', `Bearer ${tokenB}`);
  const server = () => app.getHttpServer();
  const validBom = () => ({
    itemId,
    bomCode: 'E2EBOM-' + Math.floor(performance.now()),
    components: [{ consumptionGroupId: cgId, quantity: 0.15, uom: 'KG', scrapPercent: 3 }],
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET /api/bom → 401 without a token', () => request(server()).get('/api/bom').expect(401));

  it('GET /api/bom → 401 with a junk token', () =>
    request(server()).get('/api/bom').set('Authorization', 'Bearer junk').expect(401));

  // ── Happy paths ───────────────────────────────────────────────────────────
  it('GET /api/bom → 200 with token', () => auth(request(server()).get('/api/bom')).expect(200));

  it('[GAP] GET /api/bom → returns { boms, count } envelope', () =>
    auth(request(server()).get('/api/bom'))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('boms');
        expect(r.body).toHaveProperty('count');
      }));

  it('POST /api/bom → 201 with sequential lineNumbers, numeric Decimals, auto-filled consumption UOM', async () => {
    const res = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    expect(res.body.parentItem.id).toBe(itemId);
    const comp = res.body.components[0];
    expect(comp.lineNumber).toBe(1);
    expect(comp.quantityPer).toBe(0.15); // number, not Decimal string
    expect(comp.scrapPercent).toBe(3);
    expect(comp.consumptionUomId).toBeTruthy(); // auto-filled from the group
  });

  it('GET /api/bom/:id → 200 with components and routings arrays; 404 for unknown', async () => {
    const created = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    const res = await auth(request(server()).get(`/api/bom/${created.body.id}`)).expect(200);
    expect(Array.isArray(res.body.components)).toBe(true);
    expect(Array.isArray(res.body.routings)).toBe(true);
    await auth(request(server()).get(`/api/bom/${ZERO}`)).expect(404);
  });

  it('PATCH /api/bom/:id → 200 updates header fields', async () => {
    const created = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    const res = await auth(request(server()).patch(`/api/bom/${created.body.id}`))
      .send({ isActive: false })
      .expect(200);
    expect(res.body.isActive).toBe(false);
  });

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST /api/bom → 400 when components are missing', () =>
    auth(request(server()).post('/api/bom')).send({ itemId }).expect(400));

  it('POST /api/bom → 404 on an unknown parent item / consumption group', async () => {
    await auth(request(server()).post('/api/bom'))
      .send({ ...validBom(), itemId: ZERO })
      .expect(404);
    await auth(request(server()).post('/api/bom'))
      .send({
        ...validBom(),
        components: [{ consumptionGroupId: ZERO, quantity: 1, uom: 'KG' }],
      })
      .expect(404);
  });

  it('POST /api/bom → 409 on a duplicate bomCode', async () => {
    const body = validBom();
    await auth(request(server()).post('/api/bom')).send(body).expect(201);
    await auth(request(server()).post('/api/bom')).send(body).expect(409);
  });

  it('[GAP] POST /api/bom → 400 on the removed phantom description field', () =>
    auth(request(server()).post('/api/bom'))
      .send({ ...validBom(), description: 'phantom' })
      .expect(400));

  it('[GAP] PATCH /api/bom/:id with description → 400 (previously a Prisma 500)', async () => {
    const created = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    await auth(request(server()).patch(`/api/bom/${created.body.id}`))
      .send({ description: 'crashes today' })
      .expect(400);
  });

  it('[GAP] POST /api/bom → 400 on a non-digit version (currently parseInt NaN → 500)', () =>
    auth(request(server()).post('/api/bom'))
      .send({ ...validBom(), version: 'abc' })
      .expect(400));

  it('[GAP] POST /api/bom → 400 on scrapPercent above 100', () =>
    auth(request(server()).post('/api/bom'))
      .send({
        ...validBom(),
        components: [{ consumptionGroupId: cgId, quantity: 1, uom: 'KG', scrapPercent: 150 }],
      })
      .expect(400));

  it('[GAP] PATCH re-parenting to an unknown itemId → 404 (cross-tenant vector)', async () => {
    const created = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    await auth(request(server()).patch(`/api/bom/${created.body.id}`))
      .send({ itemId: ZERO })
      .expect(404);
  });

  it("[GAP] PATCH re-parenting to ANOTHER TENANT's item → 404", async () => {
    const itemB = await authB(request(server()).post('/api/items'))
      .send({
        name: 'E2E B Item ' + Math.floor(performance.now()),
        itemType: 'finished_good',
        baseUom: 'PCS',
      })
      .expect(201);
    const created = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    await auth(request(server()).patch(`/api/bom/${created.body.id}`))
      .send({ itemId: itemB.body.id })
      .expect(404);
  });

  // ── Calculations ──────────────────────────────────────────────────────────
  it('GET /api/bom/:id/calculate/:quantity → correct scrap math', async () => {
    const created = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    const res = await auth(
      request(server()).get(`/api/bom/${created.body.id}/calculate/100`),
    ).expect(200);
    const req = res.body.requirements[0];
    expect(req.requiredQuantity).toBeCloseTo(15); // 0.15 × 100
    expect(req.scrapQuantity).toBeCloseTo(0.45); // 15 × 3%
    expect(req.totalQuantity).toBeCloseTo(15.45);
  });

  it('[GAP] GET /api/bom/:id/calculate/abc → 400 (currently NaN math in a 200)', async () => {
    const created = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    await auth(request(server()).get(`/api/bom/${created.body.id}/calculate/abc`)).expect(400);
  });

  it('GET /api/bom/:id/material-suggestions/:quantity → qtyPlanned includes scrap', async () => {
    const created = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    const res = await auth(
      request(server()).get(`/api/bom/${created.body.id}/material-suggestions/100`),
    ).expect(200);
    expect(res.body[0].qtyPlanned).toBeCloseTo(15.45);
    expect(res.body[0].consumptionGroupId).toBe(cgId);
  });

  // ── Routing steps ─────────────────────────────────────────────────────────
  it('routing lifecycle: add 201 → duplicate 409 → bad WC 404 → list → update → labor estimate → delete', async () => {
    const bom = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    const bomId = bom.body.id;

    const step = await auth(request(server()).post(`/api/bom/${bomId}/routing`))
      .send({ stepNumber: 10, workCenterId: wcId, setupTime: 0.5, runTimePerUnit: 0.004 })
      .expect(201);
    expect(step.body.setupTime).toBe(0.5); // number, not Decimal string

    await auth(request(server()).post(`/api/bom/${bomId}/routing`))
      .send({ stepNumber: 10, workCenterId: wcId })
      .expect(409);

    await auth(request(server()).post(`/api/bom/${bomId}/routing`))
      .send({ stepNumber: 20, workCenterId: ZERO })
      .expect(404);

    const list = await auth(request(server()).get(`/api/bom/${bomId}/routing`)).expect(200);
    expect(list.body).toHaveLength(1);

    const updated = await auth(
      request(server()).patch(`/api/bom/${bomId}/routing/${step.body.id}`),
    )
      .send({ description: 'Grill patties' })
      .expect(200);
    expect(updated.body.description).toBe('Grill patties');

    const estimate = await auth(
      request(server()).get(`/api/bom/${bomId}/routing/labor-estimate/1000`),
    ).expect(200);
    expect(estimate.body.totalSetupHours).toBeCloseTo(0.5);
    expect(estimate.body.totalRunHours).toBeCloseTo(4);

    await auth(request(server()).delete(`/api/bom/${bomId}/routing/${step.body.id}`)).expect(200);
    const after = await auth(request(server()).get(`/api/bom/${bomId}/routing`)).expect(200);
    expect(after.body).toHaveLength(0);
  });

  // ── Soft delete ───────────────────────────────────────────────────────────
  it('DELETE /api/bom/:id → 200 then GET → 404 (soft-deleted); 404 for unknown', async () => {
    const created = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    await auth(request(server()).delete(`/api/bom/${created.body.id}`)).expect(200);
    await auth(request(server()).get(`/api/bom/${created.body.id}`)).expect(404);
    await auth(request(server()).delete(`/api/bom/${ZERO}`)).expect(404);
  });

  // NOTE: the production-plan delete guard (DELETE → 400) is unit-tested only — there is
  // no production-plan API fixture until the production cluster spec. TODO(cluster spec).

  // ── Tenant isolation ──────────────────────────────────────────────────────
  it('a BOM created under tenant A is 404/absent/immutable for tenant B', async () => {
    const created = await auth(request(server()).post('/api/bom')).send(validBom()).expect(201);
    const id = created.body.id;

    await authB(request(server()).get(`/api/bom/${id}`)).expect(404);
    await authB(request(server()).patch(`/api/bom/${id}`)).send({ isActive: false }).expect(404);
    await authB(request(server()).delete(`/api/bom/${id}`)).expect(404);
    await authB(request(server()).post(`/api/bom/${id}/routing`))
      .send({ stepNumber: 10, workCenterId: wcId })
      .expect(404);

    const listB = await authB(request(server()).get('/api/bom')).expect(200);
    const rows = Array.isArray(listB.body) ? listB.body : (listB.body.boms ?? []);
    expect(rows.map((b: { id: string }) => b.id)).not.toContain(id);

    const stillA = await auth(request(server()).get(`/api/bom/${id}`)).expect(200);
    expect(stillA.body.id).toBe(id);
  });
});
