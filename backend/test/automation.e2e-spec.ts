// ============================================================================
// E2E tests for the Automation controller — spec-031-automation
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation
// needs BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com
// (TENANT2).
// NOTE: approve/reject of a REAL queue item requires a review_required auto-JE
// produced by another module (handleAutoJe), which the service unit suite covers
// directly. Here we exercise the endpoints, guards, DTO validation, and the
// not-found / cross-tenant fetch path.
// Run: pnpm test:e2e automation
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const A = '/api/automation';

describe('Automation (e2e)', () => {
  let app: INestApplication;
  let token: string; // DEMO
  let tokenB: string; // TENANT2

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
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  it('GET /api/automation/config → 401 without a token', () =>
    request(server()).get(`${A}/config`).expect(401));

  // ── Config ───────────────────────────────────────────────────────────────
  it('GET /api/automation/config → 200 returns all module configs (defaults created)', async () => {
    const r = await auth(request(server()).get(`${A}/config`)).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body[0]).toHaveProperty('module');
    expect(r.body[0]).toHaveProperty('mode');
  });

  it('PATCH /api/automation/config/:module → 200 with a valid mode', () =>
    auth(request(server()).patch(`${A}/config/ar_invoice`))
      .send({ mode: 'review_required' })
      .expect(200));

  it('PATCH /api/automation/config/:module → 400 for an unknown module', () =>
    auth(request(server()).patch(`${A}/config/not_a_module`))
      .send({ mode: 'manual' })
      .expect(400));

  it('PATCH /api/automation/config/:module → 400 for an invalid mode (@IsEnum)', () =>
    auth(request(server()).patch(`${A}/config/ar_invoice`))
      .send({ mode: 'turbo' })
      .expect(400));

  // ── Queue ────────────────────────────────────────────────────────────────
  it('GET /api/automation/queue → 200 array', async () => {
    const r = await auth(request(server()).get(`${A}/queue`)).expect(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('GET /api/automation/queue/stats → 200 with counts', async () => {
    const r = await auth(request(server()).get(`${A}/queue/stats`)).expect(200);
    expect(r.body).toHaveProperty('pending');
    expect(r.body).toHaveProperty('total');
  });

  // ── Approve / reject: validation + not-found / tenant isolation ───────────
  it('PATCH /api/automation/queue/:id/approve → 404 for a non-existent item', () =>
    auth(request(server()).patch(`${A}/queue/${ZERO}/approve`)).send({}).expect(404));

  it('PATCH /api/automation/queue/:id/approve → 404 from another tenant', () =>
    authB(request(server()).patch(`${A}/queue/${ZERO}/approve`)).send({}).expect(404));

  it('PATCH /api/automation/queue/:id/reject → 400 without a rejectReason (DTO)', () =>
    auth(request(server()).patch(`${A}/queue/${ZERO}/reject`)).send({}).expect(400));

  it('PATCH /api/automation/queue/:id/reject → 404 for a non-existent item (with reason)', () =>
    auth(request(server()).patch(`${A}/queue/${ZERO}/reject`))
      .send({ rejectReason: 'test' })
      .expect(404));
});
