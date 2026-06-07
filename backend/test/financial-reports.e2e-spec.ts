// ============================================================================
// E2E tests for the Financial Reports controller — spec-032-financial-reports
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Read-only module; uses
// the DEMO admin token. Asserts the four report endpoints, date validation, and
// the general-ledger unknown-account 404.
// Run: pnpm test:e2e financial-reports
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const FR = '/api/financial-reports';

describe('FinancialReports (e2e)', () => {
  let app: INestApplication;
  let token: string;

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

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    token = await login('admin@demo.com');
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  it('GET /trial-balance → 401 without a token', () =>
    request(server()).get(`${FR}/trial-balance`).expect(401));

  // ── Happy path (all four reports) ──────────────────────────────────────────
  it('GET /trial-balance → 200 all-time (no params)', async () => {
    const r = await auth(request(server()).get(`${FR}/trial-balance`)).expect(200);
    expect(r.body.reportName).toBe('Trial Balance');
    expect(r.body.totals).toHaveProperty('isBalanced');
  });

  it('GET /profit-and-loss → 200 with a valid range', async () => {
    const r = await auth(
      request(server()).get(`${FR}/profit-and-loss?startDate=2026-01-01&endDate=2026-12-31`),
    ).expect(200);
    expect(r.body.reportName).toBe('Profit & Loss Statement');
  });

  it('GET /balance-sheet → 200 as-of endDate', async () => {
    const r = await auth(request(server()).get(`${FR}/balance-sheet?endDate=2026-12-31`)).expect(200);
    expect(r.body.reportName).toBe('Balance Sheet');
    expect(r.body).toHaveProperty('isBalanced');
  });

  it('GET /general-ledger → 200', async () => {
    const r = await auth(request(server()).get(`${FR}/general-ledger`)).expect(200);
    expect(r.body.reportName).toBe('General Ledger');
    expect(Array.isArray(r.body.entries)).toBe(true);
  });

  // ── Date validation (spec-032) ─────────────────────────────────────────────
  it('GET /trial-balance?startDate only → 400 (half-specified range)', () =>
    auth(request(server()).get(`${FR}/trial-balance?startDate=2026-01-01`)).expect(400));

  it('GET /profit-and-loss inverted range → 400', () =>
    auth(
      request(server()).get(`${FR}/profit-and-loss?startDate=2026-12-31&endDate=2026-01-01`),
    ).expect(400));

  it('GET /trial-balance?fiscalPeriod=2026-13 (bad format) → 400 (@Matches)', () =>
    auth(request(server()).get(`${FR}/trial-balance?fiscalPeriod=2026-13-99`)).expect(400));

  it('GET /trial-balance?fiscalPeriod=2026-03 → 200', () =>
    auth(request(server()).get(`${FR}/trial-balance?fiscalPeriod=2026-03`)).expect(200));

  // ── General Ledger unknown account ─────────────────────────────────────────
  it('GET /general-ledger?accountNumber=9.9.99 (nonexistent) → 404', () =>
    auth(request(server()).get(`${FR}/general-ledger?accountNumber=9.9.99`)).expect(404));
});
