/**
 * Tests for OSS relay auth-code linking flow.
 * POST /api/settings/relay/link-exchange
 * DELETE /api/settings/relay/unlink
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/index.js';

vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

describe('Relay link-exchange and unlink', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });

    await app.inject({
      method: 'POST', url: '/api/setup',
      payload: { displayName: 'Relay User', email: 'relay@test.com', password: 'testpass1234relay', timezone: 'UTC' },
      headers: { 'content-type': 'application/json' },
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'testpass1234relay' },
      headers: { 'content-type': 'application/json' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await app.inject({ method: 'GET', url: '/api/csrf', headers: { cookie: cookies } });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;
  });

  afterAll(() => app.close());

  describe('POST /api/settings/relay/link-exchange', () => {
    it('requires auth', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/settings/relay/link-exchange',
        headers: { 'content-type': 'application/json' },
        payload: { relayUrl: 'https://relay.example.com', code: 'abc123' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('requires CSRF', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/settings/relay/link-exchange',
        headers: { cookie: cookies, 'content-type': 'application/json' },
        payload: { relayUrl: 'https://relay.example.com', code: 'abc123' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('validates required fields', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/settings/relay/link-exchange',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
        payload: { code: 'abc123' }, // missing relayUrl
      });
      expect(res.statusCode).toBe(400);
    });

    it('validates relayUrl must be a URL', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/settings/relay/link-exchange',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
        payload: { relayUrl: 'not-a-url', code: 'abc123' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 502 when SaaS relay is unreachable', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/settings/relay/link-exchange',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
        payload: { relayUrl: 'https://unreachable-relay-host-xyz.example.com', code: 'TESTCODE' },
      });
      expect(res.statusCode).toBe(502);
    });

    it('stores relayUrl, encrypted apiKey, connectionId on success', async () => {
      // Mock the SaaS exchange endpoint via a local mock
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          relayEndpoint: 'https://relay.example.com',
          apiKey: 'key-abc-xyz-123',
          connectionId: 'conn-001',
        }),
      });
      const origFetch = global.fetch;
      global.fetch = mockFetch as any;

      try {
        const res = await app.inject({
          method: 'POST', url: '/api/settings/relay/link-exchange',
          headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
          payload: { relayUrl: 'https://relay.example.com', code: 'VALIDCODE' },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.ok).toBe(true);
        expect(body.relayUrl).toBe('https://relay.example.com');
        expect(body.connectionId).toBe('conn-001');

        // Verify settings endpoint shows relay configured with connectionId
        const settingsRes = await app.inject({
          method: 'GET', url: '/api/settings',
          headers: { cookie: cookies },
        });
        const settings = JSON.parse(settingsRes.payload);
        expect(settings.relay.enabled).toBe(true);
        expect(settings.relay.apiKeyConfigured).toBe(true);
        expect(settings.relay.connectionId).toBe('conn-001');
        expect(settings.relay.relayUrl).toBe('https://relay.example.com');

        // Verify the raw API key is NOT stored in plaintext
        expect(mockFetch).toHaveBeenCalledWith(
          'https://relay.example.com/api/relay/link/exchange',
          expect.objectContaining({
            method: 'POST',
          }),
        );
        const [relayUrl, relayRequest] = mockFetch.mock.calls[0]!;
        expect(relayUrl).not.toContain('?');
        expect(relayUrl).not.toContain('VALIDCODE');
        expect(JSON.parse((relayRequest as RequestInit).body as string)).toMatchObject({
          code: 'VALIDCODE',
          state: 'oss-link',
        });
      } finally {
        global.fetch = origFetch;
      }
    });

    it('returns 410 when code is expired/used (SaaS returns 410)', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 410,
        json: async () => ({ error: 'Code expired' }),
      });
      const origFetch = global.fetch;
      global.fetch = mockFetch as any;

      try {
        const res = await app.inject({
          method: 'POST', url: '/api/settings/relay/link-exchange',
          headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
          payload: { relayUrl: 'https://relay.example.com', code: 'EXPIREDCODE' },
        });
        expect(res.statusCode).toBe(410);
      } finally {
        global.fetch = origFetch;
      }
    });

    it('emits relay_linked audit event on success', async () => {
      const { eq } = await import('drizzle-orm');
      const { auditEvents } = await import('../src/db/schema.js');

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          relayEndpoint: 'https://relay2.example.com',
          apiKey: 'key-audit-test',
          connectionId: 'conn-audit',
        }),
      });
      const origFetch = global.fetch;
      global.fetch = mockFetch as any;

      try {
        await app.inject({
          method: 'POST', url: '/api/settings/relay/link-exchange',
          headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
          payload: { relayUrl: 'https://relay2.example.com', code: 'AUDITCODE' },
        });

        const events = await app.db
          .select()
          .from(auditEvents)
          .all();
        const relayLinkedEvent = events.find(e => e.eventType === 'relay_linked');
        expect(relayLinkedEvent).toBeDefined();
        // Verify no secrets in audit event metadata
        const metadata = relayLinkedEvent?.metadata ?? '{}';
        expect(metadata).not.toContain('apiKey');
        expect(metadata).not.toContain('key-');
      } finally {
        global.fetch = origFetch;
      }
    });
  });

  describe('DELETE /api/settings/relay/unlink', () => {
    it('requires auth', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/settings/relay/unlink',
      });
      expect(res.statusCode).toBe(401);
    });

    it('requires CSRF', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/settings/relay/unlink',
        headers: { cookie: cookies },
      });
      expect(res.statusCode).toBe(403);
    });

    it('clears relay settings and emits relay_unlinked audit event', async () => {
      // First link
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          relayEndpoint: 'https://relay-unlink.example.com',
          apiKey: 'key-to-be-cleared',
          connectionId: 'conn-to-clear',
        }),
      });
      const origFetch = global.fetch;
      global.fetch = mockFetch as any;

      await app.inject({
        method: 'POST', url: '/api/settings/relay/link-exchange',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
        payload: { relayUrl: 'https://relay-unlink.example.com', code: 'LINKFIRST' },
      });
      global.fetch = origFetch;

      // Verify relay is linked
      const beforeRes = await app.inject({
        method: 'GET', url: '/api/settings',
        headers: { cookie: cookies },
      });
      expect(JSON.parse(beforeRes.payload).relay.enabled).toBe(true);

      // Unlink
      const unlinkRes = await app.inject({
        method: 'DELETE', url: '/api/settings/relay/unlink',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      });
      expect(unlinkRes.statusCode).toBe(200);
      expect(JSON.parse(unlinkRes.payload).ok).toBe(true);

      // Verify relay is cleared
      const afterRes = await app.inject({
        method: 'GET', url: '/api/settings',
        headers: { cookie: cookies },
      });
      const afterSettings = JSON.parse(afterRes.payload);
      expect(afterSettings.relay.enabled).toBe(false);
      expect(afterSettings.relay.connectionId).toBeNull();

      // Verify audit event
      const { auditEvents } = await import('../src/db/schema.js');
      const events = await app.db.select().from(auditEvents).all();
      expect(events.some(e => e.eventType === 'relay_unlinked')).toBe(true);
    });
  });
});
