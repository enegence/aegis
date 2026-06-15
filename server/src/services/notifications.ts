import { eq } from 'drizzle-orm';
import { appSettings, notificationEvents } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';
import { decryptField } from './field-encrypt.js';
import { sendSmtpNotification, type SmtpConfig } from './providers/smtp.js';
import { sendTelegramNotification, type TelegramConfig } from './providers/telegram.js';
import { loadConfig } from '../config.js';

export interface NotificationDispatchRequest {
  switchId?: number;
  contactId?: number;
  channel: 'email' | 'telegram';
  purpose: 'test' | 'reminder' | 'warning' | 'triggered' | 'claim';
  to: string;         // email address or telegram chat ID
  subject?: string;
  body: string;
}

async function getSettingValue(
  db: AegisDb,
  key: string,
): Promise<{ value: string | null; encrypted: boolean } | null> {
  const rows = await db
    .select({ value: appSettings.value, encrypted: appSettings.encrypted })
    .from(appSettings)
    .where(eq(appSettings.key, key));

  if (rows.length === 0 || rows[0].value == null) return null;
  return { value: rows[0].value, encrypted: rows[0].encrypted };
}

async function getDecryptedSetting(db: AegisDb, key: string): Promise<string | null> {
  const row = await getSettingValue(db, key);
  if (!row || !row.value) return null;

  if (row.encrypted) {
    const config = loadConfig({ testing: true });
    return decryptField(row.value, config.fieldEncryptionKey);
  }

  return row.value;
}

async function getPlainSetting(db: AegisDb, key: string): Promise<string | null> {
  const row = await getSettingValue(db, key);
  return row?.value ?? null;
}

export async function getSmtpConfig(db: AegisDb): Promise<SmtpConfig | null> {
  const host = await getPlainSetting(db, 'smtp.host');
  if (!host) return null;

  const portStr = await getPlainSetting(db, 'smtp.port');
  const user = await getPlainSetting(db, 'smtp.user');
  const password = await getDecryptedSetting(db, 'smtp.password');
  const fromEmail = await getPlainSetting(db, 'smtp.fromEmail');
  const secureStr = await getPlainSetting(db, 'smtp.secure');

  if (!user || !password || !fromEmail) return null;

  return {
    host,
    port: portStr ? parseInt(portStr, 10) : 587,
    user,
    password,
    fromEmail,
    secure: secureStr === null ? undefined : secureStr === 'true',
  };
}

export async function getTelegramConfig(db: AegisDb): Promise<TelegramConfig | null> {
  const botToken = await getDecryptedSetting(db, 'telegram.botToken');
  if (!botToken) return null;

  const chatId = await getPlainSetting(db, 'telegram.chatId');
  if (!chatId) return null;

  return { botToken, chatId };
}

export async function dispatchNotification(
  db: AegisDb,
  req: NotificationDispatchRequest,
): Promise<void> {
  // Insert a queued record first
  const inserted = await db
    .insert(notificationEvents)
    .values({
      switchId: req.switchId ?? null,
      contactId: req.contactId ?? null,
      channel: req.channel,
      purpose: req.purpose,
      status: 'queued',
    })
    .returning({ id: notificationEvents.id });

  const eventId = inserted[0]?.id;

  // Load provider config
  let result: { ok: boolean; externalId?: string; error?: string };

  if (req.channel === 'email') {
    const config = await getSmtpConfig(db);
    if (!config) {
      await db
        .update(notificationEvents)
        .set({ status: 'skipped', failureReason: 'smtp_not_configured' })
        .where(eq(notificationEvents.id, eventId));
      return;
    }

    result = await sendSmtpNotification(config, {
      to: req.to,
      subject: req.subject,
      body: req.body,
      purpose: req.purpose,
    });
  } else if (req.channel === 'telegram') {
    const config = await getTelegramConfig(db);
    if (!config) {
      await db
        .update(notificationEvents)
        .set({ status: 'skipped', failureReason: 'telegram_not_configured' })
        .where(eq(notificationEvents.id, eventId));
      return;
    }

    result = await sendTelegramNotification(config, {
      to: req.to,
      body: req.body,
      purpose: req.purpose,
    });
  } else {
    await db
      .update(notificationEvents)
      .set({ status: 'skipped', failureReason: 'unsupported_channel' })
      .where(eq(notificationEvents.id, eventId));
    return;
  }

  if (result.ok) {
    await db
      .update(notificationEvents)
      .set({
        status: 'sent',
        externalId: result.externalId ?? null,
        sentAt: new Date(),
      })
      .where(eq(notificationEvents.id, eventId));
  } else {
    await db
      .update(notificationEvents)
      .set({
        status: 'failed',
        failureReason: result.error ?? 'unknown_error',
      })
      .where(eq(notificationEvents.id, eventId));
  }
}
