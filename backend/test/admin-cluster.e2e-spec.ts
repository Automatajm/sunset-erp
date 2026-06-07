// ============================================================================
// E2E tests for the Admin cluster — spec-027 (users / roles / tenants /
// tenant-settings). PREREQUISITES: Postgres + Redis up, `pnpm seed` run.
// Cross-tenant isolation needs BOTH seeded tenants: admin@demo.com (DEMO) and
// tenant2admin@demo.com (TENANT2). This suite also CREATES a limited-role user
// (a role with no ADMIN:*/SETTINGS:* permissions) to prove the tenant-settings
// authorization gap is closed (403). E2E residue: a role + a user per run.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e admin-cluster
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';

describe('AdminCluster (e2e)', () => {
  let app: INestApplication;
  let token: string; // DEMO admin (full perms)
  let limitedToken: string; // DEMO user with a no-permission role
  let selfUserId: string; // the admin's own id

  const rawLogin = (email: string, password = 'Admin123!') =>
    request(app.getHttpServer()).post('/api/auth/login').send({ email, password });

  const login = async (email: string, password = 'Admin123!') => {
    const r = await rawLogin(email, password);
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

  const rows = (body: unknown, key: string): any[] =>
    Array.isArray(body) ? (body as any[]) : ((body as Record<string, any>)[key] ?? []);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    token = await login('admin@demo.com');
    const profile = await auth(request(server()).get('/api/auth/profile')).expect(200);
    selfUserId = profile.body.user.id;

    // Build a limited-role user in DEMO: a role with ZERO permissions, then a
    // user holding only that role → must be 403 on tenant-settings.
    const n = Math.floor(performance.now() * 1000);
    const role = await auth(request(server()).post('/api/roles'))
      .send({ code: `E2ELIMITED${n}`, name: `E2E Limited ${n}`, permissionIds: [] })
      .expect(201);
    const limitedEmail = `e2e-limited-${n}@demo.com`;
    await auth(request(server()).post('/api/users'))
      .send({
        email: limitedEmail,
        password: 'Limited123!',
        firstName: 'Lim',
        lastName: 'Ited',
        roleIds: [role.body.id],
      })
      .expect(201);
    limitedToken = await login(limitedEmail, 'Limited123!');
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Authorization gap (the headline) ───────────────────────────────────────

  it('GET /api/tenant-settings → 401 without a token', () =>
    request(server()).get('/api/tenant-settings').expect(401));

  it('[GAP] tenant-settings is permission-guarded: a no-permission token → 403', () =>
    request(server())
      .get('/api/tenant-settings')
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(403));

  it('[GAP] PATCH /api/tenant-settings with a no-permission token → 403', () =>
    request(server())
      .patch('/api/tenant-settings')
      .set('Authorization', `Bearer ${limitedToken}`)
      .send({ defaultUomSystem: 'imperial' })
      .expect(403));

  it('admin (SETTINGS:EDIT) can read tenant-settings', () =>
    auth(request(server()).get('/api/tenant-settings')).expect(200));

  // ── Response envelopes (fix the two broken pages) ──────────────────────────

  it('[GAP] GET /api/users → { users, count }', async () => {
    const res = await auth(request(server()).get('/api/users')).expect(200);
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('count');
  });

  it('[GAP] GET /api/roles → { roles, count }', async () => {
    const res = await auth(request(server()).get('/api/roles')).expect(200);
    expect(res.body).toHaveProperty('roles');
    expect(res.body).toHaveProperty('count');
  });

  it('[GAP] GET /api/tenants → { tenants, count }', async () => {
    const res = await auth(request(server()).get('/api/tenants')).expect(200);
    expect(res.body).toHaveProperty('tenants');
    expect(res.body).toHaveProperty('count');
  });

  it('GET /api/roles/permissions → { permissions, grouped, count } (unchanged)', async () => {
    const res = await auth(request(server()).get('/api/roles/permissions')).expect(200);
    expect(res.body).toHaveProperty('permissions');
    expect(res.body).toHaveProperty('grouped');
  });

  // ── baseCurrency reachable + catalog-validated ─────────────────────────────

  it('[GAP] PATCH tenant-settings sets baseCurrency from the catalog', async () => {
    const res = await auth(request(server()).patch('/api/tenant-settings'))
      .send({ baseCurrency: 'DOP' })
      .expect(200);
    expect(res.body.baseCurrency).toBe('DOP');
  });

  it('[GAP] PATCH tenant-settings rejects an unknown baseCurrency → 404', () =>
    auth(request(server()).patch('/api/tenant-settings'))
      .send({ baseCurrency: 'XXX' })
      .expect(404));

  // ── Roles: create / dup / system guard ─────────────────────────────────────

  it('POST /api/roles dup code → 409; create + delete happy path', async () => {
    const n = Math.floor(performance.now() * 1000);
    const code = `E2EROLE${n}`;
    const r = await auth(request(server()).post('/api/roles'))
      .send({ code, name: 'E2E Role' })
      .expect(201);
    expect(r.body.code).toBe(code); // uppercased
    await auth(request(server()).post('/api/roles')).send({ code, name: 'dup' }).expect(409);
    await auth(request(server()).delete(`/api/roles/${r.body.id}`)).expect(200);
  });

  it('GET /api/roles/:id for another tenant id → 404', () =>
    auth(request(server()).get(`/api/roles/${ZERO}`)).expect(404));

  // ── Users: validation + self-deactivation guard ────────────────────────────

  it('POST /api/users {} → 400 (validation)', () =>
    auth(request(server()).post('/api/users')).send({}).expect(400));

  it('[GAP] admin cannot deactivate themselves → 400', () =>
    auth(request(server()).patch(`/api/users/${selfUserId}/deactivate`)).expect(400));

  // ── Tenants: validation ────────────────────────────────────────────────────

  it('[GAP] POST /api/tenants with non-ISO-2 country → 400', () =>
    auth(request(server()).post('/api/tenants'))
      .send({ name: 'Bad', country: 'Dominican Republic' })
      .expect(400));

  it('POST /api/tenants happy path → 201 with auto-generated code', async () => {
    const n = Math.floor(performance.now() * 1000);
    const res = await auth(request(server()).post('/api/tenants'))
      .send({ name: `E2E Tenant ${n}`, country: 'DO' })
      .expect(201);
    expect(res.body.code).toMatch(/-\d{4}$/);
  });

  // ── Not found ──────────────────────────────────────────────────────────────

  it('GET /api/users/:id and /api/tenants/:id for unknown id → 404', async () => {
    await auth(request(server()).get(`/api/users/${ZERO}`)).expect(404);
    await auth(request(server()).get(`/api/tenants/${ZERO}`)).expect(404);
  });
});
