import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { appSettings } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';
import { encryptField } from '../services/field-encrypt.js';
import { writeAuditEvent } from '../services/audit.js';
import { getSmtpConfig, getTelegramConfig, dispatchNotification } from '../services/notifications.js';
import {
  SmtpSettingsInputSchema,
  TelegramSettingsInputSchema,
  TestNotificationInputSchema,
} from '../schemas/notifications.js';

async function upsertSetting(
  db: AegisDb,
  key: string,
  value: string,
  encrypted: boolean,
): Promise<void> {
  const existing = await db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, key));
  if (existing.length > 0) {
    await db.update(appSettings).set({ value, encrypted, updatedAt: new Date() }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, encrypted, updatedAt: new Date() });
  }
}

export async function settingsRoutes(app: FastifyInstance) {
  // GET /api/settings/notifications — returns status (no secrets)
  app.get('/api/settings/notifications', {
    preHandler: [app.requireAuth],
  }, async (_req, reply) => {
    const db = app.db;

    // SMTP status
    const smtpHost = await getPlainSetting(db, 'smtp.host');
    const smtpPortStr = await getPlainSetting(db, 'smtp.port');
    const smtpUser = await getPlainSetting(db, 'smtp.user');
    const smtpFromEmail = await getPlainSetting(db, 'smtp.fromEmail');
    const smtpSecureStr = await getPlainSetting(db, 'smtp.secure');
    const smtpPasswordRow = await getSettingRow(db, 'smtp.password');

    const hasPassword = smtpPasswordRow != null && smtpPasswordRow.value != null;

    const smtpConfigured = Boolean(smtpHost && smtpUser && smtpFromEmail && hasPassword);

    const smtpStatus: Record<string, unknown> = { hasPassword, configured: smtpConfigured };
    if (smtpHost) smtpStatus.host = smtpHost;
    if (smtpPortStr) smtpStatus.port = parseInt(smtpPortStr, 10);
    if (smtpUser) smtpStatus.user = smtpUser;
    if (smtpFromEmail) smtpStatus.fromEmail = smtpFromEmail;
    if (smtpSecureStr !== null) smtpStatus.secure = smtpSecureStr === 'true';

    // Telegram status
    const telegramChatId = await getPlainSetting(db, 'telegram.chatId');
    const telegramTokenRow = await getSettingRow(db, 'telegram.botToken');
    const hasBotToken = telegramTokenRow != null && telegramTokenRow.value != null;
    const telegramConfigured = Boolean(telegramChatId && hasBotToken);

    const telegramStatus: Record<string, unknown> = { hasBotToken, configured: telegramConfigured };
    if (telegramChatId) telegramStatus.chatId = telegramChatId;

    return reply.send({
      smtp: smtpStatus,
      telegram: telegramStatus,
    });
  });

  // PUT /api/settings/notifications/smtp — save SMTP settings
  app.put('/api/settings/notifications/smtp', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const body = SmtpSettingsInputSchema.parse(req.body);
    const db = app.db;
    const key = app.config.fieldEncryptionKey;
    const existingPasswordRow = await getSettingRow(db, 'smtp.password');
    const shouldKeepExistingPassword =
      body.password.length === 0 &&
      existingPasswordRow != null &&
      existingPasswordRow.value != null;

    if (body.password.length === 0 && !shouldKeepExistingPassword) {
      return reply.status(400).send({ error: 'SMTP password is required' });
    }

    await upsertSetting(db, 'smtp.host', body.host, false);
    await upsertSetting(db, 'smtp.port', String(body.port), false);
    await upsertSetting(db, 'smtp.user', body.user, false);
    await upsertSetting(db, 'smtp.fromEmail', body.fromEmail, false);
    await upsertSetting(db, 'smtp.secure', String(body.secure), false);
    if (!shouldKeepExistingPassword) {
      const encryptedPassword = encryptField(body.password, key)!;
      await upsertSetting(db, 'smtp.password', encryptedPassword, true);
    }

    await writeAuditEvent(db, {
      eventType: 'notification_settings_updated',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: { channel: 'smtp' },
    });

    return reply.send({
      host: body.host,
      port: body.port,
      user: body.user,
      fromEmail: body.fromEmail,
      secure: body.secure,
      hasPassword: true,
      configured: true,
    });
  });

  // PUT /api/settings/notifications/telegram — save Telegram settings
  app.put('/api/settings/notifications/telegram', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const body = TelegramSettingsInputSchema.parse(req.body);
    const db = app.db;
    const key = app.config.fieldEncryptionKey;
    const existingTokenRow = await getSettingRow(db, 'telegram.botToken');
    const shouldKeepExistingToken =
      body.botToken.length === 0 &&
      existingTokenRow != null &&
      existingTokenRow.value != null;

    if (body.botToken.length === 0 && !shouldKeepExistingToken) {
      return reply.status(400).send({ error: 'Telegram bot token is required' });
    }

    await upsertSetting(db, 'telegram.chatId', body.chatId, false);
    if (!shouldKeepExistingToken) {
      const encryptedToken = encryptField(body.botToken, key)!;
      await upsertSetting(db, 'telegram.botToken', encryptedToken, true);
    }

    await writeAuditEvent(db, {
      eventType: 'notification_settings_updated',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: { channel: 'telegram' },
    });

    return reply.send({
      chatId: body.chatId,
      hasBotToken: true,
      configured: true,
    });
  });

  // POST /api/settings/notifications/test — send test notification
  app.post('/api/settings/notifications/test', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const body = TestNotificationInputSchema.parse(req.body);
    const db = app.db;
    let ok = false;
    let message: string | undefined;

    try {
      if (body.channel === 'email') {
        const config = await getSmtpConfig(db);
        if (!config) {
          message = 'SMTP not configured';
        } else {
          await dispatchNotification(db, {
            channel: 'email',
            purpose: 'test',
            to: config.user,
            subject: 'Aegis — Test Notification',
            body: 'This is a test notification from your Aegis instance.',
          });
          ok = true;
        }
      } else if (body.channel === 'telegram') {
        const config = await getTelegramConfig(db);
        if (!config) {
          message = 'Telegram not configured';
        } else {
          await dispatchNotification(db, {
            channel: 'telegram',
            purpose: 'test',
            to: config.chatId,
            body: 'This is a test notification from your Aegis instance.',
          });
          ok = true;
        }
      }
    } catch (err) {
      ok = false;
      message = 'Notification dispatch failed';
    }

    await writeAuditEvent(db, {
      eventType: 'notification_test_sent',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: { channel: body.channel, result: ok },
    });

    const response: { ok: boolean; message?: string } = { ok };
    if (message) response.message = message;
    return reply.send(response);
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getSettingRow(
  db: AegisDb,
  key: string,
): Promise<{ value: string | null; encrypted: boolean } | null> {
  const rows = await db
    .select({ value: appSettings.value, encrypted: appSettings.encrypted })
    .from(appSettings)
    .where(eq(appSettings.key, key));
  if (rows.length === 0) return null;
  return rows[0];
}

async function getPlainSetting(db: AegisDb, key: string): Promise<string | null> {
  const row = await getSettingRow(db, key);
  return row?.value ?? null;
}
