// ============================================================================
// E2E tests for spec-034 session security — refresh cookie, sliding token,
// refresh/logout endpoints. PREREQUISITES: Postgres + Redis up, `pnpm seed`.
// Uses admin@demo.com (single-tenant → cookie issued at login).
// Run: pnpm test:e2e auth-session
// ============================================================================
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth Session (e2e) — spec-034', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  // Extract the refresh_token cookie string from a Set-Cookie header array.
  const refreshCookie = (setCookie: string[] | undefined): string | undefined =>
    (setCookie ?? []).find((c) => c.startsWith('refresh_token='));

  const loginDemo = async () => {
    const r = await request(server())
      .post('/api/auth/login')
      .send({ email: 'admin@demo.com', password: 'Admin123!' })
      .expect(201);
    return r;
  };

  it('login sets an httpOnly, SameSite=Strict refresh_token cookie (not in body)', async () => {
    const r = await loginDemo();
    expect(r.body.access_token).toBeTruthy();
    expect(r.body.refresh_token).toBeUndefined(); // never in the JSON body
    const cookie = refreshCookie(r.headers['set-cookie'] as unknown as string[]);
    expect(cookie).toBeTruthy();
    expect(cookie!.toLowerCase()).toContain('httponly');
    expect(cookie!.toLowerCase()).toContain('samesite=strict');
  });

  it('an authenticated 2xx response carries a fresh X-Access-Token (sliding)', async () => {
    const login = await loginDemo();
    const token = login.body.access_token;
    const r = await request(server())
      .get('/api/financial-reports/trial-balance')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(r.headers['x-access-token']).toBeTruthy();
    expect(r.headers['x-access-token']).not.toBe(''); // a real signed token
  });

  it('POST /api/auth/refresh with the cookie → 200 + a new access token', async () => {
    const login = await loginDemo();
    const cookie = refreshCookie(login.headers['set-cookie'] as unknown as string[])!;
    const r = await request(server())
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    expect(r.body.access_token).toBeTruthy();
    // rotation: a new refresh cookie is set
    expect(refreshCookie(r.headers['set-cookie'] as unknown as string[])).toBeTruthy();
  });

  it('POST /api/auth/refresh with no cookie → 401', () =>
    request(server()).post('/api/auth/refresh').expect(401));

  it('POST /api/auth/refresh with a garbage cookie → 401', () =>
    request(server())
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=not-a-real-token')
      .expect(401));

  it('logout revokes the refresh token → subsequent refresh with it → 401', async () => {
    const login = await loginDemo();
    const cookie = refreshCookie(login.headers['set-cookie'] as unknown as string[])!;

    await request(server()).post('/api/auth/logout').set('Cookie', cookie).expect(200);

    await request(server()).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('logout is idempotent (200 even with no cookie)', () =>
    request(server()).post('/api/auth/logout').expect(200));

  it('refresh rotation revokes the old token (reuse of a rotated cookie → 401)', async () => {
    const login = await loginDemo();
    const cookie1 = refreshCookie(login.headers['set-cookie'] as unknown as string[])!;

    const r2 = await request(server()).post('/api/auth/refresh').set('Cookie', cookie1).expect(200);
    const cookie2 = refreshCookie(r2.headers['set-cookie'] as unknown as string[])!;

    // cookie2 works…
    await request(server()).post('/api/auth/refresh').set('Cookie', cookie2).expect(200);
    // …but the rotated-away cookie1 is now revoked
    await request(server()).post('/api/auth/refresh').set('Cookie', cookie1).expect(401);
  });
});
