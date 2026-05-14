import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/index.js';
import { packets, releaseRuns } from '../src/db/schema.js';

vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

describe('dashboard phase 3 extensions', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let switchId: number;

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
    const csrfToken = JSON.parse(csrfRes.payload).csrfToken;

    const swRes = await app.inject({
      method: 'POST', url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'SW', mode: 'trip', triggerAt: new Date(Date.now() + 86400000).toISOString() },
    });
    switchId = JSON.parse(swRes.payload).id;
  });

  afterAll(() => app.close());

  it('dashboard includes latestPacket: null when no packet', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/dashboard',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('latestPacket');
    expect(body.latestPacket).toBeNull();
  });

  it('dashboard includes latestPacket when packet exists', async () => {
    await app.db.insert(packets).values({
      switchId, version: 1, keyId: 'k1', contentHash: 'h1', encryptedObjectHash: 'h2',
    });

    const res = await app.inject({
      method: 'GET', url: '/api/dashboard',
      headers: { cookie: cookies },
    });
    const body = JSON.parse(res.payload);
    expect(body.latestPacket).not.toBeNull();
    expect(body.latestPacket.version).toBe(1);
  });

  it('dashboard includes activeReleaseRun when run exists', async () => {
    await app.db.insert(releaseRuns).values({
      triggeringSwitchId: switchId, status: 'active',
    });

    const res = await app.inject({
      method: 'GET', url: '/api/dashboard',
      headers: { cookie: cookies },
    });
    const body = JSON.parse(res.payload);
    expect(body.activeReleaseRun).not.toBeNull();
    expect(body.activeReleaseRun.status).toBe('active');
  });

  it('dashboard includes recentAuditEvents array', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/dashboard',
      headers: { cookie: cookies },
    });
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.recentAuditEvents)).toBe(true);
  });
});
