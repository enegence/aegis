import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { runWorkerOnce } from '../src/worker/index.js';
import { startOrAttachReleaseRun } from '../src/services/release-run.js';
import {
  getReleaseRunById,
  setActivePacket,
} from '../src/repositories/release-run-repository.js';
import { listClaimsForRun } from '../src/repositories/contact-claim-repository.js';
import { createSwitch } from '../src/services/switch-repository.js';
import { encryptField } from '../src/services/field-encrypt.js';
import { owner, contacts, switches, packets } from '../src/db/schema.js';

vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

const FIELD_KEY = 'dev-field-key-change-me-32bytes!!';
const APP_URL = 'http://localhost:8000';
const SYNC_CONFIG = { fieldEncryptionKey: FIELD_KEY, dataDir: './data', appUrl: APP_URL };

function makeDb(): AegisDb {
  const db = createTestDb();
  migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

async function seedBase(db: AegisDb) {
  await db.insert(owner).values({
    displayName: 'Owner', email: 'owner@x.com', phone: null,
    timezone: 'UTC', passwordHash: 'x', totpEnabled: false, setupComplete: true,
  });
  const [c1] = await db.insert(contacts).values({
    fullNameEncrypted: encryptField('Alice', FIELD_KEY)!,
    emailEncrypted: encryptField('alice@x.com', FIELD_KEY)!,
    priorityOrder: 1, preferredChannels: '["email"]', confirmationWindowHours: 24,
  }).returning();
  const [c2] = await db.insert(contacts).values({
    fullNameEncrypted: encryptField('Bob', FIELD_KEY)!,
    emailEncrypted: encryptField('bob@x.com', FIELD_KEY)!,
    priorityOrder: 2, preferredChannels: '["email"]', confirmationWindowHours: 24,
  }).returning();

  const sw = await createSwitch(db, {
    name: 'Switch', mode: 'trip',
    triggerAt: new Date(Date.now() + 86400000),
    selectedContactIds: [c1.id, c2.id],
  });
  return { c1, c2, sw };
}

async function seedPacket(db: AegisDb, switchId: number, runId: number) {
  const [pkt] = await db.insert(packets).values({
    switchId, releaseRunId: runId, version: 1,
    keyId: `key-${Date.now()}`, contentHash: 'abc', encryptedObjectHash: 'def',
  }).returning();
  return pkt;
}

describe('worker cascade integration', () => {
  let db: AegisDb;

  beforeEach(() => { db = makeDb(); });

  it('starts cascade when release run has active packet and no claim', async () => {
    const { sw } = await seedBase(db);
    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);

    await runWorkerOnce(db, new Date(), SYNC_CONFIG);

    const claims = await listClaimsForRun(db, run.id);
    expect(claims.length).toBe(1);
    expect(claims[0].status).toBe('notified');
  });

  it('does not create duplicate claims on second tick', async () => {
    const { sw } = await seedBase(db);
    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);

    await runWorkerOnce(db, new Date(), SYNC_CONFIG);
    await runWorkerOnce(db, new Date(), SYNC_CONFIG);

    const claims = await listClaimsForRun(db, run.id);
    expect(claims.length).toBe(1);
  });

  it('escalates timed-out claim to next contact', async () => {
    const { sw } = await seedBase(db);
    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);

    // Tick 1: starts cascade (notifies contact 1)
    await runWorkerOnce(db, new Date(), SYNC_CONFIG);
    const claimsAfterFirst = await listClaimsForRun(db, run.id);
    expect(claimsAfterFirst.length).toBe(1);

    // Tick 2 — 25h later: escalates to contact 2
    const future = new Date(Date.now() + 25 * 3600000);
    await runWorkerOnce(db, future, SYNC_CONFIG);

    const claimsAfterEscalation = await listClaimsForRun(db, run.id);
    expect(claimsAfterEscalation.length).toBe(2);
    expect(claimsAfterEscalation[0].status).toBe('escalated');
    expect(claimsAfterEscalation[1].status).toBe('notified');
  });

  it('fails run when all contacts exhausted', async () => {
    // Single-contact switch
    await db.insert(owner).values({
      displayName: 'Owner2', email: 'o2@x.com', phone: null,
      timezone: 'UTC', passwordHash: 'x', totpEnabled: false, setupComplete: true,
    });
    const [c] = await db.insert(contacts).values({
      fullNameEncrypted: encryptField('Solo', FIELD_KEY)!,
      emailEncrypted: encryptField('solo@x.com', FIELD_KEY)!,
      priorityOrder: 1, preferredChannels: '["email"]', confirmationWindowHours: 24,
    }).returning();
    const sw = await createSwitch(db, {
      name: 'Solo Switch', mode: 'trip',
      triggerAt: new Date(Date.now() + 86400000),
      selectedContactIds: [c.id],
    });

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);

    // Tick 1: starts cascade
    await runWorkerOnce(db, new Date(), SYNC_CONFIG);

    // Tick 2 — 25h later: one contact, run fails
    const future = new Date(Date.now() + 25 * 3600000);
    await runWorkerOnce(db, future, SYNC_CONFIG);

    const failedRun = await getReleaseRunById(db, run.id);
    expect(failedRun?.status).toBe('failed');
  });

  it('skips cascade when no active packet set', async () => {
    const { sw } = await seedBase(db);
    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    // No setActivePacket

    await runWorkerOnce(db, new Date(), SYNC_CONFIG);

    const claims = await listClaimsForRun(db, run.id);
    expect(claims.length).toBe(0);
  });
});
