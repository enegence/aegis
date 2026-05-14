import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createTestDb, type AegisDb } from '../src/db/index.js';
import { appSettings, notificationEvents } from '../src/db/schema.js';
import { renderTemplate } from '../src/services/notification-templates.js';
import {
  sendSmtpNotification,
  type SmtpConfig,
} from '../src/services/providers/smtp.js';
import {
  sendTelegramNotification,
  type TelegramConfig,
} from '../src/services/providers/telegram.js';
import { dispatchNotification } from '../src/services/notifications.js';
import { encryptField } from '../src/services/field-encrypt.js';

// ─── Mock nodemailer ──────────────────────────────────────────────────────────

const mockSendMail = vi.fn();
const mockVerify = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      verify: mockVerify,
    })),
  },
}));

// ─── Mock fetch for Telegram ──────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_SMTP_CONFIG: SmtpConfig = {
  host: 'smtp.example.com',
  port: 587,
  user: 'noreply@example.com',
  password: 'secret-password',
  fromEmail: 'noreply@example.com',
};

const TEST_TELEGRAM_CONFIG: TelegramConfig = {
  botToken: 'bot-secret-token',
  chatId: '123456789',
};

// ─── Template tests ───────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('owner_test_notification returns subject and body', () => {
    const result = renderTemplate('owner_test_notification', {
      switchName: 'My Switch',
    });
    expect(result.subject).toBeTruthy();
    expect(result.body).toBeTruthy();
    expect(result.body).toContain('My Switch');
  });

  it('owner_heartbeat_reminder body contains switch name, no PII', () => {
    const result = renderTemplate('owner_heartbeat_reminder', {
      switchName: 'Health Check',
      nextActionAt: '2026-06-01T12:00:00Z',
    });
    expect(result.body).toContain('Health Check');
    expect(result.body).toContain('2026-06-01T12:00:00Z');
    // Must not contain PII-style terms
    expect(result.body).not.toMatch(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
    expect(result.body).not.toMatch(/\+?[0-9]{7,}/);
  });

  it('owner_warning_started body contains switch name', () => {
    const result = renderTemplate('owner_warning_started', {
      switchName: 'Family Data',
    });
    expect(result.body).toContain('Family Data');
  });

  it('no template output contains "email", "phone", "password", or "token"', () => {
    const purposes = [
      'owner_test_notification',
      'owner_trip_reminder',
      'owner_heartbeat_reminder',
      'owner_warning_started',
      'owner_trigger_reached_local_only',
    ] as const;

    const forbidden = ['password', 'token'];

    for (const purpose of purposes) {
      const result = renderTemplate(purpose, {
        switchName: 'My Switch',
        nextActionAt: '2026-06-01',
        mode: 'heartbeat',
      });
      const combined = (result.subject + ' ' + result.body).toLowerCase();
      for (const word of forbidden) {
        expect(combined, `Template '${purpose}' contains forbidden word '${word}'`).not.toContain(word);
      }
    }
  });
});

// ─── SMTP provider tests ──────────────────────────────────────────────────────

describe('sendSmtpNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('with mocked transport succeeds and returns ok=true', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: '<test-id@example.com>' });

    const result = await sendSmtpNotification(TEST_SMTP_CONFIG, {
      to: 'contact@example.com',
      subject: 'Test',
      body: 'Hello from Aegis',
      purpose: 'test',
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('<test-id@example.com>');
    expect(result.error).toBeUndefined();
  });

  it('with mocked transport failure returns ok=false with sanitized error', async () => {
    mockSendMail.mockRejectedValueOnce(
      new Error(`Authentication failed for user ${TEST_SMTP_CONFIG.user} with password ${TEST_SMTP_CONFIG.password}`)
    );

    const result = await sendSmtpNotification(TEST_SMTP_CONFIG, {
      to: 'contact@example.com',
      body: 'Hello',
      purpose: 'test',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    // Password must be redacted
    expect(result.error).not.toContain('secret-password');
    // Email addresses should be redacted
    expect(result.error).not.toContain('noreply@example.com');
  });
});

// ─── Telegram provider tests ──────────────────────────────────────────────────

describe('sendTelegramNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('with mocked fetch succeeds and returns ok=true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    });

    const result = await sendTelegramNotification(TEST_TELEGRAM_CONFIG, {
      to: '123456789',
      body: 'Aegis notification',
      purpose: 'reminder',
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('42');
  });

  it('with mocked fetch failure returns ok=false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, description: 'Unauthorized' }),
    });

    const result = await sendTelegramNotification(TEST_TELEGRAM_CONFIG, {
      to: '123456789',
      body: 'Aegis notification',
      purpose: 'test',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ─── Dispatch notification tests ─────────────────────────────────────────────

describe('dispatchNotification', () => {
  let db: AegisDb;

  beforeAll(() => {
    db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('with no config stored → records "skipped" in notification_events', async () => {
    await dispatchNotification(db, {
      channel: 'email',
      purpose: 'test',
      to: 'contact@example.com',
      body: 'Test notification',
    });

    const events = await db.select().from(notificationEvents);
    const last = events[events.length - 1];
    expect(last.status).toBe('skipped');
    expect(last.failureReason).toBe('smtp_not_configured');
  });

  it('with no telegram config stored → records "skipped"', async () => {
    await dispatchNotification(db, {
      channel: 'telegram',
      purpose: 'test',
      to: '123456789',
      body: 'Test notification',
    });

    const events = await db.select().from(notificationEvents);
    const last = events[events.length - 1];
    expect(last.status).toBe('skipped');
    expect(last.failureReason).toBe('telegram_not_configured');
  });

  it('dispatchNotification records "sent" on success (email)', async () => {
    // Insert SMTP config into appSettings
    const TEST_FIELD_KEY = 'dev-field-key-change-me-32bytes!!';
    await db.insert(appSettings).values([
      { key: 'smtp.host', value: 'smtp.example.com', encrypted: false },
      { key: 'smtp.port', value: '587', encrypted: false },
      { key: 'smtp.user', value: 'noreply@example.com', encrypted: false },
      { key: 'smtp.password', value: encryptField('secret', TEST_FIELD_KEY), encrypted: true },
      { key: 'smtp.fromEmail', value: 'noreply@example.com', encrypted: false },
    ]);

    mockSendMail.mockResolvedValueOnce({ messageId: '<sent-id@example.com>' });

    await dispatchNotification(db, {
      channel: 'email',
      purpose: 'reminder',
      to: 'someone@example.com',
      body: 'Check in reminder',
    });

    const events = await db.select().from(notificationEvents);
    const sent = events.find(e => e.status === 'sent');
    expect(sent).toBeDefined();
    expect(sent?.externalId).toBe('<sent-id@example.com>');
  });
});
