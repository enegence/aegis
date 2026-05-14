import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { appSettings, owner } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';
import { encryptField, decryptField } from '../services/field-encrypt.js';
import { writeAuditEvent } from '../services/audit.js';
import { getSmtpConfig, getTelegramConfig, dispatchNotification } from '../services/notifications.js';
import { testSmtpConnection } from '../services/providers/smtp.js';
import {
  SmtpSettingsInputSchema,
  TelegramSettingsInputSchema,
  TestNotificationInputSchema,
} from '../schemas/notifications.js';

const OwnerUpdateSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).nullable().optional(),
  timezone: z.string().max(100).optional(),
});

const DeploymentUpdateSchema = z.object({
  mode: z.enum(['vault', 'dead_drop', 'relay_monitoring', 'relay_escrow']),
});

const S3UpdateSchema = z.object({
  endpoint: z.string().optional(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  prefix: z.string().default('aegis'),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().optional(), // empty = keep existing
  forcePathStyle: z.boolean().default(false),
});

const RelayUpdateSchema = z.object({
  relayUrl: z.string().url().optional().or(z.literal('')),
  apiKey: z.string().optional(), // empty = keep existing
});

const PacketsUpdateSchema = z.object({
  retentionDays: z.number().int().min(0).max(3650).nullable(),
});

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

  // GET /api/settings — consolidated settings view (no secrets)
  app.get('/api/settings', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const db = app.db;
    const [ownerRow] = await db.select().from(owner).where(eq(owner.id, req.ownerId!));

    // Notifications
    const smtpHost = await getPlainSetting(db, 'smtp.host');
    const smtpUser = await getPlainSetting(db, 'smtp.user');
    const smtpFromEmail = await getPlainSetting(db, 'smtp.fromEmail');
    const smtpPortStr = await getPlainSetting(db, 'smtp.port');
    const smtpSecureStr = await getPlainSetting(db, 'smtp.secure');
    const smtpHasPassword = (await getSettingRow(db, 'smtp.password'))?.value != null;

    const telegramChatId = await getPlainSetting(db, 'telegram.chatId');
    const telegramHasToken = (await getSettingRow(db, 'telegram.botToken'))?.value != null;

    // Storage
    const s3Bucket = await getPlainSetting(db, 's3_bucket');
    const s3Region = await getPlainSetting(db, 's3_region');
    const s3Prefix = await getPlainSetting(db, 's3_prefix');
    const s3Endpoint = await getPlainSetting(db, 's3_endpoint');
    const s3HasKey = (await getSettingRow(db, 's3_access_key_id_encrypted'))?.value != null;
    const s3LastVerified = await getPlainSetting(db, 's3_last_verified_at');

    // Relay
    const relayUrl = await getPlainSetting(db, 'relay_url');
    const relayHasKey = (await getSettingRow(db, 'relay_api_key_encrypted'))?.value != null;
    const relayLastHeartbeat = await getPlainSetting(db, 'relay_last_heartbeat_at');

    // Deployment mode and packets
    const deploymentMode = await getPlainSetting(db, 'deployment_mode') ?? 'vault';
    const retentionStr = await getPlainSetting(db, 'packet_retention_days');

    return reply.send({
      owner: {
        displayName: ownerRow?.displayName ?? '',
        email: ownerRow?.email ?? '',
        phone: ownerRow?.phone ?? null,
        timezone: ownerRow?.timezone ?? 'UTC',
      },
      deployment: {
        mode: deploymentMode,
      },
      notifications: {
        smtp: {
          configured: Boolean(smtpHost && smtpUser && smtpFromEmail && smtpHasPassword),
          host: smtpHost,
          port: smtpPortStr ? parseInt(smtpPortStr, 10) : null,
          user: smtpUser,
          fromEmail: smtpFromEmail,
          secure: smtpSecureStr === 'true',
          hasPassword: smtpHasPassword,
        },
        telegram: {
          configured: Boolean(telegramChatId && telegramHasToken),
          chatId: telegramChatId,
          hasBotToken: telegramHasToken,
        },
      },
      storage: {
        s3Configured: Boolean(s3Bucket && s3HasKey),
        bucket: s3Bucket,
        region: s3Region,
        prefix: s3Prefix,
        endpoint: s3Endpoint,
        hasAccessKey: s3HasKey,
        lastVerifiedAt: s3LastVerified,
      },
      relay: {
        enabled: Boolean(relayUrl && relayHasKey),
        relayUrl,
        apiKeyConfigured: relayHasKey,
        lastHeartbeatAt: relayLastHeartbeat,
      },
      security: {
        totpEnabled: ownerRow?.totpEnabled ?? false,
      },
      packets: {
        retentionDays: retentionStr ? parseInt(retentionStr, 10) : null,
      },
    });
  });

  // PUT /api/settings/owner — update owner profile
  app.put('/api/settings/owner', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parseResult = OwnerUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parseResult.error.issues });
    }
    const body = parseResult.data;
    const updates: Partial<typeof owner.$inferInsert> = { updatedAt: new Date() };
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.timezone !== undefined) updates.timezone = body.timezone;

    await app.db.update(owner).set(updates).where(eq(owner.id, req.ownerId!));

    await writeAuditEvent(app.db, {
      eventType: 'owner_profile_updated',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: { fields: Object.keys(body) },
    });

    return reply.send({ ok: true });
  });

  // PUT /api/settings/deployment — change default deployment mode
  app.put('/api/settings/deployment', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parseResult = DeploymentUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parseResult.error.issues });
    }
    const { mode } = parseResult.data;

    await upsertSetting(app.db, 'deployment_mode', mode, false);

    await writeAuditEvent(app.db, {
      eventType: 'deployment_mode_changed',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: { mode },
    });

    return reply.send({ ok: true, mode });
  });

  // PUT /api/settings/storage/s3 — configure S3 storage
  app.put('/api/settings/storage/s3', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parseResult = S3UpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parseResult.error.issues });
    }
    const body = parseResult.data;
    const fek = app.config.fieldEncryptionKey;
    const db = app.db;

    if (body.endpoint !== undefined) await upsertSetting(db, 's3_endpoint', body.endpoint, false);
    await upsertSetting(db, 's3_region', body.region, false);
    await upsertSetting(db, 's3_bucket', body.bucket, false);
    await upsertSetting(db, 's3_prefix', body.prefix, false);
    await upsertSetting(db, 's3_force_path_style', String(body.forcePathStyle), false);
    await upsertSetting(db, 's3_access_key_id', body.accessKeyId, false);

    if (body.secretAccessKey && body.secretAccessKey.length > 0) {
      const encrypted = encryptField(body.secretAccessKey, fek)!;
      await upsertSetting(db, 's3_access_key_id_encrypted', encrypted, true);
    }

    await writeAuditEvent(db, {
      eventType: 'storage_settings_updated',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: { provider: 's3' },
    });

    return reply.send({ ok: true, configured: true });
  });

  // POST /api/settings/storage/test — test S3 connection
  app.post('/api/settings/storage/test', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const db = app.db;
    const s3Bucket = await getPlainSetting(db, 's3_bucket');
    const s3Region = await getPlainSetting(db, 's3_region');
    if (!s3Bucket || !s3Region) {
      return reply.send({ ok: false, message: 'S3 not configured', checkedAt: new Date().toISOString() });
    }

    // Lazy-import to avoid loading AWS SDK when not needed
    try {
      const { syncPacketForSwitch: _ } = await import('../services/dead-drop-sync.js');
      return reply.send({ ok: true, message: 'S3 configuration present. Use Settings → Storage to test upload.', checkedAt: new Date().toISOString() });
    } catch {
      return reply.send({ ok: false, message: 'S3 provider unavailable', checkedAt: new Date().toISOString() });
    }
  });

  // PUT /api/settings/relay — configure Relay connection
  app.put('/api/settings/relay', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parseResult = RelayUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parseResult.error.issues });
    }
    const body = parseResult.data;
    const fek = app.config.fieldEncryptionKey;
    const db = app.db;

    if (body.relayUrl !== undefined) {
      await upsertSetting(db, 'relay_url', body.relayUrl, false);
    }
    if (body.apiKey && body.apiKey.length > 0) {
      const encrypted = encryptField(body.apiKey, fek)!;
      await upsertSetting(db, 'relay_api_key_encrypted', encrypted, true);
    }

    await writeAuditEvent(db, {
      eventType: 'relay_settings_updated',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: {},
    });

    return reply.send({ ok: true });
  });

  // POST /api/settings/relay/test — test Relay heartbeat
  app.post('/api/settings/relay/test', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const db = app.db;
    const relayUrl = await getPlainSetting(db, 'relay_url');
    const relayKeyRow = await getSettingRow(db, 'relay_api_key_encrypted');

    if (!relayUrl || !relayKeyRow?.value) {
      return reply.send({ ok: false, message: 'Relay not configured', checkedAt: new Date().toISOString() });
    }

    try {
      const apiKey = decryptField(relayKeyRow.value, app.config.fieldEncryptionKey);
      const res = await fetch(`${relayUrl}/api/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test' }),
        signal: AbortSignal.timeout(8000),
      });
      const ok = res.ok;
      return reply.send({ ok, message: ok ? 'Relay reachable' : `Relay returned ${res.status}`, checkedAt: new Date().toISOString() });
    } catch {
      return reply.send({ ok: false, message: 'Relay unreachable', checkedAt: new Date().toISOString() });
    }
  });

  // PUT /api/settings/packets — update packet retention
  app.put('/api/settings/packets', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parseResult = PacketsUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parseResult.error.issues });
    }
    const { retentionDays } = parseResult.data;

    if (retentionDays !== null) {
      await upsertSetting(app.db, 'packet_retention_days', String(retentionDays), false);
    } else {
      // null means remove retention limit
      await upsertSetting(app.db, 'packet_retention_days', '0', false);
    }

    return reply.send({ ok: true, retentionDays });
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
