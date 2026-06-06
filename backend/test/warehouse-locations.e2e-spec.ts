// ============================================================================
// E2E tests for the WarehouseLocations controller — spec-014-warehouse-locations
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run. Cross-tenant isolation needs
// BOTH seeded tenants: admin@demo.com (DEMO) and tenant2admin@demo.com (TENANT2).
// A fresh warehouse is created per run, so fixed child codes never collide.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e warehouse-locations
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

const ZERO = '00000000-0000-0000-0000-000000000000';
const BASE = '/api/warehouse-locations';

describe('WarehouseLocations (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let whId: string; // fresh warehouse under tenant A
  // primary chain under zone STOR
  let zoneId: string;
  let aisleId: string;
  let rackId: string;
  let levelId: string;
  let binId: string;

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

  // List bodies may be a bare array (current) or an envelope (spec target) —
  // unwrap both so non-envelope tests stay valid across the migration.
  const rows = (body: unknown, key: string): Array<{ id: string; fullCode?: string }> =>
    Array.isArray(body) ? body : ((body as Record<string, never>)[key] ?? []);

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

    const wh = await auth(request(server()).post('/api/warehouses'))
      .send({ name: 'E2E WL Warehouse ' + Math.floor(performance.now()), locationTrackingEnabled: true })
      .expect(201);
    whId = wh.body.id;

    // Primary chain: STOR → 01 → 01 → 01 → 01
    const zone = await auth(request(server()).post(`${BASE}/zones`))
      .send({ warehouseId: whId, code: 'STOR', name: 'Storage' })
      .expect(201);
    zoneId = zone.body.id;
    const aisle = await auth(request(server()).post(`${BASE}/aisles`))
      .send({ zoneId, code: '01' })
      .expect(201);
    aisleId = aisle.body.id;
    const rack = await auth(request(server()).post(`${BASE}/racks`))
      .send({ aisleId, code: '01' })
      .expect(201);
    rackId = rack.body.id;
    const level = await auth(request(server()).post(`${BASE}/levels`))
      .send({ rackId, code: '01' })
      .expect(201);
    levelId = level.body.id;
    const bin = await auth(request(server()).post(`${BASE}/bins`))
      .send({ levelId, code: '01' })
      .expect(201);
    binId = bin.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET zones → 401 without a token', () =>
    request(server()).get(`${BASE}/zones/by-warehouse/${ZERO}`).expect(401));

  it('POST zones → 401 with a junk token', () =>
    request(server())
      .post(`${BASE}/zones`)
      .set('Authorization', 'Bearer junk')
      .send({ warehouseId: ZERO, code: 'X', name: 'X' })
      .expect(401));

  // NOTE: 403 (missing INVENTORY:* permission) is not covered — no limited-role fixture.

  // ── fullCode chain (built in beforeAll) ───────────────────────────────────
  it('the 5-segment fullCode chain is system-generated tier by tier', async () => {
    const bins = await auth(request(server()).get(`${BASE}/bins/by-level/${levelId}`)).expect(200);
    const bin = rows(bins.body, 'bins').find((b) => b.id === binId);
    expect(bin?.fullCode).toBe('STOR-01-01-01-01');
  });

  it('POST zones uppercases the client-supplied code', async () => {
    const res = await auth(request(server()).post(`${BASE}/zones`))
      .send({ warehouseId: whId, code: 'recv', name: 'Receiving', zoneType: 'receiving' })
      .expect(201);
    expect(res.body.code).toBe('RECV');
  });

  // ── List envelopes (spec §Response format) ────────────────────────────────
  it('[GAP] GET zones → { zones, count } envelope', () =>
    auth(request(server()).get(`${BASE}/zones/by-warehouse/${whId}`))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('zones');
        expect(r.body).toHaveProperty('count');
      }));

  it('[GAP] GET aisles/racks/levels/bins → enveloped likewise', async () => {
    const checks: Array<[string, string]> = [
      [`${BASE}/aisles/by-zone/${zoneId}`, 'aisles'],
      [`${BASE}/racks/by-aisle/${aisleId}`, 'racks'],
      [`${BASE}/levels/by-rack/${rackId}`, 'levels'],
      [`${BASE}/bins/by-level/${levelId}`, 'bins'],
    ];
    for (const [url, key] of checks) {
      const r = await auth(request(server()).get(url)).expect(200);
      expect(r.body).toHaveProperty(key);
      expect(r.body).toHaveProperty('count');
    }
  });

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST zones → 400 when required fields are missing', () =>
    auth(request(server()).post(`${BASE}/zones`)).send({}).expect(400));

  it('POST zones → 404 for an unknown warehouse', () =>
    auth(request(server()).post(`${BASE}/zones`))
      .send({ warehouseId: ZERO, code: 'X1', name: 'X' })
      .expect(404));

  it('[GAP] POST zones → 400 on a zoneType outside the whitelist', () =>
    auth(request(server()).post(`${BASE}/zones`))
      .send({ warehouseId: whId, code: 'BAD1', name: 'Bad', zoneType: 'garage' })
      .expect(400));

  it('[GAP] POST bins → 400 on a binType outside the whitelist', () =>
    auth(request(server()).post(`${BASE}/bins`))
      .send({ levelId, code: '98', binType: 'cupboard' })
      .expect(400));

  it('POST zones → 409 on a duplicate active sibling code', () =>
    auth(request(server()).post(`${BASE}/zones`))
      .send({ warehouseId: whId, code: 'STOR', name: 'Dup' })
      .expect(409));

  it('POST aisles → 409 on a duplicate code within the zone', () =>
    auth(request(server()).post(`${BASE}/aisles`))
      .send({ zoneId, code: '01' })
      .expect(409));

  it('[GAP] PATCH to a sibling code → 409 (update duplicate re-check)', async () => {
    const a2 = await auth(request(server()).post(`${BASE}/aisles`))
      .send({ zoneId, code: '77' })
      .expect(201);
    await auth(request(server()).patch(`${BASE}/aisles/${a2.body.id}`))
      .send({ code: '01' }) // already taken by the primary aisle
      .expect(409);
    await auth(request(server()).delete(`${BASE}/aisles/${a2.body.id}`)).expect(200);
  });

  it('PATCH/DELETE → 404 for unknown ids (all five entities)', async () => {
    for (const entity of ['zones', 'aisles', 'racks', 'levels', 'bins']) {
      await auth(request(server()).patch(`${BASE}/${entity}/${ZERO}`))
        .send({ name: 'X' })
        .expect(404);
      await auth(request(server()).delete(`${BASE}/${entity}/${ZERO}`)).expect(404);
    }
  });

  // ── fullCode cascade (dedicated chain — does not disturb the primary one) ──
  it('[GAP] renaming an aisle code cascades fullCode to descendant racks/levels/bins', async () => {
    const z = await auth(request(server()).post(`${BASE}/zones`))
      .send({ warehouseId: whId, code: 'CASC', name: 'Cascade' })
      .expect(201);
    const a = await auth(request(server()).post(`${BASE}/aisles`))
      .send({ zoneId: z.body.id, code: '01' })
      .expect(201);
    const r = await auth(request(server()).post(`${BASE}/racks`))
      .send({ aisleId: a.body.id, code: '01' })
      .expect(201);
    const l = await auth(request(server()).post(`${BASE}/levels`))
      .send({ rackId: r.body.id, code: '01' })
      .expect(201);
    await auth(request(server()).post(`${BASE}/bins`))
      .send({ levelId: l.body.id, code: '01' })
      .expect(201);

    const patched = await auth(request(server()).patch(`${BASE}/aisles/${a.body.id}`))
      .send({ code: '02' })
      .expect(200);
    expect(patched.body.fullCode).toBe('CASC-02');

    const racks = await auth(
      request(server()).get(`${BASE}/racks/by-aisle/${a.body.id}`),
    ).expect(200);
    expect(rows(racks.body, 'racks')[0].fullCode).toBe('CASC-02-01');

    const bins = await auth(
      request(server()).get(`${BASE}/bins/by-level/${l.body.id}`),
    ).expect(200);
    expect(rows(bins.body, 'bins')[0].fullCode).toBe('CASC-02-01-01-01');
  });

  // ── Delete guards (dedicated chain) ───────────────────────────────────────
  it('[GAP] deleting a parent with active children → 400 at every tier; bottom-up succeeds', async () => {
    const z = await auth(request(server()).post(`${BASE}/zones`))
      .send({ warehouseId: whId, code: 'DEL', name: 'Delete me' })
      .expect(201);
    const a = await auth(request(server()).post(`${BASE}/aisles`))
      .send({ zoneId: z.body.id, code: '01' })
      .expect(201);
    const r = await auth(request(server()).post(`${BASE}/racks`))
      .send({ aisleId: a.body.id, code: '01' })
      .expect(201);
    const l = await auth(request(server()).post(`${BASE}/levels`))
      .send({ rackId: r.body.id, code: '01' })
      .expect(201);
    const b = await auth(request(server()).post(`${BASE}/bins`))
      .send({ levelId: l.body.id, code: '01' })
      .expect(201);

    // top-down: every parent with an active child must refuse
    await auth(request(server()).delete(`${BASE}/zones/${z.body.id}`)).expect(400); // [GAP]
    await auth(request(server()).delete(`${BASE}/aisles/${a.body.id}`)).expect(400); // [GAP]
    await auth(request(server()).delete(`${BASE}/racks/${r.body.id}`)).expect(400); // [GAP]
    await auth(request(server()).delete(`${BASE}/levels/${l.body.id}`)).expect(400); // existing guard

    // bottom-up: all succeed with { message, id }
    for (const [entity, id] of [
      ['bins', b.body.id],
      ['levels', l.body.id],
      ['racks', r.body.id],
      ['aisles', a.body.id],
      ['zones', z.body.id],
    ] as Array<[string, string]>) {
      const res = await auth(request(server()).delete(`${BASE}/${entity}/${id}`)).expect(200);
      expect(res.body).toEqual(expect.objectContaining({ message: expect.any(String), id }));
    }
  });

  it('[GAP] re-creating a soft-deleted sibling code → 409 (P2002 mapped), never 500', async () => {
    const l2 = await auth(request(server()).post(`${BASE}/levels`))
      .send({ rackId, code: '88' })
      .expect(201);
    const b1 = await auth(request(server()).post(`${BASE}/bins`))
      .send({ levelId: l2.body.id, code: '01' })
      .expect(201);
    await auth(request(server()).delete(`${BASE}/bins/${b1.body.id}`)).expect(200);
    // The @@unique([levelId, code]) index ignores deletedAt — the row still occupies the code.
    await auth(request(server()).post(`${BASE}/bins`))
      .send({ levelId: l2.body.id, code: '01' })
      .expect(409);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  it('a hierarchy created under tenant A is invisible and immutable for tenant B', async () => {
    await authB(request(server()).patch(`${BASE}/zones/${zoneId}`))
      .send({ name: 'Hijacked' })
      .expect(404);
    await authB(request(server()).delete(`${BASE}/zones/${zoneId}`)).expect(404);
    await authB(request(server()).patch(`${BASE}/bins/${binId}`))
      .send({ name: 'Hijacked' })
      .expect(404);
    await authB(request(server()).delete(`${BASE}/bins/${binId}`)).expect(404);

    // listing A's parents from B's token yields nothing
    const zonesB = await authB(
      request(server()).get(`${BASE}/zones/by-warehouse/${whId}`),
    ).expect(200);
    expect(rows(zonesB.body, 'zones')).toHaveLength(0);
    const binsB = await authB(
      request(server()).get(`${BASE}/bins/by-level/${levelId}`),
    ).expect(200);
    expect(rows(binsB.body, 'bins')).toHaveLength(0);

    // tenant B cannot create children under A's parents
    await authB(request(server()).post(`${BASE}/zones`))
      .send({ warehouseId: whId, code: 'EVIL', name: 'Evil' })
      .expect(404);
    await authB(request(server()).post(`${BASE}/bins`))
      .send({ levelId, code: '66' })
      .expect(404);

    // A still sees its data intact
    const zonesA = await auth(
      request(server()).get(`${BASE}/zones/by-warehouse/${whId}`),
    ).expect(200);
    expect(rows(zonesA.body, 'zones').map((z) => z.id)).toContain(zoneId);
  });
});
