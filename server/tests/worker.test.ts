import { describe, it, expect, vi, beforeAll } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { createSwitch, markSwitchStatus, getActiveReleaseRun } from '../src/services/switch-repository.js';
import { contactClaims } from '../src/db/schema.js';
import { runWorkerOnce, startWorker } from '../src/worker/index.js';

// ─── Mock nodemailer (processRemindersForSwitch dispatches email) ────────────

const mockSendMail = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      verify: vi.fn(),
    })),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDb(): AegisDb {
  const db = createTestDb();
  migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runWorkerOnce', () => {
  it('empty DB returns result with 0 evaluated', async () => {
    const db = makeDb();
    const now = new Date('2026-01-01T00:00:00Z');
    const result = await runWorkerOnce(db, now);

    expect(result.evaluated).toBe(0);
    expect(result.transitioned).toBe(0);
    expect(result.notificationsSent).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.ranAt).toEqual(now);
  });

  it('armed trip switch past triggerAt transitions to triggered', async () => {
    const db = makeDb();

    const triggerAt = new Date('2026-01-01T00:00:00Z');
    const sw = await createSwitch(db, {
      name: 'Trip Past Due',
      mode: 'trip',
      warningWindowDays: 0,
      triggerAt,
    });
    await markSwitchStatus(db, sw.id, 'armed');

    // now is after triggerAt
    const now = new Date('2026-01-02T00:00:00Z');
    const result = await runWorkerOnce(db, now);

    expect(result.evaluated).toBeGreaterThanOrEqual(1);
    expect(result.transitioned).toBeGreaterThanOrEqual(1);

    // Verify switch is now triggered
    const activeRun = await getActiveReleaseRun(db);
    expect(activeRun).not.toBeNull();
    expect(activeRun?.triggeringSwitchId).toBe(sw.id);
  });

  it('armed heartbeat switch with overdue nextCheckInDueAt transitions to warning', async () => {
    const db = makeDb();

    // nextCheckInDueAt already in the past
    const nextCheckInDueAt = new Date('2026-01-01T00:00:00Z');
    const sw = await createSwitch(db, {
      name: 'Heartbeat Overdue',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
    });
    await markSwitchStatus(db, sw.id, 'armed', { nextCheckInDueAt });

    // now is after nextCheckInDueAt
    const now = new Date('2026-01-02T00:00:00Z');
    const result = await runWorkerOnce(db, now);

    expect(result.evaluated).toBeGreaterThanOrEqual(1);
    expect(result.transitioned).toBeGreaterThanOrEqual(1);

    // Re-query by listing switches to check the updated status
    const allSwitches = await import('../src/services/switch-repository.js').then(m =>
      m.getSwitchById(db, sw.id)
    );
    expect(allSwitches?.status).toBe('warning');
  });

  it('processes multiple switches in one run', async () => {
    const db = makeDb();
    const now = new Date('2026-02-01T00:00:00Z');

    // Switch 1: trip, overdue
    const sw1 = await createSwitch(db, {
      name: 'Multi Switch A',
      mode: 'trip',
      warningWindowDays: 0,
      triggerAt: new Date('2026-01-01T00:00:00Z'),
    });
    await markSwitchStatus(db, sw1.id, 'armed');

    // Switch 2: heartbeat, overdue
    const sw2 = await createSwitch(db, {
      name: 'Multi Switch B',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
    });
    await markSwitchStatus(db, sw2.id, 'armed', {
      nextCheckInDueAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await runWorkerOnce(db, now);

    expect(result.evaluated).toBeGreaterThanOrEqual(2);
    expect(result.transitioned).toBeGreaterThanOrEqual(2);
  });

  it('does NOT create contact_claims (no cascade in Phase 2 worker)', async () => {
    const db = makeDb();

    const triggerAt = new Date('2026-01-01T00:00:00Z');
    const sw = await createSwitch(db, {
      name: 'No Cascade Switch',
      mode: 'trip',
      warningWindowDays: 0,
      triggerAt,
    });
    await markSwitchStatus(db, sw.id, 'armed');

    const now = new Date('2026-01-02T00:00:00Z');
    await runWorkerOnce(db, now);

    // No contact_claims should be created
    const claims = await db.select().from(contactClaims);
    expect(claims.length).toBe(0);
  });

  it('error in one switch does not prevent processing others', async () => {
    const db = makeDb();
    const now = new Date('2026-03-01T00:00:00Z');

    // Create two armed switches
    const sw1 = await createSwitch(db, {
      name: 'Error Resilience Switch A',
      mode: 'trip',
      warningWindowDays: 0,
      triggerAt: new Date('2026-02-01T00:00:00Z'),
    });
    await markSwitchStatus(db, sw1.id, 'armed');

    const sw2 = await createSwitch(db, {
      name: 'Error Resilience Switch B',
      mode: 'trip',
      warningWindowDays: 0,
      triggerAt: new Date('2026-02-01T00:00:00Z'),
    });
    await markSwitchStatus(db, sw2.id, 'armed');

    // Import the engine module, save original reference, then spy
    const engineModule = await import('../src/services/switch-engine.js');
    // Capture original BEFORE spying to avoid recursive calls in the mock
    const originalEvaluateAndTransition = engineModule.evaluateAndTransition;

    let callCount = 0;
    vi.spyOn(engineModule, 'evaluateAndTransition').mockImplementation(
      async (dbArg, id, nowArg) => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('Simulated per-switch failure');
        }
        // Call the saved original (not engineModule.evaluateAndTransition,
        // which would be recursive through the spy)
        return originalEvaluateAndTransition(dbArg, id, nowArg);
      },
    );

    try {
      const result = await runWorkerOnce(db, now);

      // First switch errored, second was evaluated successfully
      expect(result.errors).toBeGreaterThanOrEqual(1);
      expect(result.evaluated).toBeGreaterThanOrEqual(1);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('startWorker', () => {
  it('creates a worker handle with a stop function', () => {
    const db = makeDb();

    const handle = startWorker(db, { intervalMs: 60000 });

    expect(handle).toBeDefined();
    expect(typeof handle.stop).toBe('function');

    // Clean up — stop the timer so it doesn't outlive the test
    handle.stop();
  });

  it('returns a handle whose stop() resolves without error', async () => {
    const db = makeDb();

    const handle = startWorker(db, { intervalMs: 60000 });
    await expect(handle.stop()).resolves.toBeUndefined();
  });
});
