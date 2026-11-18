/**
 * Environment variables were renamed from AEGIS_* to UNDERWING_*.
 * An existing .env that still uses the old names must keep working, with one
 * warning per old variable that names the variable and never its value.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEnv, resetEnvWarnings } from '../src/env.js';
import { loadConfig } from '../src/config.js';

const STRONG_SECRET = 'a'.repeat(64) + 'b'.repeat(64);
const FIELD_KEY = '0123456789abcdef'.repeat(4);
const NAMES = ['PORT', 'HOST', 'DB_PATH', 'DATA_DIR', 'APP_URL', 'SECRET_KEY', 'FIELD_ENCRYPTION_KEY'];

function clearEnv() {
  for (const name of NAMES) {
    delete process.env[`UNDERWING_${name}`];
    delete process.env[`AEGIS_${name}`];
  }
}

describe('readEnv', () => {
  beforeEach(() => resetEnvWarnings());

  it('reads the new name', () => {
    const warn = vi.fn();
    expect(readEnv('PORT', { env: { UNDERWING_PORT: '9000' }, warn })).toBe('9000');
    expect(warn).not.toHaveBeenCalled();
  });

  it('prefers the new name when both are set and stays quiet', () => {
    const warn = vi.fn();
    expect(readEnv('PORT', { env: { UNDERWING_PORT: '9000', AEGIS_PORT: '8000' }, warn })).toBe('9000');
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the old name and warns once, naming the variable but not its value', () => {
    const warn = vi.fn();
    const env = { AEGIS_SECRET_KEY: 'super-secret-value' };
    expect(readEnv('SECRET_KEY', { env, warn })).toBe('super-secret-value');
    expect(readEnv('SECRET_KEY', { env, warn })).toBe('super-secret-value');
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('AEGIS_SECRET_KEY');
    expect(message).toContain('UNDERWING_SECRET_KEY');
    expect(message).not.toContain('super-secret-value');
  });

  it('warns separately for each old variable', () => {
    const warn = vi.fn();
    const env = { AEGIS_PORT: '8000', AEGIS_HOST: '127.0.0.1' };
    readEnv('PORT', { env, warn });
    readEnv('HOST', { env, warn });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('treats an empty value as unset', () => {
    const warn = vi.fn();
    expect(readEnv('PORT', { env: { UNDERWING_PORT: '', AEGIS_PORT: '' }, warn })).toBeUndefined();
    expect(readEnv('PORT', { env: { UNDERWING_PORT: '', AEGIS_PORT: '8000' }, warn })).toBe('8000');
    expect(readEnv('PORT', { env: {}, warn })).toBeUndefined();
  });
});

describe('loadConfig with old and new variable names', () => {
  const savedNodeEnv = process.env.NODE_ENV;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearEnv();
    resetEnvWarnings();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    clearEnv();
    process.env.NODE_ENV = savedNodeEnv;
    warnSpy.mockRestore();
  });

  it('reads an old-style environment unchanged', () => {
    process.env.AEGIS_PORT = '8123';
    process.env.AEGIS_HOST = '127.0.0.1';
    process.env.AEGIS_APP_URL = 'https://legacy.example.test';
    process.env.AEGIS_DATA_DIR = '/srv/legacy-data';
    process.env.AEGIS_DB_PATH = '/srv/legacy-data/aegis.db';
    process.env.AEGIS_SECRET_KEY = STRONG_SECRET;
    process.env.AEGIS_FIELD_ENCRYPTION_KEY = FIELD_KEY;

    const config = loadConfig();
    expect(config).toMatchObject({
      port: 8123,
      host: '127.0.0.1',
      appUrl: 'https://legacy.example.test',
      dataDir: '/srv/legacy-data',
      dbPath: '/srv/legacy-data/aegis.db',
      secretKey: STRONG_SECRET,
      fieldEncryptionKey: FIELD_KEY,
    });

    const warned = warnSpy.mock.calls.map((call) => String(call[0])).join('\n');
    for (const name of NAMES) expect(warned).toContain(`AEGIS_${name}`);
    expect(warned).not.toContain(STRONG_SECRET);
    expect(warned).not.toContain(FIELD_KEY);
  });

  it('reads a new-style environment without warnings', () => {
    process.env.UNDERWING_PORT = '8124';
    process.env.UNDERWING_SECRET_KEY = STRONG_SECRET;
    process.env.UNDERWING_FIELD_ENCRYPTION_KEY = FIELD_KEY;

    const config = loadConfig();
    expect(config.port).toBe(8124);
    expect(config.secretKey).toBe(STRONG_SECRET);
    expect(config.fieldEncryptionKey).toBe(FIELD_KEY);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each(['UNDERWING', 'AEGIS'])('refuses a weak %s_SECRET_KEY in production', (prefix) => {
    process.env.NODE_ENV = 'production';
    process.env[`${prefix}_SECRET_KEY`] = 'dev-secret-key-change-me';
    process.env[`${prefix}_FIELD_ENCRYPTION_KEY`] = FIELD_KEY;
    expect(() => loadConfig()).toThrow(/UNDERWING_SECRET_KEY/);
  });

  it.each(['UNDERWING', 'AEGIS'])('refuses a short %s_SECRET_KEY in production', (prefix) => {
    process.env.NODE_ENV = 'production';
    process.env[`${prefix}_SECRET_KEY`] = 'too-short';
    process.env[`${prefix}_FIELD_ENCRYPTION_KEY`] = FIELD_KEY;
    expect(() => loadConfig()).toThrow(/UNDERWING_SECRET_KEY/);
  });

  it.each(['UNDERWING', 'AEGIS'])('refuses a malformed %s_FIELD_ENCRYPTION_KEY in production', (prefix) => {
    process.env.NODE_ENV = 'production';
    process.env[`${prefix}_SECRET_KEY`] = STRONG_SECRET;
    process.env[`${prefix}_FIELD_ENCRYPTION_KEY`] = 'not-hex';
    expect(() => loadConfig()).toThrow(/UNDERWING_FIELD_ENCRYPTION_KEY/);
  });

  it('refuses to start in production when neither name sets the secrets', () => {
    process.env.NODE_ENV = 'production';
    expect(() => loadConfig()).toThrow(/UNDERWING_SECRET_KEY/);
  });

  it.each(['UNDERWING', 'AEGIS'])('starts in production with strong %s_* secrets', (prefix) => {
    process.env.NODE_ENV = 'production';
    process.env[`${prefix}_SECRET_KEY`] = STRONG_SECRET;
    process.env[`${prefix}_FIELD_ENCRYPTION_KEY`] = FIELD_KEY;
    const config = loadConfig();
    expect(config.secretKey).toBe(STRONG_SECRET);
    expect(config.fieldEncryptionKey).toBe(FIELD_KEY);
  });
});
