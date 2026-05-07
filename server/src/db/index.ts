import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let db: ReturnType<typeof createDb> | null = null;

function createDb(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

export function getDb(dbPath?: string): ReturnType<typeof createDb> {
  if (!db) {
    db = createDb(dbPath || './data/aegis.db');
  }
  return db;
}

export function createTestDb(): ReturnType<typeof createDb> {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

export type AegisDb = ReturnType<typeof createDb>;
