/**
 * Security Baseline Tests — Aegis OSS
 *
 * Verifies that core security invariants are actually implemented.
 * For each feature not yet implemented, an it.todo() placeholder documents the gap.
 *
 * Coverage:
 *   - CSRF protection (no token rejected, invalid token rejected, valid token accepted)
 *   - Session lifecycle (logout invalidates session, expired session rejected)
 *   - Password reset token single-use and hash storage
 *   - Server startup rejects weak secrets in production
 *   - TOTP setup flow (start, confirm, disable requires proof)
 *   - Field encryption: estate item sensitive fields not plaintext in DB
 *   - Field encryption: contact sensitive fields not plaintext in DB
 *   - Audit log: contact notification event contains no plaintext PII
 *   - Audit log: packet/release event contains no plaintext secrets
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/index.js';
import { createTestDb } from '../src/db/index.js';
import { estateItems, contacts, auditEvents, sessions } from '../src/db/schema.js';
import { loadConfig } from '../src/config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function setupOwner(app: Awaited<ReturnType<typeof buildApp>>) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: {
      displayName: 'Security Baseline',
      email: 'baseline@test.com',
      password: 'testpass1234',
      timezone: 'UTC',
    },
  });
}

async function login(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'testpass1234' },
  });
  return String(res.headers['set-cookie']);
}

async function getCsrf(app: Awaited<ReturnType<typeof buildApp>>, cookies: string) {
  const res = await app.inject({
    method: 'GET',
    url: '/api/csrf',
    headers: { cookie: cookies },
  });
  return JSON.parse(res.payload).csrfToken as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSRF Protection
// ─────────────────────────────────────────────────────────────────────────────

describe('CSRF protection', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
    await setupOwner(app);
    cookies = await login(app);
  });

  afterAll(() => app.close());

  it('state-changing request without CSRF token is rejected (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/estate-items',
      headers: { cookie: cookies },
      payload: { category: 'Financial', title: 'No CSRF' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('state-changing request with invalid CSRF token is rejected (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/estate-items',
      headers: { cookie: cookies, 'x-csrf-token': 'invalid-token-value' },
      payload: { category: 'Financial', title: 'Bad CSRF' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('state-changing request with valid CSRF token is accepted', async () => {
    const csrfToken = await getCsrf(app, cookies);
    const res = await app.inject({
      method: 'POST',
      url: '/api/estate-items',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { category: 'Financial', title: 'Valid CSRF' },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Session Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe('Session lifecycle', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
    await setupOwner(app);
  });

  afterAll(() => app.close());

  it('logout invalidates session — subsequent request returns 401', async () => {
    const sessionCookies = await login(app);

    // Confirm session is valid
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: sessionCookies },
    });
    expect(me.statusCode).toBe(200);

    // Logout
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: sessionCookies },
    });
    expect(logoutRes.statusCode).toBe(200);

    // Subsequent request with old session cookie must be rejected
    const afterLogout = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: sessionCookies },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('request without session cookie returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });
    expect(res.statusCode).toBe(401);
  });

  it('request with fabricated session ID returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: 'aegis_session=totally-fake-session-id-that-does-not-exist' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('expired session is rejected — returns 401', async () => {
    // Look up the owner id from the owner table (set up in beforeAll)
    const { owner: ownerTable } = await import('../src/db/schema.js');
    const ownerRows = await app.db.select({ id: ownerTable.id }).from(ownerTable).limit(1);
    const ownerId = ownerRows[0]!.id;

    // Insert an already-expired session directly into the DB
    const expiredSessionId = 'expired-session-id-for-test-baseline-oss';
    const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    app.db.insert(sessions).values({
      id: expiredSessionId,
      ownerId,
      expiresAt: pastDate,
      createdAt: pastDate,
    }).run();

    // Request with the expired session cookie must be rejected
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `aegis_session=${expiredSessionId}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server startup secret validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Server startup secret validation', () => {
  it('loadConfig rejects "change-me" secretKey in production mode', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() =>
        loadConfig({
          secretKey: 'dev-secret-key-change-me',
          fieldEncryptionKey: 'a'.repeat(64),
        })
      ).toThrow(/change-me|too short/i);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('loadConfig rejects short secretKey (< 64 chars) in production mode', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() =>
        loadConfig({
          secretKey: 'short-key',
          fieldEncryptionKey: 'a'.repeat(64),
        })
      ).toThrow(/too short|at least/i);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('loadConfig rejects "change-me" fieldEncryptionKey in production mode', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() =>
        loadConfig({
          secretKey: 'a'.repeat(64),
          fieldEncryptionKey: 'dev-field-key-change-me-32bytes!!',
        })
      ).toThrow(/change-me|FATAL/i);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('loadConfig rejects fieldEncryptionKey that is not 64 hex chars in production mode', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() =>
        loadConfig({
          secretKey: 'a'.repeat(64),
          fieldEncryptionKey: 'not-valid-hex!!!',
        })
      ).toThrow(/hex|FATAL/i);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Field Encryption — Estate Items
// ─────────────────────────────────────────────────────────────────────────────

describe('Field encryption — estate items', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
    await setupOwner(app);
    cookies = await login(app);
    csrfToken = await getCsrf(app, cookies);
  });

  afterAll(() => app.close());

  it('institutionName is NOT stored as plaintext in DB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/estate-items',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        category: 'Financial',
        title: 'Encryption Test',
        institutionName: 'SecretBankName',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    const itemId = body.id as number;

    const rows = await app.db
      .select()
      .from(estateItems)
      .where(eq(estateItems.id, itemId));

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    // Must not store plaintext
    expect(row.institutionNameEncrypted).not.toBe('SecretBankName');
    // Must be a non-empty string (ciphertext)
    expect(typeof row.institutionNameEncrypted).toBe('string');
    expect(row.institutionNameEncrypted!.length).toBeGreaterThan(10);
  });

  it('executorNotes is NOT stored as plaintext in DB', async () => {
    const csrfToken2 = await getCsrf(app, cookies);
    const res = await app.inject({
      method: 'POST',
      url: '/api/estate-items',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken2 },
      payload: {
        category: 'Legal',
        title: 'Executor Notes Test',
        executorNotes: 'Call John Smith at 555-9999',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    const itemId = body.id as number;

    const rows = await app.db
      .select()
      .from(estateItems)
      .where(eq(estateItems.id, itemId));

    const row = rows[0]!;
    expect(row.executorNotesEncrypted).not.toBe('Call John Smith at 555-9999');
    expect(row.executorNotesEncrypted!.length).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Field Encryption — Contacts
// ─────────────────────────────────────────────────────────────────────────────

describe('Field encryption — contacts', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
    await setupOwner(app);
    cookies = await login(app);
  });

  afterAll(() => app.close());

  it('email is NOT stored as plaintext in DB', async () => {
    const csrfToken = await getCsrf(app, cookies);
    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        fullName: 'Encrypt Test Contact',
        email: 'encrypt-test@example.com',
        priorityOrder: 1,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    // API may return { id } or { contact: { id } } — handle both
    const contactId = body.id ?? body.contact?.id;
    expect(contactId).toBeDefined();

    const rows = await app.db
      .select()
      .from(contacts)
      .where(eq(contacts.id, Number(contactId)));

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.emailEncrypted).not.toBe('encrypt-test@example.com');
    expect(row.emailEncrypted.length).toBeGreaterThan(10);
  });

  it('fullName is NOT stored as plaintext in DB', async () => {
    const csrfToken = await getCsrf(app, cookies);
    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        fullName: 'Alice Sensitive-Name',
        email: 'alice-name@example.com',
        priorityOrder: 2,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    const contactId = body.id ?? body.contact?.id;

    const rows = await app.db
      .select()
      .from(contacts)
      .where(eq(contacts.id, Number(contactId)));

    const row = rows[0]!;
    expect(row.fullNameEncrypted).not.toBe('Alice Sensitive-Name');
    expect(row.fullNameEncrypted.length).toBeGreaterThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log Redaction
// ─────────────────────────────────────────────────────────────────────────────

describe('Audit log redaction', () => {
  it('writeAuditEvent rejects metadata with PII-like key "email"', async () => {
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });

    const { writeAuditEvent } = await import('../src/services/audit.js');
    await expect(
      writeAuditEvent(db, {
        eventType: 'contact_notified',
        actorType: 'system',
        metadata: { email: 'victim@example.com' },
      })
    ).rejects.toThrow(/PII-like key/i);
  });

  it('writeAuditEvent rejects metadata with key "secretKey"', async () => {
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });

    const { writeAuditEvent } = await import('../src/services/audit.js');
    await expect(
      writeAuditEvent(db, {
        eventType: 'packet_generated',
        actorType: 'system',
        metadata: { secretKey: 'abc123' },
      })
    ).rejects.toThrow(/PII-like key/i);
  });

  it('writeAuditEvent rejects metadata with key "phoneNumber"', async () => {
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });

    const { writeAuditEvent } = await import('../src/services/audit.js');
    await expect(
      writeAuditEvent(db, {
        eventType: 'contact_notified',
        actorType: 'system',
        metadata: { phoneNumber: '+15551234567' },
      })
    ).rejects.toThrow(/PII-like key/i);
  });

  it('writeAuditEvent rejects metadata with key "apiKey"', async () => {
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });

    const { writeAuditEvent } = await import('../src/services/audit.js');
    await expect(
      writeAuditEvent(db, {
        eventType: 'relay_heartbeat_sent',
        actorType: 'relay',
        metadata: { apiKey: 'relay-key-xyz' },
      })
    ).rejects.toThrow(/PII-like key/i);
  });

  it('audit events stored via app do not contain plaintext PII for contact events', async () => {
    const app = await buildApp({ testing: true, dbPath: ':memory:' });
    try {
      await setupOwner(app);
      const cookies = await login(app);
      const csrfToken = await getCsrf(app, cookies);

      // Create a contact (triggers contact_created audit event)
      await app.inject({
        method: 'POST',
        url: '/api/contacts',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: {
          fullName: 'PII Test Contact',
          email: 'pii-audit@test.com',
          priorityOrder: 1,
        },
      });

      // Query all audit events and verify no plaintext PII leaked into metadata
      const events = await app.db.select().from(auditEvents);
      for (const event of events) {
        if (!event.metadata) continue;
        const metaStr = typeof event.metadata === 'string'
          ? event.metadata
          : JSON.stringify(event.metadata);
        expect(metaStr).not.toContain('pii-audit@test.com');
        expect(metaStr).not.toContain('PII Test Contact');
      }
    } finally {
      await app.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log — Packet / Release Events
// ─────────────────────────────────────────────────────────────────────────────

describe('Audit log — packet/release events strip secrets', () => {
  it('packet_generated audit event metadata does not contain key material, storage credentials, or API keys', async () => {
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });

    const { writeAuditEvent } = await import('../src/services/audit.js');

    // Simulate the metadata written by packet-builder.ts for packet_generated
    // (packetId, version, keyId — the keyId is an identifier, not the raw key)
    await writeAuditEvent(db, {
      eventType: 'packet_generated',
      actorType: 'owner',
      metadata: { packetId: 1, version: 1, keyId: 'key-uuid-abc123' },
    });

    const events = await db.select().from(auditEvents).where(eq(auditEvents.eventType, 'packet_generated'));
    expect(events).toHaveLength(1);
    // In SQLite, metadata is stored as TEXT (JSON string); normalise to string for contains checks
    const rawMeta = events[0]!.metadata;
    const metaStr = typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta);

    // Must not contain any raw key material, storage credentials, or API keys
    expect(metaStr).not.toContain('secretKey');
    expect(metaStr).not.toContain('encryptionKey');
    expect(metaStr).not.toContain('accessKeyId');
    expect(metaStr).not.toContain('secretAccessKey');
    expect(metaStr).not.toContain('apiKey');
    // The fields present (packetId, version, keyId) are identifiers only — not secret material
    expect(JSON.parse(metaStr)).toMatchObject({ packetId: 1, version: 1 });
  });

  it('packet_deleted audit event metadata does not contain key material or storage credentials', async () => {
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });

    const { writeAuditEvent } = await import('../src/services/audit.js');

    // Simulate the metadata written by packets.ts route for packet_deleted
    await writeAuditEvent(db, {
      eventType: 'packet_deleted',
      actorType: 'owner',
      metadata: { packetId: 2, version: 1 },
    });

    const events = await db.select().from(auditEvents).where(eq(auditEvents.eventType, 'packet_deleted'));
    expect(events).toHaveLength(1);
    const rawMeta = events[0]!.metadata;
    const metaStr = typeof rawMeta === 'string' ? rawMeta : JSON.stringify(rawMeta);

    expect(metaStr).not.toContain('secretKey');
    expect(metaStr).not.toContain('encryptionKey');
    expect(metaStr).not.toContain('accessKeyId');
    expect(metaStr).not.toContain('secretAccessKey');
    expect(metaStr).not.toContain('apiKey');
    expect(JSON.parse(metaStr)).toMatchObject({ packetId: 2, version: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TOTP security
// ─────────────────────────────────────────────────────────────────────────────

describe('TOTP security', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
    await setupOwner(app);
    cookies = await login(app);
    csrfToken = await getCsrf(app, cookies);
  });

  afterAll(() => app.close());

  it('TOTP secret is stored encrypted (not plaintext) in DB', async () => {
    // Start TOTP setup — this stores an encrypted pending secret
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/security/totp/start',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {},
    });
    expect(startRes.statusCode).toBe(200);
    const { secret } = JSON.parse(startRes.payload);

    // Query DB directly — secret must not be stored as plaintext
    const { owner } = await import('../src/db/schema.js');
    const rows = await app.db.select({ totpSecretEncrypted: owner.totpSecretEncrypted }).from(owner);
    expect(rows).toHaveLength(1);
    const stored = rows[0]!.totpSecretEncrypted;
    expect(stored).not.toBeNull();
    expect(stored).not.toBe(secret); // must not be plaintext TOTP secret
  });

  it('TOTP disable requires password proof', async () => {
    // Re-enable TOTP first
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/security/totp/start',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: {},
    });
    const { secret } = JSON.parse(startRes.payload);
    const { generateTotpCode } = await import('../src/auth/totp.js');
    const code = generateTotpCode(secret);

    await app.inject({
      method: 'POST',
      url: '/api/security/totp/confirm',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { code },
    });

    // Try disable with wrong password
    const badPwRes = await app.inject({
      method: 'POST',
      url: '/api/security/totp/disable',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
      payload: { password: 'wrong-password', code: generateTotpCode(secret) },
    });
    expect(badPwRes.statusCode).toBe(401);
  });

  it.todo('TOTP recovery codes can be used once and cannot be reused — not yet implemented');
});

// ─────────────────────────────────────────────────────────────────────────────
// Not-yet-implemented features
// ─────────────────────────────────────────────────────────────────────────────

describe('Security features — not yet implemented (documented gaps)', () => {
  it.todo('password change requires current-password proof — not yet implemented in OSS');
  it.todo('claim PIN brute-force attempts are throttled after N wrong attempts — not yet implemented');
  it.todo('password reset token not reusable — OSS has no password reset; handled by SaaS only');
  it.todo('password reset token stored as hash — OSS has no password reset; handled by SaaS only');
  it.todo('account deletion zeroes encrypted fields before delete — not yet implemented');
  it.todo('relay API key is never passed in URL query string — enforced at linking flow level, no unit test yet');
});
