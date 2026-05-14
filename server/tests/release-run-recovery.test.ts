/**
 * Release-run recovery and idempotency tests (OSS).
 *
 * Tests:
 *  - active release run survives worker restart (state not reset)
 *  - second switch trigger is suppressed while release run active (audit event emitted)
 *  - completed release run cannot transition to any state
 *  - cancelled release run cannot transition to any state
 *  - failed release run CAN be manually retried (failed → active)
 *  - illegal transition returns typed error (ReleaseRunTransitionError)
 *  - idempotent transition to current state is a no-op
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { startOrAttachReleaseRun } from '../src/services/release-run.js';
import {
  transitionReleaseRun,
  ReleaseRunTransitionError,
  isTerminalReleaseRunStatus,
} from '../src/services/release-run-transitions.js';
import {
  getActiveReleaseRunFull,
  getReleaseRunById,
  completeReleaseRun,
  cancelReleaseRun,
  failReleaseRun,
} from '../src/repositories/release-run-repository.js';
import { createSwitch } from '../src/services/switch-repository.js';
import { getAuditEvents } from '../src/services/audit.js';
import { recoverActiveReleaseRuns } from '../src/worker/index.js';

function makeDb(): AegisDb {
  const db = createTestDb();
  migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

async function seedSwitch(db: AegisDb, name = 'Test Switch') {
  return createSwitch(db, { name, mode: 'trip', triggerAt: new Date(Date.now() + 86400000) });
}

describe('Release run recovery', () => {
  let db: AegisDb;

  beforeEach(() => {
    db = makeDb();
  });

  it('active release run survives worker restart — state is not reset', async () => {
    const sw = await seedSwitch(db, 'Switch A');
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });

    expect(run.status).toBe('active');

    // Simulate worker restart by calling recovery
    const recovered = await recoverActiveReleaseRuns(db);
    expect(recovered).toBe(1);

    // State should still be active — recovery does not reset
    const afterRecovery = await getReleaseRunById(db, run.id);
    expect(afterRecovery?.status).toBe('active');
  });

  it('second switch trigger is suppressed while release run active — audit event emitted', async () => {
    const sw1 = await seedSwitch(db, 'Switch A');
    const sw2 = await seedSwitch(db, 'Switch B');

    await startOrAttachReleaseRun(db, { triggeringSwitchId: sw1.id, reason: 'trip_triggered' });
    const result2 = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw2.id, reason: 'trip_triggered' });

    expect(result2.suppressed).toBe(true);
    expect(result2.created).toBe(false);

    // Audit event should exist for suppression
    const events = await getAuditEvents(db, { switchId: sw2.id });
    const suppressedEvent = events.find((e) => e.eventType === 'trigger_suppressed_by_active_release_run');
    expect(suppressedEvent).toBeTruthy();

    // Metadata must not contain PII
    const metaStr = JSON.stringify(suppressedEvent?.metadata ?? {});
    expect(metaStr).not.toContain('email');
    expect(metaStr).not.toContain('name');
    expect(metaStr).not.toContain('phone');
  });

  it('completed release run cannot transition to any state', async () => {
    const sw = await seedSwitch(db);
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });
    await completeReleaseRun(db, run.id);

    const completedRun = await getReleaseRunById(db, run.id);
    expect(completedRun?.status).toBe('completed');

    // Any transition from completed should fail
    await expect(
      transitionReleaseRun(db, run.id, 'completed', 'active'),
    ).rejects.toThrowError(ReleaseRunTransitionError);

    await expect(
      transitionReleaseRun(db, run.id, 'completed', 'cancelled'),
    ).rejects.toThrowError(ReleaseRunTransitionError);

    await expect(
      transitionReleaseRun(db, run.id, 'completed', 'failed'),
    ).rejects.toThrowError(ReleaseRunTransitionError);
  });

  it('cancelled release run cannot transition to any state', async () => {
    const sw = await seedSwitch(db);
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });
    await cancelReleaseRun(db, run.id);

    await expect(
      transitionReleaseRun(db, run.id, 'cancelled', 'active'),
    ).rejects.toThrowError(ReleaseRunTransitionError);
  });

  it('failed release run CAN be manually retried (failed → active)', async () => {
    const sw = await seedSwitch(db);
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });
    await failReleaseRun(db, run.id);

    const failed = await getReleaseRunById(db, run.id);
    expect(failed?.status).toBe('failed');

    // Manual retry: failed → active
    const retried = await transitionReleaseRun(db, run.id, 'failed', 'active');
    expect(retried.status).toBe('active');

    // Verify DB persisted the change
    const fromDb = await getReleaseRunById(db, run.id);
    expect(fromDb?.status).toBe('active');
  });

  it('illegal transition returns typed ReleaseRunTransitionError', async () => {
    const sw = await seedSwitch(db);
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });
    // active → pending is not an allowed transition
    await expect(
      transitionReleaseRun(db, run.id, 'active', 'pending'),
    ).rejects.toThrowError(ReleaseRunTransitionError);
  });

  it('transition to current state is idempotent (no-op, no error)', async () => {
    const sw = await seedSwitch(db);
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });
    expect(run.status).toBe('active');

    // Transitioning active → active should be a no-op
    const same = await transitionReleaseRun(db, run.id, 'active', 'active');
    expect(same.status).toBe('active');
    expect(same.id).toBe(run.id);
  });

  it('valid transition active → paused works correctly', async () => {
    const sw = await seedSwitch(db);
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });

    const paused = await transitionReleaseRun(db, run.id, 'active', 'paused');
    expect(paused.status).toBe('paused');
  });

  it('valid transition paused → active works correctly', async () => {
    const sw = await seedSwitch(db);
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });

    await transitionReleaseRun(db, run.id, 'active', 'paused');
    const resumed = await transitionReleaseRun(db, run.id, 'paused', 'active');
    expect(resumed.status).toBe('active');
  });

  it('valid transition active → completed sets completedAt', async () => {
    const sw = await seedSwitch(db);
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });

    // SQLite stores timestamps at second precision; allow ±2s for test
    const before = new Date(Date.now() - 2000);
    const completed = await transitionReleaseRun(db, run.id, 'active', 'completed');
    const after = new Date(Date.now() + 2000);

    expect(completed.status).toBe('completed');
    expect(completed.completedAt).not.toBeNull();
    expect(completed.completedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(completed.completedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('isTerminalReleaseRunStatus identifies terminal states correctly', () => {
    expect(isTerminalReleaseRunStatus('completed')).toBe(true);
    expect(isTerminalReleaseRunStatus('cancelled')).toBe(true);
    expect(isTerminalReleaseRunStatus('active')).toBe(false);
    expect(isTerminalReleaseRunStatus('paused')).toBe(false);
    expect(isTerminalReleaseRunStatus('failed')).toBe(false);
  });

  it('worker recovery emits recovery audit events', async () => {
    const sw = await seedSwitch(db);
    await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });

    await recoverActiveReleaseRuns(db);

    const events = await getAuditEvents(db);
    const startedEvent = events.find((e) => e.eventType === 'worker_recovery_started');
    const completedEvent = events.find((e) => e.eventType === 'worker_recovery_completed');

    expect(startedEvent).toBeTruthy();
    expect(completedEvent).toBeTruthy();

    // Metadata contains count, not PII
    const metaStr = JSON.stringify(startedEvent?.metadata ?? {});
    expect(metaStr).not.toContain('email');
    expect(metaStr).toContain('activeRunCount');
  });

  it('worker recovery with no active runs returns 0', async () => {
    const count = await recoverActiveReleaseRuns(db);
    expect(count).toBe(0);
  });
});
