import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../src/db/index.js';
import { appSettings } from '../src/db/schema.js';
import { seedSettingsFromEnvironment } from '../src/services/env-settings.js';
import { decryptField } from '../src/services/field-encrypt.js';
import { resetEnvWarnings } from '../src/env.js';

const FIELD_KEY = 'dev-field-key-change-me-32bytes!!';
const ENV_KEYS = [
  'UNDERWING_SMTP_HOST',
  'UNDERWING_SMTP_PORT',
  'UNDERWING_SMTP_USER',
  'UNDERWING_SMTP_PASSWORD',
  'UNDERWING_SMTP_FROM',
  'UNDERWING_SMTP_SECURE',
  'UNDERWING_S3_ACCESS_KEY_ID',
  'UNDERWING_S3_SECRET_ACCESS_KEY',
  'UNDERWING_S3_REGION',
  'UNDERWING_S3_BUCKET',
  'UNDERWING_S3_PREFIX',
];

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
    delete process.env[key.replace('UNDERWING_', 'AEGIS_')];
  }
  resetEnvWarnings();
});

describe('seedSettingsFromEnvironment', () => {
  it('imports setup SMTP environment into app settings using runtime keys', async () => {
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
    process.env.UNDERWING_SMTP_HOST = 'smtp.example.com';
    process.env.UNDERWING_SMTP_PORT = '465';
    process.env.UNDERWING_SMTP_USER = 'mailer@example.com';
    process.env.UNDERWING_SMTP_PASSWORD = 'smtp-secret';
    process.env.UNDERWING_SMTP_FROM = 'mailer@example.com';
    process.env.UNDERWING_SMTP_SECURE = 'true';

    const inserted = await seedSettingsFromEnvironment(db, FIELD_KEY);
    expect(inserted).toBe(6);

    const passwordRows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'smtp.password'));
    expect(passwordRows).toHaveLength(1);
    expect(passwordRows[0].encrypted).toBe(true);
    expect(decryptField(passwordRows[0].value!, FIELD_KEY)).toBe('smtp-secret');

    const secureRows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'smtp.secure'));
    expect(secureRows[0].value).toBe('true');
  });

  it('imports setup S3 environment into app settings using runtime keys', async () => {
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
    process.env.UNDERWING_S3_ACCESS_KEY_ID = 'access-key';
    process.env.UNDERWING_S3_SECRET_ACCESS_KEY = 'secret-key';
    process.env.UNDERWING_S3_REGION = 'us-east-1';
    process.env.UNDERWING_S3_BUCKET = 'bucket';
    process.env.UNDERWING_S3_PREFIX = 'underwing';

    const inserted = await seedSettingsFromEnvironment(db, FIELD_KEY);
    expect(inserted).toBe(5);

    const accessRows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 's3_access_key_id_encrypted'));
    expect(accessRows).toHaveLength(1);
    expect(accessRows[0].encrypted).toBe(true);
    expect(decryptField(accessRows[0].value!, FIELD_KEY)).toBe('access-key');

    const bucketRows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 's3_bucket'));
    expect(bucketRows[0].value).toBe('bucket');
  });

  it('still imports settings from an older .env that uses AEGIS_* names', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
    process.env.AEGIS_SMTP_HOST = 'smtp.legacy.example';
    process.env.AEGIS_SMTP_PASSWORD = 'legacy-smtp-secret';
    process.env.AEGIS_S3_BUCKET = 'legacy-bucket';
    process.env.AEGIS_S3_PREFIX = 'aegis';

    const inserted = await seedSettingsFromEnvironment(db, FIELD_KEY);
    expect(inserted).toBe(4);

    const hostRows = await db.select().from(appSettings).where(eq(appSettings.key, 'smtp.host'));
    expect(hostRows[0].value).toBe('smtp.legacy.example');
    const passwordRows = await db.select().from(appSettings).where(eq(appSettings.key, 'smtp.password'));
    expect(decryptField(passwordRows[0].value!, FIELD_KEY)).toBe('legacy-smtp-secret');
    const prefixRows = await db.select().from(appSettings).where(eq(appSettings.key, 's3_prefix'));
    expect(prefixRows[0].value).toBe('aegis');

    const warned = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(warned).toContain('AEGIS_SMTP_PASSWORD');
    expect(warned).not.toContain('legacy-smtp-secret');
    warn.mockRestore();
  });

  it('prefers the new name when both are set', async () => {
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
    process.env.AEGIS_SMTP_HOST = 'smtp.old.example';
    process.env.UNDERWING_SMTP_HOST = 'smtp.new.example';

    await seedSettingsFromEnvironment(db, FIELD_KEY);
    const hostRows = await db.select().from(appSettings).where(eq(appSettings.key, 'smtp.host'));
    expect(hostRows[0].value).toBe('smtp.new.example');
  });
});
