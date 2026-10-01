/**
 * Aegis Core → Aegis Relay escrow packet upload.
 *
 * POST /api/settings/relay/escrow-upload builds the switch's current packet,
 * uploads the ciphertext to POST {relayUrl}/api/relay/packets (contract
 * RelayPacketUploadSchema, Bearer key), and returns the packet's base64 key
 * once so the owner can escrow it in Aegis Relay. The key must decrypt the
 * uploaded bytes, because the hosted claim portal opens them with it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDecipheriv } from 'crypto';
import { eq } from 'drizzle-orm';
import { RelayPacketUploadSchema } from '@aegis/contracts';
import { buildApp } from '../src/index.js';
import { encryptField } from '../src/services/field-encrypt.js';
import { appSettings, auditEvents, contacts, estateItems } from '../src/db/schema.js';

vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

const FIELD_KEY = 'dev-field-key-change-me-32bytes!!';
const CONNECTION_ID = '5e3c8a10-2b6d-4c1e-9f7a-0d1b2c3e4f50';

describe('relay escrow upload', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dataDir: string;
  let cookies: string;
  let csrfToken: string;
  let escrowSwitchId: number;
  let vaultSwitchId: number;
  const fetchMock = vi.fn();

  async function post(url: string, payload: unknown) {
    return app.inject({ method: 'POST', url, headers: { cookie: cookies, 'x-csrf-token': csrfToken }, payload: payload as object });
  }

  beforeAll(async () => {
    vi.stubGlobal('fetch', fetchMock);
    dataDir = mkdtempSync(join(tmpdir(), 'aegis-escrow-upload-'));
    app = await buildApp({ testing: true, dbPath: ':memory:', dataDir });
    await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { displayName: 'Owner', email: 'owner@test.com', password: 'testpass1234', timezone: 'UTC' } });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'testpass1234' } });
    cookies = String(login.headers['set-cookie']);
    csrfToken = JSON.parse((await app.inject({ method: 'GET', url: '/api/csrf', headers: { cookie: cookies } })).payload).csrfToken;

    await app.db.insert(contacts).values({ fullNameEncrypted: encryptField('Bob Smith', FIELD_KEY)!, emailEncrypted: encryptField('bob@example.com', FIELD_KEY)!, priorityOrder: 1, preferredChannels: '["email"]', confirmationWindowHours: 48 });
    await app.db.insert(estateItems).values({ category: 'Financial', title: 'Checking', institutionNameEncrypted: encryptField('Chase', FIELD_KEY), sensitiveFlag: false, sortOrder: 0 });
    const future = new Date(Date.now() + 365 * 86400000).toISOString();
    escrowSwitchId = JSON.parse((await post('/api/switches', { name: 'Escrow', mode: 'trip', deploymentMode: 'relay_escrow', triggerAt: future, selectedContactIds: [1], selectedEstateItemIds: [1] })).payload).id;
    vaultSwitchId = JSON.parse((await post('/api/switches', { name: 'Vault', mode: 'trip', deploymentMode: 'vault', triggerAt: future, selectedContactIds: [1], selectedEstateItemIds: [1] })).payload).id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('refuses when Relay is not linked', async () => {
    const res = await post('/api/settings/relay/escrow-upload', { switchId: escrowSwitchId });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.payload).error).toBe('relay_not_linked');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires auth and CSRF', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/settings/relay/escrow-upload', payload: { switchId: escrowSwitchId } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/settings/relay/escrow-upload', headers: { cookie: cookies }, payload: { switchId: escrowSwitchId } })).statusCode).toBe(403);
  });

  it('uploads a contract-valid packet and returns a key that decrypts exactly those bytes', async () => {
    const now = new Date();
    await app.db.insert(appSettings).values([
      { key: 'relay_url', value: 'https://relay.example.com/', encrypted: false, updatedAt: now },
      { key: 'relay_api_key_encrypted', value: encryptField('relay-secret-key', FIELD_KEY)!, encrypted: true, updatedAt: now },
      { key: 'relay_connection_id', value: CONNECTION_ID, encrypted: false, updatedAt: now },
    ]);
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        packet: { id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', sourcePacketId: body.envelope.packetId, version: 1, keyId: body.envelope.keyId, contentHash: body.envelope.contentHash, encryptedObjectHash: 'x', sizeBytes: 10, createdAt: new Date().toISOString() },
        duplicate: false,
      }), { status: 201 });
    });

    const res = await post('/api/settings/relay/escrow-upload', { switchId: escrowSwitchId });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.payload);
    expect(result.relayPacketId).toBe('9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d');
    expect(result.releaseKey).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/api/relay/packets');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer relay-secret-key');
    const body = RelayPacketUploadSchema.parse(JSON.parse(String(init.body)));
    expect(body.relayConnectionId).toBe(CONNECTION_ID);
    expect(body.envelope.sourceApp).toBe('aegis_core');

    // The returned key opens the uploaded bytes (IV|tag|ciphertext).
    const wire = Buffer.from(body.encryptedData, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(result.releaseKey, 'base64'), wire.subarray(0, 12));
    decipher.setAuthTag(wire.subarray(12, 28));
    const plain = JSON.parse(Buffer.concat([decipher.update(wire.subarray(28)), decipher.final()]).toString('utf8'));
    expect(JSON.stringify(plain)).toContain('Checking');

    // The key never appears in the audit trail.
    const events = await app.db.select().from(auditEvents).where(eq(auditEvents.eventType, 'relay_packet_uploaded'));
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0].metadata)).not.toContain(result.releaseKey);
  });

  it('refuses switches that are not in relay_escrow mode', async () => {
    const res = await post('/api/settings/relay/escrow-upload', { switchId: vaultSwitchId });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.payload).error).toBe('switch_not_relay_escrow');
  });

  it('maps Relay errors to clear responses without leaking the key', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"subscription_required"}', { status: 403 }));
    const res = await post('/api/settings/relay/escrow-upload', { switchId: escrowSwitchId });
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.payload)).toEqual({ error: 'relay_rejected', status: 403, relayError: 'subscription_required' });
    expect(res.payload).not.toContain('relay-secret-key');
  });
});
