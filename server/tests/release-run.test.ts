import { describe, it, expect, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { startOrAttachReleaseRun } from '../src/services/release-run.js';
import { getActiveReleaseRunFull, completeReleaseRun, cancelReleaseRun } from '../src/repositories/release-run-repository.js';
import { createSwitch } from '../src/services/switch-repository.js';
import { getAuditEvents } from '../src/services/audit.js';

function makeDb(): AegisDb {
  const db = createTestDb();
  migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

async function seedSwitch(db: AegisDb, name: string) {
  return createSwitch(db, { name, mode: 'trip', triggerAt: new Date(Date.now() + 86400000) });
}

describe('startOrAttachReleaseRun', () => {
  let db: AegisDb;

  beforeEach(() => { db = makeDb(); });

  it('creates release run for first triggered switch', async () => {
    const sw = await seedSwitch(db, 'Switch A');
    const result = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw.id, reason: 'trip_triggered' });

    expect(result.created).toBe(true);
    expect(result.suppressed).toBe(false);
    expect(result.run.triggeringSwitchId).toBe(sw.id);
    expect(result.run.status).toBe('active');
  });

  it('second trigger attaches to existing active run', async () => {
    const sw1 = await seedSwitch(db, 'Switch A');
    const sw2 = await seedSwitch(db, 'Switch B');

    const first = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw1.id, reason: 'trip_triggered' });
    const second = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw2.id, reason: 'trip_triggered' });

    expect(second.created).toBe(false);
    expect(second.suppressed).toBe(true);
    expect(second.run.id).toBe(first.run.id);
  });

  it('second trigger adds switch to suppressedSwitchIds', async () => {
    const sw1 = await seedSwitch(db, 'Switch A');
    const sw2 = await seedSwitch(db, 'Switch B');

    const first = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw1.id, reason: 'trip_triggered' });
    await startOrAttachReleaseRun(db, { triggeringSwitchId: sw2.id, reason: 'trip_triggered' });

    const updated = await getActiveReleaseRunFull(db);
    expect(updated?.suppressedSwitchIds).toContain(sw2.id);
    expect(updated?.suppressedSwitchIds).not.toContain(sw1.id);
    expect(first.run.id).toBe(updated?.id);
  });

  it('no duplicate run after suppression', async () => {
    const sw1 = await seedSwitch(db, 'Switch A');
    const sw2 = await seedSwitch(db, 'Switch B');

    await startOrAttachReleaseRun(db, { triggeringSwitchId: sw1.id, reason: 'trip_triggered' });
    await startOrAttachReleaseRun(db, { triggeringSwitchId: sw2.id, reason: 'trip_triggered' });

    const active = await getActiveReleaseRunFull(db);
    expect(active).not.toBeNull();
    expect(active?.triggeringSwitchId).toBe(sw1.id);
  });

  it('completed run allows a new run', async () => {
    const sw1 = await seedSwitch(db, 'Switch A');
    const sw2 = await seedSwitch(db, 'Switch B');

    const first = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw1.id, reason: 'trip_triggered' });
    await completeReleaseRun(db, first.run.id);

    const second = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw2.id, reason: 'trip_triggered' });
    expect(second.created).toBe(true);
    expect(second.run.id).not.toBe(first.run.id);
  });

  it('cancelled run allows a new run', async () => {
    const sw1 = await seedSwitch(db, 'Switch A');
    const sw2 = await seedSwitch(db, 'Switch B');

    const first = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw1.id, reason: 'trip_triggered' });
    await cancelReleaseRun(db, first.run.id);

    const second = await startOrAttachReleaseRun(db, { triggeringSwitchId: sw2.id, reason: 'trip_triggered' });
    expect(second.created).toBe(true);
  });

  it('suppression audit metadata contains no PII', async () => {
    const sw1 = await seedSwitch(db, 'Switch A');
    const sw2 = await seedSwitch(db, 'Switch B');

    await startOrAttachReleaseRun(db, { triggeringSwitchId: sw1.id, reason: 'trip_triggered' });
    await startOrAttachReleaseRun(db, { triggeringSwitchId: sw2.id, reason: 'trip_triggered' });

    const events = await getAuditEvents(db, { switchId: sw2.id });
    const suppressed = events.find((e) => e.eventType === 'trigger_suppressed_by_active_release_run');
    expect(suppressed).toBeTruthy();
    const metadataStr = JSON.stringify(suppressed?.metadata ?? {});
    expect(metadataStr).not.toContain('email');
    expect(metadataStr).not.toContain('name');
    expect(metadataStr).not.toContain('phone');
  });
});
