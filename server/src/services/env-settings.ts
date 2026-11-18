import { eq } from 'drizzle-orm';
import type { UnderwingDb } from '../db/index.js';
import { appSettings } from '../db/schema.js';
import { encryptField } from './field-encrypt.js';
import { readEnv } from '../env.js';

type EnvSetting = {
  /** Variable name without its prefix: UNDERWING_<name>, or AEGIS_<name> on older installs. */
  envName: string;
  key: string;
  encrypted: boolean;
  /** Stored as 'true' or 'false'; `true` and `1` (any case) turn it on. */
  boolean?: boolean;
};

const ENV_SETTINGS: EnvSetting[] = [
  { envName: 'SMTP_HOST', key: 'smtp.host', encrypted: false },
  { envName: 'SMTP_PORT', key: 'smtp.port', encrypted: false },
  { envName: 'SMTP_USER', key: 'smtp.user', encrypted: false },
  { envName: 'SMTP_PASSWORD', key: 'smtp.password', encrypted: true },
  { envName: 'SMTP_FROM', key: 'smtp.fromEmail', encrypted: false },
  { envName: 'SMTP_SECURE', key: 'smtp.secure', encrypted: false },
  { envName: 'TELEGRAM_BOT_TOKEN', key: 'telegram.botToken', encrypted: true },
  { envName: 'TELEGRAM_CHAT_ID', key: 'telegram.chatId', encrypted: false },
  { envName: 'S3_ENDPOINT', key: 's3_endpoint', encrypted: false },
  { envName: 'S3_REGION', key: 's3_region', encrypted: false },
  { envName: 'S3_BUCKET', key: 's3_bucket', encrypted: false },
  { envName: 'S3_ACCESS_KEY_ID', key: 's3_access_key_id_encrypted', encrypted: true },
  { envName: 'S3_SECRET_ACCESS_KEY', key: 's3_secret_access_key_encrypted', encrypted: true },
  { envName: 'S3_PREFIX', key: 's3_prefix', encrypted: false },
  // For MinIO and other path-style providers. Read by loadS3Config in dead-drop-sync.ts.
  { envName: 'S3_FORCE_PATH_STYLE', key: 's3_force_path_style', encrypted: false, boolean: true },
];

function normalizeBoolean(raw: string): 'true' | 'false' {
  const value = raw.trim().toLowerCase();
  return value === 'true' || value === '1' ? 'true' : 'false';
}

async function settingExists(db: UnderwingDb, key: string): Promise<boolean> {
  const rows = await db
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(eq(appSettings.key, key));

  return rows.length > 0;
}

export async function seedSettingsFromEnvironment(
  db: UnderwingDb,
  fieldEncryptionKey: string,
): Promise<number> {
  let inserted = 0;

  for (const setting of ENV_SETTINGS) {
    const rawValue = readEnv(setting.envName);
    if (!rawValue || await settingExists(db, setting.key)) continue;

    const plainValue = setting.boolean ? normalizeBoolean(rawValue) : rawValue;
    const value = setting.encrypted
      ? encryptField(plainValue, fieldEncryptionKey)!
      : plainValue;

    await db.insert(appSettings).values({
      key: setting.key,
      value,
      encrypted: setting.encrypted,
      updatedAt: new Date(),
    });
    inserted += 1;
  }

  return inserted;
}
