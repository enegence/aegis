import { describe, it, expect, beforeAll } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { writeAuditEvent, getAuditEvents } from '../src/services/audit.js';

let db: AegisDb;

beforeAll(() => {
  db = createTestDb();
  migrate(db, { migrationsFolder: './drizzle' });
});

describe('writeAuditEvent', () => {
  it('writes a valid audit event to the database', async () => {
    await expect(
      writeAuditEvent(db, {
        eventType: 'switch_armed',
        actorType: 'owner',
        metadata: { switchMode: 'heartbeat' },
      })
    ).resolves.toBeUndefined();
  });

  it('written event can be retrieved via getAuditEvents', async () => {
    await writeAuditEvent(db, {
      eventType: 'check_in_completed',
      actorType: 'owner',
      actorId: 'owner-1',
      metadata: { reason: 'manual' },
    });

    const events = await getAuditEvents(db);
    const found = events.find(e => e.eventType === 'check_in_completed');
    expect(found).toBeDefined();
    expect(found?.actorType).toBe('owner');
    expect(found?.actorId).toBe('owner-1');
    expect(found?.metadata).toEqual({ reason: 'manual' });
  });

  it('throws when metadata contains PII-like key "email"', async () => {
    await expect(
      writeAuditEvent(db, {
        eventType: 'contact_notified',
        actorType: 'system',
        metadata: { email: 'user@example.com' },
      })
    ).rejects.toThrow('Audit metadata contains PII-like key: "email"');
  });

  it('throws when metadata contains PII-like key "phoneNumber"', async () => {
    await expect(
      writeAuditEvent(db, {
        eventType: 'contact_notified',
        actorType: 'system',
        metadata: { phoneNumber: '+1234567890' },
      })
    ).rejects.toThrow('Audit metadata contains PII-like key: "phoneNumber"');
  });

  it('throws when metadata contains PII-like key "secretKey"', async () => {
    await expect(
      writeAuditEvent(db, {
        eventType: 'packet_generated',
        actorType: 'system',
        metadata: { secretKey: 'abc123' },
      })
    ).rejects.toThrow('Audit metadata contains PII-like key: "secretKey"');
  });

  it('throws when metadata contains PII-like key "apiKey"', async () => {
    await expect(
      writeAuditEvent(db, {
        eventType: 'relay_heartbeat_sent',
        actorType: 'relay',
        metadata: { apiKey: 'relay-key-xyz' },
      })
    ).rejects.toThrow('Audit metadata contains PII-like key: "apiKey"');
  });

  it('accepts non-PII metadata keys ("switchMode", "count", "reason")', async () => {
    await expect(
      writeAuditEvent(db, {
        eventType: 'switch_armed',
        actorType: 'owner',
        metadata: { switchMode: 'trip', count: 3, reason: 'user-initiated' },
      })
    ).resolves.toBeUndefined();
  });
});

describe('getAuditEvents', () => {
  it('returns events ordered by createdAt descending (newest first)', async () => {
    const db2 = createTestDb();
    migrate(db2, { migrationsFolder: './drizzle' });

    // Write events with a small delay to ensure distinct timestamps
    await writeAuditEvent(db2, { eventType: 'switch_armed', actorType: 'owner' });
    await writeAuditEvent(db2, { eventType: 'check_in_completed', actorType: 'owner' });
    await writeAuditEvent(db2, { eventType: 'cascade_completed', actorType: 'system' });

    const events = await getAuditEvents(db2);
    expect(events.length).toBeGreaterThanOrEqual(3);

    // Verify descending order: each event's createdAt should be >= the next one's
    for (let i = 0; i < events.length - 1; i++) {
      const a = new Date(events[i].createdAt).getTime();
      const b = new Date(events[i + 1].createdAt).getTime();
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });

  it('filters by switchId', async () => {
    const db3 = createTestDb();
    migrate(db3, { migrationsFolder: './drizzle' });

    // Insert a switch first (required for foreign key)
    const { switches } = await import('../src/db/schema.js');
    await db3.insert(switches).values({
      name: 'Test Switch',
      mode: 'heartbeat',
      deploymentMode: 'vault',
      status: 'armed',
      gracePeriodHours: 72,
      warningWindowDays: 3,
    });

    await writeAuditEvent(db3, {
      switchId: 1,
      eventType: 'switch_armed',
      actorType: 'owner',
    });
    await writeAuditEvent(db3, {
      switchId: null,
      eventType: 'cascade_completed',
      actorType: 'system',
    });

    const filtered = await getAuditEvents(db3, { switchId: 1 });
    expect(filtered.length).toBe(1);
    expect(filtered[0].eventType).toBe('switch_armed');
    expect(filtered[0].switchId).toBe(1);
  });
});
