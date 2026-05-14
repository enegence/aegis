import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';

describe('Auth routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/setup', () => {
    it('creates initial owner account', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          displayName: 'Test Owner',
          email: 'test@example.com',
          password: 'secure-passphrase-123',
          timezone: 'America/Chicago',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.owner.displayName).toBe('Test Owner');
      expect(body.owner.email).toBe('test@example.com');
    });

    it('rejects second setup attempt', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          displayName: 'Another Owner',
          email: 'other@example.com',
          password: 'another-password',
          timezone: 'UTC',
        },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns session cookie on valid login', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          password: 'secure-passphrase-123',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();
      const cookies = res.headers['set-cookie'];
      expect(String(cookies)).toContain('aegis_session');
    });

    it('rejects invalid password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          password: 'wrong-password',
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns owner info when authenticated', async () => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'secure-passphrase-123' },
      });
      const cookies = loginRes.headers['set-cookie'];

      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: String(cookies) },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.displayName).toBe('Test Owner');
    });

    it('returns 401 without session', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/csrf', () => {
    it('returns a CSRF token when authenticated', async () => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'secure-passphrase-123' },
      });
      const cookies = loginRes.headers['set-cookie'];

      const res = await app.inject({
        method: 'GET',
        url: '/api/csrf',
        headers: { cookie: String(cookies) },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(typeof body.csrfToken).toBe('string');
      expect(body.csrfToken.length).toBe(64); // 32 bytes as hex = 64 chars
    });

    it('returns 401 without session', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/csrf',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns consistent token for the same session', async () => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'secure-passphrase-123' },
      });
      const cookies = loginRes.headers['set-cookie'];

      const res1 = await app.inject({ method: 'GET', url: '/api/csrf', headers: { cookie: String(cookies) } });
      const res2 = await app.inject({ method: 'GET', url: '/api/csrf', headers: { cookie: String(cookies) } });
      expect(JSON.parse(res1.payload).csrfToken).toBe(JSON.parse(res2.payload).csrfToken);
    });
  });
});
