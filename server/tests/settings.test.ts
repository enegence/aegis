import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/index.js';
import { auditEvents } from '../src/db/schema.js';
import { desc } from 'drizzle-orm';

// ─── Mock nodemailer (prevent real SMTP connections) ──────────────────────────

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

// ─── Mock fetch (prevent real Telegram calls) ─────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SMTP_PAYLOAD = {
  host: 'smtp.example.com',
  port: 587,
  user: 'noreply@example.com',
  password: 'super-secret-password',
  fromEmail: 'noreply@example.com',
  secure: false,
};

const TELEGRAM_PAYLOAD = {
  botToken: 'bot-secret-token-12345',
  chatId: '987654321',
};

describe('Notification Settings Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });

    // Setup owner
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { displayName: 'Settings Owner', email: 'settings@test.com', password: 'testpass123', timezone: 'UTC' },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'testpass123' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await app.inject({
      method: 'GET',
      url: '/api/csrf',
      headers: { cookie: cookies },
    });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── 1. Unauthenticated GET returns 401 ──────────────────────────────────────

  it('GET /api/settings/notifications — unauthenticated returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings/notifications' });
    expect(res.statusCode).toBe(401);
  });

  // ─── 2. GET returns empty config when nothing stored ─────────────────────────

  it('GET /api/settings/notifications — returns empty config (no settings stored)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/notifications',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.smtp).toBeDefined();
    expect(body.smtp.hasPassword).toBe(false);
    expect(body.smtp.configured).toBe(false);
    expect(body.telegram).toBeDefined();
    expect(body.telegram.hasBotToken).toBe(false);
    expect(body.telegram.configured).toBe(false);
    // Must not contain secret fields
    expect(body.smtp.password).toBeUndefined();
    expect(body.telegram.botToken).toBeUndefined();
  });

  // ─── 3. Missing CSRF on PUT returns 403 ──────────────────────────────────────

  it('PUT /api/settings/notifications/smtp — missing CSRF returns 403', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings/notifications/smtp',
      headers: { cookie: cookies },
      payload: SMTP_PAYLOAD,
    });
    expect(res.statusCode).toBe(403);
  });

  // ─── 4. PUT smtp saves settings, GET no longer empty ─────────────────────────

  it('PUT /api/settings/notifications/smtp — saves settings, GET shows them', async () => {
    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/settings/notifications/smtp',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: SMTP_PAYLOAD,
    });
    expect(putRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/settings/notifications',
      headers: { cookie: cookies },
    });
    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.payload);
    expect(body.smtp.host).toBe('smtp.example.com');
    expect(body.smtp.port).toBe(587);
    expect(body.smtp.user).toBe('noreply@example.com');
    expect(body.smtp.fromEmail).toBe('noreply@example.com');
    expect(body.smtp.secure).toBe(false);
    expect(body.smtp.hasPassword).toBe(true);
    expect(body.smtp.configured).toBe(true);
  });

  // ─── 5. GET response never contains password field ───────────────────────────

  it('PUT /api/settings/notifications/smtp — GET response never contains password', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/settings/notifications',
      headers: { cookie: cookies },
    });
    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.payload);
    expect(body.smtp.password).toBeUndefined();
    // The raw payload should not contain the actual password string
    expect(getRes.payload).not.toContain('super-secret-password');
  });

  // ─── 6. PUT telegram saves chatId and botToken ───────────────────────────────

  it('PUT /api/settings/notifications/telegram — saves chatId and botToken', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings/notifications/telegram',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: TELEGRAM_PAYLOAD,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.chatId).toBe('987654321');
    expect(body.hasBotToken).toBe(true);
    expect(body.configured).toBe(true);
    // Should never expose the token
    expect(body.botToken).toBeUndefined();
    expect(res.payload).not.toContain('bot-secret-token-12345');
  });

  // ─── 7. GET after both saves shows hasPassword=true and hasBotToken=true ─────

  it('GET after both saves — hasPassword=true, hasBotToken=true', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/notifications',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.smtp.hasPassword).toBe(true);
    expect(body.smtp.configured).toBe(true);
    expect(body.telegram.hasBotToken).toBe(true);
    expect(body.telegram.chatId).toBe('987654321');
    expect(body.telegram.configured).toBe(true);
  });

  // ─── 8. POST test with email channel, provider configured, returns ok ─────────

  it('POST /api/settings/notifications/test — email channel with config returns ok', async () => {
    // Mock nodemailer to succeed
    mockSendMail.mockResolvedValueOnce({ messageId: '<test-msg@example.com>' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/notifications/test',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { channel: 'email', purpose: 'test' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(true);
  });

  it('POST /api/settings/notifications/test — defaults purpose to test when omitted', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: '<default-purpose@example.com>' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/settings/notifications/test',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { channel: 'email' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).ok).toBe(true);
  });

  // ─── 9. POST test telegram with no config returns ok=false ───────────────────

  it('POST /api/settings/notifications/test — telegram channel, no config, ok=false with message', async () => {
    // Build a fresh app with no settings stored
    const freshApp = await buildApp({ testing: true, dbPath: ':memory:' });
    await freshApp.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { displayName: 'Fresh Owner', email: 'fresh@test.com', password: 'testpass123', timezone: 'UTC' },
    });
    const loginRes = await freshApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'testpass123' },
    });
    const freshCookies = String(loginRes.headers['set-cookie']);
    const csrfRes = await freshApp.inject({
      method: 'GET',
      url: '/api/csrf',
      headers: { cookie: freshCookies },
    });
    const freshCsrf = JSON.parse(csrfRes.payload).csrfToken;

    const res = await freshApp.inject({
      method: 'POST',
      url: '/api/settings/notifications/test',
      headers: { cookie: freshCookies, 'x-csrf-token': freshCsrf },
      payload: { channel: 'telegram', purpose: 'test' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ok).toBe(false);
    expect(body.message).toBeDefined();

    await freshApp.close();
  });

  // ─── 10. Audit event written for settings change ──────────────────────────────

  it('Audit event written for SMTP settings change', async () => {
    // Save SMTP settings (already done but let's do one more update to confirm fresh audit)
    mockSendMail.mockResolvedValue({ messageId: '<audit-test@example.com>' });

    await app.inject({
      method: 'PUT',
      url: '/api/settings/notifications/smtp',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { ...SMTP_PAYLOAD, host: 'smtp2.example.com' },
    });

    const events = await app.db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt));

    const settingsEvent = events.find(e => e.eventType === 'notification_settings_updated');
    expect(settingsEvent).toBeDefined();
    expect(settingsEvent?.metadata).toBeDefined();
    const meta = JSON.parse(settingsEvent!.metadata!);
    expect(meta.channel).toBe('smtp');
    // Must not contain password
    expect(settingsEvent!.metadata).not.toContain('password');
  });

  it('PUT /api/settings/notifications/smtp — blank password keeps existing secret', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings/notifications/smtp',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        host: 'smtp-kept.example.com',
        port: 2525,
        user: 'updated@example.com',
        password: '',
        fromEmail: 'updated@example.com',
        secure: true,
      },
    });
    expect(res.statusCode).toBe(200);

    mockSendMail.mockResolvedValueOnce({ messageId: '<kept-password@example.com>' });
    const testRes = await app.inject({
      method: 'POST',
      url: '/api/settings/notifications/test',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { channel: 'email' },
    });
    expect(testRes.statusCode).toBe(200);
    expect(JSON.parse(testRes.payload).ok).toBe(true);
  });

  it('PUT /api/settings/notifications/telegram — blank bot token keeps existing secret', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 123 } }),
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings/notifications/telegram',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { botToken: '', chatId: '111222333' },
    });
    expect(res.statusCode).toBe(200);

    const testRes = await app.inject({
      method: 'POST',
      url: '/api/settings/notifications/test',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { channel: 'telegram' },
    });
    expect(testRes.statusCode).toBe(200);
    expect(JSON.parse(testRes.payload).ok).toBe(true);
  });
});
