import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';
import { sql } from 'drizzle-orm';

describe('Phase 2 schema migrations', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
  });

  afterAll(async () => {
    await app.close();
  });

  function getColumns(tableName: string): string[] {
    const db = app.db;
    // PRAGMA table_info does not support parameter binding — embed tableName directly
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

  it('switches table has last_reminder_sent_at column', () => {
    const columns = getColumns('switches');
    expect(columns).toContain('last_reminder_sent_at');
  });

  it('switches table has last_warning_sent_at column', () => {
    const columns = getColumns('switches');
    expect(columns).toContain('last_warning_sent_at');
  });

  it('switches table has last_evaluated_at column', () => {
    const columns = getColumns('switches');
    expect(columns).toContain('last_evaluated_at');
  });

  it('release_runs table exists with correct columns', () => {
    expect(tableExists('release_runs')).toBe(true);
    const columns = getColumns('release_runs');
    expect(columns).toContain('id');
    // Phase 3 renamed switch_id → triggering_switch_id
    expect(columns).toContain('triggering_switch_id');
    expect(columns).toContain('status');
    expect(columns).toContain('created_at');
    expect(columns).toContain('completed_at');
    expect(columns).toContain('cancelled_at');
  });

  it('notification_events table exists with correct columns', () => {
    expect(tableExists('notification_events')).toBe(true);
    const columns = getColumns('notification_events');
    expect(columns).toContain('id');
    expect(columns).toContain('switch_id');
    expect(columns).toContain('contact_id');
    expect(columns).toContain('channel');
    expect(columns).toContain('purpose');
    expect(columns).toContain('status');
    expect(columns).toContain('external_id');
    expect(columns).toContain('failure_reason');
    expect(columns).toContain('sent_at');
    expect(columns).toContain('created_at');
  });

  it('app_settings has value and encrypted columns (not value_encrypted)', () => {
    expect(tableExists('app_settings')).toBe(true);
    const columns = getColumns('app_settings');
    expect(columns).toContain('value');
    expect(columns).toContain('encrypted');
    expect(columns).not.toContain('value_encrypted');
  });
});
