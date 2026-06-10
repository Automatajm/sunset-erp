// ============================================================================
// E2E tests for the BulkImport controller — spec-035-bulk-import
// PREREQUISITES: Postgres + Redis up, `pnpm seed` run, UOM catalog seeded.
// Cross-tenant isolation needs BOTH seeded tenants: admin@demo.com (DEMO, holds
// ALL permissions) and tenant2admin@demo.com (TENANT2).
// Codes use a deterministic E2EBULK prefix (no Date.now) so reruns are stable;
// every really-created Item is removed in afterAll (DELETE + a PrismaClient
// deleteMany safety net) so the suite leaves no residue.
// Run: pnpm test:e2e -- --runInBand bulk-import
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

describe('BulkImport (e2e)', () => {
  let app: INestApplication;
  let token: string; // tenant A — DEMO (all permissions)
  let tokenB: string; // tenant B — TENANT2
  let prisma: PrismaClient;

  // Deterministic codes — stable across reruns (no Date.now / performance.now).
  const PFX = 'E2EBULK';
  const CODE_1 = `${PFX}-1`;
  const CODE_DUP = `${PFX}-DUP`;
  const CODE_UNIQUE = `${PFX}-UNIQUE`;

  // Handles both login shapes from spec-001: single tenant (token is already
  // tenant-scoped) and multi-tenant (requiresTenantSelection -> select default).
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

  const validItem = (code: string) => ({
    code,
    name: `Bulk ${code}`,
    itemType: 'raw_material',
    baseUom: 'PCS',
  });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = new PrismaClient();

    token = await login('admin@demo.com');
    tokenB = await login('tenant2admin@demo.com');

    // Hard-clean any residue from a previous aborted run so creation counts
    // (inserted === 1 etc.) are deterministic.
    await hardCleanResidue();
  });

  // ── Residue cleanup ─────────────────────────────────────────────────────────
  // Primary path: API DELETE each E2EBULK item we can see under DEMO.
  // Safety net: hard-delete any E2EBULK-prefixed Item row for the DEMO tenant.
  const hardCleanResidue = async () => {
    const demo = await prisma.tenant.findUnique({ where: { code: 'DEMO' } });
    if (demo) {
      await prisma.item.deleteMany({
        where: { tenantId: demo.id, code: { startsWith: PFX } },
      });
    }
  };

  const apiDeleteResidue = async () => {
    const list = await auth(request(server()).get('/api/items'));
    const rows = (list.body.items ?? list.body) as { id: string; code: string }[];
    const mine = rows.filter((i) => i.code?.startsWith(PFX));
    for (const i of mine) {
      await auth(request(server()).delete(`/api/items/${i.id}`));
    }
  };

  afterAll(async () => {
    // Best-effort API delete first, then the hard safety net.
    try {
      await apiDeleteResidue();
    } catch {
      /* fall through to hard clean */
    }
    await hardCleanResidue();
    await prisma.$disconnect();
    await app.close();
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const authB = (req: request.Test) => req.set('Authorization', `Bearer ${tokenB}`);
  const server = () => app.getHttpServer();

  // Fetch the DEMO item codes currently visible to tenant A.
  const demoItemCodes = async (): Promise<string[]> => {
    const list = await auth(request(server()).get('/api/items')).expect(200);
    const rows = (list.body.items ?? list.body) as { code: string }[];
    return rows.map((i) => i.code);
  };

  // ── Validation / guard error paths ──────────────────────────────────────────
  it('POST /api/bulk-import/widgets → 400 on an invalid entity', () =>
    auth(request(server()).post('/api/bulk-import/widgets'))
      .send({ records: [validItem(CODE_1)] })
      .expect(400));

  it('POST /api/bulk-import/items → 400 on empty records', () =>
    auth(request(server()).post('/api/bulk-import/items')).send({ records: [] }).expect(400));

  it('POST /api/bulk-import/items → 400 on more than 2000 rows', () => {
    const records = Array.from({ length: 2001 }, () => ({ foo: 'bar' }));
    return auth(request(server()).post('/api/bulk-import/items')).send({ records }).expect(400);
  });

  // ── SSRF guard ──────────────────────────────────────────────────────────────
  it('POST /api/bulk-import/items → 400 on a loopback sourceUrl', () =>
    auth(request(server()).post('/api/bulk-import/items'))
      .send({ sourceUrl: 'http://127.0.0.1:9/x' })
      .expect(400));

  it('POST /api/bulk-import/items → 400 on a cloud-metadata link-local sourceUrl', () =>
    auth(request(server()).post('/api/bulk-import/items'))
      .send({ sourceUrl: 'http://169.254.169.254/latest/meta-data' })
      .expect(400));

  // ── dryRun writes nothing ───────────────────────────────────────────────────
  it('POST /api/bulk-import/items dryRun → 200, validates without writing', async () => {
    const res = await auth(request(server()).post('/api/bulk-import/items'))
      .send({ records: [validItem(CODE_1)], dryRun: true })
      .expect(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.inserted).toBe(0);
    expect(res.body.valid).toBeGreaterThanOrEqual(1);

    // Nothing was written — CODE_1 must be absent from the items list.
    expect(await demoItemCodes()).not.toContain(CODE_1);
  });

  // ── Real import + duplicate-skip on rerun ───────────────────────────────────
  it('POST /api/bulk-import/items → 200 inserts the row, then a re-POST skips the duplicate', async () => {
    const res = await auth(request(server()).post('/api/bulk-import/items'))
      .send({ records: [validItem(CODE_1)] })
      .expect(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.errors).toHaveLength(0);

    // It is now present.
    expect(await demoItemCodes()).toContain(CODE_1);

    // Re-POST the same single record without upsert → duplicate skipped (not 500).
    const again = await auth(request(server()).post('/api/bulk-import/items'))
      .send({ records: [validItem(CODE_1)], upsert: false })
      .expect(200);
    expect(again.body.skipped).toBe(1);
    expect(again.body.inserted).toBe(0);
  });

  // ── Duplicate within one batch (the key fix) ────────────────────────────────
  // The second CODE_DUP row sees the first as already-created (sequential, no
  // batch transaction) and is handled gracefully — never a 500. The handler
  // resolves the in-batch collision as a skip (existing-record path); a P2002
  // write race would surface as a per-row error instead. Either is acceptable;
  // what must hold is 200-not-500, the duplicate consumed exactly once, and the
  // unique row imported.
  it('POST /api/bulk-import/items → 200 (NOT 500) when a code is duplicated within one batch', async () => {
    const res = await auth(request(server()).post('/api/bulk-import/items'))
      .send({
        records: [validItem(CODE_DUP), validItem(CODE_DUP), validItem(CODE_UNIQUE)],
      })
      .expect(200);

    // The unique row still imports.
    expect(res.body.inserted).toBeGreaterThanOrEqual(1);

    // The second duplicate row did not insert a twin and did not crash — it was
    // absorbed either as a skip or as a per-row duplicate error.
    const dupSkipped = res.body.skipped >= 1;
    const dupErrored = res.body.errors.some(
      (e: { value?: string; message: string }) =>
        e.value === CODE_DUP || /duplicate/i.test(e.message),
    );
    expect(dupSkipped || dupErrored).toBe(true);

    // Both codes exist, and the duplicate exists exactly once (no twin row).
    const codes = await demoItemCodes();
    expect(codes).toContain(CODE_DUP);
    expect(codes).toContain(CODE_UNIQUE);
    expect(codes.filter((c) => c === CODE_DUP)).toHaveLength(1);
  });

  // ── Tenant isolation ────────────────────────────────────────────────────────
  // Items imported under DEMO (token) must never appear under TENANT2 (tokenB).
  it('E2EBULK items created under tenant A are absent from tenant B', async () => {
    const listB = await authB(request(server()).get('/api/items')).expect(200);
    const rows = (listB.body.items ?? listB.body) as { code: string }[];
    const leaked = rows.map((i) => i.code).filter((c) => c?.startsWith(PFX));
    expect(leaked).toEqual([]);
  });

  // ── Per-entity permission (positive) ────────────────────────────────────────
  // admin holds ADMIN:SETTINGS, so the per-entity guard permits a users import.
  // dryRun keeps it side-effect-free (no user created). The 403 negative is
  // covered by a unit test — admin has every permission here.
  it('POST /api/bulk-import/users dryRun → 200 (guard permits ADMIN:SETTINGS holder)', async () => {
    const res = await auth(request(server()).post('/api/bulk-import/users'))
      .send({
        records: [
          {
            email: `${PFX.toLowerCase()}-noop@example.com`,
            firstName: 'Bulk',
            lastName: 'Noop',
          },
        ],
        dryRun: true,
      })
      .expect(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.entity).toBe('users');
  });

  // ── Cleanup verification ────────────────────────────────────────────────────
  // Mirrors afterAll so a green run proves residue cleanup actually works.
  it('cleanup leaves no E2EBULK items behind', async () => {
    await apiDeleteResidue();
    await hardCleanResidue();
    const remaining = await demoItemCodes();
    expect(remaining.filter((c) => c.startsWith(PFX))).toEqual([]);
  });
});
