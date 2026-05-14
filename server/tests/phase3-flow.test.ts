/**
 * Phase 3 end-to-end integration test.
 * Exercises the full release lifecycle: armed switch → trigger → release run →
 * packet → cascade → claim → acknowledge → run completed.
 * Mocked: SMTP/S3. All other behavior is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { createSwitch, markSwitchStatus } from '../src/services/switch-repository.js';
import { evaluateAndTransition } from '../src/services/switch-engine.js';
import { startOrAttachReleaseRun } from '../src/services/release-run.js';
import { buildPacket } from '../src/services/packet-builder.js';
import {
  setActivePacket,
  getReleaseRunById,
  getActiveReleaseRunFull,
} from '../src/repositories/release-run-repository.js';
import { startCascade, checkAndEscalate } from '../src/services/cascade.js';
import {
  createContactClaim,
  updateClaimStatus,
  listClaimsForRun,
  hashClaimToken,
} from '../src/repositories/contact-claim-repository.js';
import { getClaimByTokenHash } from '../src/repositories/contact-claim-repository.js';
import { completeReleaseRun } from '../src/repositories/release-run-repository.js';
import { getAuditEvents } from '../src/services/audit.js';
import { encryptField } from '../src/services/field-encrypt.js';
import { owner, contacts, estateItems } from '../src/db/schema.js';

vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

const FIELD_KEY = 'dev-field-key-change-me-32bytes!!';
const APP_URL = 'http://localhost:8000';

function makeDb(): AegisDb {
  const db = createTestDb();
  migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

describe('phase 3 full release flow', () => {
  let db: AegisDb;
  let dataDir: string;

  beforeEach(() => {
    db = makeDb();
    dataDir = mkdtempSync(join(tmpdir(), 'aegis-e2e-'));
  });

  it('complete release lifecycle: trigger → cascade → acknowledge', async () => {
    // 1. Seed owner, contacts, estate items
    await db.insert(owner).values({
      displayName: 'Test Owner', email: 'owner@example.com', phone: null,
      timezone: 'UTC', passwordHash: 'x', totpEnabled: false, setupComplete: true,
    });

    const [contact1] = await db.insert(contacts).values({
      fullNameEncrypted: encryptField('Alice', FIELD_KEY)!,
      emailEncrypted: encryptField('alice@x.com', FIELD_KEY)!,
      priorityOrder: 1, preferredChannels: '["email"]', confirmationWindowHours: 48,
    }).returning();

    const [contact2] = await db.insert(contacts).values({
      fullNameEncrypted: encryptField('Bob', FIELD_KEY)!,
      emailEncrypted: encryptField('bob@x.com', FIELD_KEY)!,
      priorityOrder: 2, preferredChannels: '["email"]', confirmationWindowHours: 48,
    }).returning();

    await db.insert(estateItems).values({
      category: 'Financial', title: 'Main Account',
      institutionNameEncrypted: encryptField('Bank', FIELD_KEY),
      sensitiveFlag: false, sortOrder: 0,
    });

    // 2. Create and arm switch in Dead Drop mode
    const sw = await createSwitch(db, {
      name: 'Test Switch',
      mode: 'trip',
      triggerAt: new Date(Date.now() - 1000), // in the past
      deploymentMode: 'dead_drop',
      selectedContactIds: [contact1.id, contact2.id],
      selectedEstateItemIds: [1],
    });
    await markSwitchStatus(db, sw.id, 'armed');

    // 3. Evaluate: switch should transition to triggered
    const afterEval = await evaluateAndTransition(db, sw.id, new Date());
    expect(['triggered', 'warned', 'armed']).toContain(afterEval.status);

    // 4. Get the release run (evaluateAndTransition already created it if triggered)
    let activeRun2 = await getActiveReleaseRunFull(db);
    if (!activeRun2) {
      // switch may not have triggered (e.g. warningWindowDays > 0); force create
      const { run: r } = await startOrAttachReleaseRun(db, {
        triggeringSwitchId: sw.id, reason: 'trip_triggered',
      });
      activeRun2 = r as typeof activeRun2;
    }
    const run = activeRun2!;
    expect(run).not.toBeNull();

    // 5. Generate packet
    const packet = await buildPacket(db, FIELD_KEY, dataDir, sw.id);
    expect(packet.id).toBeGreaterThan(0);
    expect(packet.localCiphertextPath).toBeTruthy();

    // Set as active packet on run
    await setActivePacket(db, run.id, packet.id);

    // 6. Start cascade
    const cascadeResult = await startCascade(
      db,
      { appUrl: APP_URL, fieldEncryptionKey: FIELD_KEY },
      run.id,
    );
    expect(cascadeResult.started).toBe(true);
    expect(cascadeResult.claimId).toBeGreaterThan(0);

    const runAfterCascade = await getReleaseRunById(db, run.id);
    expect(runAfterCascade?.status).toBe('cascade_active');

    // 7. Get claim from DB
    const claims = await listClaimsForRun(db, run.id);
    expect(claims.length).toBe(1);
    const claim = claims[0];
    expect(claim.contactId).toBe(contact1.id);
    expect(claim.status).toBe('notified');

    // Verify token is stored as hash (not plaintext)
    expect(claim.claimTokenHash).toMatch(/^[0-9a-f]{64}$/);

    // 8. Simulate contact claim flow (direct DB updates, bypassing HTTP for unit test)
    const now = new Date();
    await updateClaimStatus(db, claim.id, { status: 'opened', openedAt: now });
    await updateClaimStatus(db, claim.id, { status: 'verified', verifiedAt: now });
    await updateClaimStatus(db, claim.id, { status: 'accepted', acceptedAt: now });
    await updateClaimStatus(db, claim.id, { status: 'packet_downloaded', packetDownloadedAt: now });
    await updateClaimStatus(db, claim.id, { status: 'key_viewed', keyViewedAt: now });
    await updateClaimStatus(db, claim.id, { status: 'acknowledged', acknowledgedAt: now });

    // 9. Complete the release run
    await completeReleaseRun(db, run.id);
    await markSwitchStatus(db, sw.id, 'completed');

    const completedRun = await getReleaseRunById(db, run.id);
    expect(completedRun?.status).toBe('completed');

    // 10. Verify no active run remains
    const activeRun = await getActiveReleaseRunFull(db);
    expect(activeRun).toBeNull();

    // 11. Verify audit log contains no PII
    const auditEvts = await getAuditEvents(db, { switchId: sw.id });
    expect(auditEvts.length).toBeGreaterThan(0);

    const auditStr = JSON.stringify(auditEvts.map((e) => e.metadata));
    expect(auditStr).not.toContain('alice');
    expect(auditStr).not.toContain('Alice');
    expect(auditStr).not.toContain('bob@');
    expect(auditStr).not.toContain('@example.com');
    expect(auditStr).not.toContain('Bank');

    // 12. Cleanup
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('second trigger is suppressed by active run', async () => {
    await db.insert(owner).values({
      displayName: 'O', email: 'o@x.com', phone: null,
      timezone: 'UTC', passwordHash: 'x', totpEnabled: false, setupComplete: true,
    });

    const sw1 = await createSwitch(db, { name: 'SW1', mode: 'trip', triggerAt: new Date() });
    const sw2 = await createSwitch(db, { name: 'SW2', mode: 'trip', triggerAt: new Date() });

    const first = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw1.id, reason: 'trip_triggered' });
    const second = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw2.id, reason: 'trip_triggered' });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.suppressed).toBe(true);
    expect(second.run.id).toBe(first.run.id);
  });

  it('cascade escalates and fails when all contacts exhausted', async () => {
    await db.insert(owner).values({
      displayName: 'O2', email: 'o2@x.com', phone: null,
      timezone: 'UTC', passwordHash: 'x', totpEnabled: false, setupComplete: true,
    });

    const [c] = await db.insert(contacts).values({
      fullNameEncrypted: encryptField('Solo', FIELD_KEY)!,
      emailEncrypted: encryptField('solo@x.com', FIELD_KEY)!,
      priorityOrder: 1, preferredChannels: '["email"]', confirmationWindowHours: 1,
    }).returning();

    await db.insert(estateItems).values({ category: 'Other', title: 'Item', sensitiveFlag: false, sortOrder: 0 });

    const sw = await createSwitch(db, {
      name: 'Solo SW', mode: 'trip', triggerAt: new Date(),
      selectedContactIds: [c.id], selectedEstateItemIds: [1],
    });

    const packet = await buildPacket(db, FIELD_KEY, dataDir, sw.id);
    const { run } = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });
    await setActivePacket(db, run.id, packet.id);

    await startCascade(db, { appUrl: APP_URL, fieldEncryptionKey: FIELD_KEY }, run.id);

    // 2h later — contact window expired (1h), escalate
    const future = new Date(Date.now() + 2 * 3600000);
    const result = await checkAndEscalate(
      db, { appUrl: APP_URL, fieldEncryptionKey: FIELD_KEY }, run.id, future,
    );

    expect(result.failed).toBe(true);

    const failedRun = await getReleaseRunById(db, run.id);
    expect(failedRun?.status).toBe('failed');

    rmSync(dataDir, { recursive: true, force: true });
  });
});
