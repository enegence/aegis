import { eq } from 'drizzle-orm';
import type { AegisDb } from '../db/index.js';
import { appSettings, switches, packets } from '../db/schema.js';
import { decryptField } from './field-encrypt.js';
import { buildPacket } from './packet-builder.js';
import { listPacketsBySwitchId, updatePacketStorage } from '../repositories/packet-repository.js';
import { S3StorageProvider } from './storage/s3-storage.js';
import { deserializeEncryptedPacket } from './packet-crypto.js';
import { writeAuditEvent } from './audit.js';
import { readFileSync, existsSync } from 'fs';

const DEAD_DROP_MODES = new Set(['dead_drop', 'relay_monitoring', 'relay_escrow']);
const STALE_HOURS = 24;

export interface DeadDropSyncResult {
  switchId: number;
  skipped: boolean;
  skipReason?: string;
  packetId?: number;
  uploaded?: boolean;
  verified?: boolean;
  error?: string;
}

interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  prefix?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

async function loadS3Config(
  db: AegisDb,
  fieldEncryptionKey: string,
): Promise<S3Config | null> {
  const rows = await db.select().from(appSettings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row.value) map[row.key] = row.value;
  }

  const region = map['s3_region'];
  const bucket = map['s3_bucket'];
  const accessKeyIdEnc = map['s3_access_key_id_encrypted'];
  const legacyAccessKeyId = map['s3_access_key_id'];
  const secretKeyEnc = map['s3_secret_access_key_encrypted'];

  if (!region || !bucket || (!accessKeyIdEnc && !legacyAccessKeyId) || !secretKeyEnc) return null;

  const accessKeyId = accessKeyIdEnc
    ? decryptField(accessKeyIdEnc, fieldEncryptionKey)
    : legacyAccessKeyId;
  const secretAccessKey = decryptField(secretKeyEnc, fieldEncryptionKey);
  if (!accessKeyId || !secretAccessKey) return null;

  return {
    endpoint: map['s3_endpoint'] || undefined,
    region,
    bucket,
    prefix: map['s3_prefix'] || undefined,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: map['s3_force_path_style'] === 'true',
  };
}

function isStale(
  switchRow: typeof switches.$inferSelect,
  latestPacket: { createdAt: Date; lastVerifiedAt: Date | null; storageObjectKey: string | null } | null,
): boolean {
  if (!latestPacket) return true;
  if (!latestPacket.storageObjectKey) return true;
  if (switchRow.updatedAt > latestPacket.createdAt) return true;
  if (!latestPacket.lastVerifiedAt) return true;
  const ageMs = Date.now() - latestPacket.lastVerifiedAt.getTime();
  return ageMs > STALE_HOURS * 3600 * 1000;
}

export async function syncPacketForSwitch(
  db: AegisDb,
  switchId: number,
  fieldEncryptionKey: string,
  dataDir: string,
): Promise<DeadDropSyncResult> {
  const swRows = await db.select().from(switches).where(eq(switches.id, switchId));
  const sw = swRows[0];
  if (!sw) return { switchId, skipped: true, skipReason: 'switch not found' };

  if (!DEAD_DROP_MODES.has(sw.deploymentMode)) {
    return { switchId, skipped: true, skipReason: `deployment mode ${sw.deploymentMode} does not use Packet Mirror` };
  }

  if (sw.status !== 'armed' && sw.status !== 'warning') {
    return { switchId, skipped: true, skipReason: `switch status ${sw.status} is not eligible for sync` };
  }

  const s3Config = await loadS3Config(db, fieldEncryptionKey);
  if (!s3Config) {
    return { switchId, skipped: true, skipReason: 'S3 not configured' };
  }

  const existingPackets = await listPacketsBySwitchId(db, switchId);
  const latest = existingPackets[0] ?? null;

  let packetRecord = latest;
  if (isStale(sw, latest)) {
    try {
      packetRecord = await buildPacket(db, fieldEncryptionKey, dataDir, switchId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await writeAuditEvent(db, {
        switchId,
        eventType: 'packet_generated',
        actorType: 'system',
        metadata: { error: msg },
      });
      return { switchId, skipped: false, error: `packet generation failed: ${msg}` };
    }
  }

  if (!packetRecord) {
    return { switchId, skipped: false, error: 'no packet available after generation attempt' };
  }

  const ciphertextPath = packetRecord.localCiphertextPath;
  if (!ciphertextPath || !existsSync(ciphertextPath)) {
    return { switchId, skipped: false, packetId: packetRecord.id, error: 'ciphertext file missing' };
  }

  const fileData = readFileSync(ciphertextPath);
  const { ciphertext } = deserializeEncryptedPacket(fileData);

  const provider = new S3StorageProvider(s3Config);
  let uploadResult;
  try {
    uploadResult = await provider.uploadPacket({
      switchId,
      packetId: packetRecord.id,
      version: packetRecord.version,
      encryptedBytes: fileData,
      encryptedObjectHash: packetRecord.encryptedObjectHash ?? '',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeAuditEvent(db, {
      switchId,
      eventType: 'packet_uploaded',
      actorType: 'system',
      metadata: { error: msg },
    });
    return { switchId, skipped: false, packetId: packetRecord.id, uploaded: false, error: `upload failed: ${msg}` };
  }

  const verifyResult = await provider.verifyPacket({
    objectKey: uploadResult.objectKey,
    expectedSizeBytes: fileData.length,
  });

  await updatePacketStorage(db, packetRecord.id, {
    storageProvider: 's3',
    storageBucket: s3Config.bucket,
    storageObjectKey: uploadResult.objectKey,
    storageRegion: s3Config.region,
    storageVersionId: uploadResult.versionId,
  });

  if (verifyResult.ok) {
    await db
      .update(packets)
      .set({ lastVerifiedAt: new Date() })
      .where(eq(packets.id, packetRecord.id));
  }

  await db
    .update(switches)
    .set({ lastPacketSyncAt: new Date() })
    .where(eq(switches.id, switchId));

  await writeAuditEvent(db, {
    switchId,
    eventType: 'packet_uploaded',
    actorType: 'system',
    metadata: {
      packetId: packetRecord.id,
      objectKey: uploadResult.objectKey,
      verified: verifyResult.ok,
    },
  });

  // Suppress linting on ciphertext — used for length check only, not logged
  void ciphertext;

  return {
    switchId,
    skipped: false,
    packetId: packetRecord.id,
    uploaded: true,
    verified: verifyResult.ok,
  };
}
