/**
 * Tests for password change, TOTP recovery codes, and rate limiting.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/index.js';

vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

describe('Password change', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });

    await app.inject({
      method: 'POST', url: '/api/setup',
      payload: { displayName: 'PwChange User', email: 'pwchange@test.com', password: 'original-pass-1234', timezone: 'UTC' },
      headers: { 'content-type': 'application/json' },
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'original-pass-1234' },
      headers: { 'content-type': 'application/json' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await app.inject({ method: 'GET', url: '/api/csrf', headers: { cookie: cookies } });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;
  });

  afterAll(() => app.close());

  it('POST /api/security/password requires auth', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/security/password',
      headers: { 'content-type': 'application/json' },
      payload: { currentPassword: 'original-pass-1234', newPassword: 'new-password-5678' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/security/password requires CSRF', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/security/password',
      headers: { cookie: cookies, 'content-type': 'application/json' },
      payload: { currentPassword: 'original-pass-1234', newPassword: 'new-password-5678' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects when currentPassword is wrong', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/security/password',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { currentPassword: 'wrong-password', newPassword: 'new-password-5678' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects newPassword shorter than 12 chars', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/security/password',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { currentPassword: 'original-pass-1234', newPassword: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('changes password and emits audit event', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/security/password',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { currentPassword: 'original-pass-1234', newPassword: 'new-password-5678-long' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).ok).toBe(true);

    // Verify audit event was written
    const { auditEvents } = await import('../src/db/schema.js');
    const events = await app.db.select().from(auditEvents).all();
    expect(events.some(e => e.eventType === 'password_changed')).toBe(true);

    // Verify old password no longer works
    const loginOldRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'original-pass-1234' },
      headers: { 'content-type': 'application/json' },
    });
    expect(loginOldRes.statusCode).toBe(401);

    // Verify new password works
    const loginNewRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'new-password-5678-long' },
      headers: { 'content-type': 'application/json' },
    });
    expect(loginNewRes.statusCode).toBe(200);
  });
});

describe('TOTP recovery codes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });

    await app.inject({
      method: 'POST', url: '/api/setup',
      payload: { displayName: 'Recovery User', email: 'recovery@test.com', password: 'recovery-pass-1234', timezone: 'UTC' },
      headers: { 'content-type': 'application/json' },
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'recovery-pass-1234' },
      headers: { 'content-type': 'application/json' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await app.inject({ method: 'GET', url: '/api/csrf', headers: { cookie: cookies } });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;
  });

  afterAll(() => app.close());

  async function enableTotp() {
    const startRes = await app.inject({
      method: 'POST', url: '/api/security/totp/start',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {},
    });
    const { secret } = JSON.parse(startRes.payload);
    const { generateTotpCode } = await import('../src/auth/totp.js');
    const code = generateTotpCode(secret);
    await app.inject({
      method: 'POST', url: '/api/security/totp/confirm',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { code },
    });
    return secret;
  }

  it('POST /api/security/totp/recovery/generate requires auth', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/security/totp/recovery/generate',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/security/totp/recovery/generate requires CSRF', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/security/totp/recovery/generate',
      headers: { cookie: cookies, 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when TOTP not enabled', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/security/totp/recovery/generate',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toMatch(/totp/i);
  });

  it('generates 8 recovery codes when TOTP enabled', async () => {
    await enableTotp();

    const res = await app.inject({
      method: 'POST', url: '/api/security/totp/recovery/generate',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.codes)).toBe(true);
    expect(body.codes).toHaveLength(8);
    // Each code should be 8 hex chars
    for (const code of body.codes) {
      expect(code).toMatch(/^[0-9a-f]{8}$/);
    }

    // Verify audit event
    const { auditEvents } = await import('../src/db/schema.js');
    const events = await app.db.select().from(auditEvents).all();
    expect(events.some(e => e.eventType === 'totp_recovery_codes_generated')).toBe(true);

    // Verify codes are encrypted in DB (not plaintext)
    const { owner } = await import('../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    const [ownerRow] = await app.db.select({ totpRecoveryCodesEncrypted: owner.totpRecoveryCodesEncrypted }).from(owner).all();
    expect(ownerRow.totpRecoveryCodesEncrypted).not.toBeNull();
    // Should NOT contain plaintext codes directly
    for (const code of body.codes) {
      expect(ownerRow.totpRecoveryCodesEncrypted).not.toContain(code);
    }
  });

  it('POST /api/security/totp/recovery/regenerate invalidates old codes', async () => {
    // Get initial codes
    const genRes = await app.inject({
      method: 'POST', url: '/api/security/totp/recovery/generate',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {},
    });
    const firstCodes = JSON.parse(genRes.payload).codes as string[];

    // Regenerate
    const regenRes = await app.inject({
      method: 'POST', url: '/api/security/totp/recovery/regenerate',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {},
    });
    expect(regenRes.statusCode).toBe(200);
    const newCodes = JSON.parse(regenRes.payload).codes as string[];
    expect(newCodes).toHaveLength(8);

    // New codes should differ from old codes (extremely unlikely to be same)
    const overlap = newCodes.filter(c => firstCodes.includes(c));
    expect(overlap.length).toBeLessThan(8);

    // Verify audit event
    const { auditEvents } = await import('../src/db/schema.js');
    const events = await app.db.select().from(auditEvents).all();
    expect(events.some(e => e.eventType === 'totp_recovery_codes_regenerated')).toBe(true);
  });

  it('POST /api/security/totp/recovery/use logs in with valid code', async () => {
    // Generate fresh codes
    const genRes = await app.inject({
      method: 'POST', url: '/api/security/totp/recovery/generate',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {},
    });
    const codes = JSON.parse(genRes.payload).codes as string[];
    const codeToUse = codes[0];

    // Use one code (no auth required — this is recovery)
    const useRes = await app.inject({
      method: 'POST', url: '/api/security/totp/recovery/use',
      headers: { 'content-type': 'application/json' },
      payload: { code: codeToUse },
    });
    expect(useRes.statusCode).toBe(200);
    expect(JSON.parse(useRes.payload).ok).toBe(true);
    // Should set a session cookie
    expect(String(useRes.headers['set-cookie'])).toContain('aegis_session');

    // Verify audit event
    const { auditEvents } = await import('../src/db/schema.js');
    const events = await app.db.select().from(auditEvents).all();
    expect(events.some(e => e.eventType === 'totp_recovery_code_used')).toBe(true);

    // Verify used code is removed (remaining = 7)
    const { owner } = await import('../src/db/schema.js');
    const { decryptRecoveryCodes } = await import('../src/auth/totp.js');
    const [ownerRow] = await app.db.select({ totpRecoveryCodesEncrypted: owner.totpRecoveryCodesEncrypted }).from(owner).all();
    const remaining = decryptRecoveryCodes(ownerRow.totpRecoveryCodesEncrypted!, app.config.fieldEncryptionKey);
    expect(remaining).toHaveLength(7);
    expect(remaining).not.toContain(codeToUse);
  });

  it('rejects invalid recovery code', async () => {
    const useRes = await app.inject({
      method: 'POST', url: '/api/security/totp/recovery/use',
      headers: { 'content-type': 'application/json' },
      payload: { code: 'invalid1' },
    });
    expect(useRes.statusCode).toBe(401);
  });

  it('disabling TOTP clears recovery codes', async () => {
    // Enable fresh TOTP to get a known secret for disable
    const startRes = await app.inject({
      method: 'POST', url: '/api/security/totp/start',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {},
    });
    const { secret } = JSON.parse(startRes.payload);
    const { generateTotpCode } = await import('../src/auth/totp.js');
    const code1 = generateTotpCode(secret);
    await app.inject({
      method: 'POST', url: '/api/security/totp/confirm',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { code: code1 },
    });

    // Generate recovery codes
    await app.inject({
      method: 'POST', url: '/api/security/totp/recovery/generate',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {},
    });

    // Disable TOTP
    const code2 = generateTotpCode(secret);
    const disableRes = await app.inject({
      method: 'POST', url: '/api/security/totp/disable',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { password: 'recovery-pass-1234', code: code2 },
    });
    expect(disableRes.statusCode).toBe(200);

    // Verify recovery codes are cleared in DB
    const { owner } = await import('../src/db/schema.js');
    const [ownerRow] = await app.db.select({ totpRecoveryCodesEncrypted: owner.totpRecoveryCodesEncrypted }).from(owner).all();
    expect(ownerRow.totpRecoveryCodesEncrypted).toBeNull();
  });
});

describe('Recovery code helpers', () => {
  it('generateRecoveryCodes returns 8 hex codes of 8 chars each', async () => {
    const { generateRecoveryCodes } = await import('../src/auth/totp.js');
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('encryptRecoveryCodes / decryptRecoveryCodes roundtrip', async () => {
    const { generateRecoveryCodes, encryptRecoveryCodes, decryptRecoveryCodes } = await import('../src/auth/totp.js');
    const codes = generateRecoveryCodes();
    const key = 'test-field-encryption-key-32chars!!';
    const encrypted = encryptRecoveryCodes(codes, key);
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toContain(codes[0]); // should be encrypted

    const decrypted = decryptRecoveryCodes(encrypted, key);
    expect(decrypted).toEqual(codes);
  });

  it('useRecoveryCode returns remaining codes on valid code', async () => {
    const { generateRecoveryCodes, encryptRecoveryCodes, useRecoveryCode } = await import('../src/auth/totp.js');
    const codes = generateRecoveryCodes();
    const key = 'test-field-encryption-key-32chars!!';
    const encrypted = encryptRecoveryCodes(codes, key);

    const remaining = useRecoveryCode(codes[0], encrypted, key);
    expect(remaining).not.toBeNull();
    expect(remaining!).toHaveLength(7);
    expect(remaining!).not.toContain(codes[0]);
  });

  it('useRecoveryCode returns null on invalid code', async () => {
    const { generateRecoveryCodes, encryptRecoveryCodes, useRecoveryCode } = await import('../src/auth/totp.js');
    const codes = generateRecoveryCodes();
    const key = 'test-field-encryption-key-32chars!!';
    const encrypted = encryptRecoveryCodes(codes, key);

    const result = useRecoveryCode('badcode1', encrypted, key);
    expect(result).toBeNull();
  });
});
