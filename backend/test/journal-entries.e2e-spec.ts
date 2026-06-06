// ============================================================================
// E2E tests for the JournalEntries controller — spec-015-journal-entries
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation needs
// BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// Fixture accounts are created per run with unique accountNumbers (E2E residue).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e journal-entries
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const BASE = '/api/journal-entries';

describe('JournalEntries (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let accDr: string; // postable asset account
  let accCr: string; // postable revenue account
  let accHeader: string; // allowManualPosting: false
  let accInactive: string; // isActive: false

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

  const balancedBody = (over: Record<string, unknown> = {}) => ({
    entryDate: '2026-06-15',
    journalType: 'general',
    description: 'E2E JE',
    lines: [
      { accountId: accDr, debitAmount: 100, creditAmount: 0 },
      { accountId: accCr, debitAmount: 0, creditAmount: 100 },
    ],
    ...over,
  });

  const rows = (body: unknown): Array<{ id: string }> =>
    Array.isArray(body)
      ? (body as Array<{ id: string }>)
      : ((body as { journalEntries?: Array<{ id: string }> }).journalEntries ?? []);

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
    const mkAccount = async (suffix: string, extra: Record<string, unknown> = {}) => {
      const res = await auth(request(server()).post('/api/chart-of-accounts'))
        .send({
          accountNumber: `E2E.JE.${n}.${suffix}`,
          name: `E2E JE Account ${suffix}`,
          accountType: 'asset',
          allowManualPosting: true,
          ...extra,
        })
        .expect(201);
      return res.body.id as string;
    };
    accDr = await mkAccount('1');
    accCr = await mkAccount('2', { accountType: 'revenue' });
    accHeader = await mkAccount('3', { allowManualPosting: false });
    accInactive = await mkAccount('4', { isActive: false });
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET / → 401 without a token', () => request(server()).get(BASE).expect(401));

  it('POST / → 401 with a junk token', () =>
    request(server()).post(BASE).set('Authorization', 'Bearer junk').send({}).expect(401));

  // NOTE: 403 (missing ACCOUNTING:* permission) is not covered — no limited-role fixture.

  // ── Create — happy path + numbering ──────────────────────────────────────
  it('POST balanced → 201, system-assigned JE-YYYYMM-NNNN, draft, derived fiscalPeriod', async () => {
    const res = await auth(request(server()).post(BASE)).send(balancedBody()).expect(201);
    expect(res.body.entryNumber).toMatch(/^JE-\d{6}-\d{4}$/);
    expect(res.body.status).toBe('draft');
    expect(res.body.fiscalPeriod).toBe('2026-06');
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines[0].debitAmount).toBe(100); // Decimal → number
  });

  it('POST with a client-supplied entryNumber → 400 (spec-012, forbidNonWhitelisted)', () =>
    auth(request(server()).post(BASE))
      .send(balancedBody({ entryNumber: 'JE-999999-9999' }))
      .expect(400));

  // ── Create — double-entry integrity ───────────────────────────────────────
  it('[GAP] POST off by one cent → 400 (cent-exact balance, zero tolerance)', () =>
    auth(request(server()).post(BASE))
      .send(
        balancedBody({
          lines: [
            { accountId: accDr, debitAmount: 100.0, creditAmount: 0 },
            { accountId: accCr, debitAmount: 0, creditAmount: 100.01 },
          ],
        }),
      )
      .expect(400));

  it('POST clearly unbalanced → 400', () =>
    auth(request(server()).post(BASE))
      .send(
        balancedBody({
          lines: [
            { accountId: accDr, debitAmount: 100, creditAmount: 0 },
            { accountId: accCr, debitAmount: 0, creditAmount: 50 },
          ],
        }),
      )
      .expect(400));

  it('POST line with both sides / neither side → 400', async () => {
    await auth(request(server()).post(BASE))
      .send(
        balancedBody({
          lines: [
            { accountId: accDr, debitAmount: 50, creditAmount: 50 },
            { accountId: accCr, debitAmount: 50, creditAmount: 50 },
          ],
        }),
      )
      .expect(400);
    await auth(request(server()).post(BASE))
      .send(
        balancedBody({
          lines: [
            { accountId: accDr, debitAmount: 0, creditAmount: 0 },
            { accountId: accCr, debitAmount: 0, creditAmount: 0 },
          ],
        }),
      )
      .expect(400);
  });

  it('POST a single line → 400 (@ArrayMinSize(2))', () =>
    auth(request(server()).post(BASE))
      .send(balancedBody({ lines: [{ accountId: accDr, debitAmount: 100, creditAmount: 0 }] }))
      .expect(400));

  // ── Create — DTO whitelists & caps ─────────────────────────────────────────
  it('[GAP] POST journalType outside the whitelist → 400', () =>
    auth(request(server()).post(BASE))
      .send(balancedBody({ journalType: 'weird' }))
      .expect(400));

  it('[GAP] POST line with referenceType/referenceId → 400 (phantom fields removed)', () =>
    auth(request(server()).post(BASE))
      .send(
        balancedBody({
          lines: [
            { accountId: accDr, debitAmount: 100, creditAmount: 0, referenceType: 'invoice' },
            { accountId: accCr, debitAmount: 0, creditAmount: 100 },
          ],
        }),
      )
      .expect(400));

  it('[GAP] POST amount beyond Decimal(18,2) capacity → 400, never 500', () =>
    auth(request(server()).post(BASE))
      .send(
        balancedBody({
          lines: [
            { accountId: accDr, debitAmount: 1e17, creditAmount: 0 },
            { accountId: accCr, debitAmount: 0, creditAmount: 1e17 },
          ],
        }),
      )
      .expect(400));

  // ── Create — account gates ─────────────────────────────────────────────────
  it('POST line against a header account → 400; inactive account → 400; unknown → 404', async () => {
    await auth(request(server()).post(BASE))
      .send(
        balancedBody({
          lines: [
            { accountId: accHeader, debitAmount: 100, creditAmount: 0 },
            { accountId: accCr, debitAmount: 0, creditAmount: 100 },
          ],
        }),
      )
      .expect(400);
    await auth(request(server()).post(BASE))
      .send(
        balancedBody({
          lines: [
            { accountId: accInactive, debitAmount: 100, creditAmount: 0 },
            { accountId: accCr, debitAmount: 0, creditAmount: 100 },
          ],
        }),
      )
      .expect(400);
    await auth(request(server()).post(BASE))
      .send(
        balancedBody({
          lines: [
            { accountId: ZERO, debitAmount: 100, creditAmount: 0 },
            { accountId: accCr, debitAmount: 0, creditAmount: 100 },
          ],
        }),
      )
      .expect(404);
  });

  // ── List ──────────────────────────────────────────────────────────────────
  it('[GAP] GET / → { journalEntries, count } envelope', () =>
    auth(request(server()).get(BASE))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('journalEntries');
        expect(r.body).toHaveProperty('count');
      }));

  it('GET /?status=draft → 200; [GAP] ?status=weird → 400', async () => {
    await auth(request(server()).get(`${BASE}?status=draft`)).expect(200);
    await auth(request(server()).get(`${BASE}?status=weird`)).expect(400); // [GAP]
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  it('draft → update → post → frozen → unpost → delete lifecycle', async () => {
    const created = await auth(request(server()).post(BASE)).send(balancedBody()).expect(201);
    const id = created.body.id;

    // update draft: entryDate change recomputes fiscalPeriod
    const updated = await auth(request(server()).patch(`${BASE}/${id}`))
      .send({ entryDate: '2026-07-10', description: 'Moved to July' })
      .expect(200);
    expect(updated.body.fiscalPeriod).toBe('2026-07');

    // post
    const posted = await auth(request(server()).patch(`${BASE}/${id}/post`)).expect(200);
    expect(posted.body.journalEntry.status).toBe('posted');
    expect(posted.body.message).toContain('posted');

    // posted entries are frozen
    await auth(request(server()).patch(`${BASE}/${id}`)).send({ description: 'X' }).expect(400);
    await auth(request(server()).delete(`${BASE}/${id}`)).expect(400);
    await auth(request(server()).patch(`${BASE}/${id}/post`)).expect(400); // already posted

    // unpost → draft again → delete
    const unposted = await auth(request(server()).patch(`${BASE}/${id}/unpost`)).expect(200);
    expect(unposted.body.journalEntry.status).toBe('draft');
    await auth(request(server()).patch(`${BASE}/${id}/unpost`)).expect(400); // not posted
    const deleted = await auth(request(server()).delete(`${BASE}/${id}`)).expect(200);
    expect(deleted.body).toEqual(
      expect.objectContaining({ message: expect.any(String), id }),
    );
    await auth(request(server()).get(`${BASE}/${id}`)).expect(404); // soft-deleted
  });

  it('GET/PATCH/POST/UNPOST/DELETE → 404 for an unknown id', async () => {
    await auth(request(server()).get(`${BASE}/${ZERO}`)).expect(404);
    await auth(request(server()).patch(`${BASE}/${ZERO}`)).send({ description: 'X' }).expect(404);
    await auth(request(server()).patch(`${BASE}/${ZERO}/post`)).expect(404);
    await auth(request(server()).patch(`${BASE}/${ZERO}/unpost`)).expect(404);
    await auth(request(server()).delete(`${BASE}/${ZERO}`)).expect(404);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  it('an entry created under tenant A is invisible and immutable for tenant B', async () => {
    const created = await auth(request(server()).post(BASE)).send(balancedBody()).expect(201);
    const id = created.body.id;

    await authB(request(server()).get(`${BASE}/${id}`)).expect(404);
    await authB(request(server()).patch(`${BASE}/${id}`)).send({ description: 'X' }).expect(404);
    await authB(request(server()).patch(`${BASE}/${id}/post`)).expect(404);
    await authB(request(server()).patch(`${BASE}/${id}/unpost`)).expect(404);
    await authB(request(server()).delete(`${BASE}/${id}`)).expect(404);

    const listB = await authB(request(server()).get(BASE)).expect(200);
    expect(rows(listB.body).map((e) => e.id)).not.toContain(id);

    // tenant B cannot post lines against tenant A's accounts either
    await authB(request(server()).post(BASE)).send(balancedBody()).expect(404);

    // A still sees its entry
    const stillA = await auth(request(server()).get(`${BASE}/${id}`)).expect(200);
    expect(stillA.body.id).toBe(id);
  });
});
