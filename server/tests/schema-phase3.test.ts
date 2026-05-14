import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';
import { sql } from 'drizzle-orm';
import { appSettings } from '../src/db/schema.js';

describe('Phase 3 schema', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
  });

  afterAll(async () => {
    await app.close();
  });

  function getColumns(tableName: string): string[] {
    const db = app.db;
    const rows = db.all<{ name: string }>(sql.raw(`PRAGMA table_info(${tableName})`));
    return rows.map((r) => r.name);
  }

  function tableExists(tableName: string): boolean {
    const db = app.db;
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name=${tableName}`
    );
    return rows.length > 0;
  }

  // ─── packets ──────────────────────────────────────────────────────────────────

  it('packets table has release_run_id column', () => {
    const cols = getColumns('packets');
    expect(cols).toContain('release_run_id');
  });

  it('packets table has schema_version column', () => {
    const cols = getColumns('packets');
    expect(cols).toContain('schema_version');
  });

  it('packets table has local_ciphertext_path column', () => {
    const cols = getColumns('packets');
    expect(cols).toContain('local_ciphertext_path');
  });

  it('packets table has storage_version_id column', () => {
    const cols = getColumns('packets');
    expect(cols).toContain('storage_version_id');
  });

  // ─── contact_claims ───────────────────────────────────────────────────────────

  it('contact_claims has claim_token_hash (not plaintext claim_token)', () => {
    const cols = getColumns('contact_claims');
    expect(cols).toContain('claim_token_hash');
    expect(cols).not.toContain('claim_token');
  });

  it('contact_claims has release_run_id column', () => {
    const cols = getColumns('contact_claims');
    expect(cols).toContain('release_run_id');
  });

  // ─── release_runs ─────────────────────────────────────────────────────────────

  it('release_runs has triggering_switch_id (not switch_id)', () => {
    const cols = getColumns('release_runs');
    expect(cols).toContain('triggering_switch_id');
    expect(cols).not.toContain('switch_id');
  });

  it('release_runs has active_packet_id column', () => {
    const cols = getColumns('release_runs');
    expect(cols).toContain('active_packet_id');
  });

  it('release_runs has current_contact_claim_id column', () => {
    const cols = getColumns('release_runs');
    expect(cols).toContain('current_contact_claim_id');
  });

  it('release_runs has suppressed_switch_ids column', () => {
    const cols = getColumns('release_runs');
    expect(cols).toContain('suppressed_switch_ids');
  });

  it('release_runs has metadata column', () => {
    const cols = getColumns('release_runs');
    expect(cols).toContain('metadata');
  });

  it('release_runs has started_at column', () => {
    const cols = getColumns('release_runs');
    expect(cols).toContain('started_at');
  });

  it('release_runs has updated_at column', () => {
    const cols = getColumns('release_runs');
    expect(cols).toContain('updated_at');
  });

  // ─── local_acknowledgements ───────────────────────────────────────────────────

  it('local_acknowledgements table exists', () => {
    expect(tableExists('local_acknowledgements')).toBe(true);
  });

  it('local_acknowledgements has required columns', () => {
    const cols = getColumns('local_acknowledgements');
    expect(cols).toContain('id');
    expect(cols).toContain('owner_id');
    expect(cols).toContain('context_type');
    expect(cols).toContain('context_id');
    expect(cols).toContain('version');
    expect(cols).toContain('acknowledged_at');
  });

  // ─── S3 storage settings round-trip ──────────────────────────────────────────

  it('S3 storage settings can be persisted in app_settings', async () => {
    const db = app.db;
    const keys = [
      's3_endpoint', 's3_region', 's3_bucket', 's3_prefix',
      's3_access_key_id_encrypted', 's3_secret_access_key_encrypted',
      's3_force_path_style', 'packet_retention_days',
    ];
    for (const key of keys) {
      await db.insert(appSettings).values({ key, value: 'test-value', encrypted: false }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value: 'test-value' },
      });
      const rows = await db.select().from(appSettings).where(sql`key = ${key}`);
      expect(rows[0]?.value).toBe('test-value');
    }
  });
});
