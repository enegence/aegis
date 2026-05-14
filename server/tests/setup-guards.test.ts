import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';

describe('setup guards', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('fresh DB — GET /api/setup/status returns setupComplete=false', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/setup/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.setupComplete).toBe(false);
    expect(body.ownerExists).toBe(false);
    expect(body.appVersion).toBeTruthy();
  });

  it('fresh DB — protected route returns 428 before setup', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(428);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('setup_required');
  });

  it('setup creates owner, sets session cookie, and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: {
        displayName: 'Test Owner',
        email: 'owner@test.com',
        password: 'hunter2hunter2',
        timezone: 'UTC',
              },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.owner.email).toBe('owner@test.com');
    expect(res.headers['set-cookie']).toBeTruthy();
  });

  it('second setup attempt is rejected 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: {
        displayName: 'Second',
        email: 'second@test.com',
        password: 'hunter2hunter2',
        timezone: 'UTC',
              },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('GET /api/setup/status returns setupComplete=true after setup', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/setup/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.setupComplete).toBe(true);
    expect(body.ownerExists).toBe(true);
  });

  it('protected route requires auth after setup (401 without session)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    // 428 gone now — 401 expected
    expect(res.statusCode).toBe(401);
  });

  it('login succeeds after setup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'hunter2hunter2' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).success).toBe(true);
  });

  it('setup short password rejected (< 12 chars)', async () => {
    // Need a fresh app to test validation
    const fresh = await buildApp({ testing: true, dbPath: ':memory:' });
    try {
      const res = await fresh.inject({
        method: 'POST',
        url: '/api/setup',
        payload: {
          displayName: 'Test',
          email: 'test@test.com',
          password: 'short',
          timezone: 'UTC',
                  },
        headers: { 'content-type': 'application/json' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await fresh.close();
    }
  });

  it('setup with invalid email rejected', async () => {
    const fresh = await buildApp({ testing: true, dbPath: ':memory:' });
    try {
      const res = await fresh.inject({
        method: 'POST',
        url: '/api/setup',
        payload: {
          displayName: 'Test',
          email: 'not-an-email',
          password: 'hunter2hunter2',
          timezone: 'UTC',
        },
        headers: { 'content-type': 'application/json' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await fresh.close();
    }
  });
});
