// ============================================================================
// E2E tests for the AR Invoices controller — spec-026-ar-invoices
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation
// needs BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com
// (TENANT2). Fixtures per run (E2E residue): customer, item, SO, GL accounts
// (1.1.03 / 4.1.01 / 1.1.02 — created tolerantly), GBP→DOP rate.
// Frozen-rate assertions are SELF-CONSISTENT (amountBase ≈ total × rate) so
// residue rates from earlier runs cannot break them.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e ar-invoices
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const AR = '/api/ar-invoices';

describe('ArInvoices (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let custA: string;
  let itemA: string;

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

  const rows = (body: unknown, key: string): any[] =>
    Array.isArray(body) ? (body as any[]) : ((body as Record<string, any>)[key] ?? []);

  const today = new Date().toISOString().split('T')[0];
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const createInvoice = async (over: Record<string, any> = {}) => {
    const res = await auth(request(server()).post(AR))
      .send({
        customerId: custA,
        invoiceDate: today,
        dueDate: in30,
        lines: [{ description: 'E2E service line', quantity: 10, unitPrice: 100 }],
        ...over,
      })
      .expect(201);
    return res.body;
  };

  // Tolerant create: 201 (new) or 400/409 (residue from a previous run)
  const ensure = (req: request.Test, body: any) =>
    req.send(body).then((r) => {
      if (![200, 201, 400, 409].includes(r.status))
        throw new Error(`fixture failed: ${r.status} ${JSON.stringify(r.body)}`);
      return r;
    });

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

    const n = Math.floor(performance.now() * 1000);
    custA = (
      await auth(request(server()).post('/api/customers'))
        .send({ name: `E2E AR Customer ${n}` })
        .expect(201)
    ).body.id;
    itemA = (
      await auth(request(server()).post('/api/items'))
        .send({ name: `E2E AR Item ${n}`, itemType: 'finished_good', baseUom: 'PCS' })
        .expect(201)
    ).body.id;

    // GL accounts the send/payment JEs require (tolerate residue)
    await ensure(auth(request(server()).post('/api/chart-of-accounts')), {
      accountNumber: '1.1.03', name: 'Accounts Receivable', accountType: 'asset',
    });
    await ensure(auth(request(server()).post('/api/chart-of-accounts')), {
      accountNumber: '4.1.01', name: 'Revenue', accountType: 'revenue',
    });
    await ensure(auth(request(server()).post('/api/chart-of-accounts')), {
      accountNumber: '1.1.02', name: 'Cash', accountType: 'asset',
    });

    // A GBP→DOP rate effective today (value varies per run — assertions
    // are self-consistent, never pinned)
    await ensure(auth(request(server()).post('/api/exchange-rates')), {
      fromCurrency: 'GBP', toCurrency: 'DOP', rate: 75.5, rateDate: today,
    });
    // USD→DOP too: SOs default to USD (sales-orders.service) and the from-so
    // test freezes that rate — on a clean DB nothing else provides it (the
    // suite used to pass only via exchange-rates-suite residue; spec-028).
    await ensure(auth(request(server()).post('/api/exchange-rates')), {
      fromCurrency: 'USD', toCurrency: 'DOP', rate: 60.0, rateDate: today,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('GET /api/ar-invoices → 401 without a token', () =>
    request(server()).get(AR).expect(401));

  it('POST /api/ar-invoices → 401 without a token', () =>
    request(server()).post(AR).send({}).expect(401));

  // ── Envelope + query validation ────────────────────────────────────────────

  it('[GAP] GET / returns the { arInvoices, count } envelope', async () => {
    const res = await auth(request(server()).get(AR)).expect(200);
    expect(res.body).toHaveProperty('arInvoices');
    expect(res.body).toHaveProperty('count');
  });

  it('[GAP] GET /?status=weird → 400 (query whitelist)', () =>
    auth(request(server()).get(`${AR}?status=weird`)).expect(400));

  it('GET /aging and /kpis return their shapes', async () => {
    const aging = await auth(request(server()).get(`${AR}/aging`)).expect(200);
    expect(aging.body.summary).toHaveProperty('current');
    const kpis = await auth(request(server()).get(`${AR}/kpis`)).expect(200);
    expect(kpis.body).toHaveProperty('collectionRate');
  });

  // ── DTO validation ─────────────────────────────────────────────────────────

  it('POST {} → 400; unknown customer → 404', async () => {
    await auth(request(server()).post(AR)).send({}).expect(400);
    await auth(request(server()).post(AR))
      .send({
        customerId: ZERO, invoiceDate: today, dueDate: in30,
        lines: [{ description: 'x', quantity: 1, unitPrice: 1 }],
      })
      .expect(404);
  });

  it('[GAP] POST with empty lines [] → 400 (@ArrayMinSize)', () =>
    auth(request(server()).post(AR))
      .send({ customerId: custA, invoiceDate: today, dueDate: in30, lines: [] })
      .expect(400));

  it('[GAP] POST with discountPercent 150 → 400 (@Max(100))', () =>
    auth(request(server()).post(AR))
      .send({
        customerId: custA, invoiceDate: today, dueDate: in30,
        lines: [{ description: 'x', quantity: 1, unitPrice: 10, discountPercent: 150 }],
      })
      .expect(400));

  it('[GAP] POST with a 4-letter currency → 400 (@Length(3,3))', () =>
    auth(request(server()).post(AR))
      .send({
        customerId: custA, invoiceDate: today, dueDate: in30, currency: 'USDX',
        lines: [{ description: 'x', quantity: 1, unitPrice: 10 }],
      })
      .expect(400));

  // ── Frozen-rate pattern ────────────────────────────────────────────────────

  it('[GAP] no currency in body → tenant base currency with identity rate 1', async () => {
    const inv = await createInvoice();
    expect(inv.currency).toBe('DOP');
    expect(Number(inv.exchangeRate)).toBe(1);
    expect(Number(inv.amountBase)).toBeCloseTo(Number(inv.totalAmount), 2);
    expect(inv.baseCurrency).toBe('DOP');
  });

  it('[GAP] GBP invoice freezes rate + amountBase; later rates do NOT change it', async () => {
    const inv = await createInvoice({ currency: 'GBP' });
    expect(Number(inv.exchangeRate)).toBeGreaterThan(1);
    expect(Number(inv.amountBase)).toBeCloseTo(
      Number(inv.totalAmount) * Number(inv.exchangeRate),
      1,
    );
    const frozenBase = Number(inv.amountBase);
    await ensure(auth(request(server()).post('/api/exchange-rates')), {
      fromCurrency: 'GBP', toCurrency: 'DOP', rate: 54321, rateDate: today,
    });
    const again = await auth(request(server()).get(`${AR}/${inv.id}`)).expect(200);
    expect(Number(again.body.amountBase)).toBeCloseTo(frozenBase, 2); // FROZEN
  });

  // ── from-SO flow (AR-specific: retroactive date) ───────────────────────────

  it('[GAP] from-so: retroactive invoiceDate = orderDate, cogsAmount null, frozen trio present', async () => {
    const so = await auth(request(server()).post('/api/sales-orders'))
      .send({
        customerId: custA,
        lines: [{ itemId: itemA, orderedQuantity: 10, uom: 'PCS', unitPrice: 100 }],
      })
      .expect(201);
    await auth(
      request(server()).patch(`/api/sales-orders/${so.body.id}/status/confirmed`),
    ).expect(200);
    const inv = await auth(
      request(server()).post(`${AR}/from-so/${so.body.id}`),
    ).expect(201);
    expect(String(inv.body.invoiceDate).slice(0, 10)).toBe(
      String(so.body.orderDate).slice(0, 10),
    );
    expect(inv.body.lines[0].cogsAmount).toBeNull();
    expect(inv.body.baseCurrency).toBe('DOP');
    expect(Number(inv.body.amountBase)).toBeCloseTo(
      Number(inv.body.totalAmount) * Number(inv.body.exchangeRate),
      1,
    );
    // duplicate from-so → 400
    await auth(request(server()).post(`${AR}/from-so/${so.body.id}`)).expect(400);
  });

  // ── Lifecycle: send → pay → paid; void guards ──────────────────────────────

  it('send → JE; [GAP] payment carries its own frozen trio; [GAP] void partial → 409; full pay → paid', async () => {
    const inv = await createInvoice(); // DOP, 1000 total, no item lines (skip stock)
    await auth(request(server()).patch(`${AR}/${inv.id}/send`)).expect(200);

    const pay1 = await auth(request(server()).post(`${AR}/${inv.id}/payments`))
      .send({ paymentDate: today, amount: 400, paymentMethod: 'wire' })
      .expect(201);
    expect(pay1.body.newStatus).toBe('partial');
    expect(pay1.body.payment.paymentNumber).toMatch(/^PAY-\d{4}-\d{4,}$/);
    expect(pay1.body.payment.baseCurrency).toBe('DOP');
    expect(Number(pay1.body.payment.amountBase)).toBeCloseTo(400, 2);

    await auth(request(server()).patch(`${AR}/${inv.id}/void`)).expect(409); // [GAP]

    const pay2 = await auth(request(server()).post(`${AR}/${inv.id}/payments`))
      .send({ paymentDate: today, amount: 600 })
      .expect(201);
    expect(pay2.body.newStatus).toBe('paid');
    await auth(request(server()).post(`${AR}/${inv.id}/payments`))
      .send({ paymentDate: today, amount: 1 })
      .expect(400); // over-payment on paid
  });

  it('[GAP] paymentMethod outside the whitelist → 400', async () => {
    const inv = await createInvoice();
    await auth(request(server()).patch(`${AR}/${inv.id}/send`)).expect(200);
    await auth(request(server()).post(`${AR}/${inv.id}/payments`))
      .send({ paymentDate: today, amount: 1, paymentMethod: 'iou' })
      .expect(400);
  });

  it('void of an unpaid sent invoice → 200; double void → 400', async () => {
    const inv = await createInvoice();
    await auth(request(server()).patch(`${AR}/${inv.id}/send`)).expect(200);
    const res = await auth(request(server()).patch(`${AR}/${inv.id}/void`)).expect(200);
    expect(res.body.invoice.status).toBe('void');
    await auth(request(server()).patch(`${AR}/${inv.id}/void`)).expect(400);
  });

  it('draft-only guards: edit/delete sent → 400; payment on draft → 400', async () => {
    const draft = await createInvoice();
    await auth(request(server()).post(`${AR}/${draft.id}/payments`))
      .send({ paymentDate: today, amount: 1 })
      .expect(400);
    await auth(request(server()).patch(`${AR}/${draft.id}/send`)).expect(200);
    await auth(request(server()).patch(`${AR}/${draft.id}`)).send({ notes: 'x' }).expect(400);
    await auth(request(server()).delete(`${AR}/${draft.id}`)).expect(400);
  });

  // ── Tenant isolation ───────────────────────────────────────────────────────

  it('tenant B cannot see, send, or pay tenant A invoices', async () => {
    const inv = await createInvoice();
    const list = await authB(request(server()).get(AR)).expect(200);
    expect(rows(list.body, 'arInvoices').map((i) => i.id)).not.toContain(inv.id);
    await authB(request(server()).get(`${AR}/${inv.id}`)).expect(404);
    await authB(request(server()).patch(`${AR}/${inv.id}/send`)).expect(404);
    await authB(request(server()).post(`${AR}/${inv.id}/payments`))
      .send({ paymentDate: today, amount: 1 })
      .expect(404);
  });

  it('tenant B cannot invoice a tenant A customer → 404', () =>
    authB(request(server()).post(AR))
      .send({
        customerId: custA, invoiceDate: today, dueDate: in30,
        lines: [{ description: 'x', quantity: 1, unitPrice: 1 }],
      })
      .expect(404));

  // ── Not found ──────────────────────────────────────────────────────────────

  it('GET/PATCH/DELETE a non-existent id → 404', async () => {
    await auth(request(server()).get(`${AR}/${ZERO}`)).expect(404);
    await auth(request(server()).patch(`${AR}/${ZERO}`)).send({ notes: 'x' }).expect(404);
    await auth(request(server()).delete(`${AR}/${ZERO}`)).expect(404);
  });

  // NOTE: 403 (permission-lacking role) not covered — no limited-role seed
  // fixture (same gap as other suites). The send-aborts-on-shipment-failure
  // path is unit-tested (e2e invoices here use description-only lines, which
  // skip the stock path by design).
});
