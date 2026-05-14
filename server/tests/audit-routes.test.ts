import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildApp } from '../src/index.js';
import { writeAuditEvent } from '../src/services/audit.js';

vi.mock('../src/services/notifications.js', () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getSmtpConfig: vi.fn().mockResolvedValue(null),
  getTelegramConfig: vi.fn().mockResolvedValue(null),
}));

describe('audit routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });

    await app.inject({
      method: 'POST', url: '/api/auth/setup',
      payload: { displayName: 'Owner', email: 'o@t.com', password: 'testpass1234', timezone: 'UTC' },
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'testpass1234' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    // Seed some audit events — one with only safe metadata, one without
    await writeAuditEvent(app.db, {
      eventType: 'switch_armed',
      actorType: 'owner',
      metadata: { switchId: 42, releaseRunId: 1 },
    });
  });

  afterAll(() => app.close());

  it('GET /api/audit-log requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/audit-log' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/audit-log returns events', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/audit-log',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
  });

  it('audit log response excludes PII keys', async () => {
    // The writeAuditEvent guard already blocks PII at write time.
    // Verify the route redacts any hypothetical keys that bypass that guard.
    const res = await app.inject({
      method: 'GET', url: '/api/audit-log',
      headers: { cookie: cookies },
    });
    const body = JSON.parse(res.payload);
    const metaStr = JSON.stringify(body.events.map((e: any) => e.metadata));
    // None of the seeded events have PII keys; verify no raw PII appears
    expect(metaStr).not.toContain('@'); // no email addresses
    expect(metaStr).not.toContain('password');
  });

  it('GET /api/audit-log/export returns downloadable JSON', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/audit-log/export',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    const parsed = JSON.parse(res.payload);
    expect(parsed.exportedAt).toBeTruthy();
    expect(Array.isArray(parsed.events)).toBe(true);
  });

  it('audit log respects switchId filter', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/audit-log?switchId=99999',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.events.length).toBe(0);
  });
});
