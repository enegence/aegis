import { describe, it, expect, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { createSwitch } from '../src/services/switch-repository.js';
import type { SwitchRecord } from '../src/services/switch-repository.js';
import { checkSwitchReadiness } from '../src/services/readiness.js';
import { armSwitch } from '../src/services/switch-engine.js';
import { owner, appSettings } from '../src/db/schema.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeSwitchRecord(overrides: Partial<SwitchRecord> = {}): SwitchRecord {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 3600000); // 30 days out
  return {
    id: 1,
    name: 'Test Switch',
    mode: 'trip',
    deploymentMode: 'vault',
    status: 'draft',
    triggerAt: future,
    heartbeatIntervalDays: null,
    nextCheckInDueAt: null,
    warningStartsAt: null,
    gracePeriodHours: 72,
    warningWindowDays: 3,
    lastCheckInAt: null,
    lastPacketSyncAt: null,
    lastReminderSentAt: null,
    lastWarningSentAt: null,
    lastEvaluatedAt: null,
    selectedContactIds: [1],
    selectedEstateItemIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function createOwnerWithSetupComplete(
  db: AegisDb,
  setupComplete = true,
): Promise<void> {
  const now = new Date();
  await db.insert(owner).values({
    displayName: 'Test Owner',
    email: 'test@example.com',
    passwordHash: 'hash-placeholder',
    timezone: 'UTC',
    setupComplete,
    createdAt: now,
    updatedAt: now,
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('checkSwitchReadiness', () => {
  let db: AegisDb;

  beforeEach(() => {
    db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
  });

  it('no contacts selected → at_least_one_contact_selected = not_ready, overall not_ready', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord({ selectedContactIds: [] });

    const result = await checkSwitchReadiness(db, sw);

    expect(result.status).toBe('not_ready');
    const check = result.checks.find(c => c.id === 'at_least_one_contact_selected');
    expect(check).toBeDefined();
    expect(check!.status).toBe('not_ready');
    expect(check!.required).toBe(true);
  });

  it('trip switch with no triggerAt → switch_schedule_valid = not_ready', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord({ mode: 'trip', triggerAt: null });

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'switch_schedule_valid');
    expect(check).toBeDefined();
    expect(check!.status).toBe('not_ready');
    expect(check!.required).toBe(true);
    expect(result.status).toBe('not_ready');
  });

  it('trip switch with past triggerAt → switch_schedule_valid = not_ready', async () => {
    await createOwnerWithSetupComplete(db);
    const past = new Date(Date.now() - 86400000); // yesterday
    const sw = makeSwitchRecord({ mode: 'trip', triggerAt: past });

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'switch_schedule_valid');
    expect(check).toBeDefined();
    expect(check!.status).toBe('not_ready');
    expect(result.status).toBe('not_ready');
  });

  it('heartbeat switch with intervalDays < 1 → switch_schedule_valid = not_ready', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord({
      mode: 'heartbeat',
      triggerAt: null,
      heartbeatIntervalDays: 0,
    });

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'switch_schedule_valid');
    expect(check).toBeDefined();
    expect(check!.status).toBe('not_ready');
    expect(result.status).toBe('not_ready');
  });

  it('heartbeat switch with null intervalDays → switch_schedule_valid = not_ready', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord({
      mode: 'heartbeat',
      triggerAt: null,
      heartbeatIntervalDays: null,
    });

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'switch_schedule_valid');
    expect(check).toBeDefined();
    expect(check!.status).toBe('not_ready');
  });

  it('valid heartbeat switch → schedule check passes', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord({
      mode: 'heartbeat',
      triggerAt: null,
      heartbeatIntervalDays: 7,
    });

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'switch_schedule_valid');
    expect(check).toBeDefined();
    expect(check!.status).toBe('ready');
  });

  it('dead drop mode → storage_configured_for_dead_drop = not_ready (required)', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord({ deploymentMode: 'dead_drop' });

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'storage_configured_for_dead_drop');
    expect(check).toBeDefined();
    expect(check!.status).toBe('not_ready');
    expect(check!.required).toBe(true);
    expect(result.status).toBe('not_ready');
  });

  it('vault mode without acknowledgement → mode_limitations_acknowledged = warning (non-blocking)', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord({ deploymentMode: 'vault' });

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'mode_limitations_acknowledged');
    expect(check).toBeDefined();
    expect(check!.status).toBe('warning');
    expect(check!.required).toBe(false);
    // Should not block arming (not 'not_ready' overall due to this check alone)
  });

  it('fully configured vault switch has overall status warning (not not_ready)', async () => {
    await createOwnerWithSetupComplete(db);
    const future = new Date(Date.now() + 30 * 24 * 3600000);
    const sw = makeSwitchRecord({
      selectedContactIds: [1],
      mode: 'trip',
      triggerAt: future,
      deploymentMode: 'vault',
    });

    const result = await checkSwitchReadiness(db, sw);

    // All required checks pass, but Phase 3 placeholders create warnings
    expect(result.status).toBe('warning');
    expect(result.status).not.toBe('not_ready');

    // Required checks should all be ready
    const requiredFailed = result.checks.filter(
      c => c.required && c.status === 'not_ready',
    );
    expect(requiredFailed).toHaveLength(0);
  });

  it('resolution hints are present on not_ready checks', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord({
      selectedContactIds: [],
      triggerAt: null,
    });

    const result = await checkSwitchReadiness(db, sw);

    const notReadyChecks = result.checks.filter(c => c.status === 'not_ready');
    expect(notReadyChecks.length).toBeGreaterThan(0);

    for (const check of notReadyChecks) {
      expect(check.resolutionHint).toBeDefined();
      expect(check.resolutionHint).not.toBe('');
    }
  });

  it('owner_setup_complete fails when owner has setupComplete=false', async () => {
    await createOwnerWithSetupComplete(db, false);
    const sw = makeSwitchRecord();

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'owner_setup_complete');
    expect(check).toBeDefined();
    expect(check!.status).toBe('not_ready');
    expect(result.status).toBe('not_ready');
  });

  it('owner_setup_complete passes when owner has setupComplete=true', async () => {
    await createOwnerWithSetupComplete(db, true);
    const sw = makeSwitchRecord();

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'owner_setup_complete');
    expect(check).toBeDefined();
    expect(check!.status).toBe('ready');
  });

  it('notification_provider_configured = warning when no SMTP or Telegram settings exist', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord();

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'notification_provider_configured');
    expect(check).toBeDefined();
    expect(check!.status).toBe('warning');
    expect(check!.required).toBe(false);
  });

  it('notification_provider_configured = ready when SMTP host is set', async () => {
    await createOwnerWithSetupComplete(db);
    const now = new Date();
    await db.insert(appSettings).values({
      key: 'smtp.host',
      value: 'smtp.example.com',
      encrypted: false,
      updatedAt: now,
    });
    const sw = makeSwitchRecord();

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'notification_provider_configured');
    expect(check).toBeDefined();
    expect(check!.status).toBe('ready');
  });

  it('packet_generation_placeholder is always warning and non-required', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord();

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'packet_generation_placeholder');
    expect(check).toBeDefined();
    expect(check!.status).toBe('warning');
    expect(check!.required).toBe(false);
  });

  it('claim_portal_reachable_or_acknowledged is always warning and non-required', async () => {
    await createOwnerWithSetupComplete(db);
    const sw = makeSwitchRecord();

    const result = await checkSwitchReadiness(db, sw);

    const check = result.checks.find(c => c.id === 'claim_portal_reachable_or_acknowledged');
    expect(check).toBeDefined();
    expect(check!.status).toBe('warning');
    expect(check!.required).toBe(false);
  });
});

describe('armSwitch readiness gate integration', () => {
  let db: AegisDb;

  beforeEach(() => {
    db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
  });

  it('armSwitch fails when no contacts selected (readiness returns not_ready)', async () => {
    await createOwnerWithSetupComplete(db);

    // Create switch with no contacts
    const sw = await createSwitch(db, {
      name: 'No Contacts Switch',
      mode: 'trip',
      deploymentMode: 'vault',
      triggerAt: new Date(Date.now() + 30 * 24 * 3600000),
      selectedContactIds: [],
    });

    await expect(armSwitch(db, sw.id)).rejects.toThrow(
      /not ready to arm/i,
    );
  });

  it('armSwitch fails with descriptive error listing failed checks', async () => {
    await createOwnerWithSetupComplete(db);

    // Create switch with no contacts and no triggerAt
    const sw = await createSwitch(db, {
      name: 'Invalid Switch',
      mode: 'trip',
      deploymentMode: 'vault',
      triggerAt: null,
      selectedContactIds: [],
    });

    let caughtError: Error | null = null;
    try {
      await armSwitch(db, sw.id);
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toContain('not ready to arm');
    // Should mention the failed check IDs
    expect(caughtError!.message).toContain('at_least_one_contact_selected');
  });

  it('armSwitch succeeds on a fully configured switch (warnings do not block)', async () => {
    await createOwnerWithSetupComplete(db);

    const future = new Date(Date.now() + 30 * 24 * 3600000);
    const sw = await createSwitch(db, {
      name: 'Ready Switch',
      mode: 'trip',
      deploymentMode: 'vault',
      triggerAt: future,
      selectedContactIds: [999], // fictitious contact id — readiness only checks length
    });

    // Should succeed despite Phase 3 warnings
    const armed = await armSwitch(db, sw.id);
    expect(armed.status).toBe('armed');
  });
});
