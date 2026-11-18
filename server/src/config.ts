import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import { readEnv } from './env.js';
import { DEFAULT_DB_PATH, resolveDbPath } from './db/path.js';

if (process.env.NODE_ENV !== 'test') {
  loadDotenv({ path: resolve(process.cwd(), '.env') });
  loadDotenv({ path: resolve(process.cwd(), '../.env') });
}

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
    port: parseInt(readEnv('PORT') || '8000', 10),
    host: readEnv('HOST') || '0.0.0.0',
    dbPath: readEnv('DB_PATH') || DEFAULT_DB_PATH,
    dataDir: readEnv('DATA_DIR') || './data',
    appUrl: readEnv('APP_URL') || 'http://localhost',
    secretKey: readEnv('SECRET_KEY') || 'dev-secret-key-change-me',
    fieldEncryptionKey: readEnv('FIELD_ENCRYPTION_KEY') || 'dev-field-key-change-me-32bytes!!',
    testing: false,
    ...overrides,
  };

  // An install that already has aegis.db keeps using it (see db/path.ts).
  config.dbPath = resolveDbPath(config.dbPath);

  if (!config.testing && process.env.NODE_ENV === 'production') {
    if (config.secretKey.includes('change-me') || config.secretKey.length < 64) {
      throw new Error('FATAL: UNDERWING_SECRET_KEY is not set or too short (min 64 chars). Run setup.sh to generate secrets.');
    }
    if (config.fieldEncryptionKey.includes('change-me')) {
      throw new Error('FATAL: UNDERWING_FIELD_ENCRYPTION_KEY is not set. Run setup.sh to generate secrets.');
    }
    if (!/^[0-9a-fA-F]{64}$/.test(config.fieldEncryptionKey)) {
      throw new Error('FATAL: UNDERWING_FIELD_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Run setup.sh to generate secrets.');
    }
  }

  return config;
}
