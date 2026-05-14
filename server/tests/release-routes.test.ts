import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/index.js';
import { encryptField } from '../src/services/field-encrypt.js';
import { owner, contacts, packets, releaseRuns } from '../src/db/schema.js';

vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

const FIELD_KEY = 'dev-field-key-change-me-32bytes!!';

describe('release routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;
  let switchId: number;
  let runId: number;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });

    await app.inject({
      method: 'POST', url: '/api/auth/setup',
      payload: { displayName: 'Owner', email: 'o@t.com', password: 'testpass1234', timezone: 'UTC' },
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'testpass1234' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await app.inject({ method: 'GET', url: '/api/csrf', headers: { cookie: cookies } });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;

    await app.db.insert(contacts).values({
      fullNameEncrypted: encryptField('Alice', FIELD_KEY)!,
      emailEncrypted: encryptField('alice@x.com', FIELD_KEY)!,
      priorityOrder: 1, preferredChannels: '["email"]', confirmationWindowHours: 48,
    });

    const swRes = await app.inject({
      method: 'POST', url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'SW', mode: 'trip', triggerAt: new Date(Date.now() + 86400000).toISOString() },
    });
    switchId = JSON.parse(swRes.payload).id;

    const [run] = await app.db.insert(releaseRuns).values({
      triggeringSwitchId: switchId, status: 'cascade_active',
    }).returning();
    runId = run.id;

    await app.db.insert(packets).values({
      switchId, releaseRunId: runId, version: 1,
      keyId: 'k1', contentHash: 'h1', encryptedObjectHash: 'h2',
    });
  });

  afterAll(() => app.close());

  it('GET /api/release/status requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/release/status' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/release/status returns active run summary', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/release/status',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.activeRun).not.toBeNull();
    expect(body.activeRun.id).toBe(runId);
    expect(body.activeRun.status).toBe('cascade_active');
  });

  it('GET /api/release/runs returns all runs', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/release/runs',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.runs.length).toBeGreaterThan(0);
  });

  it('GET /api/release/runs/:id returns run detail', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/release/runs/${runId}`,
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.run.id).toBe(runId);
    expect(Array.isArray(body.claims)).toBe(true);
  });

  it('POST /api/release/runs/:id/cancel marks run cancelled', async () => {
    // Create a fresh run to cancel
    const [freshRun] = await app.db.insert(releaseRuns).values({
      triggeringSwitchId: switchId, status: 'active',
    }).returning();

    const res = await app.inject({
      method: 'POST', url: `/api/release/runs/${freshRun.id}/cancel`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(200);

    const checkRes = await app.inject({
      method: 'GET', url: `/api/release/runs/${freshRun.id}`,
      headers: { cookie: cookies },
    });
    const body = JSON.parse(checkRes.payload);
    expect(body.run.status).toBe('cancelled');
  });

  it('POST /api/release/simulate returns valid/invalid assessment', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/release/simulate',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(typeof body.valid).toBe('boolean');
    expect(Array.isArray(body.issues)).toBe(true);
  });
});
