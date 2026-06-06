// ============================================================================
// E2E tests for the Exchange Rates controller — spec-021-multi-currency
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run (currency catalog +
// SETTINGS:VIEW/EDIT permissions granted to ADMIN). Cross-tenant isolation
// needs BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com
// (TENANT2). Rates created per run are E2E residue (unique by tenant+pair+date,
// dated far in the past to avoid colliding with the demo seed).
// Run: pnpm test:e2e exchange-rates
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ER = '/api/exchange-rates';
// A fixed past date keeps the [tenant, pair, date] unique key out of the demo
// seed's way; re-runs hit the 409 path deliberately, so use a per-run date.
const day = (n: number) => `2020-01-${String(n).padStart(2, '0')}`;

describe('ExchangeRates (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let runDay: string;

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
    // 1-28: a stable per-run day inside January 2020
    runDay = day(1 + (Math.floor(performance.now()) % 28));
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('GET /api/exchange-rates → 401 without a token', () =>
    request(server()).get(ER).expect(401));

  it('POST /api/exchange-rates → 401 without a token', () =>
    request(server()).post(ER).send({}).expect(401));

  // ── Create + validation ────────────────────────────────────────────────────

  it('POST {} → 400 (missing required fields)', () =>
    auth(request(server()).post(ER)).send({}).expect(400));

  it('POST with identical pair → 400', () =>
    auth(request(server()).post(ER))
      .send({ fromCurrency: 'USD', toCurrency: 'USD', rate: 1, rateDate: runDay })
      .expect(400));

  it('POST with an unknown currency → 404', () =>
    auth(request(server()).post(ER))
      .send({ fromCurrency: 'XXX', toCurrency: 'DOP', rate: 10, rateDate: runDay })
      .expect(404));

  it('POST with a bad source → 400 (@IsIn whitelist)', () =>
    auth(request(server()).post(ER))
      .send({
        fromCurrency: 'USD',
        toCurrency: 'DOP',
        rate: 59.5,
        rateDate: runDay,
        source: 'scraped',
      })
      .expect(400));

  it('POST with a negative rate → 400 (@IsPositive)', () =>
    auth(request(server()).post(ER))
      .send({ fromCurrency: 'USD', toCurrency: 'DOP', rate: -1, rateDate: runDay })
      .expect(400));

  it('POST happy path → 201; duplicate tenant+pair+date → 409', async () => {
    const res = await auth(request(server()).post(ER))
      .send({ fromCurrency: 'USD', toCurrency: 'DOP', rate: 59.5, rateDate: runDay })
      .expect(201);
    expect(res.body.fromCurrency).toBe('USD');
    expect(res.body.source).toBe('manual');
    await auth(request(server()).post(ER))
      .send({ fromCurrency: 'USD', toCurrency: 'DOP', rate: 60.0, rateDate: runDay })
      .expect(409);
  });

  // ── List + envelope + filters ──────────────────────────────────────────────

  it('GET / returns the { exchangeRates, count } envelope', async () => {
    const res = await auth(request(server()).get(ER)).expect(200);
    expect(res.body).toHaveProperty('exchangeRates');
    expect(res.body).toHaveProperty('count');
  });

  it('GET /?from=USD filters by fromCurrency', async () => {
    const res = await auth(request(server()).get(`${ER}?from=USD`)).expect(200);
    for (const r of res.body.exchangeRates) expect(r.fromCurrency).toBe('USD');
  });

  it('GET /?from=USDX → 400 (length-validated query)', () =>
    auth(request(server()).get(`${ER}?from=USDX`)).expect(400));

  // ── Tenant isolation ───────────────────────────────────────────────────────

  it('tenant B does not see tenant A rates; same pair+date is creatable under B', async () => {
    const listB = await authB(request(server()).get(`${ER}?from=USD&to=DOP`)).expect(200);
    const datesB = listB.body.exchangeRates.map((r: any) =>
      String(r.effectiveDate).slice(0, 10),
    );
    expect(datesB).not.toContain(runDay);
    // The unique key is tenant-scoped — B can register the same pair+date.
    await authB(request(server()).post(ER))
      .send({ fromCurrency: 'USD', toCurrency: 'DOP', rate: 58.9, rateDate: runDay })
      .expect(201);
  });
});
