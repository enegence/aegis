import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

loadDotenv({ path: resolve(process.cwd(), '../.env') });

export interface AppConfig {
  port: number;
  host: string;
  dbPath: string;
  dataDir: string;
  appUrl: string;
  secretKey: string;
  fieldEncryptionKey: string;
  testing: boolean;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const config = {
    port: parseInt(process.env.AEGIS_PORT || '8000', 10),
    host: process.env.AEGIS_HOST || '0.0.0.0',
    dbPath: process.env.AEGIS_DB_PATH || './data/aegis.db',
    dataDir: process.env.AEGIS_DATA_DIR || './data',
    appUrl: process.env.AEGIS_APP_URL || 'http://localhost:8000',
    secretKey: process.env.AEGIS_SECRET_KEY || 'dev-secret-key-change-me',
    fieldEncryptionKey: process.env.AEGIS_FIELD_ENCRYPTION_KEY || 'dev-field-key-change-me-32bytes!!',
    testing: false,
    ...overrides,
  };

  if (!config.testing && process.env.NODE_ENV === 'production') {
    if (config.secretKey.includes('change-me') || config.secretKey.length < 64) {
      throw new Error('FATAL: AEGIS_SECRET_KEY is not set or too short (min 64 chars). Run setup.sh to generate secrets.');
    }
    if (config.fieldEncryptionKey.includes('change-me')) {
      throw new Error('FATAL: AEGIS_FIELD_ENCRYPTION_KEY is not set. Run setup.sh to generate secrets.');
    }
    if (!/^[0-9a-fA-F]{64}$/.test(config.fieldEncryptionKey)) {
      throw new Error('FATAL: AEGIS_FIELD_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Run setup.sh to generate secrets.');
    }
  }

  return config;
}
