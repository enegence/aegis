import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { syncPacketForSwitch } from '../src/services/dead-drop-sync.js';
import { encryptField } from '../src/services/field-encrypt.js';
import { appSettings, owner, switches, contacts, estateItems } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

// Mock S3 client so we don't make real network calls
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn((args) => ({ _type: 'PutObject', ...args })),
    HeadObjectCommand: vi.fn((args) => ({ _type: 'HeadObject', ...args })),
    GetObjectCommand: vi.fn((args) => ({ _type: 'GetObject', ...args })),
    DeleteObjectCommand: vi.fn((args) => ({ _type: 'DeleteObject', ...args })),
    __mockSend: mockSend,
  };
});

const FIELD_KEY = 'dev-field-key-change-me-32bytes!!';

function makeDb(): AegisDb {
  const db = createTestDb();
  migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

async function seedBase(db: AegisDb, deploymentMode = 'dead_drop') {
  await db.insert(owner).values({
    displayName: 'Test', email: 'test@example.com', phone: null,
    timezone: 'UTC', passwordHash: 'x', totpEnabled: false, setupComplete: true,
  });

  await db.insert(contacts).values({
    fullNameEncrypted: encryptField('Bob', FIELD_KEY)!,
    emailEncrypted: encryptField('bob@x.com', FIELD_KEY)!,
    priorityOrder: 1, preferredChannels: '["email"]', confirmationWindowHours: 48,
  });

  await db.insert(estateItems).values({
    category: 'Financial', title: 'Account',
    institutionNameEncrypted: encryptField('Bank', FIELD_KEY),
    sensitiveFlag: false, sortOrder: 0,
  });

  const swRows = await db.insert(switches).values({
    name: 'Test Switch', mode: 'trip',
    deploymentMode,
    status: 'armed',
    gracePeriodHours: 72, warningWindowDays: 3,
    selectedContactIds: '[1]',
    selectedEstateItemIds: '[1]',
  }).returning();

  return swRows[0];
}

async function seedS3Settings(db: AegisDb) {
  const settings = [
    { key: 's3_region', value: 'us-east-1' },
    { key: 's3_bucket', value: 'test-bucket' },
    { key: 's3_access_key_id_encrypted', value: encryptField('test-key', FIELD_KEY)! },
    { key: 's3_secret_access_key_encrypted', value: encryptField('test-secret', FIELD_KEY)! },
  ];
  for (const s of settings) {
    await db.insert(appSettings).values({ key: s.key, value: s.value, encrypted: false });
  }
}

describe('syncPacketForSwitch', () => {
  let db: AegisDb;
  let dataDir: string;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = makeDb();
    dataDir = mkdtempSync(join(tmpdir(), 'aegis-sync-test-'));
    const mod = await import('@aws-sdk/client-s3');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSend = (mod as any).__mockSend as ReturnType<typeof vi.fn>;
    mockSend.mockReset();
  });

  it('skips vault mode switches', async () => {
    await seedBase(db, 'vault');
    const result = await syncPacketForSwitch(db, 1, FIELD_KEY, dataDir);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('vault');
  });

  it('skips when S3 not configured', async () => {
    await seedBase(db, 'dead_drop');
    // No S3 settings inserted
    const result = await syncPacketForSwitch(db, 1, FIELD_KEY, dataDir);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('S3 not configured');
  });

  it('generates and uploads packet for armed dead_drop switch', async () => {
    await seedBase(db, 'dead_drop');
    await seedS3Settings(db);
    // Mock S3: PutObject, then HeadObject
    mockSend
      .mockResolvedValueOnce({ ETag: '"abc"' })  // PutObject
      .mockResolvedValueOnce({ ContentLength: 999 }); // HeadObject (size won't match but that's ok for test)

    const result = await syncPacketForSwitch(db, 1, FIELD_KEY, dataDir);
    expect(result.skipped).toBe(false);
    expect(result.uploaded).toBe(true);
    expect(result.packetId).toBeGreaterThan(0);
  });

  it('does not fail when upload fails', async () => {
    await seedBase(db, 'dead_drop');
    await seedS3Settings(db);
    mockSend.mockRejectedValueOnce(new Error('network error'));

    const result = await syncPacketForSwitch(db, 1, FIELD_KEY, dataDir);
    expect(result.skipped).toBe(false);
    expect(result.uploaded).toBe(false);
    expect(result.error).toContain('upload failed');
  });

  it('updates lastPacketSyncAt on success', async () => {
    await seedBase(db, 'dead_drop');
    await seedS3Settings(db);
    mockSend
      .mockResolvedValueOnce({ ETag: '"abc"' })
      .mockResolvedValueOnce({ ContentLength: 999 });

    await syncPacketForSwitch(db, 1, FIELD_KEY, dataDir);

    const swRows = await db.select().from(switches).where(eq(switches.id, 1));
    expect(swRows[0].lastPacketSyncAt).toBeTruthy();
  });

  it('skips non-existent switch', async () => {
    const result = await syncPacketForSwitch(db, 9999, FIELD_KEY, dataDir);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('not found');
  });
});
