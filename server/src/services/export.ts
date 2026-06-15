/**
 * Aegis OSS — Export / Restore Service
 *
 * Creates and decrypts encrypted export bundles. The bundle format is:
 *   {
 *     schemaVersion: "aegis-export-2026-05-01",
 *     createdAt: ISO string,
 *     appVersion: string,
 *     encryption: { algorithm, kdf, salt, iv, authTag },
 *     payloadHash: sha256 hex of plaintext payload,
 *     encryptedPayload: hex
 *   }
 *
 * Key derivation: argon2id (moderate cost for export — not auth-level paranoid).
 * Encryption: AES-256-GCM.
 */

import argon2 from 'argon2';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import type { AegisDb } from '../db/index.js';
import {
  owner,
  estateItems,
  contacts,
  switches,
  releaseRuns,
  auditEvents,
  appSettings,
  packets,
} from '../db/schema.js';
import { decryptField } from './field-encrypt.js';
import { APP_VERSION } from '../version.js';

export const EXPORT_SCHEMA_VERSION = 'aegis-export-2026-05-01';
const ALGORITHM = 'aes-256-gcm';

export interface ExportBundle {
  schemaVersion: string;
  createdAt: string;
  appVersion: string;
  encryption: {
    algorithm: string;
    kdf: string;
    salt: string;
    iv: string;
    authTag: string;
  };
  payloadHash: string;
  encryptedPayload: string;
}

export interface ExportPayload {
  owner: {
    displayName: string;
    email: string;
    phone: string | null;
    timezone: string;
    totpEnabled: boolean;
    createdAt: string;
  };
  estateItems: Array<{
    id: number;
    category: string;
    title: string;
    institutionName: string | null;
    accountType: string | null;
    referenceHint: string | null;
    assetDescription: string | null;
    locationNotes: string | null;
    executorNotes: string | null;
    sensitiveFlag: boolean;
    sortOrder: number;
    createdAt: string;
  }>;
  contacts: Array<{
    id: number;
    fullName: string;
    relationship: string | null;
    priorityOrder: number;
    email: string;
    phone: string | null;
    telegramHandle: string | null;
    preferredChannels: string;
    confirmationWindowHours: number;
    backupNotes: string | null;
    createdAt: string;
  }>;
  switches: Array<{
    id: number;
    name: string;
    mode: string;
    deploymentMode: string;
    status: string;
    gracePeriodHours: number;
    warningWindowDays: number;
    createdAt: string;
  }>;
  packetsMeta: Array<{
    id: number;
    switchId: number;
    version: number;
    schemaVersion: string;
    encryptionAlgorithm: string;
    createdAt: string;
  }>;
  releaseRunsMeta: Array<{
    id: number;
    triggeringSwitchId: number;
    status: string;
    startedAt: string;
    completedAt: string | null;
  }>;
  auditEventsMeta: Array<{
    id: number;
    eventType: string;
    actorType: string;
    createdAt: string;
  }>;
  settings?: Array<{ key: string; value: string | null; encrypted: boolean }>;
  exportedAt: string;
}

/** Derive a 32-byte AES key from a passphrase using argon2id. */
async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  // argon2.hash with raw:true and type argon2id gives us the raw key bytes
  const hash = await argon2.hash(passphrase, {
    type: argon2.argon2id,
    salt,
    hashLength: 32,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    raw: true,
  });
  return hash as unknown as Buffer;
}

/** Build an encrypted export bundle from plaintext payload. */
export async function buildExportBundle(
  payload: ExportPayload,
  passphrase: string,
): Promise<ExportBundle> {
  const plaintext = JSON.stringify(payload);
  const payloadHash = createHash('sha256').update(plaintext).digest('hex');

  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    encryption: {
      algorithm: ALGORITHM,
      kdf: 'argon2id',
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    },
    payloadHash,
    encryptedPayload: encrypted.toString('hex'),
  };
}

/** Decrypt an export bundle with the provided passphrase. Returns the payload. */
export async function decryptExportBundle(
  bundle: ExportBundle,
  passphrase: string,
): Promise<ExportPayload> {
  if (bundle.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${bundle.schemaVersion}`);
  }

  const salt = Buffer.from(bundle.encryption.salt, 'hex');
  const iv = Buffer.from(bundle.encryption.iv, 'hex');
  const authTag = Buffer.from(bundle.encryption.authTag, 'hex');
  const encryptedData = Buffer.from(bundle.encryptedPayload, 'hex');

  const key = await deriveKey(passphrase, salt);

  let plaintext: string;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    plaintext = decrypted.toString('utf8');
  } catch {
    throw new Error('Decryption failed — incorrect passphrase or corrupted bundle');
  }

  // Verify hash
  const actualHash = createHash('sha256').update(plaintext).digest('hex');
  if (actualHash !== bundle.payloadHash) {
    throw new Error('Payload hash mismatch — bundle may be corrupted');
  }

  return JSON.parse(plaintext) as ExportPayload;
}

/** Gather all exportable data from the DB, decrypting fields for re-encryption. */
export async function gatherExportPayload(
  db: AegisDb,
  fieldKey: string,
  includeConfig: boolean,
): Promise<ExportPayload> {
  const [ownerRow] = await db.select().from(owner).limit(1);
  if (!ownerRow) {
    throw new Error('No owner found');
  }

  const estateRows = await db.select().from(estateItems);
  const contactRows = await db.select().from(contacts);
  const switchRows = await db.select().from(switches);
  const packetRows = await db.select().from(packets);
  const releaseRunRows = await db.select().from(releaseRuns);
  const auditRows = await db.select().from(auditEvents);

  const exportedOwner: ExportPayload['owner'] = {
    displayName: ownerRow.displayName,
    email: ownerRow.email,
    phone: ownerRow.phone ?? null,
    timezone: ownerRow.timezone,
    totpEnabled: ownerRow.totpEnabled,
    createdAt: ownerRow.createdAt instanceof Date
      ? ownerRow.createdAt.toISOString()
      : String(ownerRow.createdAt),
  };

  const exportedEstateItems = estateRows.map(item => ({
    id: item.id,
    category: item.category,
    title: item.title,
    institutionName: decryptField(item.institutionNameEncrypted ?? null, fieldKey),
    accountType: decryptField(item.accountTypeEncrypted ?? null, fieldKey),
    referenceHint: decryptField(item.referenceHintEncrypted ?? null, fieldKey),
    assetDescription: decryptField(item.assetDescriptionEncrypted ?? null, fieldKey),
    locationNotes: decryptField(item.locationNotesEncrypted ?? null, fieldKey),
    executorNotes: decryptField(item.executorNotesEncrypted ?? null, fieldKey),
    sensitiveFlag: item.sensitiveFlag,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt instanceof Date
      ? item.createdAt.toISOString()
      : String(item.createdAt),
  }));

  const exportedContacts = contactRows.map(c => ({
    id: c.id,
    fullName: decryptField(c.fullNameEncrypted, fieldKey) ?? '',
    relationship: decryptField(c.relationshipEncrypted ?? null, fieldKey),
    priorityOrder: c.priorityOrder,
    email: decryptField(c.emailEncrypted, fieldKey) ?? '',
    phone: decryptField(c.phoneEncrypted ?? null, fieldKey),
    telegramHandle: decryptField(c.telegramHandleEncrypted ?? null, fieldKey),
    preferredChannels: c.preferredChannels,
    confirmationWindowHours: c.confirmationWindowHours,
    backupNotes: decryptField(c.backupNotesEncrypted ?? null, fieldKey),
    createdAt: c.createdAt instanceof Date
      ? c.createdAt.toISOString()
      : String(c.createdAt),
  }));

  const exportedSwitches = switchRows.map(s => ({
    id: s.id,
    name: s.name,
    mode: s.mode,
    deploymentMode: s.deploymentMode,
    status: s.status,
    gracePeriodHours: s.gracePeriodHours,
    warningWindowDays: s.warningWindowDays,
    createdAt: s.createdAt instanceof Date
      ? s.createdAt.toISOString()
      : String(s.createdAt),
  }));

  const exportedPacketsMeta = packetRows.map(p => ({
    id: p.id,
    switchId: p.switchId,
    version: p.version,
    schemaVersion: p.schemaVersion,
    encryptionAlgorithm: p.encryptionAlgorithm,
    createdAt: p.createdAt instanceof Date
      ? p.createdAt.toISOString()
      : String(p.createdAt),
  }));

  const exportedReleaseRunsMeta = releaseRunRows.map(r => ({
    id: r.id,
    triggeringSwitchId: r.triggeringSwitchId,
    status: r.status,
    startedAt: r.startedAt instanceof Date
      ? r.startedAt.toISOString()
      : String(r.startedAt),
    completedAt: r.completedAt instanceof Date
      ? r.completedAt.toISOString()
      : r.completedAt
        ? String(r.completedAt)
        : null,
  }));

  const exportedAuditMeta = auditRows.map(a => ({
    id: a.id,
    eventType: a.eventType,
    actorType: a.actorType,
    createdAt: a.createdAt instanceof Date
      ? a.createdAt.toISOString()
      : String(a.createdAt),
  }));

  let exportedSettings: ExportPayload['settings'];
  if (includeConfig) {
    const settingRows = await db.select().from(appSettings);
    // Export settings keys but exclude raw storage credentials
    exportedSettings = settingRows
      .filter(s => !['s3_access_key_id_encrypted', 's3_secret_access_key_encrypted'].includes(s.key))
      .map(s => ({
        key: s.key,
        value: s.encrypted ? '[ENCRYPTED — NOT EXPORTED]' : (s.value ?? null),
        encrypted: s.encrypted,
      }));
  }

  return {
    owner: exportedOwner,
    estateItems: exportedEstateItems,
    contacts: exportedContacts,
    switches: exportedSwitches,
    packetsMeta: exportedPacketsMeta,
    releaseRunsMeta: exportedReleaseRunsMeta,
    auditEventsMeta: exportedAuditMeta,
    settings: exportedSettings,
    exportedAt: new Date().toISOString(),
  };
}
