// ============================================================================
// E2E tests for the Warehouses controller — spec-004-warehouses
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

describe('Warehouses (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2

  // Handles both login shapes from spec-001: single tenant (token is already
  // tenant-scoped) and multi-tenant (requiresTenantSelection -> select the default tenant).
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
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const server = () => app.getHttpServer();
  const validWarehouse = () => ({
    name: 'E2E WH ' + Math.floor(performance.now()),
    warehouseType: 'regular',
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET /api/warehouses → 401 without a token', () =>
    request(server()).get('/api/warehouses').expect(401));

  it('GET /api/warehouses → 401 with a junk token', () =>
    request(server()).get('/api/warehouses').set('Authorization', 'Bearer junk').expect(401));

  // ── Happy paths ───────────────────────────────────────────────────────────
  it('GET /api/warehouses → 200 returns an array', () =>
    auth(request(server()).get('/api/warehouses'))
      .expect(200)
      .expect((r) => {
        expect(Array.isArray(r.body)).toBe(true);
      }));

  it('POST /api/warehouses → 201 and auto-generates a WH-{TYPE}-{NNN} code', () =>
    auth(request(server()).post('/api/warehouses'))
      .send(validWarehouse())
      .expect(201)
      .expect((r) => {
        expect(r.body.code).toMatch(/^WH-(REG|CON|TRN)-\d{3,}$/); // padStart(3) is a minimum — sequence can exceed 999
      }));

  it('GET /api/warehouses list entries carry enrichment keys', async () => {
    await auth(request(server()).post('/api/warehouses')).send(validWarehouse()).expect(201);
    const res = await auth(request(server()).get('/api/warehouses')).expect(200);
    expect(res.body[0]).toHaveProperty('stockCount');
    expect(res.body[0]).toHaveProperty('zoneCount');
    expect(res.body[0]).toHaveProperty('occupancyPct');
    expect(res.body[0]).toHaveProperty('capacityPallets');
  });

  it('GET /api/warehouses/:id/stats → 200 with locations + capacity shape', async () => {
    const created = await auth(request(server()).post('/api/warehouses'))
      .send(validWarehouse())
      .expect(201);
    const res = await auth(
      request(server()).get(`/api/warehouses/${created.body.id}/stats`),
    ).expect(200);
    expect(res.body).toHaveProperty('locations');
    expect(res.body).toHaveProperty('capacity');
    expect(res.body).toHaveProperty('stockLines');
  });

  it('GET /api/warehouses/:id/location-tree → 200 returns an array', async () => {
    const created = await auth(request(server()).post('/api/warehouses'))
      .send(validWarehouse())
      .expect(201);
    const res = await auth(
      request(server()).get(`/api/warehouses/${created.body.id}/location-tree`),
    ).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST /api/warehouses → 400 when required name is missing', () =>
    auth(request(server()).post('/api/warehouses')).send({}).expect(400));

  it('[GAP] POST /api/warehouses → 400 on an invalid warehouseType (needs @IsIn)', () =>
    auth(request(server()).post('/api/warehouses'))
      .send({ name: 'Bad Type', warehouseType: 'not_a_type' })
      .expect(400));

  it('GET /api/warehouses/:id → 404 for an unknown / other-tenant id', () =>
    auth(request(server()).get('/api/warehouses/00000000-0000-0000-0000-000000000000')).expect(404));

  it('DELETE /api/warehouses/:id → 404 for an unknown id', () =>
    auth(
      request(server()).delete('/api/warehouses/00000000-0000-0000-0000-000000000000'),
    ).expect(404));

  // ── Duplicate code → 409 ──────────────────────────────────────────────────
  it('POST /api/warehouses → 409 on a duplicate explicit code', async () => {
    // Unique across runs — performance.now() % 100 only had 100 possible values and
    // collided with residue from prior runs (first POST already 409'd).
    const code = `WHDUP-${Date.now()}`;
    await auth(request(server()).post('/api/warehouses'))
      .send({ ...validWarehouse(), code })
      .expect(201);
    await auth(request(server()).post('/api/warehouses'))
      .send({ ...validWarehouse(), code })
      .expect(409);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  // A: DEMO (token), B: TENANT2 (tokenB). A warehouse created under A must be
  // invisible to B — both as a 404 on the detail route and as an absence from B's list.
  it('a warehouse created under tenant A is 404/absent for tenant B', async () => {
    const authB = (req: request.Test) => req.set('Authorization', `Bearer ${tokenB}`);

    const created = await auth(request(server()).post('/api/warehouses'))
      .send(validWarehouse())
      .expect(201);
    const id = created.body.id;

    // B cannot fetch A's warehouse by id.
    await authB(request(server()).get(`/api/warehouses/${id}`)).expect(404);

    // B's list does not contain A's warehouse.
    const listB = await authB(request(server()).get('/api/warehouses')).expect(200);
    const ids = listB.body.map((w: { id: string }) => w.id);
    expect(ids).not.toContain(id);
  });
});
