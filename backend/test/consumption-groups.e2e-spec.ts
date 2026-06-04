// ============================================================================
// E2E tests for the ConsumptionGroups controller — spec-008-consumption-groups
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run, UOM catalog seeded
// (`npx ts-node prisma/seed-uom.ts` — cfg_uom_units must not be empty).
// Cross-tenant isolation needs BOTH seeded tenants: admin@demo.com (DEMO) and
// tenant2admin@demo.com (TENANT2).
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until implemented.
// Run: pnpm test:e2e consumption-groups
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ConsumptionGroups (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO
  let tokenB: string; // tenant B — TENANT2
  let uomId: string; // any active unit from the global UOM catalog

  // Handles both login shapes from spec-001: single tenant (token is already
  // tenant-scoped) and multi-tenant (requiresTenantSelection -> select the default tenant).
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

    // Any active unit works as a consumption UOM (global catalog).
    const units = await request(app.getHttpServer())
      .get('/api/uom/units')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const rows = Array.isArray(units.body) ? units.body : (units.body.units ?? []);
    if (!rows.length) throw new Error('UOM catalog empty — run: npx ts-node prisma/seed-uom.ts');
    uomId = rows[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const authB = (req: request.Test) => req.set('Authorization', `Bearer ${tokenB}`);
  const server = () => app.getHttpServer();
  const validGroup = () => ({
    name: 'E2E Group ' + Math.floor(performance.now()),
    consumptionUomId: uomId,
  });

  // ── Auth gates ──────────────────────────────────────────────────────────
  it('GET /api/consumption-groups → 401 without a token', () =>
    request(server()).get('/api/consumption-groups').expect(401));

  it('GET /api/consumption-groups → 401 with a junk token', () =>
    request(server())
      .get('/api/consumption-groups')
      .set('Authorization', 'Bearer junk')
      .expect(401));

  // NOTE: 403 (missing INVENTORY:* permission) is not covered — the seed has no
  // limited-role user. TODO: add a viewer-only fixture, then assert POST → 403.

  // ── Happy paths ───────────────────────────────────────────────────────────
  it('GET /api/consumption-groups → 200 with token', () =>
    auth(request(server()).get('/api/consumption-groups')).expect(200));

  it('[GAP] GET /api/consumption-groups → returns { consumptionGroups, count } envelope', () =>
    auth(request(server()).get('/api/consumption-groups'))
      .expect(200)
      .expect((r) => {
        expect(r.body).toHaveProperty('consumptionGroups');
        expect(r.body).toHaveProperty('count');
      }));

  it('POST /api/consumption-groups → 201 with auto-generated CG code and defaults', async () => {
    const res = await auth(request(server()).post('/api/consumption-groups'))
      .send(validGroup())
      .expect(201);
    expect(res.body.code).toMatch(/^CG-\d{4}-\d{4}$/);
    expect(res.body.isActive).toBe(true);
    expect(res.body._count).toEqual({ items: 0 });
    expect(res.body.consumptionUom.id).toBe(uomId);
  });

  it('POST twice → strictly increasing sequence (codes never collide)', async () => {
    const a = await auth(request(server()).post('/api/consumption-groups'))
      .send(validGroup())
      .expect(201);
    const b = await auth(request(server()).post('/api/consumption-groups'))
      .send(validGroup())
      .expect(201);
    expect(b.body.code).not.toBe(a.body.code);
    expect(b.body.code > a.body.code).toBe(true);
  });

  it('GET /api/consumption-groups/:id → 200 with items array and totalConsumptionQty', async () => {
    const created = await auth(request(server()).post('/api/consumption-groups'))
      .send(validGroup())
      .expect(201);
    const res = await auth(
      request(server()).get(`/api/consumption-groups/${created.body.id}`),
    ).expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('totalConsumptionQty');
  });

  it('PATCH /api/consumption-groups/:id → 200 updates name', async () => {
    const created = await auth(request(server()).post('/api/consumption-groups'))
      .send(validGroup())
      .expect(201);
    const res = await auth(
      request(server()).patch(`/api/consumption-groups/${created.body.id}`),
    )
      .send({ name: 'E2E Renamed' })
      .expect(200);
    expect(res.body.name).toBe('E2E Renamed');
  });

  // ── Validation / error paths ──────────────────────────────────────────────
  it('POST /api/consumption-groups → 400 when required fields are missing', () =>
    auth(request(server()).post('/api/consumption-groups')).send({}).expect(400));

  it('POST /api/consumption-groups → 400 on a client-supplied code (forbidNonWhitelisted)', () =>
    auth(request(server()).post('/api/consumption-groups'))
      .send({ ...validGroup(), code: 'HACK-0001' })
      .expect(400));

  it('POST /api/consumption-groups → 400 on a non-UUID consumptionUomId', () =>
    auth(request(server()).post('/api/consumption-groups'))
      .send({ name: 'Bad', consumptionUomId: 'not-a-uuid' })
      .expect(400));

  it('[GAP] POST /api/consumption-groups → 404 (not 500) on an unknown consumptionUomId', () =>
    auth(request(server()).post('/api/consumption-groups'))
      .send({ name: 'Ghost UOM', consumptionUomId: '00000000-0000-0000-0000-000000000000' })
      .expect(404));

  it('GET /api/consumption-groups/:id → 404 for an unknown id', () =>
    auth(
      request(server()).get('/api/consumption-groups/00000000-0000-0000-0000-000000000000'),
    ).expect(404));

  it('DELETE /api/consumption-groups/:id → 404 for an unknown id', () =>
    auth(
      request(server()).delete('/api/consumption-groups/00000000-0000-0000-0000-000000000000'),
    ).expect(404));

  // ── Delete guard + soft delete ────────────────────────────────────────────
  it('[GAP] DELETE → 400 while an active item is assigned, then 200 once unassigned, then GET → 404', async () => {
    const group = await auth(request(server()).post('/api/consumption-groups'))
      .send(validGroup())
      .expect(201);

    // Assign an item to the group (CreateItemDto.consumptionGroupId is optional).
    const item = await auth(request(server()).post('/api/items'))
      .send({
        name: 'E2E CG Item ' + Math.floor(performance.now()),
        itemType: 'raw_material',
        baseUom: 'PCS',
        consumptionGroupId: group.body.id,
      })
      .expect(201);

    // Blocked while the item is assigned (spec §Business rules).
    const blocked = await auth(
      request(server()).delete(`/api/consumption-groups/${group.body.id}`),
    ).expect(400);
    expect(blocked.body.message).toContain('Cannot delete');

    // Remove the item, then the group soft-deletes.
    await auth(request(server()).delete(`/api/items/${item.body.id}`)).expect(200);
    const deleted = await auth(
      request(server()).delete(`/api/consumption-groups/${group.body.id}`),
    ).expect(200);
    expect(deleted.body).toEqual(
      expect.objectContaining({ message: expect.any(String), id: group.body.id }),
    );

    // Soft-deleted rows are invisible.
    await auth(request(server()).get(`/api/consumption-groups/${group.body.id}`)).expect(404);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────
  // A: DEMO (token), B: TENANT2 (tokenB). A group created under A must be
  // invisible and immutable for B — 404 on detail/patch/delete, absent from B's list.
  it('a group created under tenant A is 404/absent/immutable for tenant B', async () => {
    const created = await auth(request(server()).post('/api/consumption-groups'))
      .send({ name: 'Tenant-A Only', consumptionUomId: uomId })
      .expect(201);
    const id = created.body.id;

    await authB(request(server()).get(`/api/consumption-groups/${id}`)).expect(404);
    await authB(request(server()).patch(`/api/consumption-groups/${id}`))
      .send({ name: 'Hijacked' })
      .expect(404);
    await authB(request(server()).delete(`/api/consumption-groups/${id}`)).expect(404);

    // B's list does not contain A's group.
    // (Tolerates both the current bare array and the target envelope so this
    // isolation test never false-fails on the envelope [GAP].)
    const listB = await authB(request(server()).get('/api/consumption-groups')).expect(200);
    const rows = Array.isArray(listB.body) ? listB.body : (listB.body.consumptionGroups ?? []);
    expect(rows.map((g: { id: string }) => g.id)).not.toContain(id);

    // And A still sees it unchanged after B's attempts.
    const stillA = await auth(
      request(server()).get(`/api/consumption-groups/${id}`),
    ).expect(200);
    expect(stillA.body.name).toBe('Tenant-A Only');
  });
});
