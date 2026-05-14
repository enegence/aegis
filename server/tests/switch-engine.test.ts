import { describe, it, expect, beforeAll } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { createSwitch, markSwitchStatus, getActiveReleaseRun, createReleaseRun } from '../src/services/switch-repository.js';
import type { SwitchRecord } from '../src/services/switch-repository.js';
import {
  calculateInitialSchedule,
  calculateNextCheckInDueAt,
  evaluateSwitch,
  evaluateAndTransition,
  armSwitch,
  pauseSwitch,
  cancelSwitch,
  checkIn,
} from '../src/services/switch-engine.js';
import { getAuditEvents } from '../src/services/audit.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeSwitchRecord(overrides: Partial<SwitchRecord> = {}): SwitchRecord {
  const now = new Date('2025-01-01T00:00:00Z');
  return {
    id: 1,
    name: 'Test Switch',
    mode: 'trip',
    deploymentMode: 'vault',
    status: 'armed',
    triggerAt: null,
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
    selectedContactIds: [],
    selectedEstateItemIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ─── Pure function tests ───────────────────────────────────────────────────────

describe('calculateInitialSchedule', () => {
  it('trip mode: sets triggerAt and warningStartsAt', () => {
    const now = new Date('2025-01-01T00:00:00Z');
    const triggerAt = new Date('2025-04-01T00:00:00Z');
    const result = calculateInitialSchedule(
      { mode: 'trip', triggerAt, warningWindowDays: 3 },
      now,
    );
    expect(result.triggerAt).toEqual(triggerAt);
    expect(result.nextCheckInDueAt).toBeNull();
    // warningStartsAt should be 3 days before triggerAt
    const expected = new Date('2025-03-29T00:00:00Z');
    expect(result.warningStartsAt).toEqual(expected);
  });

  it('heartbeat mode: sets nextCheckInDueAt from now + intervalDays', () => {
    const now = new Date('2025-01-01T00:00:00Z');
    const result = calculateInitialSchedule(
      { mode: 'heartbeat', heartbeatIntervalDays: 7 },
      now,
    );
    expect(result.triggerAt).toBeNull();
    expect(result.warningStartsAt).toBeNull();
    const expected = calculateNextCheckInDueAt(now, 7);
    expect(result.nextCheckInDueAt).toEqual(expected);
  });
});

describe('evaluateSwitch — trip mode', () => {
  it('armed → warning when now >= warningStartsAt', () => {
    const triggerAt = new Date('2025-01-10T00:00:00Z');
    const warningStartsAt = new Date('2025-01-07T00:00:00Z');
    const sw = makeSwitchRecord({
      mode: 'trip',
      status: 'armed',
      triggerAt,
      warningStartsAt,
      warningWindowDays: 3,
    });
    // now is past the warningStartsAt but before triggerAt
    const now = new Date('2025-01-08T00:00:00Z');
    const result = evaluateSwitch(sw, now);
    expect(result.shouldTransitionTo).toBe('warning');
  });

  it('armed → triggered when no warning window', () => {
    const triggerAt = new Date('2025-01-05T00:00:00Z');
    const sw = makeSwitchRecord({
      mode: 'trip',
      status: 'armed',
      triggerAt,
      warningStartsAt: null,
      warningWindowDays: 0,
    });
    const now = new Date('2025-01-06T00:00:00Z');
    const result = evaluateSwitch(sw, now);
    expect(result.shouldTransitionTo).toBe('triggered');
  });

  it('warning → triggered when now >= triggerAt', () => {
    const triggerAt = new Date('2025-01-05T00:00:00Z');
    const sw = makeSwitchRecord({
      mode: 'trip',
      status: 'warning',
      triggerAt,
      warningWindowDays: 3,
    });
    const now = new Date('2025-01-06T00:00:00Z');
    const result = evaluateSwitch(sw, now);
    expect(result.shouldTransitionTo).toBe('triggered');
  });

  it('paused switch → no transition', () => {
    const sw = makeSwitchRecord({ mode: 'trip', status: 'paused' });
    const result = evaluateSwitch(sw, new Date());
    expect(result.shouldTransitionTo).toBeNull();
  });

  it('cancelled switch → no transition', () => {
    const sw = makeSwitchRecord({ mode: 'trip', status: 'cancelled' });
    const result = evaluateSwitch(sw, new Date());
    expect(result.shouldTransitionTo).toBeNull();
  });
});

describe('evaluateSwitch — heartbeat mode', () => {
  it('armed → warning when now >= nextCheckInDueAt', () => {
    const nextCheckInDueAt = new Date('2025-01-05T00:00:00Z');
    const sw = makeSwitchRecord({
      mode: 'heartbeat',
      status: 'armed',
      nextCheckInDueAt,
      heartbeatIntervalDays: 7,
    });
    const now = new Date('2025-01-06T00:00:00Z');
    const result = evaluateSwitch(sw, now);
    expect(result.shouldTransitionTo).toBe('warning');
  });

  it('warning → triggered after grace period expires', () => {
    const nextCheckInDueAt = new Date('2025-01-05T00:00:00Z');
    const sw = makeSwitchRecord({
      mode: 'heartbeat',
      status: 'warning',
      nextCheckInDueAt,
      gracePeriodHours: 72,
    });
    // 72 hours after nextCheckInDueAt = 2025-01-08T00:00:00Z
    const now = new Date('2025-01-08T01:00:00Z');
    const result = evaluateSwitch(sw, now);
    expect(result.shouldTransitionTo).toBe('triggered');
  });
});

// ─── Stateful action tests ─────────────────────────────────────────────────────

describe('evaluateAndTransition', () => {
  let db: AegisDb;

  beforeAll(() => {
    db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
  });

  it('creates release run when switch triggers and none exists', async () => {
    const sw = await createSwitch(db, {
      name: 'Trigger Test',
      mode: 'trip',
      warningWindowDays: 0,
      triggerAt: new Date('2025-01-01T00:00:00Z'),
    });
    await markSwitchStatus(db, sw.id, 'armed');

    const now = new Date('2025-01-02T00:00:00Z');
    const updated = await evaluateAndTransition(db, sw.id, now);

    expect(updated.status).toBe('triggered');

    const activeRun = await getActiveReleaseRun(db);
    expect(activeRun).not.toBeNull();
    expect(activeRun?.triggeringSwitchId).toBe(sw.id);

    const events = await getAuditEvents(db, { switchId: sw.id });
    expect(events.some(e => e.eventType === 'release_run_created')).toBe(true);
  });

  it('does NOT create second release run when one is already active (writes suppressed event)', async () => {
    // Use isolated DB so active release run from previous test does not interfere
    const isolatedDb = createTestDb();
    migrate(isolatedDb, { migrationsFolder: './drizzle' });

    // Create a pre-existing active release run from a different switch
    const sw1 = await createSwitch(isolatedDb, { name: 'Existing Run Switch', mode: 'trip' });
    await createReleaseRun(isolatedDb, sw1.id);

    // Create the switch under test
    const sw2 = await createSwitch(isolatedDb, {
      name: 'Second Trigger Switch',
      mode: 'trip',
      warningWindowDays: 0,
      triggerAt: new Date('2025-01-01T00:00:00Z'),
    });
    await markSwitchStatus(isolatedDb, sw2.id, 'armed');

    const now = new Date('2025-01-02T00:00:00Z');
    const updated = await evaluateAndTransition(isolatedDb, sw2.id, now);

    expect(updated.status).toBe('triggered');

    // Should still be just the one (original) release run
    const activeRun = await getActiveReleaseRun(isolatedDb);
    expect(activeRun?.triggeringSwitchId).toBe(sw1.id);

    const events = await getAuditEvents(isolatedDb, { switchId: sw2.id });
    expect(
      events.some(e => e.eventType === 'trigger_suppressed_by_active_release_run'),
    ).toBe(true);
    expect(events.some(e => e.eventType === 'release_run_created')).toBe(false);
  });
});

describe('checkIn', () => {
  let db: AegisDb;

  beforeAll(() => {
    db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
  });

  it('resets nextCheckInDueAt and sets lastCheckInAt', async () => {
    const sw = await createSwitch(db, {
      name: 'CheckIn Reset Test',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
    });
    // Arm it first so it's in valid status
    await markSwitchStatus(db, sw.id, 'armed', {
      nextCheckInDueAt: new Date('2025-01-01T00:00:00Z'),
    });

    const before = Date.now();
    const updated = await checkIn(db, sw.id);
    const after = Date.now();

    expect(updated.status).toBe('armed');
    expect(updated.lastCheckInAt).not.toBeNull();
    const checkInTime = updated.lastCheckInAt!.getTime();
    // Allow a 2-second slack on both sides to account for SQLite timestamp
    // rounding (stored as integer seconds) vs JS Date.now() milliseconds.
    expect(checkInTime).toBeGreaterThanOrEqual(before - 2000);
    expect(checkInTime).toBeLessThanOrEqual(after + 2000);

    // nextCheckInDueAt should be ~7 days from the stored lastCheckInAt
    expect(updated.nextCheckInDueAt).not.toBeNull();
    const newDue = updated.nextCheckInDueAt!.getTime();
    const expectedDue = checkInTime + 7 * 86400000;
    expect(Math.abs(newDue - expectedDue)).toBeLessThan(2000); // within 2 seconds
  });

  it('warning → armed after check-in', async () => {
    const sw = await createSwitch(db, {
      name: 'CheckIn Warning Reset Test',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
    });
    await markSwitchStatus(db, sw.id, 'warning');

    const updated = await checkIn(db, sw.id);
    expect(updated.status).toBe('armed');

    const events = await getAuditEvents(db, { switchId: sw.id });
    expect(events.some(e => e.eventType === 'check_in_completed')).toBe(true);
  });
});
