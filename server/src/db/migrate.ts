import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './index.js';
import { loadConfig } from '../config.js';

const config = loadConfig();
const db = getDb(config.dbPath);

migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrations applied successfully');
