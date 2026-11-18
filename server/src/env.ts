/**
 * Environment variable names.
 *
 * Settings are named UNDERWING_*. Installs set up before the rename have the
 * same settings under AEGIS_*; those keep working. `readEnv` reads the new
 * name first, falls back to the old one, and warns once per old variable,
 * naming the variable and never its value.
 */

export const ENV_PREFIX = 'UNDERWING_';
export const LEGACY_ENV_PREFIX = 'AEGIS_';

const warned = new Set<string>();

export interface ReadEnvOptions {
  env?: Record<string, string | undefined>;
  warn?: (message: string) => void;
}

function present(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * Read a setting by its name without the prefix, for example `readEnv('PORT')`
 * for UNDERWING_PORT. An empty value counts as unset.
 */
export function readEnv(name: string, options: ReadEnvOptions = {}): string | undefined {
  const env = options.env ?? process.env;
  const current = env[`${ENV_PREFIX}${name}`];
  if (present(current)) return current;

  const legacyName = `${LEGACY_ENV_PREFIX}${name}`;
  const legacy = env[legacyName];
  if (!present(legacy)) return undefined;

  if (!warned.has(legacyName)) {
    warned.add(legacyName);
    const warn = options.warn ?? ((message: string) => console.warn(message));
    warn(`[config] ${legacyName} is the old name for ${ENV_PREFIX}${name}. It still works; rename it in your .env when convenient.`);
  }
  return legacy;
}

/** Test hook: forget which old variables have been warned about. */
export function resetEnvWarnings(): void {
  warned.clear();
}
