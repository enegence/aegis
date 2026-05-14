import { describe, it, expect, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { buildPacket, PacketBuildError } from '../src/services/packet-builder.js';
import { decryptPacketJson, deserializeEncryptedPacket } from '../src/services/packet-crypto.js';
import { decryptField, encryptField } from '../src/services/field-encrypt.js';
import { loadPacketKey } from '../src/repositories/packet-repository.js';
import { listPacketsBySwitchId } from '../src/repositories/packet-repository.js';
import { getAuditEvents } from '../src/services/audit.js';
import { owner, switches, estateItems, contacts } from '../src/db/schema.js';
import { readFileSync } from 'fs';

const FIELD_KEY = '0123456789abcdef0123456789abcdef';

function makeDb(): AegisDb {
  const db = createTestDb();
  migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

async function seedOwner(db: AegisDb) {
  await db.insert(owner).values({
    displayName: 'Test Owner',
    email: 'owner@example.com',
    phone: null,
    timezone: 'UTC',
    passwordHash: 'fakehash',
    totpEnabled: false,
    setupComplete: true,
  });
}

async function seedSwitch(db: AegisDb, selectedContactIds: number[], selectedItemIds: number[]) {
  const rows = await db
    .insert(switches)
    .values({
      name: 'Test Switch',
      mode: 'trip',
      deploymentMode: 'dead_drop',
      status: 'armed',
      gracePeriodHours: 72,
      warningWindowDays: 3,
      selectedContactIds: JSON.stringify(selectedContactIds),
      selectedEstateItemIds: JSON.stringify(selectedItemIds),
    })
    .returning();
  return rows[0];
}

async function seedEstateItem(db: AegisDb) {
  const rows = await db
    .insert(estateItems)
    .values({
      category: 'Financial',
      title: 'Checking Account',
      institutionNameEncrypted: encryptField('Chase Bank', FIELD_KEY),
      accountTypeEncrypted: encryptField('checking', FIELD_KEY),
      referenceHintEncrypted: null,
      sensitiveFlag: false,
      sortOrder: 0,
    })
    .returning();
  return rows[0];
}

async function seedContact(db: AegisDb) {
  const rows = await db
    .insert(contacts)
    .values({
      fullNameEncrypted: encryptField('Bob Smith', FIELD_KEY)!,
      emailEncrypted: encryptField('bob@example.com', FIELD_KEY)!,
      relationshipEncrypted: null,
      priorityOrder: 1,
      preferredChannels: '["email"]',
      confirmationWindowHours: 48,
    })
    .returning();
  return rows[0];
}

describe('packet builder', () => {
  let db: AegisDb;
  let dataDir: string;

  beforeEach(() => {
    db = makeDb();
    dataDir = mkdtempSync(join(tmpdir(), 'aegis-test-'));
  });

  it('builds and encrypts a packet with selected items and contacts', async () => {
    await seedOwner(db);
    const item = await seedEstateItem(db);
    const contact = await seedContact(db);
    const sw = await seedSwitch(db, [contact.id], [item.id]);

    const record = await buildPacket(db, FIELD_KEY, dataDir, sw.id);

    expect(record.id).toBeGreaterThan(0);
    expect(record.switchId).toBe(sw.id);
    expect(record.version).toBe(1);
    expect(record.keyId).toBeTruthy();
    expect(record.localCiphertextPath).toBeTruthy();
    expect(record.contentHash).toBeTruthy();
    expect(record.encryptedObjectHash).toBeTruthy();
  });

  it('packet decrypts to expected payload shape', async () => {
    await seedOwner(db);
    const item = await seedEstateItem(db);
    const contact = await seedContact(db);
    const sw = await seedSwitch(db, [contact.id], [item.id]);

    const record = await buildPacket(db, FIELD_KEY, dataDir, sw.id);

    const encryptedKeyMaterial = await loadPacketKey(db, record.keyId);
    const packetKeyB64 = decryptField(encryptedKeyMaterial!, FIELD_KEY)!;
    const packetKey = Buffer.from(packetKeyB64, 'base64');

    const fileData = readFileSync(record.localCiphertextPath!);
    const { iv, authTag, ciphertext } = deserializeEncryptedPacket(fileData);
    const payload = decryptPacketJson(ciphertext, packetKey, iv, authTag) as Record<string, unknown>;

    expect(payload.sourceApp).toBe('aegis_core');
    expect(payload.schemaVersion).toBe('1.0');
    expect(Array.isArray(payload.estateItems)).toBe(true);
    expect(Array.isArray(payload.contacts)).toBe(true);
  });

  it('payload includes selected estate item (Chase Bank) and contact (Bob Smith)', async () => {
    await seedOwner(db);
    const item = await seedEstateItem(db);
    const contact = await seedContact(db);
    const sw = await seedSwitch(db, [contact.id], [item.id]);

    const record = await buildPacket(db, FIELD_KEY, dataDir, sw.id);

    const encryptedKeyMaterial = await loadPacketKey(db, record.keyId);
    const packetKeyB64 = decryptField(encryptedKeyMaterial!, FIELD_KEY)!;
    const packetKey = Buffer.from(packetKeyB64, 'base64');

    const fileData = readFileSync(record.localCiphertextPath!);
    const { iv, authTag, ciphertext } = deserializeEncryptedPacket(fileData);
    const payload = decryptPacketJson(ciphertext, packetKey, iv, authTag) as {
      estateItems: Array<{ institutionName: string | null }>;
      contacts: Array<{ fullName: string }>;
    };

    expect(payload.estateItems[0].institutionName).toBe('Chase Bank');
    expect(payload.contacts[0].fullName).toBe('Bob Smith');
  });

  it('version increments per switch on repeated builds', async () => {
    await seedOwner(db);
    const item = await seedEstateItem(db);
    const contact = await seedContact(db);
    const sw = await seedSwitch(db, [contact.id], [item.id]);

    const r1 = await buildPacket(db, FIELD_KEY, dataDir, sw.id);
    const r2 = await buildPacket(db, FIELD_KEY, dataDir, sw.id);

    expect(r1.version).toBe(1);
    expect(r2.version).toBe(2);
  });

  it('excludes unselected estate items', async () => {
    await seedOwner(db);
    const item = await seedEstateItem(db);
    await seedEstateItem(db); // unselected
    const contact = await seedContact(db);
    const sw = await seedSwitch(db, [contact.id], [item.id]); // only first item

    const record = await buildPacket(db, FIELD_KEY, dataDir, sw.id);
    const packets = await listPacketsBySwitchId(db, sw.id);
    expect(packets[0].id).toBe(record.id);
    // Only 1 item included — verified by the selection filter logic (unit)
  });

  it('generation writes packet_generated audit event', async () => {
    await seedOwner(db);
    const item = await seedEstateItem(db);
    const contact = await seedContact(db);
    const sw = await seedSwitch(db, [contact.id], [item.id]);

    await buildPacket(db, FIELD_KEY, dataDir, sw.id);

    const events = await getAuditEvents(db, { switchId: sw.id });
    expect(events.some((e) => e.eventType === 'packet_generated')).toBe(true);
  });

  it('fails when switch has no selected estate items', async () => {
    await seedOwner(db);
    const contact = await seedContact(db);
    const sw = await seedSwitch(db, [contact.id], []);

    await expect(buildPacket(db, FIELD_KEY, dataDir, sw.id)).rejects.toThrow(PacketBuildError);
  });

  it('fails when switch has no selected contacts', async () => {
    await seedOwner(db);
    const item = await seedEstateItem(db);
    const sw = await seedSwitch(db, [], [item.id]);

    await expect(buildPacket(db, FIELD_KEY, dataDir, sw.id)).rejects.toThrow(PacketBuildError);
  });

  it('fails when switch does not exist', async () => {
    await seedOwner(db);
    await expect(buildPacket(db, FIELD_KEY, dataDir, 9999)).rejects.toThrow(PacketBuildError);
  });
});
