/**
 * Aegis Core → Aegis Relay heartbeat sender.
 *
 * The SaaS route is POST {relayUrl}/api/relay/heartbeat with a Bearer API key
 * and a body matching the shared HeartbeatSchema contract. Without a sender,
 * Relay Monitoring never sees this instance.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { HeartbeatSchema } from '@aegis/contracts';
import { buildApp } from '../src/index.js';
import { appSettings, switches } from '../src/db/schema.js';
import { encryptField } from '../src/services/field-encrypt.js';
import { sendRelayHeartbeatIfDue, RELAY_HEARTBEAT_INTERVAL_SECONDS } from '../src/services/relay-client.js';

vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

const CONNECTION_ID = '0b1f6a3e-0c7c-4f7e-9d0a-2f6c5d4b3a21';

describe('relay heartbeat client', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
  });
  afterAll(() => app.close());

  async function setting(key: string) {
    const [row] = await app.db.select().from(appSettings).where(eq(appSettings.key, key));
    return row?.value ?? null;
  }

  it('does nothing when Relay is not linked', async () => {
    const fetchMock = vi.fn();
    const result = await sendRelayHeartbeatIfDue(app.db, app.config.fieldEncryptionKey, new Date(), fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ sent: false, reason: 'not_linked' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a contract-valid heartbeat to /api/relay/heartbeat with a Bearer key', async () => {
    const now = new Date('2030-01-01T00:00:00Z');
    await app.db.insert(appSettings).values([
      { key: 'relay_url', value: 'https://relay.example.com', encrypted: false, updatedAt: now },
      { key: 'relay_api_key_encrypted', value: encryptField('relay-secret-key', app.config.fieldEncryptionKey)!, encrypted: true, updatedAt: now },
      { key: 'relay_connection_id', value: CONNECTION_ID, encrypted: false, updatedAt: now },
    ]);
    await app.db.insert(switches).values([
      { name: 'Escrow switch', mode: 'heartbeat', deploymentMode: 'relay_escrow', status: 'armed', heartbeatIntervalDays: 7 },
      { name: 'Draft', mode: 'trip', deploymentMode: 'vault', status: 'draft' },
    ] as never);

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    const result = await sendRelayHeartbeatIfDue(app.db, app.config.fieldEncryptionKey, now, fetchMock as unknown as typeof fetch);
    expect(result.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/api/relay/heartbeat');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer relay-secret-key');
    expect(url).not.toContain('relay-secret-key');
    const body = HeartbeatSchema.parse(JSON.parse(String(init.body)));
    expect(body.relayConnectionId).toBe(CONNECTION_ID);
    expect(body.mode).toBe('relay_escrow');
    expect(body.switchCount).toBe(1);
    expect(body.metadata?.heartbeatIntervalSeconds).toBeGreaterThan(RELAY_HEARTBEAT_INTERVAL_SECONDS);
    expect(await setting('relay_last_heartbeat_at')).toBe(now.toISOString());
  });

  it('waits for the interval before sending again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const soon = new Date(Date.parse('2030-01-01T00:00:00Z') + 60_000);
    expect((await sendRelayHeartbeatIfDue(app.db, app.config.fieldEncryptionKey, soon, fetchMock as unknown as typeof fetch)).sent).toBe(false);
    const later = new Date(Date.parse('2030-01-01T00:00:00Z') + RELAY_HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect((await sendRelayHeartbeatIfDue(app.db, app.config.fieldEncryptionKey, later, fetchMock as unknown as typeof fetch)).sent).toBe(true);
  });

  it('records a redacted error and does not advance the timestamp when Relay rejects it', async () => {
    const before = await setting('relay_last_heartbeat_at');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":"subscription_required"}', { status: 403 }));
    const t = new Date(Date.parse('2030-01-02T00:00:00Z'));
    const result = await sendRelayHeartbeatIfDue(app.db, app.config.fieldEncryptionKey, t, fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ sent: false, reason: 'http_403' });
    expect(await setting('relay_last_heartbeat_at')).toBe(before);
    expect(await setting('relay_last_heartbeat_error')).toBe('http_403');
  });
});
