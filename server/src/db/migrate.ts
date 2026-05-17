import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './index.js';
import { loadConfig } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const db = getDb(config.dbPath);

migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
console.log('Migrations applied successfully');
