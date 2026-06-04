// ============================================================================
// E2E tests for the Categories controller — spec-009-categories
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation and
// the cross-tenant FK-vector tests need BOTH seeded tenants: admin@demo.com (DEMO)
// and tenant2admin@demo.com (TENANT2), each with full admin permissions.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e categories
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';

describe('Categories (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let mcId: string; // macro category fixture in DEMO

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

    // Macro category fixture (parent for every category created here).
    const mc = await request(app.getHttpServer())
      .post('/api/macro-categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'E2E Cat Parent' })
      .expect(201);
    mcId = mc.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const authB = (req: request.Test) => req.set('Authorization', `Bearer ${tokenB}`);
  const server = () => app.getHttpServer();
  const validCategory = () => ({
    macroCategoryId: mcId,
    name: 'E2E Category',
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET /api/categories → 401 without a token', () =>
    request(server()).get('/api/categories').expect(401));

  it('GET /api/categories → 401 with a junk token', () =>
    request(server()).get('/api/categories').set('Authorization', 'Bearer junk').expect(401));

  // NOTE: 403 (missing INVENTORY:* permission) is not covered — no limited-role fixture.

  // ── Happy paths ───────────────────────────────────────────────────────────
  it('GET /api/categories → 200 with token', () =>
    auth(request(server()).get('/api/categories')).expect(200));

  it('[GAP] GET /api/categories → returns { categories, count } envelope', () =>
    auth(request(server()).get('/api/categories'))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('categories');
        expect(r.body).toHaveProperty('count');
      }));

  it('POST /api/categories → 201 with auto code CAT-YYYY-NNNN, macroCategory and _count.items', async () => {
    const res = await auth(request(server()).post('/api/categories'))
      .send(validCategory())
      .expect(201);
    expect(res.body.code).toMatch(/^CAT-\d{4}-\d{4}$/);
    expect(res.body.macroCategory.id).toBe(mcId);
    expect(res.body.isActive).toBe(true);
    expect(res.body._count).toEqual(expect.objectContaining({ items: 0 }));
  });

  it('GET /api/categories?macroCategoryId= filters to the parent', async () => {
    await auth(request(server()).post('/api/categories')).send(validCategory()).expect(201);
    const res = await auth(
      request(server()).get(`/api/categories?macroCategoryId=${mcId}`),
    ).expect(200);
    const rows = Array.isArray(res.body) ? res.body : (res.body.categories ?? []);
    expect(rows.length).toBeGreaterThan(0);
    for (const c of rows) expect(c.macroCategoryId).toBe(mcId);
  });

  it('PATCH /api/categories/:id → 200 updates name', async () => {
    const created = await auth(request(server()).post('/api/categories'))
      .send(validCategory())
      .expect(201);
    const res = await auth(request(server()).patch(`/api/categories/${created.body.id}`))
      .send({ name: 'E2E Renamed' })
      .expect(200);
    expect(res.body.name).toBe('E2E Renamed');
  });

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST /api/categories → 400 when required fields are missing', () =>
    auth(request(server()).post('/api/categories')).send({}).expect(400));

  it('POST /api/categories → 400 on an unknown body field (forbidNonWhitelisted)', () =>
    auth(request(server()).post('/api/categories'))
      .send({ ...validCategory(), bogus: true })
      .expect(400));

  it('POST /api/categories → 400 on a non-UUID macroCategoryId', () =>
    auth(request(server()).post('/api/categories'))
      .send({ macroCategoryId: 'nope', name: 'X' })
      .expect(400));

  it('POST /api/categories → 400 on a client-supplied code (spec-012: system-assigned)', () =>
    auth(request(server()).post('/api/categories'))
      .send({ ...validCategory(), code: 'HACK' })
      .expect(400));

  it('POST /api/categories → 404 when macroCategoryId does not resolve in the tenant', () =>
    auth(request(server()).post('/api/categories'))
      .send({ macroCategoryId: ZERO, name: 'X' })
      .expect(404));

  it('[GAP] POST /api/categories → 404 (not 500) on an unknown inventoryAccountId', () =>
    auth(request(server()).post('/api/categories'))
      .send({ ...validCategory(), inventoryAccountId: ZERO })
      .expect(404));

  it('GET/DELETE /api/categories/:id → 404 for an unknown id', async () => {
    await auth(request(server()).get(`/api/categories/${ZERO}`)).expect(404);
    await auth(request(server()).delete(`/api/categories/${ZERO}`)).expect(404);
  });

  it('[GAP] PATCH /api/categories/:id → 404 when re-parenting to an unresolvable macroCategoryId', async () => {
    const created = await auth(request(server()).post('/api/categories'))
      .send(validCategory())
      .expect(201);
    await auth(request(server()).patch(`/api/categories/${created.body.id}`))
      .send({ macroCategoryId: ZERO })
      .expect(404);
  });

  it('[GAP] PATCH /api/categories/:id → 404 on an unknown cogsAccountId', async () => {
    const created = await auth(request(server()).post('/api/categories'))
      .send(validCategory())
      .expect(201);
    await auth(request(server()).patch(`/api/categories/${created.body.id}`))
      .send({ cogsAccountId: ZERO })
      .expect(404);
  });

  // ── Delete guard + soft delete ────────────────────────────────────────────
  it('DELETE → 400 while an active item is assigned, then 200 once removed, then GET → 404', async () => {
    const cat = await auth(request(server()).post('/api/categories'))
      .send(validCategory())
      .expect(201);
    const item = await auth(request(server()).post('/api/items'))
      .send({
        name: 'E2E Cat Item ' + Math.floor(performance.now()),
        itemType: 'raw_material',
        baseUom: 'PCS',
        categoryId: cat.body.id,
      })
      .expect(201);

    const blocked = await auth(
      request(server()).delete(`/api/categories/${cat.body.id}`),
    ).expect(400);
    expect(blocked.body.message).toContain('Cannot delete');

    await auth(request(server()).delete(`/api/items/${item.body.id}`)).expect(200);
    await auth(request(server()).delete(`/api/categories/${cat.body.id}`)).expect(200);
    await auth(request(server()).get(`/api/categories/${cat.body.id}`)).expect(404);
  });

  // ── Tenant isolation + cross-tenant FK vectors ───────────────────────────
  it('a category created under tenant A is 404/absent/immutable for tenant B', async () => {
    const created = await auth(request(server()).post('/api/categories'))
      .send({ ...validCategory(), name: 'Tenant-A Only' })
      .expect(201);
    const id = created.body.id;

    await authB(request(server()).get(`/api/categories/${id}`)).expect(404);
    await authB(request(server()).patch(`/api/categories/${id}`))
      .send({ name: 'Hijacked' })
      .expect(404);
    await authB(request(server()).delete(`/api/categories/${id}`)).expect(404);

    const listB = await authB(request(server()).get('/api/categories')).expect(200);
    const rows = Array.isArray(listB.body) ? listB.body : (listB.body.categories ?? []);
    expect(rows.map((c: { id: string }) => c.id)).not.toContain(id);

    const stillA = await auth(request(server()).get(`/api/categories/${id}`)).expect(200);
    expect(stillA.body.name).toBe('Tenant-A Only');
  });

  it("[GAP] re-parenting to ANOTHER TENANT's macro category → 404 (cross-tenant FK vector)", async () => {
    // B creates a macro category in TENANT2.
    const mcB = await authB(request(server()).post('/api/macro-categories'))
      .send({ name: 'Tenant-B Macro' })
      .expect(201);
    // A tries to point its own category at B's macro category — must be 404,
    // never a silent cross-tenant link.
    const cat = await auth(request(server()).post('/api/categories'))
      .send(validCategory())
      .expect(201);
    await auth(request(server()).patch(`/api/categories/${cat.body.id}`))
      .send({ macroCategoryId: mcB.body.id })
      .expect(404);
    // And A's category still points at its original parent.
    const after = await auth(request(server()).get(`/api/categories/${cat.body.id}`)).expect(200);
    expect(after.body.macroCategoryId).toBe(mcId);
  });

  it("[GAP] linking ANOTHER TENANT's GL account → 404 (cross-tenant FK vector)", async () => {
    // B creates an account in TENANT2.
    const accB = await authB(request(server()).post('/api/chart-of-accounts'))
      .send({
        accountNumber: '96.' + Math.floor(performance.now()),
        name: 'Tenant-B Account',
        accountType: 'asset',
      })
      .expect(201);
    // A must not be able to map its category to B's account.
    await auth(request(server()).post('/api/categories'))
      .send({ ...validCategory(), inventoryAccountId: accB.body.id })
      .expect(404);
  });
});
