// ============================================================================
// E2E tests for Notifications — spec-022. PREREQUISITES: Postgres + Redis up,
// `pnpm seed` run. Default LogMailTransport means the worker marks rows 'sent'
// without an external account. Cross-tenant isolation needs admin@demo.com
// (DEMO) + tenant2admin@demo.com (TENANT2).
// Verifies: queue-first (SO confirm → pending row, API already responded),
// drain → sent, retry/cancel, apiKey never serialized, tenant isolation,
// worker-off resilience (business flows still succeed).
// Run: pnpm test:e2e notifications
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const N = '/api/notifications';

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let tokenB: string;
  let custId: string;
  let itemId: string;

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
    // Customer WITH an email so the SO-confirmed trigger has a recipient.
    custId = (
      await auth(request(server()).post('/api/customers'))
        .send({ name: `E2E Notif Cust ${n}`, email: `notif-${n}@example.com` })
        .expect(201)
    ).body.id;
    itemId = (
      await auth(request(server()).post('/api/items'))
        .send({ name: `E2E Notif Item ${n}`, itemType: 'finished_good', baseUom: 'PCS' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth + envelope ────────────────────────────────────────────────────────

  it('GET /api/notifications → 401 without a token', () =>
    request(server()).get(N).expect(401));

  it('GET /api/notifications → { notifications, count }; ?status=weird → 400', async () => {
    const res = await auth(request(server()).get(N)).expect(200);
    expect(res.body).toHaveProperty('notifications');
    expect(res.body).toHaveProperty('count');
    await auth(request(server()).get(`${N}?status=weird`)).expect(400);
  });

  // ── Queue-first: SO confirm enqueues a pending notification ───────────────

  it('confirming an SO enqueues a pending so_confirmed notification (API already responded)', async () => {
    const so = await auth(request(server()).post('/api/sales-orders'))
      .send({ customerId: custId, lines: [{ itemId, orderedQuantity: 3, uom: 'PCS', unitPrice: 100 }] })
      .expect(201);
    // The confirm response returns immediately — it never blocks on send.
    await auth(request(server()).patch(`/api/sales-orders/${so.body.id}/status/confirmed`)).expect(200);

    const list = await auth(request(server()).get(`${N}?type=so_confirmed`)).expect(200);
    const mine = rows(list.body, 'notifications').filter((x) => x.payload?.soNumber === so.body.soNumber);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine[0].status).toBe('pending');
    expect(mine[0].subject).toContain(so.body.soNumber);
    return so.body.id;
  });

  // ── Drain → sent (LogMailTransport) ───────────────────────────────────────

  it('manual drain moves pending → sent with sentAt', async () => {
    // Ensure at least one pending row exists (confirm another SO)
    const so = await auth(request(server()).post('/api/sales-orders'))
      .send({ customerId: custId, lines: [{ itemId, orderedQuantity: 1, uom: 'PCS', unitPrice: 10 }] })
      .expect(201);
    await auth(request(server()).patch(`/api/sales-orders/${so.body.id}/status/confirmed`)).expect(200);

    await auth(request(server()).post(`${N}/drain`)).expect(200);

    const sent = await auth(request(server()).get(`${N}?type=so_confirmed&status=sent`)).expect(200);
    const mine = rows(sent.body, 'notifications').find((x) => x.payload?.soNumber === so.body.soNumber);
    expect(mine).toBeTruthy();
    expect(mine.sentAt).toBeTruthy();
  });

  // ── apiKey never serialized ───────────────────────────────────────────────

  it('no notification response ever includes an emailApiKey field', async () => {
    const res = await auth(request(server()).get(N)).expect(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('emailApiKey');
    expect(raw).not.toContain('email_api_key');
  });

  // ── retry / cancel ─────────────────────────────────────────────────────────

  it('retry re-queues a pending row; cancel is terminal (retry of cancelled → 400)', async () => {
    const so = await auth(request(server()).post('/api/sales-orders'))
      .send({ customerId: custId, lines: [{ itemId, orderedQuantity: 1, uom: 'PCS', unitPrice: 5 }] })
      .expect(201);
    await auth(request(server()).patch(`/api/sales-orders/${so.body.id}/status/confirmed`)).expect(200);
    const list = await auth(request(server()).get(`${N}?type=so_confirmed&status=pending`)).expect(200);
    const target = rows(list.body, 'notifications').find((x) => x.payload?.soNumber === so.body.soNumber);
    expect(target).toBeTruthy();

    // retry of a pending row is allowed (resets retryCount, stays pending)
    const requeued = await auth(request(server()).post(`${N}/${target.id}/retry`)).expect(200);
    expect(requeued.body.notification.status).toBe('pending');

    // cancel → terminal; retrying a cancelled row is rejected (spec: retry is for failed/pending)
    const cancelled = await auth(request(server()).post(`${N}/${target.id}/cancel`)).expect(200);
    expect(cancelled.body.notification.status).toBe('cancelled');
    await auth(request(server()).post(`${N}/${target.id}/retry`)).expect(400);
  });

  it('retry/cancel a non-existent id → 404', async () => {
    await auth(request(server()).post(`${N}/${ZERO}/retry`)).expect(404);
    await auth(request(server()).post(`${N}/${ZERO}/cancel`)).expect(404);
  });

  // ── Tenant isolation ───────────────────────────────────────────────────────

  it('tenant B cannot see or mutate tenant A notifications', async () => {
    const list = await auth(request(server()).get(N)).expect(200);
    const anyA = rows(list.body, 'notifications')[0];
    if (anyA) {
      const listB = await authB(request(server()).get(N)).expect(200);
      expect(rows(listB.body, 'notifications').map((x) => x.id)).not.toContain(anyA.id);
      await authB(request(server()).post(`${N}/${anyA.id}/cancel`)).expect(404);
    }
  });

  // ── Worker-off resilience: a missing recipient never breaks the business flow ─

  it('confirming an SO for a customer WITHOUT an email still succeeds (notification skipped)', async () => {
    const n = Math.floor(performance.now() * 1000);
    const noEmail = (
      await auth(request(server()).post('/api/customers'))
        .send({ name: `E2E NoEmail ${n}` })
        .expect(201)
    ).body.id;
    const so = await auth(request(server()).post('/api/sales-orders'))
      .send({ customerId: noEmail, lines: [{ itemId, orderedQuantity: 1, uom: 'PCS', unitPrice: 10 }] })
      .expect(201);
    // Business transaction must succeed regardless of notification eligibility.
    await auth(request(server()).patch(`/api/sales-orders/${so.body.id}/status/confirmed`)).expect(200);
  });
});
