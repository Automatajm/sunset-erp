// ============================================================================
// E2E tests for the MacroCategories controller — spec-006-macro-categories
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

describe('MacroCategories (e2e)', () => {
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
  const uniqueCode = (prefix: string) => `${prefix}-${Math.floor(performance.now())}`;

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET /api/macro-categories → 401 without a token', () =>
    request(server()).get('/api/macro-categories').expect(401));

  it('GET /api/macro-categories → 401 with a junk token', () =>
    request(server())
      .get('/api/macro-categories')
      .set('Authorization', 'Bearer junk')
      .expect(401));

  // NOTE: 403 (missing INVENTORY:* permission) is not covered — the seed has no
  // limited-role user. TODO: add a viewer-only fixture, then assert POST → 403.

  // ── Happy paths ───────────────────────────────────────────────────────────
  it('GET /api/macro-categories → 200 with token', () =>
    auth(request(server()).get('/api/macro-categories')).expect(200));

  it('[GAP] GET /api/macro-categories → returns { macroCategories, count } envelope', () =>
    auth(request(server()).get('/api/macro-categories'))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('macroCategories');
        expect(r.body).toHaveProperty('count');
      }));

  it('POST /api/macro-categories → 201 with _count.categories: 0 and isActive default', async () => {
    const code = uniqueCode('E2E');
    const res = await auth(request(server()).post('/api/macro-categories'))
      .send({ code, name: 'E2E Macro' })
      .expect(201);
    expect(res.body.code).toBe(code);
    expect(res.body.isActive).toBe(true);
    expect(res.body._count).toEqual({ categories: 0 });
  });

  it('GET /api/macro-categories/:id → 200 with child categories array', async () => {
    const created = await auth(request(server()).post('/api/macro-categories'))
      .send({ code: uniqueCode('E2EGET'), name: 'E2E Detail' })
      .expect(201);
    const res = await auth(
      request(server()).get(`/api/macro-categories/${created.body.id}`),
    ).expect(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
  });

  it('PATCH /api/macro-categories/:id → 200 updates name; keeping own code is not a conflict', async () => {
    const code = uniqueCode('E2EPAT');
    const created = await auth(request(server()).post('/api/macro-categories'))
      .send({ code, name: 'Before' })
      .expect(201);
    const res = await auth(request(server()).patch(`/api/macro-categories/${created.body.id}`))
      .send({ code, name: 'After' }) // same code (self-excluded) + new name
      .expect(200);
    expect(res.body.name).toBe('After');
  });

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST /api/macro-categories → 400 when required fields are missing', () =>
    auth(request(server()).post('/api/macro-categories')).send({}).expect(400));

  it('POST /api/macro-categories → 400 on an unknown body field (forbidNonWhitelisted)', () =>
    auth(request(server()).post('/api/macro-categories'))
      .send({ code: uniqueCode('E2EBAD'), name: 'X', bogus: true })
      .expect(400));

  it('GET /api/macro-categories/:id → 404 for an unknown id', () =>
    auth(
      request(server()).get('/api/macro-categories/00000000-0000-0000-0000-000000000000'),
    ).expect(404));

  it('DELETE /api/macro-categories/:id → 404 for an unknown id', () =>
    auth(
      request(server()).delete('/api/macro-categories/00000000-0000-0000-0000-000000000000'),
    ).expect(404));

  // ── Duplicate code → 409 ──────────────────────────────────────────────────
  it('POST /api/macro-categories → 409 on a duplicate code', async () => {
    const code = uniqueCode('E2EDUP');
    await auth(request(server()).post('/api/macro-categories'))
      .send({ code, name: 'First' })
      .expect(201);
    await auth(request(server()).post('/api/macro-categories'))
      .send({ code, name: 'Second' })
      .expect(409);
  });

  it('PATCH /api/macro-categories/:id → 409 when the new code belongs to another row', async () => {
    const codeA = uniqueCode('E2ECA');
    const codeB = uniqueCode('E2ECB');
    await auth(request(server()).post('/api/macro-categories'))
      .send({ code: codeA, name: 'Holder' })
      .expect(201);
    const second = await auth(request(server()).post('/api/macro-categories'))
      .send({ code: codeB, name: 'Mover' })
      .expect(201);
    await auth(request(server()).patch(`/api/macro-categories/${second.body.id}`))
      .send({ code: codeA })
      .expect(409);
  });

  // ── Delete guard + soft delete ────────────────────────────────────────────
  it('DELETE → 400 while child categories exist, then 200 once empty, then GET → 404', async () => {
    // Build the hierarchy: macro category + one child category.
    const mc = await auth(request(server()).post('/api/macro-categories'))
      .send({ code: uniqueCode('E2EDEL'), name: 'Delete Guard' })
      .expect(201);
    const cat = await auth(request(server()).post('/api/categories'))
      .send({
        macroCategoryId: mc.body.id,
        code: uniqueCode('E2EDELC'),
        name: 'Blocking Child',
      })
      .expect(201);

    // Blocked while the child exists.
    const blocked = await auth(
      request(server()).delete(`/api/macro-categories/${mc.body.id}`),
    ).expect(400);
    expect(blocked.body.message).toContain('Cannot delete');

    // Remove the child, then the macro category soft-deletes.
    await auth(request(server()).delete(`/api/categories/${cat.body.id}`)).expect(200);
    const deleted = await auth(
      request(server()).delete(`/api/macro-categories/${mc.body.id}`),
    ).expect(200);
    expect(deleted.body).toEqual(
      expect.objectContaining({ message: expect.any(String), id: mc.body.id }),
    );

    // Soft-deleted rows are invisible.
    await auth(request(server()).get(`/api/macro-categories/${mc.body.id}`)).expect(404);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  // A: DEMO (token), B: TENANT2 (tokenB). A macro category created under A must be
  // invisible and immutable for B — 404 on detail/patch/delete, absent from B's list.
  it('a macro category created under tenant A is 404/absent/immutable for tenant B', async () => {
    const created = await auth(request(server()).post('/api/macro-categories'))
      .send({ code: uniqueCode('E2EISO'), name: 'Tenant-A Only' })
      .expect(201);
    const id = created.body.id;

    // B cannot read, update, or delete A's macro category.
    await authB(request(server()).get(`/api/macro-categories/${id}`)).expect(404);
    await authB(request(server()).patch(`/api/macro-categories/${id}`))
      .send({ name: 'Hijacked' })
      .expect(404);
    await authB(request(server()).delete(`/api/macro-categories/${id}`)).expect(404);

    // B's list does not contain A's macro category.
    // (Tolerates both the current bare array and the target { macroCategories } envelope
    // so this isolation test never false-fails on the envelope [GAP].)
    const listB = await authB(request(server()).get('/api/macro-categories')).expect(200);
    const rows = Array.isArray(listB.body) ? listB.body : (listB.body.macroCategories ?? []);
    expect(rows.map((m: { id: string }) => m.id)).not.toContain(id);

    // And A still sees it unchanged after B's attempts.
    const stillA = await auth(request(server()).get(`/api/macro-categories/${id}`)).expect(200);
    expect(stillA.body.name).toBe('Tenant-A Only');
  });
});
