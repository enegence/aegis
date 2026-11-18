import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../src/db/index.js';
import { appSettings } from '../src/db/schema.js';
import { seedSettingsFromEnvironment } from '../src/services/env-settings.js';
import { loadS3Config } from '../src/services/dead-drop-sync.js';
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
  'UNDERWING_S3_ENDPOINT',
  'UNDERWING_S3_FORCE_PATH_STYLE',
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

  // MinIO and other path-style providers need this; the storage code reads
  // the `s3_force_path_style` setting when it builds the S3 client config.
  describe('S3 path-style setting', () => {
    function setS3Env(prefix: 'UNDERWING' | 'AEGIS') {
      process.env[`${prefix}_S3_ENDPOINT`] = 'https://minio.example.test:9000';
      process.env[`${prefix}_S3_ACCESS_KEY_ID`] = 'access-key';
      process.env[`${prefix}_S3_SECRET_ACCESS_KEY`] = 'secret-key';
      process.env[`${prefix}_S3_REGION`] = 'us-east-1';
      process.env[`${prefix}_S3_BUCKET`] = 'bucket';
    }

    it('imports UNDERWING_S3_FORCE_PATH_STYLE and the storage config uses it', async () => {
      const db = createTestDb();
      migrate(db, { migrationsFolder: './drizzle' });
      setS3Env('UNDERWING');
      process.env.UNDERWING_S3_FORCE_PATH_STYLE = 'true';

      await seedSettingsFromEnvironment(db, FIELD_KEY);
      const rows = await db.select().from(appSettings).where(eq(appSettings.key, 's3_force_path_style'));
      expect(rows[0].value).toBe('true');
      expect((await loadS3Config(db, FIELD_KEY))?.forcePathStyle).toBe(true);
    });

    it('still reads the older AEGIS_S3_FORCE_PATH_STYLE name', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const db = createTestDb();
      migrate(db, { migrationsFolder: './drizzle' });
      setS3Env('AEGIS');
      process.env.AEGIS_S3_FORCE_PATH_STYLE = 'true';

      await seedSettingsFromEnvironment(db, FIELD_KEY);
      expect((await loadS3Config(db, FIELD_KEY))?.forcePathStyle).toBe(true);
      expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toContain('AEGIS_S3_FORCE_PATH_STYLE');
      warn.mockRestore();
    });

    it.each(['TRUE', ' true ', '1'])('accepts %j as on', async (value) => {
      const db = createTestDb();
      migrate(db, { migrationsFolder: './drizzle' });
      setS3Env('UNDERWING');
      process.env.UNDERWING_S3_FORCE_PATH_STYLE = value;

      await seedSettingsFromEnvironment(db, FIELD_KEY);
      expect((await loadS3Config(db, FIELD_KEY))?.forcePathStyle).toBe(true);
    });

    it.each(['false', '0', 'no'])('treats %j as off', async (value) => {
      const db = createTestDb();
      migrate(db, { migrationsFolder: './drizzle' });
      setS3Env('UNDERWING');
      process.env.UNDERWING_S3_FORCE_PATH_STYLE = value;

      await seedSettingsFromEnvironment(db, FIELD_KEY);
      const rows = await db.select().from(appSettings).where(eq(appSettings.key, 's3_force_path_style'));
      expect(rows[0].value).toBe('false');
      expect((await loadS3Config(db, FIELD_KEY))?.forcePathStyle).toBe(false);
    });

    it('stays off when the variable is not set', async () => {
      const db = createTestDb();
      migrate(db, { migrationsFolder: './drizzle' });
      setS3Env('UNDERWING');

      await seedSettingsFromEnvironment(db, FIELD_KEY);
      expect((await loadS3Config(db, FIELD_KEY))?.forcePathStyle).toBe(false);
    });
  });
});
