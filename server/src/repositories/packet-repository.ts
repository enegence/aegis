import { eq, desc, max } from 'drizzle-orm';
import { packets, encryptionKeys } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';

export interface PacketRecord {
  id: number;
  switchId: number;
  releaseRunId: number | null;
  version: number;
  schemaVersion: string;
  encryptionAlgorithm: string;
  keyId: string;
  contentHash: string;
  encryptedObjectHash: string | null;
  localCiphertextPath: string | null;
  storageProvider: string | null;
  storageBucket: string | null;
  storageObjectKey: string | null;
  storageRegion: string | null;
  storageVersionId: string | null;
  deletionStatus: string | null;
  lastVerifiedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

function rowToRecord(row: typeof packets.$inferSelect): PacketRecord {
  return {
    id: row.id,
    switchId: row.switchId,
    releaseRunId: row.releaseRunId ?? null,
    version: row.version,
    schemaVersion: row.schemaVersion,
    encryptionAlgorithm: row.encryptionAlgorithm,
    keyId: row.keyId,
    contentHash: row.contentHash,
    encryptedObjectHash: row.encryptedObjectHash ?? null,
    localCiphertextPath: row.localCiphertextPath ?? null,
    storageProvider: row.storageProvider ?? null,
    storageBucket: row.storageBucket ?? null,
    storageObjectKey: row.storageObjectKey ?? null,
    storageRegion: row.storageRegion ?? null,
    storageVersionId: row.storageVersionId ?? null,
    deletionStatus: row.deletionStatus ?? null,
    lastVerifiedAt: row.lastVerifiedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt,
  };
}

export async function getNextPacketVersion(db: AegisDb, switchId: number): Promise<number> {
  const rows = await db
    .select({ maxVersion: max(packets.version) })
    .from(packets)
    .where(eq(packets.switchId, switchId));
  const current = rows[0]?.maxVersion ?? 0;
  return current + 1;
}

export async function createPacketRecord(
  db: AegisDb,
  data: {
    switchId: number;
    version: number;
    schemaVersion: string;
    encryptionAlgorithm: string;
    keyId: string;
    contentHash: string;
    encryptedObjectHash: string;
    localCiphertextPath: string;
    expiresAt?: Date;
  },
): Promise<PacketRecord> {
  const rows = await db.insert(packets).values(data).returning();
  return rowToRecord(rows[0]);
}

export async function getPacketById(db: AegisDb, id: number): Promise<PacketRecord | null> {
  const rows = await db.select().from(packets).where(eq(packets.id, id));
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function listPacketsBySwitchId(db: AegisDb, switchId: number): Promise<PacketRecord[]> {
  const rows = await db
    .select()
    .from(packets)
    .where(eq(packets.switchId, switchId))
    .orderBy(desc(packets.version));
  return rows.map(rowToRecord);
}

export async function updatePacketStorage(
  db: AegisDb,
  id: number,
  data: {
    storageProvider?: string;
    storageBucket?: string;
    storageObjectKey?: string;
    storageRegion?: string;
    storageVersionId?: string;
  },
): Promise<PacketRecord | null> {
  const rows = await db.update(packets).set(data).where(eq(packets.id, id)).returning();
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function storePacketKey(
  db: AegisDb,
  keyId: string,
  encryptedKeyMaterial: string,
): Promise<void> {
  await db
    .insert(encryptionKeys)
    .values({
      id: keyId,
      purpose: 'packet',
      keyMaterialEncrypted: encryptedKeyMaterial,
      algorithm: 'aes-256-gcm',
    })
    .onConflictDoNothing();
}

export async function loadPacketKey(
  db: AegisDb,
  keyId: string,
): Promise<string | null> {
  const rows = await db
    .select({ keyMaterialEncrypted: encryptionKeys.keyMaterialEncrypted })
    .from(encryptionKeys)
    .where(eq(encryptionKeys.id, keyId));
  return rows[0]?.keyMaterialEncrypted ?? null;
}
