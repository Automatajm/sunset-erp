// ============================================================================
// E2E tests for the UOM module — spec-005-uom
// Boots the full AppModule + supertest against a REAL database.
// Prerequisites: Postgres + Redis up, `pnpm seed` run (seeds DEMO tenant,
// admin@demo.com / Admin123!, and the global cfg_uom_* catalog incl. GAL/LTR).
//
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
//
// NOTE on tenant isolation: UomUnit / UomConversion are GLOBAL catalogs shared
// by all tenants — there is intentionally no per-tenant isolation to assert at
// the HTTP layer. Tenant scoping for UOM lives in UomService.calcAllQties and
// is covered by the unit spec.
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

describe('UOM (e2e)', () => {
  let app: INestApplication;
  let token: string;

  const login = (email: string, password = 'Admin123!') =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .then((r) => r.body.access_token);

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

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const srv = () => app.getHttpServer();

  // ── Auth ────────────────────────────────────────────────────────────────────
  it('GET /api/uom/units → 401 without a token', () =>
    request(srv()).get('/api/uom/units').expect(401));

  // ── units ─────────────────────────────────────────────────────────────────────
  it('GET /api/uom/units → 200 returns an array', () =>
    auth(request(srv()).get('/api/uom/units'))
      .expect(200)
      .expect((r) => {
        expect(Array.isArray(r.body)).toBe(true);
      }));

  it('GET /api/uom/units?type=volume → only volume units', () =>
    auth(request(srv()).get('/api/uom/units?type=volume'))
      .expect(200)
      .expect((r) => {
        const types = [...new Set(r.body.map((u: any) => u.type))];
        expect(types.every((t) => t === 'volume')).toBe(true);
      }));

  // [GAP] AC "Invalid type/system filter values are rejected with 400 (via @IsIn)"
  it('[GAP] GET /api/uom/units?type=bogus → 400', () =>
    auth(request(srv()).get('/api/uom/units?type=bogus')).expect(400));

  it('GET /api/uom/units/:id → 404 for an unknown id', () =>
    auth(request(srv()).get(`/api/uom/units/${ZERO_UUID}`)).expect(404));

  // [GAP] AC ":id is validated as a UUID (ParseUUIDPipe)"
  it('[GAP] GET /api/uom/units/not-a-uuid → 400', () =>
    auth(request(srv()).get('/api/uom/units/not-a-uuid')).expect(400));

  // ── conversions ───────────────────────────────────────────────────────────────
  it('GET /api/uom/conversions → 200 returns an array', () =>
    auth(request(srv()).get('/api/uom/conversions'))
      .expect(200)
      .expect((r) => {
        expect(Array.isArray(r.body)).toBe(true);
      }));

  // ── convert ─────────────────────────────────────────────────────────────────
  it('GET /api/uom/convert (GAL→LTR) → 200 with a positive outputQty', () =>
    auth(request(srv()).get('/api/uom/convert?from=GAL&to=LTR&qty=2'))
      .expect(200)
      .expect((r) => {
        expect(r.body.outputQty).toBeGreaterThan(0);
        expect(r.body.fromUom).toBe('GAL');
      }));

  it('GET /api/uom/convert identity (LTR→LTR) → factor 1', () =>
    auth(request(srv()).get('/api/uom/convert?from=LTR&to=LTR&qty=5'))
      .expect(200)
      .expect((r) => {
        expect(r.body.factor).toBe(1);
        expect(r.body.outputQty).toBe(5);
      }));

  it('GET /api/uom/convert with no conversion path (GAL→KG) → 404', () =>
    auth(request(srv()).get('/api/uom/convert?from=GAL&to=KG&qty=1')).expect(404));

  // [GAP] AC "convert throws BadRequestException when qty is NaN/<=0/missing"
  it('[GAP] GET /api/uom/convert?qty=abc → 400', () =>
    auth(request(srv()).get('/api/uom/convert?from=GAL&to=LTR&qty=abc')).expect(400));
  it('[GAP] GET /api/uom/convert?qty=-1 → 400', () =>
    auth(request(srv()).get('/api/uom/convert?from=GAL&to=LTR&qty=-1')).expect(400));
});
