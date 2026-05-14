/**
 * Tests for the consolidated settings API (Task 4):
 * GET /api/settings, PUT /api/settings/owner, PUT /api/settings/deployment,
 * PUT /api/settings/storage/s3, PUT /api/settings/relay, PUT /api/settings/packets
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/index.js';

vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

describe('consolidated settings API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });

    await app.inject({
      method: 'POST', url: '/api/setup',
      payload: { displayName: 'Settings User', email: 'settings@test.com', password: 'testpass1234', timezone: 'UTC' },
      headers: { 'content-type': 'application/json' },
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'testpass1234' },
      headers: { 'content-type': 'application/json' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await app.inject({ method: 'GET', url: '/api/csrf', headers: { cookie: cookies } });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;
  });

  afterAll(() => app.close());

  it('GET /api/settings returns consolidated view without secrets', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: cookies } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.owner.email).toBe('settings@test.com');
    expect(body.owner.displayName).toBe('Settings User');
    expect(body.deployment.mode).toBe('vault');
    expect(body.notifications.smtp.configured).toBe(false);
    expect(body.notifications.telegram.configured).toBe(false);
    expect(body.storage.s3Configured).toBe(false);
    expect(body.relay.enabled).toBe(false);
    expect(body.security.totpEnabled).toBe(false);
    // Must not expose raw secrets
    expect(JSON.stringify(body)).not.toContain('password');
    expect(JSON.stringify(body)).not.toContain('secretKey');
  });

  it('GET /api/settings requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(401);
  });

  it('PUT /api/settings/owner updates profile', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/settings/owner',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { displayName: 'Updated Name', phone: '+1 555 000 0000' },
    });
    expect(res.statusCode).toBe(200);

    const check = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: cookies } });
    const body = JSON.parse(check.payload);
    expect(body.owner.displayName).toBe('Updated Name');
    expect(body.owner.phone).toBe('+1 555 000 0000');
  });

  it('PUT /api/settings/owner rejects invalid email', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/settings/owner',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/settings/owner requires CSRF', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/settings/owner',
      headers: { cookie: cookies, 'content-type': 'application/json' },
      payload: { displayName: 'No CSRF' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PUT /api/settings/deployment changes mode', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/settings/deployment',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { mode: 'dead_drop' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).mode).toBe('dead_drop');

    const check = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: cookies } });
    expect(JSON.parse(check.payload).deployment.mode).toBe('dead_drop');
  });

  it('PUT /api/settings/deployment rejects invalid mode', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/settings/deployment',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { mode: 'magic_cloud' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /api/settings/storage/s3 saves encrypted credentials', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/settings/storage/s3',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {
        region: 'us-east-1',
        bucket: 'my-aegis-bucket',
        accessKeyId: 'AKIATEST1234',
        secretAccessKey: 'super-secret-s3-key',
        prefix: 'aegis',
      },
    });
    expect(res.statusCode).toBe(200);

    const check = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: cookies } });
    const body = JSON.parse(check.payload);
    expect(body.storage.s3Configured).toBe(true);
    expect(body.storage.bucket).toBe('my-aegis-bucket');
    // Secret must not appear in response
    expect(JSON.stringify(body)).not.toContain('super-secret-s3-key');
  });

  it('PUT /api/settings/relay saves relay URL and encrypted API key', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/settings/relay',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { relayUrl: 'https://relay.example.com', apiKey: 'relay-secret-key-abc' },
    });
    expect(res.statusCode).toBe(200);

    const check = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: cookies } });
    const body = JSON.parse(check.payload);
    expect(body.relay.enabled).toBe(true);
    expect(body.relay.relayUrl).toBe('https://relay.example.com');
    expect(body.relay.apiKeyConfigured).toBe(true);
    // API key must not appear in response
    expect(JSON.stringify(body)).not.toContain('relay-secret-key-abc');
  });

  it('PUT /api/settings/packets sets retention days', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/settings/packets',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { retentionDays: 90 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).retentionDays).toBe(90);

    const check = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: cookies } });
    expect(JSON.parse(check.payload).packets.retentionDays).toBe(90);
  });
});
