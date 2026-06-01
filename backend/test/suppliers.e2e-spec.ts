// ============================================================================
// E2E tests for the Suppliers controller — spec-002-suppliers
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

describe('Suppliers (e2e)', () => {
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

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET /api/suppliers → 401 without a token', () =>
    request(server()).get('/api/suppliers').expect(401));

  it('GET /api/suppliers → 401 with a junk token', () =>
    request(server()).get('/api/suppliers').set('Authorization', 'Bearer junk').expect(401));

  // ── Happy paths ───────────────────────────────────────────────────────────
  it('GET /api/suppliers → 200 with token', () =>
    auth(request(server()).get('/api/suppliers')).expect(200));

  it('[GAP] GET /api/suppliers → returns { suppliers, count } envelope', () =>
    auth(request(server()).get('/api/suppliers'))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('suppliers');
        expect(r.body).toHaveProperty('count');
      }));

  it('POST /api/suppliers → 201 and auto-generates a SUP-YYYY-NNNN code', () =>
    auth(request(server()).post('/api/suppliers'))
      .send({ name: 'E2E Vendor ' + Math.floor(performance.now()) })
      .expect(201)
      .expect((r) => {
        expect(r.body.code).toMatch(/^SUP-\d{4}-\d{4}$/);
      }));

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST /api/suppliers → 400 when required `name` is missing', () =>
    auth(request(server()).post('/api/suppliers')).send({}).expect(400));

  it('[GAP] POST /api/suppliers → 400 on an invalid email (needs @IsEmail)', () =>
    auth(request(server()).post('/api/suppliers'))
      .send({ name: 'Bad Email', email: 'not-an-email' })
      .expect(400));

  it('GET /api/suppliers/:id → 404 for an unknown / other-tenant id', () =>
    auth(request(server()).get('/api/suppliers/00000000-0000-0000-0000-000000000000')).expect(404));

  it('DELETE /api/suppliers/:id → 404 for an unknown id', () =>
    auth(
      request(server()).delete('/api/suppliers/00000000-0000-0000-0000-000000000000'),
    ).expect(404));

  // ── Duplicate code → 409 ──────────────────────────────────────────────────
  it('POST /api/suppliers → 409 on a duplicate explicit code', async () => {
    const code = `SUP-DUP-${Math.floor(performance.now())}`;
    await auth(request(server()).post('/api/suppliers')).send({ name: 'First', code }).expect(201);
    await auth(request(server()).post('/api/suppliers')).send({ name: 'Second', code }).expect(409);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  // A: DEMO (token), B: TENANT2 (tokenB). A supplier created under A must be
  // invisible to B — both as a 404 on the detail route and as an absence from B's list.
  it('a supplier created under tenant A is 404/absent for tenant B', async () => {
    const authB = (req: request.Test) => req.set('Authorization', `Bearer ${tokenB}`);

    const created = await auth(request(server()).post('/api/suppliers'))
      .send({ name: 'Tenant-A Only ' + Math.floor(performance.now()) })
      .expect(201);
    const id = created.body.id;

    // B cannot fetch A's supplier by id.
    await authB(request(server()).get(`/api/suppliers/${id}`)).expect(404);

    // B's list does not contain A's supplier.
    const listB = await authB(request(server()).get('/api/suppliers')).expect(200);
    expect(listB.body.suppliers.map((s: { id: string }) => s.id)).not.toContain(id);
  });
});
