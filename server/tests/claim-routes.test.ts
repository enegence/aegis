import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import { buildApp } from '../src/index.js';
import { encryptField } from '../src/services/field-encrypt.js';
import {
  owner, contacts, switches, packets,
  releaseRuns,
} from '../src/db/schema.js';
import { createContactClaim } from '../src/repositories/contact-claim-repository.js';
import { storePacketKey } from '../src/repositories/packet-repository.js';

const FIELD_KEY = 'dev-field-key-change-me-32bytes!!';

// Mock dispatchNotification to avoid real SMTP calls
vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

describe('claim routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dataDir: string;
  let rawToken: string;
  let pinRawToken: string;
  let switchId: number;
  let runId: number;
  let packetId: number;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'aegis-claim-test-'));
    app = await buildApp({ testing: true, dbPath: ':memory:', dataDir });

    // Seed owner
    await app.db.insert(owner).values({
      displayName: 'Test Owner', email: 'owner@test.com', phone: null,
      timezone: 'UTC', passwordHash: 'x', totpEnabled: false, setupComplete: true,
    });

    // Seed two contacts: one without PIN, one with PIN
    const [contact1] = await app.db.insert(contacts).values({
      fullNameEncrypted: encryptField('Alice', FIELD_KEY)!,
      emailEncrypted: encryptField('alice@x.com', FIELD_KEY)!,
      priorityOrder: 1, preferredChannels: '["email"]', confirmationWindowHours: 48,
    }).returning();

    const pinHash = createHash('sha256').update('1234').digest('hex');
    const [contact2] = await app.db.insert(contacts).values({
      fullNameEncrypted: encryptField('Bob', FIELD_KEY)!,
      emailEncrypted: encryptField('bob@x.com', FIELD_KEY)!,
      priorityOrder: 2, preferredChannels: '["email"]', confirmationWindowHours: 48,
      claimPinHash: pinHash,
    }).returning();

    // Seed switch
    const [sw] = await app.db.insert(switches).values({
      name: 'Test Switch', mode: 'trip', status: 'triggered',
      triggerAt: new Date(Date.now() - 1000),
      selectedContactIds: JSON.stringify([contact1.id, contact2.id]),
      selectedEstateItemIds: '[]',
    }).returning();
    switchId = sw.id;

    // Seed release run
    const [run] = await app.db.insert(releaseRuns).values({
      triggeringSwitchId: sw.id, status: 'cascade_active',
    }).returning();
    runId = run.id;

    // Create a real (fake) encrypted packet file
    const packetDir = join(dataDir, 'packets');
    mkdirSync(packetDir, { recursive: true });
    const packetKeyId = 'test-key-id-for-claim-routes';
    const packetFilePath = join(packetDir, `${packetKeyId}.bin`);
    // fake binary content: 12B IV + 16B authTag + some ciphertext
    writeFileSync(packetFilePath, Buffer.alloc(64, 0xab));

    // Store packet key
    const rawKey = Buffer.alloc(32, 0xcd);
    const encryptedKeyMaterial = encryptField(rawKey.toString('base64'), FIELD_KEY)!;
    await storePacketKey(app.db, packetKeyId, encryptedKeyMaterial);

    // Seed packet record
    const [pkt] = await app.db.insert(packets).values({
      switchId: sw.id, releaseRunId: run.id, version: 1,
      keyId: packetKeyId, contentHash: 'abc', encryptedObjectHash: 'def',
      localCiphertextPath: packetFilePath,
    }).returning();
    packetId = pkt.id;

    // Update run with active packet
    await app.db.update(releaseRuns).set({ activePacketId: pkt.id }).where(
      (await import('drizzle-orm')).eq(releaseRuns.id, run.id)
    );

    // Create claim for contact1 (no PIN) - future expiry
    const claim1 = await createContactClaim(app.db, {
      releaseRunId: run.id, switchId: sw.id, packetId: pkt.id,
      contactId: contact1.id, expiresAt: new Date(Date.now() + 86400000),
    });
    rawToken = claim1.rawToken;

    // Mark claim as notified
    await app.db.update(
      (await import('../src/db/schema.js')).contactClaims
    ).set({ status: 'notified', notifiedAt: new Date() }).where(
      (await import('drizzle-orm')).eq(
        (await import('../src/db/schema.js')).contactClaims.id, claim1.record.id
      )
    );

    // Create claim for contact2 (with PIN) - future expiry
    const claim2 = await createContactClaim(app.db, {
      releaseRunId: run.id, switchId: sw.id, packetId: pkt.id,
      contactId: contact2.id, expiresAt: new Date(Date.now() + 86400000),
    });
    pinRawToken = claim2.rawToken;
    await app.db.update(
      (await import('../src/db/schema.js')).contactClaims
    ).set({ status: 'notified', notifiedAt: new Date() }).where(
      (await import('drizzle-orm')).eq(
        (await import('../src/db/schema.js')).contactClaims.id, claim2.record.id
      )
    );
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('invalid token returns 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/claim/thisisnotavalidtoken123456789012',
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/claim/:token returns public summary', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/claim/${rawToken}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('notified');
    expect(body.claimId).toBeGreaterThan(0);
    expect(body.pinRequired).toBe(false);
    expect(body.expiresAt).toBeTruthy();
  });

  it('open updates openedAt', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/claim/${rawToken}/open` });
    expect(res.statusCode).toBe(200);

    const check = await app.inject({ method: 'GET', url: `/api/claim/${rawToken}` });
    const body = JSON.parse(check.payload);
    expect(body.openedAt).toBeTruthy();
    expect(body.status).toBe('opened');
  });

  it('verify without PIN succeeds', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/claim/${rawToken}/verify` });
    expect(res.statusCode).toBe(200);

    const check = await app.inject({ method: 'GET', url: `/api/claim/${rawToken}` });
    const body = JSON.parse(check.payload);
    expect(body.verifiedAt).toBeTruthy();
    expect(body.status).toBe('verified');
  });

  it('wrong PIN is rate limited after max failures', async () => {
    // First check pinRequired
    const info = await app.inject({ method: 'GET', url: `/api/claim/${pinRawToken}` });
    expect(JSON.parse(info.payload).pinRequired).toBe(true);

    // Submit wrong PINs until rate limited (MAX_PIN_FAILURES = 5)
    let lastStatus = 0;
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: 'POST',
        url: `/api/claim/${pinRawToken}/verify`,
        payload: { pin: 'wrong' },
        headers: { 'content-type': 'application/json' },
      });
      lastStatus = r.statusCode;
    }
    // 5th wrong attempt triggers 429
    expect(lastStatus).toBe(429);
  });

  it('accept updates acceptedAt', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/claim/${rawToken}/accept` });
    expect(res.statusCode).toBe(200);

    const check = await app.inject({ method: 'GET', url: `/api/claim/${rawToken}` });
    const body = JSON.parse(check.payload);
    expect(body.acceptedAt).toBeTruthy();
  });

  it('packet before accept denied', async () => {
    // Create a fresh claim (still in notified status) to test this
    const { contactClaims } = await import('../src/db/schema.js');
    const { eq } = await import('drizzle-orm');

    const freshClaim = await createContactClaim(app.db, {
      releaseRunId: runId, switchId, packetId,
      contactId: 1, expiresAt: new Date(Date.now() + 86400000),
    });
    // Leave it as 'pending' status — not accepted

    const res = await app.inject({
      method: 'GET',
      url: `/api/claim/${freshClaim.rawToken}/packet`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('packet after accept returns file bytes', async () => {
    // rawToken claim is now 'accepted'
    const res = await app.inject({
      method: 'GET',
      url: `/api/claim/${rawToken}/packet`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('key-view audited and does not log key material', async () => {
    // claim is now 'packet_downloaded'
    const { getAuditEvents } = await import('../src/services/audit.js');

    const res = await app.inject({ method: 'POST', url: `/api/claim/${rawToken}/key-view` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.keyBase64).toBeTruthy();
    expect(body.algorithm).toBe('aes-256-gcm');

    const events = await getAuditEvents(app.db, { switchId });
    const evt = events.find(e => e.eventType === 'claim_key_viewed');
    expect(evt).toBeTruthy();

    const meta = JSON.stringify(evt?.metadata ?? {});
    expect(meta).not.toContain(body.keyBase64); // key NOT in audit
    expect(meta).not.toContain('key');  // no key field in metadata
    // only safe ids should be in metadata
    expect(meta).toContain('claimId');
  });

  it('acknowledge completes release run and switch', async () => {
    const { getReleaseRunById } = await import('../src/repositories/release-run-repository.js');
    const { getSwitchById } = await import('../src/services/switch-repository.js');

    const res = await app.inject({ method: 'POST', url: `/api/claim/${rawToken}/acknowledge` });
    expect(res.statusCode).toBe(200);

    const run = await getReleaseRunById(app.db, runId);
    expect(run?.status).toBe('completed');

    const sw = await getSwitchById(app.db, switchId);
    expect(sw?.status).toBe('completed');
  });

  it('expired claim returns 403', async () => {
    const { contactClaims } = await import('../src/db/schema.js');
    const { eq } = await import('drizzle-orm');

    const expired = await createContactClaim(app.db, {
      releaseRunId: runId, switchId, packetId,
      contactId: 1, expiresAt: new Date(Date.now() - 1000), // past
    });

    const res = await app.inject({ method: 'POST', url: `/api/claim/${expired.rawToken}/open` });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.payload).error).toContain('expired');
  });
});
