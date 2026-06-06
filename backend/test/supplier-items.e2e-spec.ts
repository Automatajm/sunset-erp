// ============================================================================
// E2E tests for the SupplierItems controller — spec-018-supplier-items
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run, AND the UOM catalog seeded
// (`npx ts-node prisma/seed-uom.ts`) — fixtures pick two units from GET /api/uom/units.
// Cross-tenant isolation needs BOTH tenants: admin@demo.com + tenant2admin@demo.com.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e supplier-items
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const BASE = '/api/supplier-items';

describe('SupplierItems (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let uom1: string; // catalog unit used as the item's purchase UOM
  let uom2: string; // a different unit (mismatch tests)
  let itemWithUom: string;
  let itemNoUom: string;
  let sup1: string;
  let sup2: string;

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

  const rows = (body: unknown): Array<{ id: string; isPreferred?: boolean }> =>
    Array.isArray(body)
      ? (body as Array<{ id: string }>)
      : ((body as { supplierItems?: Array<{ id: string }> }).supplierItems ?? []);

  const siBody = (over: Record<string, unknown> = {}) => ({
    supplierId: sup1,
    itemId: itemWithUom,
    purchaseUomId: uom1,
    ...over,
  });

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

    // Two distinct catalog units (UOM catalog must be seeded — see header).
    const units = await auth(request(server()).get('/api/uom/units')).expect(200);
    const list = Array.isArray(units.body) ? units.body : (units.body.units ?? []);
    if (list.length < 2) {
      throw new Error('UOM catalog not seeded — run: npx ts-node prisma/seed-uom.ts');
    }
    uom1 = list[0].id;
    uom2 = list[1].id;

    const n = Math.floor(performance.now() * 1000);
    const i1 = await auth(request(server()).post('/api/items'))
      .send({
        name: `E2E SI Item ${n}`,
        itemType: 'raw_material',
        baseUom: 'PCS',
        purchaseUomId: uom1,
      })
      .expect(201);
    itemWithUom = i1.body.id;
    const i2 = await auth(request(server()).post('/api/items'))
      .send({ name: `E2E SI Item NoUom ${n}`, itemType: 'raw_material', baseUom: 'PCS' })
      .expect(201);
    itemNoUom = i2.body.id;
    const s1 = await auth(request(server()).post('/api/suppliers'))
      .send({ name: `E2E SI Supplier 1 ${n}` })
      .expect(201);
    sup1 = s1.body.id;
    const s2 = await auth(request(server()).post('/api/suppliers'))
      .send({ name: `E2E SI Supplier 2 ${n}` })
      .expect(201);
    sup2 = s2.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET / → 401 without a token', () => request(server()).get(BASE).expect(401));

  it('POST / → 401 with a junk token', () =>
    request(server()).post(BASE).set('Authorization', 'Bearer junk').send({}).expect(401));

  // NOTE: 403 (missing INVENTORY:* permission) is not covered — no limited-role fixture.

  // ── Create + UOM rule ─────────────────────────────────────────────────────
  it('POST → 201 with conversionPreview and defaults; duplicate → 409', async () => {
    const res = await auth(request(server()).post(BASE)).send(siBody()).expect(201);
    expect(res.body.conversionPreview).toContain('= 1');
    expect(res.body.isPreferred).toBe(false);
    expect(Number(res.body.moq)).toBe(1);
    await auth(request(server()).post(BASE)).send(siBody()).expect(409);
  });

  it('POST with mismatched purchaseUomId → 400 naming both codes', async () => {
    const res = await auth(request(server()).post(BASE))
      .send(siBody({ supplierId: sup2, purchaseUomId: uom2 }))
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('mismatch');
  });

  it('POST against an item without a purchase UOM → 400', () =>
    auth(request(server()).post(BASE))
      .send(siBody({ itemId: itemNoUom }))
      .expect(400));

  it('[GAP] POST with a bogus/foreign supplierId → 404, never a FK 500', () =>
    auth(request(server()).post(BASE))
      .send(siBody({ supplierId: ZERO, itemId: itemWithUom }))
      .expect(404));

  it('POST unknown item → 404; empty body → 400', async () => {
    await auth(request(server()).post(BASE)).send(siBody({ itemId: ZERO })).expect(404);
    await auth(request(server()).post(BASE)).send({}).expect(400);
  });

  it('[GAP] POST lastPrice beyond the Decimal cap → 400, never 500', () =>
    auth(request(server()).post(BASE))
      .send(siBody({ supplierId: sup2, lastPrice: 1e15 }))
      .expect(400));

  // ── Reactivation ──────────────────────────────────────────────────────────
  it('DELETE then re-POST the same (supplier, item) reactivates the same row', async () => {
    const list = await auth(
      request(server()).get(`${BASE}?itemId=${itemWithUom}&supplierId=${sup1}`),
    ).expect(200);
    const originalId = rows(list.body)[0].id;

    await auth(request(server()).delete(`${BASE}/${originalId}`)).expect(200);
    await auth(request(server()).get(`${BASE}/${originalId}`)).expect(404); // soft-deleted

    const recreated = await auth(request(server()).post(BASE))
      .send(siBody({ lastPrice: 99 }))
      .expect(201);
    expect(recreated.body.id).toBe(originalId); // same row, reactivated
    expect(Number(recreated.body.lastPrice)).toBe(99); // merged dto field
  });

  // ── Preferred-supplier management ─────────────────────────────────────────
  it('preferred exclusivity: second preferred clears the first; [GAP] delete clears defaultSupplierId', async () => {
    // make sup1's entry preferred
    const list = await auth(
      request(server()).get(`${BASE}?itemId=${itemWithUom}&supplierId=${sup1}`),
    ).expect(200);
    const si1 = rows(list.body)[0].id;
    await auth(request(server()).patch(`${BASE}/${si1}`))
      .send({ isPreferred: true })
      .expect(200);

    // sup2 becomes preferred → sup1's flag cleared, item default mirrors sup2
    const si2 = await auth(request(server()).post(BASE))
      .send(siBody({ supplierId: sup2, isPreferred: true }))
      .expect(201);
    const after = await auth(
      request(server()).get(`${BASE}/by-item/${itemWithUom}`),
    ).expect(200);
    const prefs = rows(after.body).filter((r) => r.isPreferred);
    expect(prefs).toHaveLength(1);
    expect(prefs[0].id).toBe(si2.body.id);

    const item = await auth(request(server()).get(`/api/items/${itemWithUom}`)).expect(200);
    expect(item.body.defaultSupplierId).toBe(sup2);

    // [GAP] removing the preferred entry clears the dangling default
    await auth(request(server()).delete(`${BASE}/${si2.body.id}`)).expect(200);
    const itemAfter = await auth(
      request(server()).get(`/api/items/${itemWithUom}`),
    ).expect(200);
    expect(itemAfter.body.defaultSupplierId).toBeNull();
  });

  // ── List + query validation ───────────────────────────────────────────────
  it('[GAP] GET / → { supplierItems, count } envelope (also by-item / by-supplier)', async () => {
    const all = await auth(request(server()).get(BASE)).expect(200);
    expect(all.body).toHaveProperty('supplierItems');
    expect(all.body).toHaveProperty('count');
    const byItem = await auth(
      request(server()).get(`${BASE}/by-item/${itemWithUom}`),
    ).expect(200);
    expect(byItem.body).toHaveProperty('supplierItems');
    const bySup = await auth(
      request(server()).get(`${BASE}/by-supplier/${sup1}`),
    ).expect(200);
    expect(bySup.body).toHaveProperty('supplierItems');
  });

  it('[GAP] GET /?isPreferred=banana → 400; ?itemId=not-a-uuid → 400 (query DTO)', async () => {
    await auth(request(server()).get(`${BASE}?isPreferred=banana`)).expect(400);
    await auth(request(server()).get(`${BASE}?itemId=not-a-uuid`)).expect(400);
  });

  // ── Update / 404s ─────────────────────────────────────────────────────────
  it('PATCH updates fields; mismatched purchaseUomId on update → 400', async () => {
    const list = await auth(
      request(server()).get(`${BASE}?itemId=${itemWithUom}&supplierId=${sup1}`),
    ).expect(200);
    const id = rows(list.body)[0].id;
    const updated = await auth(request(server()).patch(`${BASE}/${id}`))
      .send({ lastPrice: 47.5 })
      .expect(200);
    expect(Number(updated.body.lastPrice)).toBe(47.5);
    await auth(request(server()).patch(`${BASE}/${id}`))
      .send({ purchaseUomId: uom2 })
      .expect(400);
  });

  it('GET/PATCH/DELETE → 404 for unknown ids', async () => {
    await auth(request(server()).get(`${BASE}/${ZERO}`)).expect(404);
    await auth(request(server()).patch(`${BASE}/${ZERO}`)).send({ lastPrice: 1 }).expect(404);
    await auth(request(server()).delete(`${BASE}/${ZERO}`)).expect(404);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  it("tenant A's supplier-items and fixtures are invisible to tenant B", async () => {
    const list = await auth(
      request(server()).get(`${BASE}?itemId=${itemWithUom}&supplierId=${sup1}`),
    ).expect(200);
    const id = rows(list.body)[0].id;

    await authB(request(server()).get(`${BASE}/${id}`)).expect(404);
    await authB(request(server()).patch(`${BASE}/${id}`)).send({ lastPrice: 1 }).expect(404);
    await authB(request(server()).delete(`${BASE}/${id}`)).expect(404);

    const listB = await authB(request(server()).get(`${BASE}?itemId=${itemWithUom}`)).expect(
      200,
    );
    expect(rows(listB.body)).toHaveLength(0);

    // [GAP-adjacent] tenant B cannot link tenant A's supplier/item (404 either way)
    await authB(request(server()).post(BASE)).send(siBody()).expect(404);
  });
});
