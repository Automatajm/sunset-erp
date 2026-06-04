// ============================================================================
// E2E tests for the WorkCenters controller — spec-010-work-centers
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation needs
// BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e work-centers.e2e
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';

describe('WorkCenters (e2e)', () => {
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
  const authB = (req: request.Test) => req.set('Authorization', `Bearer ${tokenB}`);
  const server = () => app.getHttpServer();
  const validWC = () => ({
    code: 'E2EWC-' + Math.floor(performance.now()),
    name: 'E2E Work Center',
    workCenterType: 'machine',
    capacityPerHour: 120,
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET /api/work-centers → 401 without a token', () =>
    request(server()).get('/api/work-centers').expect(401));

  it('GET /api/work-centers → 401 with a junk token', () =>
    request(server())
      .get('/api/work-centers')
      .set('Authorization', 'Bearer junk')
      .expect(401));

  // NOTE: 403 (missing INVENTORY:* permission) is not covered — no limited-role fixture.

  // ── Happy paths ───────────────────────────────────────────────────────────
  it('GET /api/work-centers → 200 with token', () =>
    auth(request(server()).get('/api/work-centers')).expect(200));

  it('[GAP] GET /api/work-centers → returns { workCenters, count } envelope', () =>
    auth(request(server()).get('/api/work-centers'))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('workCenters');
        expect(r.body).toHaveProperty('count');
      }));

  it('POST /api/work-centers → 201 with numeric Decimals and defaults', async () => {
    const res = await auth(request(server()).post('/api/work-centers'))
      .send(validWC())
      .expect(201);
    expect(res.body.capacityPerHour).toBe(120); // number, not Decimal string
    expect(res.body.efficiencyPercent).toBe(100); // default
    expect(res.body.isActive).toBe(true);
    expect(res.body.workCenterType).toBe('machine');
  });

  it('PATCH /api/work-centers/:id → 200 updates and formats numerics', async () => {
    const created = await auth(request(server()).post('/api/work-centers'))
      .send(validWC())
      .expect(201);
    const res = await auth(request(server()).patch(`/api/work-centers/${created.body.id}`))
      .send({ efficiencyPercent: 92.5 })
      .expect(200);
    expect(res.body.efficiencyPercent).toBe(92.5);
  });

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST /api/work-centers → 400 when required fields are missing', () =>
    auth(request(server()).post('/api/work-centers')).send({}).expect(400));

  it('POST /api/work-centers → 400 on an unknown body field (forbidNonWhitelisted)', () =>
    auth(request(server()).post('/api/work-centers'))
      .send({ ...validWC(), bogus: true })
      .expect(400));

  it('[GAP] POST /api/work-centers → 400 on a workCenterType outside the enum', () =>
    auth(request(server()).post('/api/work-centers'))
      .send({ ...validWC(), workCenterType: 'banana' })
      .expect(400));

  it('[GAP] POST /api/work-centers → 400 (not 500) on a numeric exceeding column precision', () =>
    auth(request(server()).post('/api/work-centers'))
      .send({ ...validWC(), efficiencyPercent: 100000 })
      .expect(400));

  it('[GAP] POST /api/work-centers → 400 on the removed phantom notes field', () =>
    auth(request(server()).post('/api/work-centers'))
      .send({ ...validWC(), notes: 'should be rejected' })
      .expect(400));

  it('POST /api/work-centers → 409 on a duplicate code', async () => {
    const body = validWC();
    await auth(request(server()).post('/api/work-centers')).send(body).expect(201);
    await auth(request(server()).post('/api/work-centers'))
      .send({ ...body, name: 'Second' })
      .expect(409);
  });

  it('GET/PATCH/DELETE /api/work-centers/:id → 404 for an unknown id', async () => {
    await auth(request(server()).get(`/api/work-centers/${ZERO}`)).expect(404);
    await auth(request(server()).patch(`/api/work-centers/${ZERO}`))
      .send({ name: 'X' })
      .expect(404);
    await auth(request(server()).delete(`/api/work-centers/${ZERO}`)).expect(404);
  });

  // ── Soft delete ───────────────────────────────────────────────────────────
  it('DELETE → 200, then GET → 404 (soft-deleted)', async () => {
    const created = await auth(request(server()).post('/api/work-centers'))
      .send(validWC())
      .expect(201);
    const deleted = await auth(
      request(server()).delete(`/api/work-centers/${created.body.id}`),
    ).expect(200);
    expect(deleted.body).toEqual(
      expect.objectContaining({ message: expect.any(String), id: created.body.id }),
    );
    await auth(request(server()).get(`/api/work-centers/${created.body.id}`)).expect(404);
  });

  // NOTE: the routing delete guard (DELETE → 400 while BomRouting rows reference the
  // work center) is unit-tested only — there is no BOM routing API fixture until the
  // bom spec lands. TODO(spec-011): create a routing here and assert the 400.

  // ── Tenant isolation ──────────────────────────────────────────────────────
  it('a work center created under tenant A is 404/absent/immutable for tenant B', async () => {
    const created = await auth(request(server()).post('/api/work-centers'))
      .send({ ...validWC(), name: 'Tenant-A Only' })
      .expect(201);
    const id = created.body.id;

    await authB(request(server()).get(`/api/work-centers/${id}`)).expect(404);
    await authB(request(server()).patch(`/api/work-centers/${id}`))
      .send({ name: 'Hijacked' })
      .expect(404);
    await authB(request(server()).delete(`/api/work-centers/${id}`)).expect(404);

    // B's list does not contain A's work center (tolerates bare array and envelope).
    const listB = await authB(request(server()).get('/api/work-centers')).expect(200);
    const rows = Array.isArray(listB.body) ? listB.body : (listB.body.workCenters ?? []);
    expect(rows.map((w: { id: string }) => w.id)).not.toContain(id);

    const stillA = await auth(request(server()).get(`/api/work-centers/${id}`)).expect(200);
    expect(stillA.body.name).toBe('Tenant-A Only');
  });
});
