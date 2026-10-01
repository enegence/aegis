/**
 * relay-client.ts — Aegis Core → Aegis Relay (SaaS) client.
 *
 * Sends periodic heartbeats so Relay Monitoring can tell when this instance
 * goes silent. Contract: POST {relayUrl}/api/relay/heartbeat with
 * `Authorization: Bearer <relay API key>` (never in the URL) and a body
 * matching HeartbeatSchema in packages/contracts/src/heartbeat.ts.
 *
 * Liveness on the SaaS side is receipt time + the interval hint we send, plus
 * a grace period. We send every RELAY_HEARTBEAT_INTERVAL_SECONDS and hint
 * three intervals, so a single missed tick never reads as offline.
 */

import { eq, inArray } from 'drizzle-orm';
import type { AegisDb } from '../db/index.js';
import { appSettings, switches } from '../db/schema.js';
import { decryptField } from './field-encrypt.js';

const parsedInterval = Number.parseInt(process.env.AEGIS_RELAY_HEARTBEAT_SECONDS ?? '300', 10);
export const RELAY_HEARTBEAT_INTERVAL_SECONDS = Number.isFinite(parsedInterval) && parsedInterval >= 60 ? parsedInterval : 300;
const INTERVAL_HINT_SECONDS = Math.min(RELAY_HEARTBEAT_INTERVAL_SECONDS * 3, 86400);
const REQUEST_TIMEOUT_MS = 10_000;

// Strongest mode wins when several switches are armed.
const MODE_RANK = ['vault', 'dead_drop', 'relay_monitoring', 'relay_escrow'] as const;
type Mode = (typeof MODE_RANK)[number];

export type HeartbeatResult =
  | { sent: true }
  | { sent: false; reason: 'not_linked' | 'not_due' | 'network_error' | `http_${number}` };

async function getSetting(db: AegisDb, key: string): Promise<string | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  return row?.value ?? null;
}

async function putSetting(db: AegisDb, key: string, value: string): Promise<void> {
  const now = new Date();
  const existing = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, key));
  if (existing.length > 0) {
    await db.update(appSettings).set({ value, encrypted: false, updatedAt: now }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, encrypted: false, updatedAt: now });
  }
}

/**
 * Normalize anything an owner or an older Relay might give us (base URL,
 * exchange URL, or heartbeat endpoint) to the Relay base URL.
 */
export function normalizeRelayBaseUrl(url: string): string {
  return url.trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/relay\/(link\/exchange|heartbeat)$/, '')
    .replace(/\/+$/, '');
}

export interface RelayCredentials {
  relayUrl: string;
  apiKey: string;
  connectionId: string;
}

/** Linked Relay credentials, or null when this instance is not linked. */
export async function getRelayCredentials(db: AegisDb, fieldEncryptionKey: string): Promise<RelayCredentials | null> {
  const [relayUrl, keyEnc, connectionId] = await Promise.all([
    getSetting(db, 'relay_url'),
    getSetting(db, 'relay_api_key_encrypted'),
    getSetting(db, 'relay_connection_id'),
  ]);
  if (!relayUrl || !keyEnc || !connectionId) return null;
  const apiKey = decryptField(keyEnc, fieldEncryptionKey);
  if (!apiKey) return null;
  return { relayUrl: normalizeRelayBaseUrl(relayUrl), apiKey, connectionId };
}

/** Build the contract body. Exported for the settings "test" button. */
export async function buildHeartbeatBody(db: AegisDb, connectionId: string, now: Date) {
  const live = await db.select({ deploymentMode: switches.deploymentMode }).from(switches)
    .where(inArray(switches.status, ['armed', 'warning']));
  let mode: Mode = 'relay_monitoring';
  let best = -1;
  for (const row of live) {
    const rank = MODE_RANK.indexOf(row.deploymentMode as Mode);
    if (rank > best) { best = rank; mode = MODE_RANK[rank]; }
  }
  return {
    version: 1 as const,
    relayConnectionId: connectionId,
    timestamp: now.toISOString(),
    mode,
    switchCount: live.length,
    metadata: { contractVersion: 1 as const, heartbeatIntervalSeconds: INTERVAL_HINT_SECONDS },
  };
}

export async function postHeartbeat(
  creds: RelayCredentials,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<HeartbeatResult> {
  try {
    const res = await fetchImpl(`${creds.relayUrl}/api/relay/heartbeat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return res.ok ? { sent: true } : { sent: false, reason: `http_${res.status}` };
  } catch {
    return { sent: false, reason: 'network_error' };
  }
}

/**
 * Called on every worker tick. Sends at most one heartbeat per interval.
 * Records `relay_last_heartbeat_at` on success and a redacted
 * `relay_last_heartbeat_error` code on failure (never the key or response body).
 */
export async function sendRelayHeartbeatIfDue(
  db: AegisDb,
  fieldEncryptionKey: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<HeartbeatResult> {
  const creds = await getRelayCredentials(db, fieldEncryptionKey);
  if (!creds) return { sent: false, reason: 'not_linked' };

  const last = await getSetting(db, 'relay_last_heartbeat_at');
  if (last && now.getTime() - Date.parse(last) < RELAY_HEARTBEAT_INTERVAL_SECONDS * 1000) {
    return { sent: false, reason: 'not_due' };
  }

  const result = await postHeartbeat(creds, await buildHeartbeatBody(db, creds.connectionId, now), fetchImpl);
  if (result.sent) {
    await putSetting(db, 'relay_last_heartbeat_at', now.toISOString());
    await putSetting(db, 'relay_last_heartbeat_error', '');
  } else {
    await putSetting(db, 'relay_last_heartbeat_error', result.reason);
  }
  return result;
}

// ── Relay Escrow packet upload ────────────────────────────────────────────────

export class RelayUploadError extends Error {
  constructor(
    public code: 'relay_not_linked' | 'switch_not_found' | 'switch_not_relay_escrow' | 'packet_unavailable' | 'relay_unreachable' | 'relay_rejected',
    public status?: number,
    public relayError?: string,
  ) {
    super(code);
  }
}

export interface EscrowUploadResult {
  relayPacketId: string;
  version: number;
  duplicate: boolean;
  keyId: string;
  /** Base64 AES-256 packet key. Shown to the owner once to escrow in Aegis Relay. */
  releaseKey: string;
}

/**
 * Build the switch's current packet and upload its ciphertext to Aegis Relay
 * (POST {relayUrl}/api/relay/packets, contract RelayPacketUploadSchema v1).
 * Returns the packet's base64 key so the owner can paste it into the Relay
 * escrow form; the SaaS never receives the key from this call.
 */
export async function uploadPacketForEscrow(
  deps: {
    db: AegisDb;
    fieldEncryptionKey: string;
    dataDir: string;
    buildPacket: (db: AegisDb, fek: string, dataDir: string, switchId: number) => Promise<{ id: number; keyId: string; contentHash: string; localCiphertextPath: string | null; createdAt: Date }>;
    loadPacketKey: (db: AegisDb, keyId: string) => Promise<string | null>;
    readFile: (path: string) => Buffer;
    fetchImpl?: typeof fetch;
  },
  switchId: number,
): Promise<EscrowUploadResult> {
  const { db, fieldEncryptionKey } = deps;
  const creds = await getRelayCredentials(db, fieldEncryptionKey);
  if (!creds) throw new RelayUploadError('relay_not_linked');

  const [sw] = await db.select({ id: switches.id, deploymentMode: switches.deploymentMode }).from(switches).where(eq(switches.id, switchId));
  if (!sw) throw new RelayUploadError('switch_not_found');
  if (sw.deploymentMode !== 'relay_escrow') throw new RelayUploadError('switch_not_relay_escrow');

  // Always build fresh so the escrowed packet matches current data.
  const packet = await deps.buildPacket(db, fieldEncryptionKey, deps.dataDir, switchId);
  if (!packet.localCiphertextPath) throw new RelayUploadError('packet_unavailable');
  const keyEnc = await deps.loadPacketKey(db, packet.keyId);
  const releaseKey = keyEnc ? decryptField(keyEnc, fieldEncryptionKey) : null;
  if (!releaseKey) throw new RelayUploadError('packet_unavailable');
  const bytes = deps.readFile(packet.localCiphertextPath);

  const body = {
    version: 1,
    relayConnectionId: creds.connectionId,
    envelope: {
      version: 1,
      // Core's per-packet keyId is a UUID and unique per packet.
      packetId: packet.keyId,
      sourceApp: 'aegis_core',
      encryptionAlgorithm: 'aes-256-gcm',
      keyId: packet.keyId,
      contentHash: packet.contentHash,
      createdAt: packet.createdAt.toISOString(),
    },
    encryptedData: bytes.toString('base64'),
  };

  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(`${creds.relayUrl}/api/relay/packets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new RelayUploadError('relay_unreachable');
  }
  const json = await res.json().catch(() => ({})) as { error?: unknown; packet?: { id?: string; version?: number }; duplicate?: boolean };
  if (!res.ok || !json.packet?.id) {
    const relayError = typeof json.error === 'string' ? json.error.slice(0, 80) : undefined;
    throw new RelayUploadError('relay_rejected', res.status, relayError);
  }
  return {
    relayPacketId: json.packet.id,
    version: json.packet.version ?? 1,
    duplicate: json.duplicate === true,
    keyId: packet.keyId,
    releaseKey,
  };
}
