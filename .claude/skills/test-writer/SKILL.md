---
name: test-writer
description: Read a completed (or draft) SDD spec and write Jest unit tests for the service layer and e2e tests for the controller layer, covering every acceptance criterion, the happy path, error paths (401/403/404/409/400), tenant isolation, and the spec's verification-checklist commands. Uses @nestjs/testing + supertest. Use when the user wants tests generated for a spec/module, or as the test-scaffolding step of /new-spec. Bootstraps the Jest harness if it is not yet set up.
---

# Test Writer

Generate the test suite for a module from its SDD spec. Output:
- `backend/src/modules/<module>/<module>.service.spec.ts` — Jest unit tests (service layer,
  PrismaService mocked).
- `backend/test/<module>.e2e-spec.ts` — e2e tests (full app + supertest, real DB).

Every test must trace to something in the spec: an acceptance criterion, an API contract,
or a verification-checklist line. Read the spec first and keep its criteria list open as the
coverage checklist.

## Step 0 — ensure the Jest harness exists (bootstrap if missing)

This repo currently has the `test` / `test:e2e` scripts but NOT the config or dependencies.
Before writing tests, detect and create what's missing:

1. **Dev deps** — if absent, install:
   `cd backend && pnpm add -D jest ts-jest @types/jest supertest @types/supertest`
   (`@nestjs/testing` is already present.)
2. **Unit config** — if `package.json` has no `jest` block, add:
   ```json
   "jest": {
     "moduleFileExtensions": ["js", "json", "ts"],
     "rootDir": "src",
     "testRegex": ".*\\.spec\\.ts$",
     "transform": { "^.+\\.(t|j)s$": "ts-jest" },
     "testEnvironment": "node"
   }
   ```
3. **E2e config** — if `backend/test/jest-e2e.json` is missing, create it:
   ```json
   {
     "moduleFileExtensions": ["js", "json", "ts"],
     "rootDir": ".",
     "testEnvironment": "node",
     "testRegex": ".e2e-spec.ts$",
     "transform": { "^.+\\.(t|j)s$": "ts-jest" }
   }
   ```
4. Tell the user the harness was bootstrapped (deps + configs added) so they know
   `package.json`/lockfile changed.

## Step 1 — read inputs
- The target spec (in `specs/completed/` or `specs/active/`): extract every acceptance
  criterion, the API contracts (paths, request/response shapes, error codes), and the
  verification checklist.
- `CLAUDE.md`: the invariants tests must enforce (tenant scoping, guards, permissions,
  validation, response envelopes, error exceptions).
- The module's `*.controller.ts`, `*.service.ts`, `dto/*.ts`, `*.module.ts`: the actual
  signatures, injected dependencies (e.g. `PrismaService`, `CacheService`, `JwtService`),
  Prisma models, and thrown exceptions.

## Step 2 — service unit tests (`<module>.service.spec.ts`)

Pattern: `Test.createTestingModule` providing the real service and a **mocked**
`PrismaService` (and mocks for any other injected provider). Assert behavior, not the DB.

```ts
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { <Module>Service } from './<module>.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';

describe('<Module>Service', () => {
  let service: <Module>Service;
  let prisma: { <model>: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = { <model>: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(),
                          update: jest.fn(), count: jest.fn() } };
    const mod = await Test.createTestingModule({
      providers: [<Module>Service, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(<Module>Service);
  });

  it('findAll scopes every query to tenantId + deletedAt: null', async () => {
    prisma.<model>.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.<model>.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }) }),
    );
  });

  it('findOne throws NotFoundException when the record is in another tenant', async () => {
    prisma.<model>.findFirst.mockResolvedValue(null); // wrong-tenant query returns nothing
    await expect(service.findOne(TENANT_B, 'id-owned-by-A')).rejects.toThrow(NotFoundException);
  });

  // ...one test per service method: happy path + each error path it can throw.
});
```

Cover, for the service:
- **Tenant scoping** — assert `where` includes `tenantId` AND `deletedAt: null` on every
  read; `tenantId` on every write. This is the most important class of test.
- **Happy path** — each method returns the expected shape on valid input.
- **Error paths** — each `throw` in the service is exercised: not-found →
  `NotFoundException`, duplicate → `ConflictException`, invalid state → `BadRequestException`.
- **Tenant isolation** — a method called with a tenantId that does not own the record gets
  `null` from the mocked query and therefore throws / returns empty (never another tenant's
  data).
- **Document numbering / side effects** — if the service generates codes or clears caches,
  assert it.

## Step 3 — controller e2e tests (`backend/test/<module>.e2e-spec.ts`)

Pattern: boot the whole `AppModule`, replicate `main.ts` global setup (prefix `api`,
`ValidationPipe`), authenticate via the seeded admin to get a real JWT, drive endpoints with
supertest. Requires a seeded DB (`pnpm seed`) and a running Postgres/Redis — note this in the
file header.

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('<Module> (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@demo.com', password: 'Admin123!' });
    token = res.body.access_token;
  });

  afterAll(async () => { await app.close(); });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('GET /api/<route> → 401 without a token', () =>
    request(app.getHttpServer()).get('/api/<route>').expect(401));

  it('GET /api/<route> → 200 with token, returns { <resource>, count }', () =>
    auth(request(app.getHttpServer()).get('/api/<route>')).expect(200)
      .expect((r) => { expect(r.body).toHaveProperty('count'); }));

  it('POST /api/<route> → 400 on invalid body (validation)', () =>
    auth(request(app.getHttpServer()).post('/api/<route>')).send({}).expect(400));

  it('GET /api/<route>/:id → 404 for an id in another tenant', () =>
    auth(request(app.getHttpServer()).get('/api/<route>/00000000-0000-0000-0000-000000000000')).expect(404));
});
```

Cover, for the controller:
- **401** — every guarded route without a token.
- **403** — a token lacking the route's `@RequirePermissions` permission (if a limited-role
  user can be seeded/created; otherwise document the prerequisite and assert the 403 path
  for a permission the admin lacks, or skip with a clear TODO referencing the missing fixture).
- **404** — fetching/updating a non-existent or other-tenant id.
- **409** — creating a duplicate (unique constraint / existing code).
- **400** — invalid DTO (missing required field, wrong type, too short) for each create/update.
- **200/201 happy path** — each endpoint with a valid request; assert the documented
  response envelope and that no secret fields leak.
- **Tenant isolation** — the strongest e2e: a record created under tenant A must be
  invisible (404 / absent from list) to a token scoped to tenant B. If only DEMO is seeded,
  add a second tenant+user via the seed or the tenants/users API in `beforeAll`, and document
  that requirement at the top of the file.
- **Verification checklist** — translate each `curl` line in the spec's
  `## Verification checklist` into a supertest assertion with the same expected result.

## Step 4 — map coverage back to the spec
After writing, list each acceptance criterion and the test(s) that cover it. Any criterion
with no test is a gap — either add the test or explicitly note why it is not machine-testable
(and how to verify it manually). Print this mapping.

## Rules

- Tests must be runnable: correct imports, real method signatures, real route paths,
  real permission codes, real DTO field names — all read from the code, never invented.
- Do NOT weaken assertions to make tests pass against broken code. If the spec says
  `deletedAt: null` and the code omits it, the test asserting it SHOULD fail — that failure
  is the signal to fix the code. Report such expected failures rather than hiding them.
- Unit tests never hit a real DB; e2e tests always do (note the seed/DB/Redis prerequisites
  in the file header).
- Match the repo's style (2-space indent, no emojis). English only.
- After writing, run `pnpm test <module>.service` and `pnpm test:e2e` if the user wants
  them executed; otherwise leave them as scaffolding and say so.
