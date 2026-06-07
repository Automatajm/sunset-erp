// ============================================================================
// E2E tests for the AP Invoices controller — spec-025-ap-invoices
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation
// needs BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com
// (TENANT2). Fixtures per run (E2E residue): supplier, GL accounts
// (2.1.01 liability / 1.1.04 + 1.1.02 assets — created tolerantly), GBP→DOP
// exchange rates, draft/posted invoices + payments.
// The frozen-rate assertions are SELF-CONSISTENT (amountBase ≈ total × rate)
// so re-runs with prior residue rates cannot break them.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e ap-invoices
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const AP = '/api/ap-invoices';

describe('ApInvoices (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let supA: string;

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
    const res = await auth(request(server()).post(AP))
      .send({
        supplierId: supA,
        invoiceDate: today,
        dueDate: in30,
        lines: [{ description: 'E2E service line', quantity: 10, unitPrice: 100 }],
        ...over,
      })
      .expect(201);
    return res.body;
  };

  // Tolerant create: 201 (new) or 409/400 (residue from a previous run)
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
    supA = (
      await auth(request(server()).post('/api/suppliers'))
        .send({ name: `E2E AP Supplier ${n}` })
        .expect(201)
    ).body.id;

    // GL accounts the post/payment JEs require (tolerate residue)
    await ensure(auth(request(server()).post('/api/chart-of-accounts')), {
      accountNumber: '2.1.01', name: 'Accounts Payable', accountType: 'liability',
    });
    await ensure(auth(request(server()).post('/api/chart-of-accounts')), {
      accountNumber: '1.1.04', name: 'Raw Material Inventory', accountType: 'asset',
    });
    await ensure(auth(request(server()).post('/api/chart-of-accounts')), {
      accountNumber: '1.1.02', name: 'Cash', accountType: 'asset',
    });

    // A GBP→DOP rate effective today (rate value varies per run — assertions
    // are self-consistent, never pinned to a value)
    await ensure(auth(request(server()).post('/api/exchange-rates')), {
      fromCurrency: 'GBP', toCurrency: 'DOP', rate: 75.5, rateDate: today,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it('GET /api/ap-invoices → 401 without a token', () =>
    request(server()).get(AP).expect(401));

  it('POST /api/ap-invoices → 401 without a token', () =>
    request(server()).post(AP).send({}).expect(401));

  // ── Envelope + query validation ────────────────────────────────────────────

  it('[GAP] GET / returns the { apInvoices, count } envelope', async () => {
    const res = await auth(request(server()).get(AP)).expect(200);
    expect(res.body).toHaveProperty('apInvoices');
    expect(res.body).toHaveProperty('count');
  });

  it('[GAP] GET /?status=weird → 400 (query whitelist)', () =>
    auth(request(server()).get(`${AP}?status=weird`)).expect(400));

  it('GET /aging and /kpis return their shapes', async () => {
    const aging = await auth(request(server()).get(`${AP}/aging`)).expect(200);
    expect(aging.body.summary).toHaveProperty('current');
    const kpis = await auth(request(server()).get(`${AP}/kpis`)).expect(200);
    expect(kpis.body).toHaveProperty('paymentRate');
  });

  // ── DTO validation ─────────────────────────────────────────────────────────

  it('POST {} → 400; unknown supplier → 404', async () => {
    await auth(request(server()).post(AP)).send({}).expect(400);
    await auth(request(server()).post(AP))
      .send({
        supplierId: ZERO, invoiceDate: today, dueDate: in30,
        lines: [{ description: 'x', quantity: 1, unitPrice: 1 }],
      })
      .expect(404);
  });

  it('[GAP] POST with empty lines [] → 400 (@ArrayMinSize)', () =>
    auth(request(server()).post(AP))
      .send({ supplierId: supA, invoiceDate: today, dueDate: in30, lines: [] })
      .expect(400));

  it('[GAP] POST with discountPercent 150 → 400 (@Max(100))', () =>
    auth(request(server()).post(AP))
      .send({
        supplierId: supA, invoiceDate: today, dueDate: in30,
        lines: [{ description: 'x', quantity: 1, unitPrice: 10, discountPercent: 150 }],
      })
      .expect(400));

  it('[GAP] POST with a 4-letter currency → 400 (@Length(3,3))', () =>
    auth(request(server()).post(AP))
      .send({
        supplierId: supA, invoiceDate: today, dueDate: in30, currency: 'USDX',
        lines: [{ description: 'x', quantity: 1, unitPrice: 10 }],
      })
      .expect(400));

  // ── Frozen-rate pattern (spec-021 gate) ────────────────────────────────────

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

    // Register a wildly different rate AFTER creation (tolerate 409 residue)
    await ensure(auth(request(server()).post('/api/exchange-rates')), {
      fromCurrency: 'GBP', toCurrency: 'DOP', rate: 12345, rateDate: today,
    });
    const again = await auth(request(server()).get(`${AP}/${inv.id}`)).expect(200);
    expect(Number(again.body.amountBase)).toBeCloseTo(frozenBase, 2); // FROZEN
  });

  // ── Lifecycle: post → pay → paid; void guards ─────────────────────────────

  it('post → JE refs set; [GAP] partial payment carries its own frozen rate; full pay → paid; [GAP] void partial → 409', async () => {
    const inv = await createInvoice(); // DOP, 1000 total
    await auth(request(server()).patch(`${AP}/${inv.id}/post`)).expect(200);

    const pay1 = await auth(request(server()).post(`${AP}/${inv.id}/payments`))
      .send({ paymentDate: today, amount: 400, paymentMethod: 'wire' })
      .expect(201);
    expect(pay1.body.newStatus).toBe('partial');
    expect(pay1.body.payment.paymentNumber).toMatch(/^APPAY-\d{4}-\d{4,}$/);
    // [GAP] frozen-rate trio on the payment
    expect(pay1.body.payment.baseCurrency).toBe('DOP');
    expect(Number(pay1.body.payment.amountBase)).toBeCloseTo(400, 2);

    // [GAP] voiding while partial must be 409
    await auth(request(server()).patch(`${AP}/${inv.id}/void`)).expect(409);

    const pay2 = await auth(request(server()).post(`${AP}/${inv.id}/payments`))
      .send({ paymentDate: today, amount: 600 })
      .expect(201);
    expect(pay2.body.newStatus).toBe('paid');

    // over-payment on a paid invoice
    await auth(request(server()).post(`${AP}/${inv.id}/payments`))
      .send({ paymentDate: today, amount: 1 })
      .expect(400);
  });

  it('[GAP] paymentMethod outside the whitelist → 400', async () => {
    const inv = await createInvoice();
    await auth(request(server()).patch(`${AP}/${inv.id}/post`)).expect(200);
    await auth(request(server()).post(`${AP}/${inv.id}/payments`))
      .send({ paymentDate: today, amount: 1, paymentMethod: 'iou' })
      .expect(400);
  });

  it('void of an unpaid posted invoice → 200 with reversal; double void → 400', async () => {
    const inv = await createInvoice();
    await auth(request(server()).patch(`${AP}/${inv.id}/post`)).expect(200);
    const res = await auth(request(server()).patch(`${AP}/${inv.id}/void`)).expect(200);
    expect(res.body.invoice.status).toBe('void');
    await auth(request(server()).patch(`${AP}/${inv.id}/void`)).expect(400);
  });

  it('draft-only guards: edit/delete posted → 400; payment on draft → 400', async () => {
    const draft = await createInvoice();
    await auth(request(server()).post(`${AP}/${draft.id}/payments`))
      .send({ paymentDate: today, amount: 1 })
      .expect(400);
    await auth(request(server()).patch(`${AP}/${draft.id}/post`)).expect(200);
    await auth(request(server()).patch(`${AP}/${draft.id}`))
      .send({ notes: 'x' })
      .expect(400);
    await auth(request(server()).delete(`${AP}/${draft.id}`)).expect(400);
  });

  it('[GAP] link-grn with a non-UUID body → 400 (LinkGrnDto)', async () => {
    const inv = await createInvoice();
    await auth(request(server()).post(`${AP}/${inv.id}/link-grn`))
      .send({ grnId: 'not-a-uuid' })
      .expect(400);
  });

  // ── Tenant isolation ───────────────────────────────────────────────────────

  it('tenant B cannot see, edit, post, or pay tenant A invoices', async () => {
    const inv = await createInvoice();
    const list = await authB(request(server()).get(AP)).expect(200);
    expect(rows(list.body, 'apInvoices').map((i) => i.id)).not.toContain(inv.id);
    await authB(request(server()).get(`${AP}/${inv.id}`)).expect(404);
    await authB(request(server()).patch(`${AP}/${inv.id}/post`)).expect(404);
    await authB(request(server()).post(`${AP}/${inv.id}/payments`))
      .send({ paymentDate: today, amount: 1 })
      .expect(404);
  });

  it('tenant B cannot create an invoice for a tenant A supplier → 404', () =>
    authB(request(server()).post(AP))
      .send({
        supplierId: supA, invoiceDate: today, dueDate: in30,
        lines: [{ description: 'x', quantity: 1, unitPrice: 1 }],
      })
      .expect(404));

  // ── Not found ──────────────────────────────────────────────────────────────

  it('GET/PATCH/DELETE a non-existent id → 404', async () => {
    await auth(request(server()).get(`${AP}/${ZERO}`)).expect(404);
    await auth(request(server()).patch(`${AP}/${ZERO}`)).send({ notes: 'x' }).expect(404);
    await auth(request(server()).delete(`${AP}/${ZERO}`)).expect(404);
  });

  // NOTE: 403 (permission-lacking role) not covered — no limited-role seed
  // fixture (same gap as other suites). createFromPo + 3-way-match happy paths
  // need a PO+GRN fixture chain — covered by unit tests and the spec's manual
  // verification checklist; the match-status endpoint shape is asserted via
  // GET on a draft (no_match):
  it('GET /:id/match-status on a no-PO invoice → no_match, canPost true', async () => {
    const inv = await createInvoice();
    const res = await auth(request(server()).get(`${AP}/${inv.id}/match-status`)).expect(200);
    expect(res.body.matchStatus).toBe('no_match');
    expect(res.body.canPost).toBe(true);
  });
});
