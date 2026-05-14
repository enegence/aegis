/**
 * Tests for health endpoints (Phase 5 Task 5).
 *
 * Verifies:
 *  - GET /health returns minimal fields only (status, version)
 *  - GET /api/health/details requires auth (401 without session)
 *  - GET /api/health/details returns worker/storage/notification state
 *  - GET /api/health/details does not include user PII or secrets
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { buildApp } from '../src/index.js';
import { createTestDb } from '../src/db/index.js';

describe('health endpoints', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with minimal fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    // Must NOT expose database state, worker status, etc. in public health
    expect(body.database).toBeUndefined();
    expect(body.worker).toBeUndefined();
    expect(body.storage).toBeUndefined();
  });

  it('GET /api/health/details returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health/details' });
    // Setup required since no owner exists — 428 is also acceptable
    expect([401, 428]).toContain(res.statusCode);
  });

  it('GET /api/health/details returns health state after auth', async () => {
    // Register owner via setup endpoint
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { displayName: 'Owner', email: 'owner@example.com', password: 'testpassword123', timezone: 'UTC' },
    });
    expect([200, 201]).toContain(setupRes.statusCode);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: 'testpassword123' },
    });
    expect(loginRes.statusCode).toBe(200);
    const cookies = String(loginRes.headers['set-cookie']);

    const res = await app.inject({
      method: 'GET',
      url: '/api/health/details',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    // Database status
    expect(body.database).toBeDefined();
    expect(body.database.status).toBe('ok');

    // Worker status
    expect(body.worker).toBeDefined();
    expect(['ok', 'degraded', 'unknown']).toContain(body.worker.status);

    // Storage status
    expect(body.storage).toBeDefined();
    expect(['ok', 'error', 'unconfigured']).toContain(body.storage.status);

    // Notification counts
    expect(body.notifications).toBeDefined();
    expect(typeof body.notifications.failedCount).toBe('number');

    // Operational counts
    expect(typeof body.activeReleaseRuns).toBe('number');
    expect(typeof body.pendingClaims).toBe('number');

    // Alerts array
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  it('GET /api/health/details does not include PII or secrets', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: 'testpassword123' },
    });
    const cookies = String(loginRes.headers['set-cookie']);

    const res = await app.inject({
      method: 'GET',
      url: '/api/health/details',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const rawPayload = res.payload;

    // No sensitive fields in response
    expect(rawPayload).not.toContain('password');
    expect(rawPayload).not.toContain('secretKey');
    expect(rawPayload).not.toContain('apiKey');
    expect(rawPayload).not.toContain('email');
    expect(rawPayload).not.toContain('encrypted');
  });
});
