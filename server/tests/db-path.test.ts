/**
 * New installs use data/underwing.db. An install that already has
 * data/aegis.db keeps using it: nothing is moved or copied, and no second,
 * empty database is created beside the existing one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { resolveDbPath, resetDbPathNotice } from '../src/db/path.js';
import { loadConfig } from '../src/config.js';

describe('resolveDbPath', () => {
  let dir: string;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'underwing-db-path-'));
    log = vi.fn();
    resetDbPathNotice();
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('uses underwing.db on a fresh install and says nothing', () => {
    const requested = join(dir, 'underwing.db');
    expect(resolveDbPath(requested, { log })).toBe(requested);
    expect(log).not.toHaveBeenCalled();
    expect(readdirSync(dir)).toEqual([]);
  });

  it('keeps using an existing aegis.db and logs one line', () => {
    const legacy = join(dir, 'aegis.db');
    const seeded = new Database(legacy);
    seeded.exec("CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES ('existing data')");
    seeded.close();

    const requested = join(dir, 'underwing.db');
    expect(resolveDbPath(requested, { log })).toBe(legacy);
    expect(resolveDbPath(requested, { log })).toBe(legacy);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain(legacy);

    // Nothing moved, copied or created beside the existing data.
    expect(readdirSync(dir)).toEqual(['aegis.db']);
    const reopened = new Database(legacy);
    expect(reopened.prepare('SELECT v FROM marker').get()).toEqual({ v: 'existing data' });
    reopened.close();
  });

  it('uses underwing.db when both files exist', () => {
    writeFileSync(join(dir, 'aegis.db'), '');
    writeFileSync(join(dir, 'underwing.db'), '');
    expect(resolveDbPath(join(dir, 'underwing.db'), { log })).toBe(join(dir, 'underwing.db'));
    expect(log).not.toHaveBeenCalled();
  });

  it('leaves any other explicit path alone', () => {
    writeFileSync(join(dir, 'aegis.db'), '');
    expect(resolveDbPath(join(dir, 'custom.db'), { log })).toBe(join(dir, 'custom.db'));
    expect(resolveDbPath(':memory:', { log })).toBe(':memory:');
    expect(log).not.toHaveBeenCalled();
  });
});

describe('loadConfig database path', () => {
  const startDir = process.cwd();
  let dir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'underwing-db-config-'));
    delete process.env.UNDERWING_DB_PATH;
    delete process.env.AEGIS_DB_PATH;
    resetDbPathNotice();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.UNDERWING_DB_PATH;
    delete process.env.AEGIS_DB_PATH;
    process.chdir(startDir);
    logSpy.mockRestore();
    warnSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('defaults to data/underwing.db on a fresh install', () => {
    process.chdir(dir);
    expect(loadConfig().dbPath).toBe('./data/underwing.db');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('with no variable set, an existing data/aegis.db is used and reported once', () => {
    process.chdir(dir);
    mkdirSync('data');
    writeFileSync(join('data', 'aegis.db'), '');
    expect(loadConfig().dbPath).toBe(join('data', 'aegis.db'));
    expect(loadConfig().dbPath).toBe(join('data', 'aegis.db'));
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(readdirSync('data')).toEqual(['aegis.db']);
  });

  it('new variable pointing at underwing.db still finds an existing aegis.db', () => {
    writeFileSync(join(dir, 'aegis.db'), '');
    process.env.UNDERWING_DB_PATH = join(dir, 'underwing.db');
    expect(loadConfig().dbPath).toBe(join(dir, 'aegis.db'));
    expect(existsSync(join(dir, 'underwing.db'))).toBe(false);
  });

  it('old variable naming aegis.db is used as written', () => {
    process.env.AEGIS_DB_PATH = join(dir, 'aegis.db');
    expect(loadConfig().dbPath).toBe(join(dir, 'aegis.db'));
  });
});
