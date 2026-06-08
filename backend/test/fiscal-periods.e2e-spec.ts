// ============================================================================
// E2E tests for the Fiscal Periods controller — spec-033-fiscal-periods
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation
// needs BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com
// (TENANT2). Period codes are unique per run (Date-based) to avoid residue.
// Run: pnpm test:e2e fiscal-periods
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const FP = '/api/fiscal-periods';

describe('FiscalPeriods (e2e)', () => {
  let app: INestApplication;
  let token: string; // DEMO
  let tokenB: string; // TENANT2
  let periodId: string;

  const stamp = `${Math.floor(Date.now() / 1000)}`;
  const code = `E2E-${stamp}`;

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

    const created = await auth(request(server()).post(FP)).send({
      periodCode: code,
      periodName: `E2E ${stamp}`,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      fiscalYear: '2026',
    });
    periodId = created.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  it('GET /api/fiscal-periods → 401 without a token', () =>
    request(server()).get(FP).expect(401));

  // ── Envelope ─────────────────────────────────────────────────────────────
  it('GET /api/fiscal-periods → 200 returns { fiscalPeriods, count }', async () => {
    const r = await auth(request(server()).get(FP)).expect(200);
    expect(r.body).toHaveProperty('fiscalPeriods');
    expect(r.body).toHaveProperty('count');
    expect(Array.isArray(r.body.fiscalPeriods)).toBe(true);
  });

  // ── Validation ───────────────────────────────────────────────────────────
  it('POST /api/fiscal-periods → 400 on empty body', () =>
    auth(request(server()).post(FP)).send({}).expect(400));

  it('POST /api/fiscal-periods → 400 on an invalid status (@IsIn)', () =>
    auth(request(server()).post(FP))
      .send({
        periodCode: `${code}-x`, periodName: 'x', startDate: '2026-02-01',
        endDate: '2026-02-28', fiscalYear: '2026', status: 'frozen',
      })
      .expect(400));

  // ── Duplicate ────────────────────────────────────────────────────────────
  it('POST /api/fiscal-periods → 409 on a duplicate code', () =>
    auth(request(server()).post(FP))
      .send({
        periodCode: code, periodName: 'dup', startDate: '2026-01-01',
        endDate: '2026-01-31', fiscalYear: '2026',
      })
      .expect(409));

  // ── Not found / tenant isolation ─────────────────────────────────────────
  it('GET /api/fiscal-periods/:id → 404 for a non-existent id', () =>
    auth(request(server()).get(`${FP}/${ZERO}`)).expect(404));

  it('GET /api/fiscal-periods/:id → 404 for a period in another tenant', () =>
    authB(request(server()).get(`${FP}/${periodId}`)).expect(404));

  it('PATCH /api/fiscal-periods/:id/close → 404 (no cross-tenant transition) for another tenant', () =>
    authB(request(server()).patch(`${FP}/${periodId}/close`)).expect(404));

  it('DELETE /api/fiscal-periods/:id → 404 (no cross-tenant delete) for another tenant', () =>
    authB(request(server()).delete(`${FP}/${periodId}`)).expect(404));

  // ── State machine happy path ───────────────────────────────────────────────
  it('open → close → lock → unlock → reopen', async () => {
    await auth(request(server()).patch(`${FP}/${periodId}/close`)).expect(200);
    // reopen from closed works; lock requires closed
    await auth(request(server()).patch(`${FP}/${periodId}/lock`)).expect(200);
    // locked cannot be reopened directly
    await auth(request(server()).patch(`${FP}/${periodId}/reopen`)).expect(400);
    await auth(request(server()).patch(`${FP}/${periodId}/unlock`)).expect(200); // → closed
    await auth(request(server()).patch(`${FP}/${periodId}/reopen`)).expect(200); // → open
  });

  it('DELETE /api/fiscal-periods/:id → 200 soft-deletes an open empty period', () =>
    auth(request(server()).delete(`${FP}/${periodId}`)).expect(200));
});
