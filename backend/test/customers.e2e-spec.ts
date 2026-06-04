// ============================================================================
// E2E tests for the Customers controller — spec-013-customers
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation needs
// BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e customers
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';

describe('Customers (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2

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
  const validCustomer = () => ({
    name: 'E2E Customer ' + Math.floor(performance.now()),
    paymentTerms: 'NET15',
    currency: 'DOP',
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET /api/customers → 401 without a token', () =>
    request(server()).get('/api/customers').expect(401));

  it('GET /api/customers → 401 with a junk token', () =>
    request(server()).get('/api/customers').set('Authorization', 'Bearer junk').expect(401));

  // NOTE: 403 (missing SALES:* permission) is not covered — no limited-role fixture.

  // ── Happy paths ───────────────────────────────────────────────────────────
  it('GET /api/customers → 200 with token', () =>
    auth(request(server()).get('/api/customers')).expect(200));

  it('[GAP] GET /api/customers → returns { customers, count } envelope', () =>
    auth(request(server()).get('/api/customers'))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('customers');
        expect(r.body).toHaveProperty('count');
      }));

  it('POST /api/customers → 201 with auto code CL-YYYY-NNNN and defaults', async () => {
    const res = await auth(request(server()).post('/api/customers'))
      .send(validCustomer())
      .expect(201);
    expect(res.body.code).toMatch(/^CL-\d{4}-\d{4}$/);
    expect(Number(res.body.creditLimit)).toBe(0);
    expect(res.body.creditStatus).toBe('good');
    expect(res.body.isActive).toBe(true);
  });

  it('[GAP] PATCH /api/customers/:id can deactivate (isActive now in the DTO)', async () => {
    const created = await auth(request(server()).post('/api/customers'))
      .send(validCustomer())
      .expect(201);
    const res = await auth(request(server()).patch(`/api/customers/${created.body.id}`))
      .send({ isActive: false })
      .expect(200);
    expect(res.body.isActive).toBe(false);
  });

  it('PATCH /api/customers/:id → 200 updates name', async () => {
    const created = await auth(request(server()).post('/api/customers'))
      .send(validCustomer())
      .expect(201);
    const res = await auth(request(server()).patch(`/api/customers/${created.body.id}`))
      .send({ name: 'E2E Renamed' })
      .expect(200);
    expect(res.body.name).toBe('E2E Renamed');
  });

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST /api/customers → 400 when required name is missing', () =>
    auth(request(server()).post('/api/customers')).send({}).expect(400));

  it('POST /api/customers → 400 on a client-supplied code (spec-012)', () =>
    auth(request(server()).post('/api/customers'))
      .send({ ...validCustomer(), code: 'HACK' })
      .expect(400));

  it('POST /api/customers → 400 on an invalid email', () =>
    auth(request(server()).post('/api/customers'))
      .send({ ...validCustomer(), email: 'not-an-email' })
      .expect(400));

  it('[GAP] POST /api/customers → 400 on a creditStatus outside the enum', () =>
    auth(request(server()).post('/api/customers'))
      .send({ ...validCustomer(), creditStatus: 'banana' })
      .expect(400));

  it('[GAP] POST /api/customers → 400 (not 500) on a creditLimit exceeding column precision', () =>
    auth(request(server()).post('/api/customers'))
      .send({ ...validCustomer(), creditLimit: 1e15 })
      .expect(400));

  it('GET/PATCH/DELETE /api/customers/:id → 404 for an unknown id', async () => {
    await auth(request(server()).get(`/api/customers/${ZERO}`)).expect(404);
    await auth(request(server()).patch(`/api/customers/${ZERO}`)).send({ name: 'X' }).expect(404);
    await auth(request(server()).delete(`/api/customers/${ZERO}`)).expect(404);
  });

  // ── Delete guard + soft delete ────────────────────────────────────────────
  it('[GAP] DELETE → 400 while an active sales order references the customer, then 200 once removed', async () => {
    const customer = await auth(request(server()).post('/api/customers'))
      .send(validCustomer())
      .expect(201);
    const item = await auth(request(server()).post('/api/items'))
      .send({
        name: 'E2E Cust Item ' + Math.floor(performance.now()),
        itemType: 'finished_good',
        baseUom: 'PCS',
      })
      .expect(201);
    const so = await auth(request(server()).post('/api/sales-orders'))
      .send({
        customerId: customer.body.id,
        lines: [{ itemId: item.body.id, orderedQuantity: 10, uom: 'PCS', unitPrice: 99.99 }],
      })
      .expect(201);

    const blocked = await auth(
      request(server()).delete(`/api/customers/${customer.body.id}`),
    ).expect(400);
    expect(blocked.body.message).toContain('Cannot delete');

    await auth(request(server()).delete(`/api/sales-orders/${so.body.id}`)).expect(200);
    await auth(request(server()).delete(`/api/customers/${customer.body.id}`)).expect(200);
    await auth(request(server()).get(`/api/customers/${customer.body.id}`)).expect(404);
  });

  it('DELETE → 200 then GET → 404 (soft-deleted)', async () => {
    const created = await auth(request(server()).post('/api/customers'))
      .send(validCustomer())
      .expect(201);
    const deleted = await auth(
      request(server()).delete(`/api/customers/${created.body.id}`),
    ).expect(200);
    expect(deleted.body).toEqual(
      expect.objectContaining({ message: expect.any(String), id: created.body.id }),
    );
    await auth(request(server()).get(`/api/customers/${created.body.id}`)).expect(404);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  it('a customer created under tenant A is 404/absent/immutable for tenant B', async () => {
    const created = await auth(request(server()).post('/api/customers'))
      .send({ ...validCustomer(), name: 'Tenant-A Only' })
      .expect(201);
    const id = created.body.id;

    await authB(request(server()).get(`/api/customers/${id}`)).expect(404);
    await authB(request(server()).patch(`/api/customers/${id}`))
      .send({ name: 'Hijacked' })
      .expect(404);
    await authB(request(server()).delete(`/api/customers/${id}`)).expect(404);

    const listB = await authB(request(server()).get('/api/customers')).expect(200);
    const rows = Array.isArray(listB.body) ? listB.body : (listB.body.customers ?? []);
    expect(rows.map((c: { id: string }) => c.id)).not.toContain(id);

    const stillA = await auth(request(server()).get(`/api/customers/${id}`)).expect(200);
    expect(stillA.body.name).toBe('Tenant-A Only');
  });
});
