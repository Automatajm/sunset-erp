// ============================================================================
// E2E tests for the Cash Flow controller — spec-030-cash-flow
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation
// needs BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com
// (TENANT2). Projection codes are unique per run (Date-based) to avoid residue.
// Run: pnpm test:e2e cash-flow
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const CF = '/api/cash-flow';

describe('CashFlow (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let projectionId: string;

  const stamp = `${Math.floor(Date.now() / 1000)}`;

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

    const created = await auth(request(server()).post(CF)).send({
      projectionCode: `E2E-CFP-${stamp}`,
      projectionName: 'E2E Projection',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });
    projectionId = created.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  it('GET /api/cash-flow → 401 without a token', () =>
    request(server()).get(CF).expect(401));

  // ── Envelope ─────────────────────────────────────────────────────────────
  it('GET /api/cash-flow → 200 returns { cashFlowProjections, count }', async () => {
    const r = await auth(request(server()).get(CF)).expect(200);
    expect(r.body).toHaveProperty('cashFlowProjections');
    expect(r.body).toHaveProperty('count');
    expect(Array.isArray(r.body.cashFlowProjections)).toBe(true);
  });

  // ── Validation ───────────────────────────────────────────────────────────
  it('POST /api/cash-flow → 400 on empty body', () =>
    auth(request(server()).post(CF)).send({}).expect(400));

  it('POST /api/cash-flow → 400 on an invalid scenario (@IsIn)', () =>
    auth(request(server()).post(CF))
      .send({
        projectionCode: `E2E-CFP-bad-${stamp}`,
        projectionName: 'x',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        scenario: 'wild',
      })
      .expect(400));

  it('POST /api/cash-flow/:id/lines → 400 on an invalid lineType (@IsIn)', () =>
    auth(request(server()).post(`${CF}/${projectionId}/lines`))
      .send({ lineDate: '2026-01-15', lineType: 'sideways', category: 'x', amount: 10 })
      .expect(400));

  it('POST /api/cash-flow/:id/lines → 400 when amount exceeds the Decimal(18,2) cap', () =>
    auth(request(server()).post(`${CF}/${projectionId}/lines`))
      .send({ lineDate: '2026-01-15', lineType: 'inflow', category: 'x', amount: 1e18 })
      .expect(400));

  it('POST /api/cash-flow/:id/generate-from-data → 400 on a bad date string', () =>
    auth(request(server()).post(`${CF}/${projectionId}/generate-from-data`))
      .send({ startDate: 'notadate' })
      .expect(400));

  // ── Not found / tenant isolation ─────────────────────────────────────────
  it('GET /api/cash-flow/:id → 404 for a non-existent id', () =>
    auth(request(server()).get(`${CF}/${ZERO}`)).expect(404));

  it('GET /api/cash-flow/:id → 404 for a projection owned by another tenant', () =>
    authB(request(server()).get(`${CF}/${projectionId}`)).expect(404));

  it('PATCH /api/cash-flow/:id → 404 (no cross-tenant write) for another tenant', () =>
    authB(request(server()).patch(`${CF}/${projectionId}`))
      .send({ projectionName: 'hijack' })
      .expect(404));

  it('DELETE /api/cash-flow/:id → 404 (no cross-tenant delete) for another tenant', () =>
    authB(request(server()).delete(`${CF}/${projectionId}`)).expect(404));

  // ── Duplicate code ───────────────────────────────────────────────────────
  it('POST /api/cash-flow → 409 on a duplicate code', () =>
    auth(request(server()).post(CF))
      .send({
        projectionCode: `E2E-CFP-${stamp}`,
        projectionName: 'dup',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      })
      .expect(409));

  // ── Happy path: line lifecycle + summary ─────────────────────────────────
  it('line lifecycle + summary', async () => {
    const line = await auth(request(server()).post(`${CF}/${projectionId}/lines`))
      .send({ lineDate: '2026-01-15', lineType: 'inflow', category: 'ar', amount: 5000 })
      .expect(201);
    const lineId = line.body.id;

    await auth(request(server()).post(`${CF}/${projectionId}/lines`))
      .send({ lineDate: '2026-01-20', lineType: 'outflow', category: 'ap', amount: 2000 })
      .expect(201);

    await auth(request(server()).patch(`${CF}/${projectionId}/lines/${lineId}`))
      .send({ amount: 6000 })
      .expect(200);

    const summary = await auth(request(server()).get(`${CF}/${projectionId}/summary`)).expect(200);
    expect(summary.body).toHaveProperty('periods');
    expect(summary.body).toHaveProperty('totals');

    await auth(request(server()).delete(`${CF}/${projectionId}/lines/${lineId}`)).expect(200);
  });
});
