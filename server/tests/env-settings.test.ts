import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../src/db/index.js';
import { appSettings } from '../src/db/schema.js';
import { seedSettingsFromEnvironment } from '../src/services/env-settings.js';
import { decryptField } from '../src/services/field-encrypt.js';

const FIELD_KEY = 'dev-field-key-change-me-32bytes!!';
const ENV_KEYS = [
  'AEGIS_SMTP_HOST',
  'AEGIS_SMTP_PORT',
  'AEGIS_SMTP_USER',
  'AEGIS_SMTP_PASSWORD',
  'AEGIS_SMTP_FROM',
  'AEGIS_SMTP_SECURE',
  'AEGIS_S3_ACCESS_KEY_ID',
  'AEGIS_S3_SECRET_ACCESS_KEY',
  'AEGIS_S3_REGION',
  'AEGIS_S3_BUCKET',
  'AEGIS_S3_PREFIX',
];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('seedSettingsFromEnvironment', () => {
  it('imports setup SMTP environment into app settings using runtime keys', async () => {
    const db = createTestDb();
    migrate(db, { migrationsFolder: './drizzle' });
    process.env.AEGIS_SMTP_HOST = 'smtp.example.com';
    process.env.AEGIS_SMTP_PORT = '465';
    process.env.AEGIS_SMTP_USER = 'mailer@example.com';
    process.env.AEGIS_SMTP_PASSWORD = 'smtp-secret';
    process.env.AEGIS_SMTP_FROM = 'mailer@example.com';
    process.env.AEGIS_SMTP_SECURE = 'true';

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
    process.env.AEGIS_S3_ACCESS_KEY_ID = 'access-key';
    process.env.AEGIS_S3_SECRET_ACCESS_KEY = 'secret-key';
    process.env.AEGIS_S3_REGION = 'us-east-1';
    process.env.AEGIS_S3_BUCKET = 'bucket';
    process.env.AEGIS_S3_PREFIX = 'aegis';

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
});
