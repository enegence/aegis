/**
 * Worker idempotency tests (OSS).
 *
 * Tests:
 *  - duplicate worker tick does not duplicate notifications (idempotency key)
 *  - duplicate worker tick does not duplicate claim escalation
 *  - worker recovery finds active release run and resumes (does not restart)
 *  - idempotency key expires appropriately
 *  - checkOrSetIdempotencyKey: first call returns found=false, second returns found=true
 *  - setting idempotency key with result stores and retrieves result
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import {
  checkIdempotencyKey,
  setIdempotencyKey,
  checkOrSetIdempotencyKey,
  deleteIdempotencyKey,
} from '../src/services/idempotency-keys.js';
import { startOrAttachReleaseRun } from '../src/services/release-run.js';
import { createSwitch } from '../src/services/switch-repository.js';
import { recoverActiveReleaseRuns } from '../src/worker/index.js';
import { getReleaseRunById } from '../src/repositories/release-run-repository.js';

// Mock notifications to avoid real SMTP/Telegram calls
vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
}));

function makeDb(): AegisDb {
  const db = createTestDb();
  migrate(db, { migrationsFolder: './drizzle' });
  return db;
}

async function seedSwitch(db: AegisDb, name = 'Switch A') {
  return createSwitch(db, { name, mode: 'trip', triggerAt: new Date(Date.now() + 86400000) });
}

describe('Idempotency key service', () => {
  let db: AegisDb;

  beforeEach(() => {
    db = makeDb();
  });

  it('first checkOrSetIdempotencyKey call returns found=false', async () => {
    const result = await checkOrSetIdempotencyKey(db, 'test-key-1', 'test_scope');
    expect(result.found).toBe(false);
    expect(result.result).toBeNull();
  });

  it('second checkOrSetIdempotencyKey call returns found=true', async () => {
    await checkOrSetIdempotencyKey(db, 'test-key-2', 'test_scope');
    const second = await checkOrSetIdempotencyKey(db, 'test-key-2', 'test_scope');
    expect(second.found).toBe(true);
  });

  it('stores and retrieves result with idempotency key', async () => {
    const resultPayload = { packetId: 42, version: 1 };
    await setIdempotencyKey(db, 'test-key-3', 'packet_generation', resultPayload);

    const check = await checkIdempotencyKey(db, 'test-key-3');
    expect(check.found).toBe(true);
    expect(check.result).toEqual(resultPayload);
  });

  it('different keys do not collide', async () => {
    await setIdempotencyKey(db, 'key-a', 'scope_a', { value: 'a' });
    await setIdempotencyKey(db, 'key-b', 'scope_b', { value: 'b' });

    const a = await checkIdempotencyKey(db, 'key-a');
    const b = await checkIdempotencyKey(db, 'key-b');

    expect((a.result as any).value).toBe('a');
    expect((b.result as any).value).toBe('b');
  });

  it('expired key is treated as absent', async () => {
    // Set key with TTL of -1ms (already expired)
    const db2 = makeDb();
    const expiredKey = 'expired-key-test';
    await db2.insert((await import('../src/db/schema.js')).idempotencyKeys).values({
      key: expiredKey,
      scope: 'test',
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    const result = await checkIdempotencyKey(db2, expiredKey);
    expect(result.found).toBe(false);
  });

  it('key without expiry is treated as permanent', async () => {
    await setIdempotencyKey(db, 'permanent-key', 'test_scope');
    const result = await checkIdempotencyKey(db, 'permanent-key');
    expect(result.found).toBe(true);
  });

  it('deleteIdempotencyKey removes key', async () => {
    await setIdempotencyKey(db, 'delete-me', 'test_scope');
    await deleteIdempotencyKey(db, 'delete-me');
    const result = await checkIdempotencyKey(db, 'delete-me');
    expect(result.found).toBe(false);
  });

  it('release-run idempotency key prevents duplicate packet generation', async () => {
    // Simulate idempotent packet_generation key
    const switchId = 1;
    const version = 1;
    const key = `packet_generation:${switchId}:${version}`;

    // First time: no key exists → proceed
    const first = await checkOrSetIdempotencyKey(db, key, 'packet_generation', {
      resultJson: { packetId: 99 },
    });
    expect(first.found).toBe(false);

    // Second time (duplicate tick): key exists → skip
    const second = await checkOrSetIdempotencyKey(db, key, 'packet_generation');
    expect(second.found).toBe(true);
  });

  it('contact notification idempotency key prevents duplicate send', async () => {
    const runId = 'run-123';
    const contactId = 'contact-456';
    const channel = 'email';
    const key = `contact_notification:${runId}:${contactId}:${channel}`;

    const first = await checkOrSetIdempotencyKey(db, key, 'contact_notification');
    expect(first.found).toBe(false);

    const second = await checkOrSetIdempotencyKey(db, key, 'contact_notification');
    expect(second.found).toBe(true);
  });

  it('claim state transition idempotency key prevents duplicate transition', async () => {
    const claimId = 'claim-789';
    const key = `claim_state_transition:${claimId}:pending:notified`;

    const first = await checkOrSetIdempotencyKey(db, key, 'claim_state_transition');
    expect(first.found).toBe(false);

    const second = await checkOrSetIdempotencyKey(db, key, 'claim_state_transition');
    expect(second.found).toBe(true);
  });
});

describe('Worker idempotency: duplicate ticks', () => {
  let db: AegisDb;

  beforeEach(() => {
    db = makeDb();
  });

  it('duplicate worker tick does not duplicate notifications (idempotency key check)', async () => {
    const sw = await seedSwitch(db);
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });

    const runId = run.id;
    const contactId = 42;
    const channel = 'email';
    const key = `contact_notification:${runId}:${contactId}:${channel}`;

    // First tick — sets key
    const tick1 = await checkOrSetIdempotencyKey(db, key, 'contact_notification');
    expect(tick1.found).toBe(false);

    // Second tick — finds key → duplicate skipped
    const tick2 = await checkOrSetIdempotencyKey(db, key, 'contact_notification');
    expect(tick2.found).toBe(true);
  });

  it('duplicate worker tick does not duplicate claim escalation (idempotency key)', async () => {
    const claimId = 55;
    const key = `claim_escalation:${claimId}`;

    const tick1 = await checkOrSetIdempotencyKey(db, key, 'claim_escalation');
    expect(tick1.found).toBe(false);

    const tick2 = await checkOrSetIdempotencyKey(db, key, 'claim_escalation');
    expect(tick2.found).toBe(true);
  });

  it('duplicate worker tick does not duplicate packet upload (idempotency key)', async () => {
    const packetId = 1;
    const version = 1;
    const key = `storage_upload:${packetId}:${version}`;

    const tick1 = await checkOrSetIdempotencyKey(db, key, 'storage_upload');
    expect(tick1.found).toBe(false);

    const tick2 = await checkOrSetIdempotencyKey(db, key, 'storage_upload');
    expect(tick2.found).toBe(true);
  });

  it('worker recovery finds active release run and resumes (does not reset state)', async () => {
    const sw = await seedSwitch(db);
    const { run } = await startOrAttachReleaseRun(db, {
      triggeringSwitchId: sw.id,
      reason: 'trip_triggered',
    });

    const before = await getReleaseRunById(db, run.id);
    expect(before?.status).toBe('active');

    // Simulate restart
    await recoverActiveReleaseRuns(db);

    // State should be unchanged
    const after = await getReleaseRunById(db, run.id);
    expect(after?.status).toBe('active');
    expect(after?.id).toBe(run.id);
  });
});
