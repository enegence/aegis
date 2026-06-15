import { eq } from 'drizzle-orm';
import type { AegisDb } from '../db/index.js';
import { appSettings } from '../db/schema.js';
import { encryptField } from './field-encrypt.js';

type EnvSetting = {
  envName: string;
  key: string;
  encrypted: boolean;
};

const ENV_SETTINGS: EnvSetting[] = [
  { envName: 'AEGIS_SMTP_HOST', key: 'smtp.host', encrypted: false },
  { envName: 'AEGIS_SMTP_PORT', key: 'smtp.port', encrypted: false },
  { envName: 'AEGIS_SMTP_USER', key: 'smtp.user', encrypted: false },
  { envName: 'AEGIS_SMTP_PASSWORD', key: 'smtp.password', encrypted: true },
  { envName: 'AEGIS_SMTP_FROM', key: 'smtp.fromEmail', encrypted: false },
  { envName: 'AEGIS_SMTP_SECURE', key: 'smtp.secure', encrypted: false },
  { envName: 'AEGIS_TELEGRAM_BOT_TOKEN', key: 'telegram.botToken', encrypted: true },
  { envName: 'AEGIS_TELEGRAM_CHAT_ID', key: 'telegram.chatId', encrypted: false },
  { envName: 'AEGIS_S3_ENDPOINT', key: 's3_endpoint', encrypted: false },
  { envName: 'AEGIS_S3_REGION', key: 's3_region', encrypted: false },
  { envName: 'AEGIS_S3_BUCKET', key: 's3_bucket', encrypted: false },
  { envName: 'AEGIS_S3_ACCESS_KEY_ID', key: 's3_access_key_id_encrypted', encrypted: true },
  { envName: 'AEGIS_S3_SECRET_ACCESS_KEY', key: 's3_secret_access_key_encrypted', encrypted: true },
  { envName: 'AEGIS_S3_PREFIX', key: 's3_prefix', encrypted: false },
];

async function settingExists(db: AegisDb, key: string): Promise<boolean> {
  const rows = await db
    .select({ key: appSettings.key })
    .from(appSettings)
    .where(eq(appSettings.key, key));

  return rows.length > 0;
}

export async function seedSettingsFromEnvironment(
  db: AegisDb,
  fieldEncryptionKey: string,
): Promise<number> {
  let inserted = 0;

  for (const setting of ENV_SETTINGS) {
    const rawValue = process.env[setting.envName];
    if (!rawValue || await settingExists(db, setting.key)) continue;

    const value = setting.encrypted
      ? encryptField(rawValue, fieldEncryptionKey)!
      : rawValue;

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
