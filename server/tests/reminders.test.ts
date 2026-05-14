import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { owner, appSettings, notificationEvents, switches } from '../src/db/schema.js';
import { createSwitch, markSwitchStatus, getSwitchById } from '../src/services/switch-repository.js';
import type { SwitchRecord } from '../src/services/switch-repository.js';
import { processRemindersForSwitch } from '../src/services/reminders.js';
import { encryptField } from '../src/services/field-encrypt.js';

// ─── Mock nodemailer ──────────────────────────────────────────────────────────

const mockSendMail = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      verify: vi.fn(),
    })),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-01-15T12:00:00Z');
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const TWENTY_FIVE_HOURS_MS = 25 * 60 * 60 * 1000;

function makeSwitchRecord(overrides: Partial<SwitchRecord> = {}): SwitchRecord {
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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

async function insertOwner(db: AegisDb): Promise<void> {
  await db.insert(owner).values({
    displayName: 'Test Owner',
    email: 'owner@example.com',
    passwordHash: 'hash',
  });
}

async function insertSmtpConfig(db: AegisDb): Promise<void> {
  const TEST_FIELD_KEY = 'dev-field-key-change-me-32bytes!!';
  await db.insert(appSettings).values([
    { key: 'smtp.host', value: 'smtp.example.com', encrypted: false },
    { key: 'smtp.port', value: '587', encrypted: false },
    { key: 'smtp.user', value: 'noreply@example.com', encrypted: false },
    { key: 'smtp.password', value: encryptField('secret', TEST_FIELD_KEY), encrypted: true },
    { key: 'smtp.fromEmail', value: 'noreply@example.com', encrypted: false },
  ]);
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('processRemindersForSwitch', () => {
  let db: AegisDb;

  beforeAll(async () => {
    db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
    await insertOwner(db);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: Trip switch armed with warningStartsAt within 24h ─────────────

  it('trip armed: warningStartsAt within 24h sends reminder and updates lastReminderSentAt', async () => {
    // warningStartsAt is 12 hours from NOW (within 24h window)
    const warningStartsAt = new Date(NOW.getTime() + TWELVE_HOURS_MS);

    const created = await createSwitch(db, {
      name: 'Trip Reminder Switch',
      mode: 'trip',
      triggerAt: new Date(NOW.getTime() + 4 * 24 * 60 * 60 * 1000),
      warningWindowDays: 3,
    });

    // Arm it and set warningStartsAt manually
    const sw = await markSwitchStatus(db, created.id, 'armed', {
      warningStartsAt,
    });

    const result = await processRemindersForSwitch(db, sw, NOW);

    // Should have dispatched (either sent or skipped depending on SMTP config)
    expect(result.sent + result.skipped).toBeGreaterThanOrEqual(1);

    // lastReminderSentAt should be updated
    const updated = await getSwitchById(db, sw.id);
    expect(updated?.lastReminderSentAt).not.toBeNull();
    expect(updated?.lastReminderSentAt?.getTime()).toBeCloseTo(NOW.getTime(), -2);
  });

  // ── Test 2: Duplicate prevention for reminder ─────────────────────────────

  it('trip armed: recent lastReminderSentAt prevents sending again', async () => {
    const warningStartsAt = new Date(NOW.getTime() + TWELVE_HOURS_MS);
    // lastReminderSentAt was just set (1 hour ago — within 24h)
    const recentReminderSentAt = new Date(NOW.getTime() - 60 * 60 * 1000);

    const created = await createSwitch(db, {
      name: 'Duplicate Reminder Switch',
      mode: 'trip',
      triggerAt: new Date(NOW.getTime() + 4 * 24 * 60 * 60 * 1000),
    });

    const sw = await markSwitchStatus(db, created.id, 'armed', {
      warningStartsAt,
      lastReminderSentAt: recentReminderSentAt,
    });

    // Count events before
    const eventsBefore = await db.select().from(notificationEvents).where(
      // Just check overall count won't grow
    );
    const countBefore = eventsBefore.length;

    const result = await processRemindersForSwitch(db, sw, NOW);

    // Should not dispatch anything
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);

    const eventsAfter = await db.select().from(notificationEvents);
    expect(eventsAfter.length).toBe(countBefore);
  });

  // ── Test 3: Heartbeat switch in warning, null lastWarningSentAt ───────────

  it('heartbeat warning: sends warning_started when lastWarningSentAt is null', async () => {
    const created = await createSwitch(db, {
      name: 'Heartbeat Warning Switch',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
    });

    const sw = await markSwitchStatus(db, created.id, 'warning', {
      // lastWarningSentAt is null (default)
    });

    const result = await processRemindersForSwitch(db, sw, NOW);

    expect(result.sent + result.skipped).toBeGreaterThanOrEqual(1);

    // lastWarningSentAt should now be set
    const updated = await getSwitchById(db, sw.id);
    expect(updated?.lastWarningSentAt).not.toBeNull();
  });

  // ── Test 4: Duplicate prevention for warning ──────────────────────────────

  it('heartbeat warning: recent lastWarningSentAt prevents second warning', async () => {
    const recentWarningSentAt = new Date(NOW.getTime() - 30 * 60 * 1000); // 30 min ago

    const created = await createSwitch(db, {
      name: 'Heartbeat No Dup Warning Switch',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
    });

    // Set warning status WITH lastWarningSentAt already set
    const sw = await markSwitchStatus(db, created.id, 'warning', {
      lastWarningSentAt: recentWarningSentAt,
    });

    const eventsBefore = await db.select().from(notificationEvents);
    const countBefore = eventsBefore.length;

    const result = await processRemindersForSwitch(db, sw, NOW);

    // Already sent, lastWarningSentAt is not null → no action
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);

    const eventsAfter = await db.select().from(notificationEvents);
    expect(eventsAfter.length).toBe(countBefore);
  });

  // ── Test 5: Triggered switch sends trigger notice ─────────────────────────

  it('triggered switch: sends trigger notice and updates lastWarningSentAt', async () => {
    const created = await createSwitch(db, {
      name: 'Triggered Switch',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
    });

    // lastWarningSentAt is null → trigger notice not yet sent
    const sw = await markSwitchStatus(db, created.id, 'triggered', {});

    const result = await processRemindersForSwitch(db, sw, NOW);

    expect(result.sent + result.skipped).toBeGreaterThanOrEqual(1);

    const updated = await getSwitchById(db, sw.id);
    expect(updated?.lastWarningSentAt).not.toBeNull();
  });

  // ── Test 6: No provider configured → skipped, no throw ───────────────────

  it('no provider configured: returns skipped=1, sent=0, does not throw', async () => {
    // Fresh db with no SMTP config and no Telegram config
    const freshDb = createTestDb();
    migrate(freshDb, { migrationsFolder: './drizzle' });

    await freshDb.insert(owner).values({
      displayName: 'Fresh Owner',
      email: 'fresh@example.com',
      passwordHash: 'hash',
    });

    const created = await createSwitch(freshDb, {
      name: 'No Provider Switch',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
    });

    const sw = await markSwitchStatus(freshDb, created.id, 'warning', {});

    const result = await processRemindersForSwitch(freshDb, sw, NOW);

    // dispatchNotification records 'skipped' when smtp_not_configured
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.sent).toBe(0);
  });

  // ── Test 7: SMTP configured → dispatchNotification called with email ──────

  it('SMTP configured: dispatches email notification (sent status recorded)', async () => {
    // Fresh db with SMTP config
    const smtpDb = createTestDb();
    migrate(smtpDb, { migrationsFolder: './drizzle' });

    await smtpDb.insert(owner).values({
      displayName: 'SMTP Owner',
      email: 'smtpowner@example.com',
      passwordHash: 'hash',
    });

    await insertSmtpConfig(smtpDb);

    // Mock nodemailer to return success
    mockSendMail.mockResolvedValueOnce({ messageId: '<reminder-id@example.com>' });

    const created = await createSwitch(smtpDb, {
      name: 'SMTP Switch',
      mode: 'heartbeat',
      heartbeatIntervalDays: 7,
    });

    const sw = await markSwitchStatus(smtpDb, created.id, 'warning', {});

    const result = await processRemindersForSwitch(smtpDb, sw, NOW);

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);

    // Notification event recorded as 'sent'
    const events = await smtpDb.select().from(notificationEvents);
    const sentEvent = events.find(e => e.status === 'sent');
    expect(sentEvent).toBeDefined();
    expect(sentEvent?.channel).toBe('email');

    // mockSendMail should have been called
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  // ── Test 8: Returns {sent, skipped} counts ────────────────────────────────

  it('returns {sent, skipped} object with correct shape', async () => {
    const created = await createSwitch(db, {
      name: 'Count Switch',
      mode: 'trip',
      triggerAt: new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000), // far future
    });

    // armed but warningStartsAt is far out → no reminder needed
    const sw = await markSwitchStatus(db, created.id, 'armed', {
      warningStartsAt: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days away, not within 24h
    });

    const result = await processRemindersForSwitch(db, sw, NOW);

    expect(result).toHaveProperty('sent');
    expect(result).toHaveProperty('skipped');
    expect(typeof result.sent).toBe('number');
    expect(typeof result.skipped).toBe('number');
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
