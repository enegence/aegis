import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { startCascade, checkAndEscalate } from '../src/services/cascade.js';
import { startOrAttachReleaseRun } from '../src/services/release-run.js';
import {
  getActiveReleaseRunFull,
  getReleaseRunById,
  setActivePacket,
} from '../src/repositories/release-run-repository.js';
import {
  listClaimsForRun,
  hashClaimToken,
} from '../src/repositories/contact-claim-repository.js';
import { createContactClaim } from '../src/repositories/contact-claim-repository.js';
import { createSwitch } from '../src/services/switch-repository.js';
import { getAuditEvents } from '../src/services/audit.js';
import { encryptField } from '../src/services/field-encrypt.js';
import { owner, contacts, packets } from '../src/db/schema.js';

// Mock notifications to avoid real SMTP/Telegram calls
vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
}));

import { dispatchNotification } from '../src/services/notifications.js';

const FIELD_KEY = 'dev-field-key-change-me-32bytes!!';
const APP_URL = 'http://localhost:8000';
const CASCADE_CONFIG = { appUrl: APP_URL, fieldEncryptionKey: FIELD_KEY };

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
    passwordHash: 'x',
    totpEnabled: false,
    setupComplete: true,
  });
}

async function seedContact(db: AegisDb, opts: { name: string; email: string; priority: number; windowHours?: number }) {
  const [row] = await db.insert(contacts).values({
    fullNameEncrypted: encryptField(opts.name, FIELD_KEY)!,
    emailEncrypted: encryptField(opts.email, FIELD_KEY)!,
    priorityOrder: opts.priority,
    preferredChannels: '["email"]',
    confirmationWindowHours: opts.windowHours ?? 48,
  }).returning();
  return row;
}

async function seedPacket(db: AegisDb, switchId: number, releaseRunId: number) {
  const [row] = await db.insert(packets).values({
    switchId,
    releaseRunId,
    version: 1,
    keyId: `key-${Date.now()}`,
    contentHash: 'abc123',
    encryptedObjectHash: 'def456',
  }).returning();
  return row;
}

async function seedSwitch(db: AegisDb, contactIds: number[]) {
  return createSwitch(db, {
    name: 'Test Switch',
    mode: 'trip',
    triggerAt: new Date(Date.now() + 86400000),
    selectedContactIds: contactIds,
  });
}

describe('startCascade', () => {
  let db: AegisDb;

  beforeEach(() => {
    db = makeDb();
    vi.mocked(dispatchNotification).mockClear();
  });

  it('starts cascade and creates claim for first contact by priority', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1 });
    const c2 = await seedContact(db, { name: 'Bob', email: 'bob@x.com', priority: 2 });
    const sw = await seedSwitch(db, [c1.id, c2.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);

    const result = await startCascade(db, CASCADE_CONFIG, run.id);

    expect(result.started).toBe(true);
    expect(result.alreadyRunning).toBe(false);
    expect(result.claimId).toBeGreaterThan(0);

    const claims = await listClaimsForRun(db, run.id);
    expect(claims).toHaveLength(1);
    expect(claims[0].contactId).toBe(c1.id);
    expect(claims[0].status).toBe('notified');
  });

  it('stores only token hash — not plaintext token', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1 });
    const sw = await seedSwitch(db, [c1.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);

    await startCascade(db, CASCADE_CONFIG, run.id);

    const claims = await listClaimsForRun(db, run.id);
    expect(claims).toHaveLength(1);

    // token hash should be a 64-char hex string (SHA-256)
    expect(claims[0].claimTokenHash).toMatch(/^[0-9a-f]{64}$/);

    // raw token should NOT equal the stored hash
    const notifyCall = vi.mocked(dispatchNotification).mock.calls[0];
    const claimUrl: string = (notifyCall[1] as any).body;
    const rawToken = claimUrl.split('/claim/')[1]?.split('\n')[0];
    expect(rawToken).not.toBe(claims[0].claimTokenHash);

    // verify: hash of raw token = stored hash
    expect(hashClaimToken(rawToken!)).toBe(claims[0].claimTokenHash);
  });

  it('sends notification with claim URL', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1 });
    const sw = await seedSwitch(db, [c1.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);

    await startCascade(db, CASCADE_CONFIG, run.id);

    expect(vi.mocked(dispatchNotification)).toHaveBeenCalledOnce();
    const call = vi.mocked(dispatchNotification).mock.calls[0][1];
    expect(call.body).toContain(`${APP_URL}/claim/`);
    expect(call.channel).toBe('email');
    expect(call.purpose).toBe('claim');
  });

  it('transitions run status to cascade_active', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1 });
    const sw = await seedSwitch(db, [c1.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);

    await startCascade(db, CASCADE_CONFIG, run.id);

    const updated = await getReleaseRunById(db, run.id);
    expect(updated?.status).toBe('cascade_active');
  });

  it('is idempotent — second call returns alreadyRunning=true', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1 });
    const sw = await seedSwitch(db, [c1.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);

    await startCascade(db, CASCADE_CONFIG, run.id);
    const second = await startCascade(db, CASCADE_CONFIG, run.id);

    expect(second.alreadyRunning).toBe(true);
    expect(second.started).toBe(false);
    const claims = await listClaimsForRun(db, run.id);
    expect(claims).toHaveLength(1);
  });

  it('skips cascade if no active packet', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1 });
    const sw = await seedSwitch(db, [c1.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    // Do NOT set activePacket

    const result = await startCascade(db, CASCADE_CONFIG, run.id);
    expect(result.started).toBe(false);
    expect(result.reason).toContain('no active packet');
  });

  it('cascade_started audit event has no PII', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1 });
    const sw = await seedSwitch(db, [c1.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);

    await startCascade(db, CASCADE_CONFIG, run.id);

    const events = await getAuditEvents(db, { switchId: sw.id });
    const event = events.find((e) => e.eventType === 'cascade_started');
    expect(event).toBeTruthy();

    const meta = JSON.stringify(event?.metadata ?? {});
    expect(meta).not.toContain('email');
    expect(meta).not.toContain('name');
    expect(meta).not.toContain('phone');
    expect(meta).not.toContain('alice');
    expect(meta).not.toContain('Alice');
  });
});

describe('checkAndEscalate', () => {
  let db: AegisDb;

  beforeEach(() => {
    db = makeDb();
    vi.mocked(dispatchNotification).mockClear();
  });

  it('does not escalate before timeout', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1, windowHours: 48 });
    const sw = await seedSwitch(db, [c1.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);
    await startCascade(db, CASCADE_CONFIG, run.id);

    const now = new Date(); // before 48h deadline
    const result = await checkAndEscalate(db, CASCADE_CONFIG, run.id, now);

    expect(result.escalated).toBe(false);
    expect(result.failed).toBe(false);
  });

  it('escalates to next contact after timeout', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1, windowHours: 24 });
    const c2 = await seedContact(db, { name: 'Bob', email: 'bob@x.com', priority: 2, windowHours: 24 });
    const sw = await seedSwitch(db, [c1.id, c2.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);
    await startCascade(db, CASCADE_CONFIG, run.id);

    vi.mocked(dispatchNotification).mockClear();

    // Simulate 25 hours later
    const future = new Date(Date.now() + 25 * 3600000);
    const result = await checkAndEscalate(db, CASCADE_CONFIG, run.id, future);

    expect(result.escalated).toBe(true);
    expect(result.failed).toBe(false);
    expect(result.newClaimId).toBeGreaterThan(0);

    const claims = await listClaimsForRun(db, run.id);
    expect(claims).toHaveLength(2);
    expect(claims[0].status).toBe('escalated');
    expect(claims[1].contactId).toBe(c2.id);
    expect(claims[1].status).toBe('notified');
  });

  it('fails run when all contacts exhausted', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1, windowHours: 24 });
    const sw = await seedSwitch(db, [c1.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);
    await startCascade(db, CASCADE_CONFIG, run.id);

    const future = new Date(Date.now() + 25 * 3600000);
    const result = await checkAndEscalate(db, CASCADE_CONFIG, run.id, future);

    expect(result.failed).toBe(true);
    expect(result.escalated).toBe(false);

    const updatedRun = await getReleaseRunById(db, run.id);
    expect(updatedRun?.status).toBe('failed');
  });

  it('failure audit event has no PII', async () => {
    await seedOwner(db);
    const c1 = await seedContact(db, { name: 'Alice', email: 'alice@x.com', priority: 1, windowHours: 24 });
    const sw = await seedSwitch(db, [c1.id]);

    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    const pkt = await seedPacket(db, sw.id, run.id);
    await setActivePacket(db, run.id, pkt.id);
    await startCascade(db, CASCADE_CONFIG, run.id);

    const future = new Date(Date.now() + 25 * 3600000);
    await checkAndEscalate(db, CASCADE_CONFIG, run.id, future);

    const events = await getAuditEvents(db, { switchId: sw.id });
    const event = events.find((e) => e.eventType === 'cascade_failed_all_contacts_exhausted');
    expect(event).toBeTruthy();

    const meta = JSON.stringify(event?.metadata ?? {});
    expect(meta).not.toContain('email');
    expect(meta).not.toContain('name');
    expect(meta).not.toContain('alice');
  });
});
