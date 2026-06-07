// ============================================================================
// E2E tests for the Budgets controller — spec-029-budgets
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation
// needs BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com
// (TENANT2). Fixtures per run: a GL account (resolved from chart-of-accounts),
// budgets with a unique code per run (Date-based) to avoid residue collisions.
// Run: pnpm test:e2e budgets
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const B = '/api/budgets';

describe('Budgets (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let accountId: string; // a GL account in DEMO
  let budgetId: string; // a budget created under DEMO

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

    // Resolve a GL account in DEMO for line tests.
    const accts = await auth(request(server()).get('/api/chart-of-accounts'));
    const list = Array.isArray(accts.body) ? accts.body : (accts.body.accounts ?? []);
    accountId = list[0]?.id;

    // A budget owned by DEMO.
    const created = await auth(request(server()).post(B)).send({
      budgetCode: `E2E-BUD-${stamp}`,
      budgetName: 'E2E Budget',
      fiscalYear: '2026',
    });
    budgetId = created.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  it('GET /api/budgets → 401 without a token', () =>
    request(server()).get(B).expect(401));

  it('POST /api/budgets → 401 without a token', () =>
    request(server()).post(B).send({}).expect(401));

  // ── Envelope ─────────────────────────────────────────────────────────────
  it('GET /api/budgets → 200 returns { budgets, count } envelope', async () => {
    const r = await auth(request(server()).get(B)).expect(200);
    expect(r.body).toHaveProperty('budgets');
    expect(r.body).toHaveProperty('count');
    expect(Array.isArray(r.body.budgets)).toBe(true);
  });

  // ── Validation ───────────────────────────────────────────────────────────
  it('POST /api/budgets → 400 on empty body', () =>
    auth(request(server()).post(B)).send({}).expect(400));

  it('POST /api/budgets/:id/lines → 400 when budgetAmount exceeds the Decimal(18,2) cap', () =>
    auth(request(server()).post(`${B}/${budgetId}/lines`))
      .send({ accountId, fiscalPeriod: '2026-01', budgetAmount: 1e18 })
      .expect(400));

  it('POST /api/budgets/:id/lines → 400 when accountId is not a UUID', () =>
    auth(request(server()).post(`${B}/${budgetId}/lines`))
      .send({ accountId: 'not-a-uuid', fiscalPeriod: '2026-01', budgetAmount: 100 })
      .expect(400));

  it('POST /api/budgets/:id/generate-from-so → 400 on a bogus soStatus (@IsIn)', () =>
    auth(request(server()).post(`${B}/${budgetId}/generate-from-so`))
      .send({ soStatuses: ['bogus'] })
      .expect(400));

  // ── Not found / tenant isolation ─────────────────────────────────────────
  it('GET /api/budgets/:id → 404 for a non-existent id', () =>
    auth(request(server()).get(`${B}/${ZERO}`)).expect(404));

  it('GET /api/budgets/:id → 404 for a budget owned by another tenant', () =>
    authB(request(server()).get(`${B}/${budgetId}`)).expect(404));

  it('PATCH /api/budgets/:id → 404 (no cross-tenant write) for another tenant', () =>
    authB(request(server()).patch(`${B}/${budgetId}`)).send({ budgetName: 'hijack' }).expect(404));

  it('DELETE /api/budgets/:id → 404 (no cross-tenant delete) for another tenant', () =>
    authB(request(server()).delete(`${B}/${budgetId}`)).expect(404));

  // ── Duplicate code ───────────────────────────────────────────────────────
  it('POST /api/budgets → 409 on a duplicate code', () =>
    auth(request(server()).post(B))
      .send({ budgetCode: `E2E-BUD-${stamp}`, budgetName: 'dup', fiscalYear: '2026' })
      .expect(409));

  // ── Happy path: lines + approve state machine ────────────────────────────
  it('full line lifecycle + approval guards', async () => {
    if (!accountId) return; // no GL account seeded — skip gracefully

    // add a line
    const line = await auth(request(server()).post(`${B}/${budgetId}/lines`))
      .send({ accountId, fiscalPeriod: `2026-${stamp.slice(-2)}`, budgetAmount: 5000 })
      .expect(201);
    const lineId = line.body.id;

    // duplicate account+period → 409
    await auth(request(server()).post(`${B}/${budgetId}/lines`))
      .send({ accountId, fiscalPeriod: `2026-${stamp.slice(-2)}`, budgetAmount: 1 })
      .expect(409);

    // update the line
    await auth(request(server()).patch(`${B}/${budgetId}/lines/${lineId}`))
      .send({ budgetAmount: 6000 })
      .expect(200);

    // approve (has a line now)
    await auth(request(server()).patch(`${B}/${budgetId}/approve`)).expect(200);

    // approved budgets are immutable
    await auth(request(server()).patch(`${B}/${budgetId}`)).send({ budgetName: 'x' }).expect(400);
    await auth(request(server()).post(`${B}/${budgetId}/lines`))
      .send({ accountId, fiscalPeriod: '2099-01', budgetAmount: 1 })
      .expect(400);
    await auth(request(server()).delete(`${B}/${budgetId}/lines/${lineId}`)).expect(400);
    await auth(request(server()).delete(`${B}/${budgetId}`)).expect(400); // only draft deletable
  });

  it('GET /api/budgets/:id/vs-actual → 200 with lines array', async () => {
    const r = await auth(request(server()).get(`${B}/${budgetId}/vs-actual`)).expect(200);
    expect(r.body).toHaveProperty('lines');
    expect(Array.isArray(r.body.lines)).toBe(true);
  });
});
