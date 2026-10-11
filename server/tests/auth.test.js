import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { initTestDb, teardownTestDb, makeApp, createUser } from './setup.js';

let app;
let user;

beforeAll(async () => {
  await initTestDb();
  app = makeApp();
  user = await createUser({ name: 'Auth Tester', email: 'auth@test.dev' });
});

afterAll(teardownTestDb);

describe('Auth', () => {
  it('registers a new account and returns tokens without leaking secrets', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'New Person', email: 'new@test.dev', password: 'Password123!' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe('new@test.dev');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.refreshTokenHash).toBeUndefined();
    // Refresh token rides an HTTP-only cookie scoped to /api/v1/auth.
    const setCookie = res.headers['set-cookie'] ?? [];
    const refresh = setCookie.find((c) => c.startsWith('bookit_refresh='));
    expect(refresh).toBeTruthy();
    expect(refresh).toContain('HttpOnly');
    expect(refresh).toContain('Path=/api/v1/auth');
  });

  it('rejects duplicate email registration', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Dup', email: 'new@test.dev', password: 'Password123!' });
    expect(res.status).toBe(409);
  });

  it('rejects weak passwords', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Weak', email: 'weak@test.dev', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'auth@test.dev', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.headers['set-cookie']?.some((c) => c.startsWith('bookit_refresh='))).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'auth@test.dev', password: 'WrongPass1!' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('requires a token on protected routes', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user with a valid token', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'auth@test.dev', password: 'Password123!' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('auth@test.dev');
  });

  it('rotates refresh tokens — a used refresh token cannot be replayed', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'auth@test.dev', password: 'Password123!' });
    const cookie = login.headers['set-cookie'].find((c) => c.startsWith('bookit_refresh='));

    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body.data.accessToken).toBeTruthy();

    // Replaying the OLD cookie must fail: rotation already invalidated it.
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('logs out and invalidates the refresh token', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'auth@test.dev', password: 'Password123!' });
    const token = login.body.data.accessToken;
    const cookie = login.headers['set-cookie'].find((c) => c.startsWith('bookit_refresh='));

    const out = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(out.status).toBe(200);

    const after = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('rejects a garbage access token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('blocks disabled accounts from logging in', async () => {
    const { User } = await import('../src/models/User.js');
    const disabled = await createUser({ email: 'disabled@test.dev' });
    await User.updateOne({ _id: disabled._id }, { isActive: false });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'disabled@test.dev', password: 'Password123!' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });
});
