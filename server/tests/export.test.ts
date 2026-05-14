import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'crypto';
import { buildApp } from '../src/index.js';
import { decryptExportBundle } from '../src/services/export.js';

// Helper: setup + login
async function setupAndLogin(app: Awaited<ReturnType<typeof buildApp>>) {
  await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: {
      displayName: 'Export Owner',
      email: 'export@test.com',
      password: 'testpass1234abcd',
      timezone: 'UTC',
    },
  });

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'testpass1234abcd' },
  });
  const cookies = String(loginRes.headers['set-cookie']);

  const csrfRes = await app.inject({
    method: 'GET',
    url: '/api/csrf',
    headers: { cookie: cookies },
  });
  const csrfToken = JSON.parse(csrfRes.payload).csrfToken;

  return { cookies, csrfToken };
}

describe('OSS Export routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
    const auth = await setupAndLogin(app);
    cookies = auth.cookies;
    csrfToken = auth.csrfToken;

    // Seed some estate items and contacts
    await app.inject({
      method: 'POST',
      url: '/api/estate-items',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        category: 'Financial',
        title: 'Test Bank Account',
        institutionName: 'Test Bank',
        referenceHint: '1234',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/estate-items',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        category: 'Property',
        title: 'Family Home',
        assetDescription: 'Main residence',
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        fullName: 'Alice Beneficiary',
        email: 'alice@example.com',
        priorityOrder: 1,
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        fullName: 'Bob Trustee',
        email: 'bob@example.com',
        priorityOrder: 2,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/export', () => {
    it('requires active session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/export',
        payload: { passphrase: 'my-export-passphrase-123' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns an encrypted export bundle', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/export',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: { passphrase: 'my-export-passphrase-123' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);

      // Bundle structure
      expect(body.schemaVersion).toBe('aegis-export-2026-05-01');
      expect(typeof body.createdAt).toBe('string');
      expect(typeof body.appVersion).toBe('string');
      expect(body.encryption).toBeDefined();
      expect(body.encryption.algorithm).toBe('aes-256-gcm');
      expect(body.encryption.kdf).toBe('argon2id');
      expect(typeof body.encryption.salt).toBe('string');
      expect(typeof body.encryption.iv).toBe('string');
      expect(typeof body.encryption.authTag).toBe('string');
      expect(typeof body.payloadHash).toBe('string');
      expect(typeof body.encryptedPayload).toBe('string');
    });

    it('bundle does NOT contain plaintext sensitive data outside encrypted payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/export',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: { passphrase: 'my-export-passphrase-123' },
      });
      const body = JSON.parse(res.payload);
      const bodyStr = JSON.stringify(body);

      // Known sensitive values must not appear in plaintext
      expect(bodyStr).not.toContain('Test Bank');
      expect(bodyStr).not.toContain('Alice Beneficiary');
      expect(bodyStr).not.toContain('alice@example.com');
      // The encrypted payload hex itself should not have plaintext
      expect(bodyStr).not.toContain('testpass1234abcd');
    });

    it('decrypts bundle with correct passphrase and contains expected counts', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/export',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: { passphrase: 'my-export-passphrase-123' },
      });
      const bundle = JSON.parse(res.payload);
      const payload = await decryptExportBundle(bundle, 'my-export-passphrase-123');

      expect(payload.estateItems).toHaveLength(2);
      expect(payload.contacts).toHaveLength(2);
      expect(Array.isArray(payload.switches)).toBe(true);
    });

    it('rejects export with missing passphrase', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/export',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/export/preview-restore', () => {
    let bundle: unknown;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/export',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: { passphrase: 'preview-passphrase-123' },
      });
      bundle = JSON.parse(res.payload);
    });

    it('requires active session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/export/preview-restore',
        payload: { bundle, passphrase: 'preview-passphrase-123' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns counts without modifying DB', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/export/preview-restore',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: { bundle, passphrase: 'preview-passphrase-123' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(typeof body.estateItems).toBe('number');
      expect(typeof body.contacts).toBe('number');
      expect(typeof body.switches).toBe('number');
      expect(body.estateItems).toBe(2);
      expect(body.contacts).toBe(2);
    });

    it('rejects invalid schema version', async () => {
      const badBundle = { ...(bundle as object), schemaVersion: 'bad-version-1.0' };
      const res = await app.inject({
        method: 'POST',
        url: '/api/export/preview-restore',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: { bundle: badBundle, passphrase: 'preview-passphrase-123' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toMatch(/schema/i);
    });

    it('fails with wrong passphrase', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/export/preview-restore',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: { bundle, passphrase: 'wrong-passphrase-xyz' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/export/restore', () => {
    let bundle: unknown;
    let restoreApp: Awaited<ReturnType<typeof buildApp>>;
    let restoreCookies: string;
    let restoreCsrf: string;

    beforeAll(async () => {
      // Export from main app
      const res = await app.inject({
        method: 'POST',
        url: '/api/export',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: { passphrase: 'restore-passphrase-123' },
      });
      bundle = JSON.parse(res.payload);

      // Create a fresh empty app to restore into
      restoreApp = await buildApp({ testing: true, dbPath: ':memory:' });
      const auth = await setupAndLogin(restoreApp);
      restoreCookies = auth.cookies;
      restoreCsrf = auth.csrfToken;
    });

    afterAll(async () => {
      await restoreApp.close();
    });

    it('requires active session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/export/restore',
        payload: { bundle, passphrase: 'restore-passphrase-123', confirmed: true },
      });
      expect(res.statusCode).toBe(401);
    });

    it('refuses restore without confirmed: true', async () => {
      const res = await restoreApp.inject({
        method: 'POST',
        url: '/api/export/restore',
        headers: { cookie: restoreCookies, 'x-csrf-token': restoreCsrf },
        payload: { bundle, passphrase: 'restore-passphrase-123' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toMatch(/confirm/i);
    });

    it('refuses to overwrite existing data without overwrite: true', async () => {
      // restoreApp already has owner + data from setupAndLogin, so it has existing estate items if we first restore
      // Actually fresh restoreApp has no estate items, so overwrite guard only triggers if there's pre-existing data
      // Let's just test the happy path works and then test overwrite guard by checking it restores
      const res = await restoreApp.inject({
        method: 'POST',
        url: '/api/export/restore',
        headers: { cookie: restoreCookies, 'x-csrf-token': restoreCsrf },
        payload: { bundle, passphrase: 'restore-passphrase-123', confirmed: true },
      });
      expect(res.statusCode).toBe(200);

      // Now try again — should fail without overwrite: true
      const res2 = await restoreApp.inject({
        method: 'POST',
        url: '/api/export/restore',
        headers: { cookie: restoreCookies, 'x-csrf-token': restoreCsrf },
        payload: { bundle, passphrase: 'restore-passphrase-123', confirmed: true },
      });
      expect(res2.statusCode).toBe(409);
      const body2 = JSON.parse(res2.payload);
      expect(body2.error).toMatch(/overwrite/i);
    });

    it('restores data with overwrite: true', async () => {
      const res = await restoreApp.inject({
        method: 'POST',
        url: '/api/export/restore',
        headers: { cookie: restoreCookies, 'x-csrf-token': restoreCsrf },
        payload: { bundle, passphrase: 'restore-passphrase-123', confirmed: true, overwrite: true },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.restored.estateItems).toBe(2);
      expect(body.restored.contacts).toBe(2);
    });

    it('rejects invalid schema version', async () => {
      const badBundle = { ...(bundle as object), schemaVersion: 'not-valid' };
      const res = await restoreApp.inject({
        method: 'POST',
        url: '/api/export/restore',
        headers: { cookie: restoreCookies, 'x-csrf-token': restoreCsrf },
        payload: { bundle: badBundle, passphrase: 'restore-passphrase-123', confirmed: true, overwrite: true },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toMatch(/schema/i);
    });
  });
});
