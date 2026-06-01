// ============================================================================
// E2E tests for the Items controller — spec-003-items
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation needs
// BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Items (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2

  const login = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Admin123!' })
      .then((r) => r.body.access_token);

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
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const server = () => app.getHttpServer();
  const validItem = () => ({
    name: 'E2E Item ' + Math.floor(performance.now()),
    itemType: 'raw_material',
    baseUom: 'PCS',
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET /api/items → 401 without a token', () =>
    request(server()).get('/api/items').expect(401));

  it('GET /api/items → 401 with a junk token', () =>
    request(server()).get('/api/items').set('Authorization', 'Bearer junk').expect(401));

  // ── Happy paths ───────────────────────────────────────────────────────────
  it('GET /api/items → 200 with token', () =>
    auth(request(server()).get('/api/items')).expect(200));

  it('[GAP] GET /api/items → returns { items, count } envelope', () =>
    auth(request(server()).get('/api/items'))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('items');
        expect(r.body).toHaveProperty('count');
      }));

  it('POST /api/items → 201 and auto-generates an ITEM-NNNN code', () =>
    auth(request(server()).post('/api/items'))
      .send(validItem())
      .expect(201)
      .expect((r) => {
        expect(r.body.code).toMatch(/^ITEM-\d{4}$/);
        expect(r.body.barcodeInternal).toBe(r.body.code);
      }));

  it('GET /api/items/statistics → 200 with aggregate shape', () =>
    auth(request(server()).get('/api/items/statistics'))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('total');
        expect(r.body).toHaveProperty('byType');
      }));

  it('GET /api/items/barcode/:scan → 200 resolves a created item', async () => {
    const created = await auth(request(server()).post('/api/items')).send(validItem()).expect(201);
    const res = await auth(
      request(server()).get(`/api/items/barcode/${created.body.code}`),
    ).expect(200);
    expect(res.body.item.id).toBe(created.body.id);
    expect(['barcodeInternal', 'itemCode']).toContain(res.body.matchedBy);
  });

  it('GET /api/items/barcode/:scan → 404 when nothing matches', () =>
    auth(request(server()).get('/api/items/barcode/NO-SUCH-CODE-XYZ')).expect(404));

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST /api/items → 400 when required fields are missing', () =>
    auth(request(server()).post('/api/items')).send({}).expect(400));

  it('[GAP] POST /api/items → 400 on an invalid itemType (needs @IsIn)', () =>
    auth(request(server()).post('/api/items'))
      .send({ name: 'Bad Type', itemType: 'not_a_type', baseUom: 'PCS' })
      .expect(400));

  it('[GAP] POST /api/items → 400 on an invalid valuationMethod (needs @IsIn)', () =>
    auth(request(server()).post('/api/items'))
      .send({ name: 'Bad Val', itemType: 'service', baseUom: 'PCS', valuationMethod: 'not_a_method' })
      .expect(400));

  it('GET /api/items/:id → 404 for an unknown / other-tenant id', () =>
    auth(request(server()).get('/api/items/00000000-0000-0000-0000-000000000000')).expect(404));

  it('DELETE /api/items/:id → 404 for an unknown id', () =>
    auth(request(server()).delete('/api/items/00000000-0000-0000-0000-000000000000')).expect(404));

  // ── Duplicate code → 409 ──────────────────────────────────────────────────
  it('POST /api/items → 409 on a duplicate explicit code', async () => {
    const code = `ITEM-DUP-${Math.floor(performance.now())}`;
    await auth(request(server()).post('/api/items'))
      .send({ ...validItem(), code })
      .expect(201);
    await auth(request(server()).post('/api/items'))
      .send({ ...validItem(), code })
      .expect(409);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  // A: DEMO (token), B: TENANT2 (tokenB). An item created under A must be
  // invisible to B — both as a 404 on the detail route and as an absence from B's list.
  it('an item created under tenant A is 404/absent for tenant B', async () => {
    const authB = (req: request.Test) => req.set('Authorization', `Bearer ${tokenB}`);

    const created = await auth(request(server()).post('/api/items')).send(validItem()).expect(201);
    const id = created.body.id;

    // B cannot fetch A's item by id.
    await authB(request(server()).get(`/api/items/${id}`)).expect(404);

    // B's list does not contain A's item.
    const listB = await authB(request(server()).get('/api/items')).expect(200);
    const ids = (listB.body.items ?? listB.body).map((i: { id: string }) => i.id);
    expect(ids).not.toContain(id);
  });
});
