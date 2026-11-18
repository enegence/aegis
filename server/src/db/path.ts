import { existsSync } from 'fs';
import { basename, dirname, join } from 'path';

export const DB_FILE_NAME = 'underwing.db';
export const LEGACY_DB_FILE_NAME = 'aegis.db';
export const DEFAULT_DB_PATH = `./data/${DB_FILE_NAME}`;

let noticed = false;

export interface ResolveDbPathOptions {
  exists?: (path: string) => boolean;
  log?: (message: string) => void;
}

/**
 * Decide which database file to open.
 *
 * New installs use underwing.db. An install set up before the rename has
 * aegis.db in the same folder; when that file exists and underwing.db does
 * not, keep using it. Nothing is moved or copied, and no second, empty
 * database is created beside existing data. Any other file name is used as
 * given.
 */
export function resolveDbPath(requested: string, options: ResolveDbPathOptions = {}): string {
  if (basename(requested) !== DB_FILE_NAME) return requested;

  const exists = options.exists ?? existsSync;
  if (exists(requested)) return requested;

  const legacy = join(dirname(requested), LEGACY_DB_FILE_NAME);
  if (!exists(legacy)) return requested;

  if (!noticed) {
    noticed = true;
    const log = options.log ?? ((message: string) => console.log(message));
    log(`[db] Using the existing database at ${legacy}. New installs use ${DB_FILE_NAME}; this one keeps its file and nothing was moved.`);
  }
  return legacy;
}

/** Test hook: allow the notice to be logged again. */
export function resetDbPathNotice(): void {
  noticed = false;
}
