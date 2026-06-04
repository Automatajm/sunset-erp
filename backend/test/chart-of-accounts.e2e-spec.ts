// ============================================================================
// E2E tests for the ChartOfAccounts controller — spec-007-chart-of-accounts
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation needs
// BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e chart-of-accounts
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ChartOfAccounts (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2

  // Handles both login shapes from spec-001: single tenant (token is already
  // tenant-scoped) and multi-tenant (requiresTenantSelection → select-tenant).
  const login = async (email: string, tenantCode: string) => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Admin123!' });
    if (!r.body.requiresTenantSelection) return r.body.access_token;
    const tenant = r.body.tenants.find((t: { code: string }) => t.code === tenantCode);
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

    token = await login('admin@demo.com', 'DEMO');
    tokenB = await login('tenant2admin@demo.com', 'TENANT2');
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const authB = (req: request.Test) => req.set('Authorization', `Bearer ${tokenB}`);
  const server = () => app.getHttpServer();
  // accountNumber is VarChar(50); keep generated codes short and unique per run.
  const uniqueNumber = (prefix: string) => `${prefix}.${Math.floor(performance.now())}`;

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET /api/chart-of-accounts → 401 without a token', () =>
    request(server()).get('/api/chart-of-accounts').expect(401));

  it('GET /api/chart-of-accounts → 401 with a junk token', () =>
    request(server())
      .get('/api/chart-of-accounts')
      .set('Authorization', 'Bearer junk')
      .expect(401));

  // NOTE: 403 (missing ACCOUNTING:* permission) is not covered — the seed has no
  // limited-role user. TODO: add a viewer-only fixture, then assert POST → 403.

  // ── Happy paths ───────────────────────────────────────────────────────────
  it('GET /api/chart-of-accounts → 200 with token', () =>
    auth(request(server()).get('/api/chart-of-accounts')).expect(200));

  it('[GAP] GET /api/chart-of-accounts → returns { accounts, count } envelope', () =>
    auth(request(server()).get('/api/chart-of-accounts'))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('accounts');
        expect(r.body).toHaveProperty('count');
      }));

  it('POST /api/chart-of-accounts → 201 with safe defaults (currency USD, isActive, not system)', async () => {
    const accountNumber = uniqueNumber('99.1');
    const res = await auth(request(server()).post('/api/chart-of-accounts'))
      .send({ accountNumber, name: 'E2E Expense', accountType: 'expense' })
      .expect(201);
    expect(res.body.accountNumber).toBe(accountNumber);
    expect(res.body.currency).toBe('USD');
    expect(res.body.isActive).toBe(true);
    expect(res.body.isSystem).toBe(false);
    expect(res.body.allowManualPosting).toBe(true);
    expect(res.body.requireReconciliation).toBe(false);
  });

  it('GET /api/chart-of-accounts/code/:code → 200 for an existing account, 404 for unknown', async () => {
    const accountNumber = uniqueNumber('99.2');
    await auth(request(server()).post('/api/chart-of-accounts'))
      .send({ accountNumber, name: 'E2E ByCode', accountType: 'asset' })
      .expect(201);
    const res = await auth(
      request(server()).get(`/api/chart-of-accounts/code/${accountNumber}`),
    ).expect(200);
    expect(res.body.accountNumber).toBe(accountNumber);
    await auth(request(server()).get('/api/chart-of-accounts/code/0.0.00.NOPE')).expect(404);
  });

  it('GET /api/chart-of-accounts/by-type → 200; summary equals the five-bucket sum', async () => {
    const res = await auth(request(server()).get('/api/chart-of-accounts/by-type')).expect(200);
    expect(res.body).toHaveProperty('byType');
    expect(res.body).toHaveProperty('summary');
    const s = res.body.summary;
    // Every account must land in one of the five buckets — desync here means an
    // account exists with an accountType outside the enum (the @IsIn gap).
    expect(s.totalAccounts).toBe(s.assets + s.liabilities + s.equity + s.revenue + s.expense);
  });

  it('PATCH /api/chart-of-accounts/:id → 200 updates name; keeping own accountNumber is not a conflict', async () => {
    const accountNumber = uniqueNumber('99.3');
    const created = await auth(request(server()).post('/api/chart-of-accounts'))
      .send({ accountNumber, name: 'Before', accountType: 'expense' })
      .expect(201);
    const res = await auth(
      request(server()).patch(`/api/chart-of-accounts/${created.body.id}`),
    )
      .send({ accountNumber, name: 'After' }) // same number (self-excluded) + new name
      .expect(200);
    expect(res.body.name).toBe('After');
  });

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST /api/chart-of-accounts → 400 when required fields are missing', () =>
    auth(request(server()).post('/api/chart-of-accounts')).send({}).expect(400));

  it('POST /api/chart-of-accounts → 400 on an unknown body field (forbidNonWhitelisted)', () =>
    auth(request(server()).post('/api/chart-of-accounts'))
      .send({
        accountNumber: uniqueNumber('99.4'),
        name: 'X',
        accountType: 'asset',
        bogus: true,
      })
      .expect(400));

  it('[GAP] POST /api/chart-of-accounts → 400 on an accountType outside the enum (spec §DTO validation)', () =>
    auth(request(server()).post('/api/chart-of-accounts'))
      .send({ accountNumber: uniqueNumber('99.5'), name: 'Bad Type', accountType: 'banana' })
      .expect(400));

  it('[GAP] POST /api/chart-of-accounts → 400 on a non-UUID parentAccountId (spec §DTO validation)', () =>
    auth(request(server()).post('/api/chart-of-accounts'))
      .send({
        accountNumber: uniqueNumber('99.6'),
        name: 'Bad Parent',
        accountType: 'asset',
        parentAccountId: 'not-a-uuid',
      })
      .expect(400));

  it('POST /api/chart-of-accounts → 404 when parentAccountId does not resolve in the tenant', () =>
    auth(request(server()).post('/api/chart-of-accounts'))
      .send({
        accountNumber: uniqueNumber('99.7'),
        name: 'Orphan',
        accountType: 'asset',
        parentAccountId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(404));

  it('GET /api/chart-of-accounts/:id → 404 for an unknown id', () =>
    auth(
      request(server()).get('/api/chart-of-accounts/00000000-0000-0000-0000-000000000000'),
    ).expect(404));

  it('DELETE /api/chart-of-accounts/:id → 404 for an unknown id', () =>
    auth(
      request(server()).delete('/api/chart-of-accounts/00000000-0000-0000-0000-000000000000'),
    ).expect(404));

  // ── Duplicate accountNumber → 409 ─────────────────────────────────────────
  it('POST /api/chart-of-accounts → 409 on a duplicate accountNumber', async () => {
    const accountNumber = uniqueNumber('99.8');
    await auth(request(server()).post('/api/chart-of-accounts'))
      .send({ accountNumber, name: 'First', accountType: 'expense' })
      .expect(201);
    await auth(request(server()).post('/api/chart-of-accounts'))
      .send({ accountNumber, name: 'Second', accountType: 'expense' })
      .expect(409);
  });

  it('PATCH /api/chart-of-accounts/:id → 409 when the new accountNumber belongs to another row', async () => {
    const numberA = uniqueNumber('99.91');
    const numberB = uniqueNumber('99.92');
    await auth(request(server()).post('/api/chart-of-accounts'))
      .send({ accountNumber: numberA, name: 'Holder', accountType: 'expense' })
      .expect(201);
    const second = await auth(request(server()).post('/api/chart-of-accounts'))
      .send({ accountNumber: numberB, name: 'Mover', accountType: 'expense' })
      .expect(201);
    await auth(request(server()).patch(`/api/chart-of-accounts/${second.body.id}`))
      .send({ accountNumber: numberA })
      .expect(409);
  });

  // ── Delete guard + soft delete ────────────────────────────────────────────
  it('[GAP] DELETE → 400 while child accounts exist, then 200 once empty, then GET → 404', async () => {
    // Build the hierarchy: parent account + one child pointing at it.
    const parent = await auth(request(server()).post('/api/chart-of-accounts'))
      .send({ accountNumber: uniqueNumber('98.1'), name: 'Parent', accountType: 'asset' })
      .expect(201);
    const child = await auth(request(server()).post('/api/chart-of-accounts'))
      .send({
        accountNumber: uniqueNumber('98.2'),
        name: 'Child',
        accountType: 'asset',
        parentAccountId: parent.body.id,
      })
      .expect(201);

    // Blocked while the child exists (spec §Business rules — currently orphans silently).
    const blocked = await auth(
      request(server()).delete(`/api/chart-of-accounts/${parent.body.id}`),
    ).expect(400);
    expect(blocked.body.message).toContain('Cannot delete');

    // Remove the child, then the parent soft-deletes.
    await auth(request(server()).delete(`/api/chart-of-accounts/${child.body.id}`)).expect(200);
    const deleted = await auth(
      request(server()).delete(`/api/chart-of-accounts/${parent.body.id}`),
    ).expect(200);
    expect(deleted.body).toEqual(
      expect.objectContaining({ message: expect.any(String), id: parent.body.id }),
    );

    // Soft-deleted rows are invisible.
    await auth(request(server()).get(`/api/chart-of-accounts/${parent.body.id}`)).expect(404);
  });

  // NOTE: the system-account guards (DELETE → 400, PATCH accountNumber/accountType → 400)
  // are unit-tested only — isSystem is forced false on create, so e2e needs a seeded
  // isSystem fixture. TODO: seed one system account, then assert both 400s here.

  // ── Tenant isolation ──────────────────────────────────────────────────────
  // A: DEMO (token), B: TENANT2 (tokenB). An account created under A must be
  // invisible and immutable for B — 404 on detail/patch/delete, absent from B's list.
  it('an account created under tenant A is 404/absent/immutable for tenant B', async () => {
    const created = await auth(request(server()).post('/api/chart-of-accounts'))
      .send({ accountNumber: uniqueNumber('97.1'), name: 'Tenant-A Only', accountType: 'asset' })
      .expect(201);
    const id = created.body.id;

    // B cannot read, update, or delete A's account.
    await authB(request(server()).get(`/api/chart-of-accounts/${id}`)).expect(404);
    await authB(request(server()).patch(`/api/chart-of-accounts/${id}`))
      .send({ name: 'Hijacked' })
      .expect(404);
    await authB(request(server()).delete(`/api/chart-of-accounts/${id}`)).expect(404);

    // B's list does not contain A's account.
    // (Tolerates both the current bare array and the target { accounts } envelope
    // so this isolation test never false-fails on the envelope [GAP].)
    const listB = await authB(request(server()).get('/api/chart-of-accounts')).expect(200);
    const rows = Array.isArray(listB.body) ? listB.body : (listB.body.accounts ?? []);
    expect(rows.map((a: { id: string }) => a.id)).not.toContain(id);

    // And A still sees it unchanged after B's attempts.
    const stillA = await auth(request(server()).get(`/api/chart-of-accounts/${id}`)).expect(200);
    expect(stillA.body.name).toBe('Tenant-A Only');
  });
});
