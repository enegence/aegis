import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';

describe('Dashboard API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });

    // Setup owner
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        displayName: 'Dashboard Owner',
        email: 'dash@test.com',
        password: 'testpass1234',
        timezone: 'UTC',
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'testpass1234' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await app.inject({
      method: 'GET',
      url: '/api/csrf',
      headers: { cookie: cookies },
    });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── 1. Unauthenticated returns 401 ─────────────────────────────────────────

  it('GET /api/dashboard — unauthenticated returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(res.statusCode).toBe(401);
  });

  // ─── 2. Empty state ──────────────────────────────────────────────────────────

  it('GET /api/dashboard — empty state: activeSwitchCount=0, nextSwitch=null', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ownerName).toBe('Dashboard Owner');
    expect(body.activeSwitchCount).toBe(0);
    expect(body.warningSwitchCount).toBe(0);
    expect(body.triggeredSwitchCount).toBe(0);
    expect(body.nextSwitch).toBeNull();
    expect(body.nextActionAt).toBeNull();
  });

  // ─── 3. With one armed trip switch ──────────────────────────────────────────

  it('GET /api/dashboard — with one armed trip switch: activeSwitchCount=1, triggeredSwitchCount=0', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Create a trip switch
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        name: 'Trip Switch',
        mode: 'trip',
        triggerAt: futureDate,
        gracePeriodHours: 72,
        warningWindowDays: 3,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const sw = JSON.parse(createRes.payload);

    // Manually set status to 'armed' via the DB — use arm endpoint
    // First create a contact so arm readiness passes
    const contactRes = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { fullName: 'Bob Jones', email: 'bob@test.com', priorityOrder: 1 },
    });
    const contactId = JSON.parse(contactRes.payload).id;

    // Update switch to include contact
    await app.inject({
      method: 'PUT',
      url: `/api/switches/${sw.id}`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { selectedContactIds: [contactId] },
    });

    // Arm the switch
    const armRes = await app.inject({
      method: 'POST',
      url: `/api/switches/${sw.id}/arm`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(armRes.statusCode).toBe(200);
    expect(JSON.parse(armRes.payload).status).toBe('armed');

    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.activeSwitchCount).toBe(1);
    expect(body.triggeredSwitchCount).toBe(0);
    expect(body.nextSwitch).not.toBeNull();
    expect(body.nextSwitch.id).toBe(sw.id);
    expect(body.nextActionAt).not.toBeNull();
  });

  // ─── 4. With one warning switch ─────────────────────────────────────────────

  it('GET /api/dashboard — with one warning switch: warningSwitchCount=1', async () => {
    // Create a fresh app for isolation
    const localApp = await buildApp({ testing: true, dbPath: ':memory:' });

    await localApp.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { displayName: 'Warn Owner', email: 'warn@test.com', password: 'testpass1234', timezone: 'UTC' },
    });

    const loginRes = await localApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'testpass1234' },
    });
    const localCookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await localApp.inject({
      method: 'GET',
      url: '/api/csrf',
      headers: { cookie: localCookies },
    });
    const localCsrf = JSON.parse(csrfRes.payload).csrfToken;

    // Create contact
    const contactRes = await localApp.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie: localCookies, 'x-csrf-token': localCsrf },
      payload: { fullName: 'Carol White', email: 'carol@test.com', priorityOrder: 1 },
    });
    const contactId = JSON.parse(contactRes.payload).id;

    // Create trip switch with past triggerAt (so it'll be in warning if warningWindowDays covers it)
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const createRes = await localApp.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: localCookies, 'x-csrf-token': localCsrf },
      payload: {
        name: 'Warning Switch',
        mode: 'trip',
        triggerAt: futureDate,
        selectedContactIds: [contactId],
        gracePeriodHours: 72,
        warningWindowDays: 3,
      },
    });
    const sw = JSON.parse(createRes.payload);

    // Arm first
    await localApp.inject({
      method: 'POST',
      url: `/api/switches/${sw.id}/arm`,
      headers: { cookie: localCookies, 'x-csrf-token': localCsrf },
    });

    // Directly patch the switch status to 'warning' using the switch-repository
    await localApp.db
      .update((await import('../src/db/schema.js')).switches)
      .set({ status: 'warning', warningStartsAt: new Date() })
      .where((await import('drizzle-orm')).eq((await import('../src/db/schema.js')).switches.id, sw.id));

    const res = await localApp.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { cookie: localCookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.warningSwitchCount).toBe(1);
    expect(body.activeSwitchCount).toBe(1); // warning counts as active
    expect(Math.abs(Date.parse(body.nextActionAt) - Date.parse(futureDate))).toBeLessThan(1000);

    await localApp.close();
  });

  it('GET /api/dashboard — heartbeat warning countdown uses grace expiry, not missed check-in time', async () => {
    const localApp = await buildApp({ testing: true, dbPath: ':memory:' });

    await localApp.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { displayName: 'Heartbeat Warning Owner', email: 'hbwarn@test.com', password: 'testpass1234', timezone: 'UTC' },
    });

    const loginRes = await localApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'testpass1234' },
    });
    const localCookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await localApp.inject({
      method: 'GET',
      url: '/api/csrf',
      headers: { cookie: localCookies },
    });
    const localCsrf = JSON.parse(csrfRes.payload).csrfToken;

    const contactRes = await localApp.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie: localCookies, 'x-csrf-token': localCsrf },
      payload: { fullName: 'Grace Period Contact', email: 'grace@test.com', priorityOrder: 1 },
    });
    const contactId = JSON.parse(contactRes.payload).id;

    const createRes = await localApp.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: localCookies, 'x-csrf-token': localCsrf },
      payload: {
        name: 'Heartbeat Warning Switch',
        mode: 'heartbeat',
        heartbeatIntervalDays: 7,
        gracePeriodHours: 48,
        selectedContactIds: [contactId],
      },
    });
    const sw = JSON.parse(createRes.payload);

    await localApp.inject({
      method: 'POST',
      url: `/api/switches/${sw.id}/arm`,
      headers: { cookie: localCookies, 'x-csrf-token': localCsrf },
    });

    const nextCheckInDueAt = new Date('2030-01-01T12:00:00.000Z');
    const expectedExpiry = new Date(nextCheckInDueAt.getTime() + 48 * 3600000).toISOString();

    await localApp.db
      .update((await import('../src/db/schema.js')).switches)
      .set({ status: 'warning', nextCheckInDueAt })
      .where((await import('drizzle-orm')).eq((await import('../src/db/schema.js')).switches.id, sw.id));

    const res = await localApp.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { cookie: localCookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.nextActionAt).toBe(expectedExpiry);

    await localApp.close();
  });

  // ─── 5. notificationsConfigured=false when no settings stored ───────────────

  it('GET /api/dashboard — notificationsConfigured=false when no settings stored', async () => {
    const localApp = await buildApp({ testing: true, dbPath: ':memory:' });

    await localApp.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { displayName: 'No Notif Owner', email: 'nonotif@test.com', password: 'testpass1234', timezone: 'UTC' },
    });

    const loginRes = await localApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'testpass1234' },
    });
    const localCookies = String(loginRes.headers['set-cookie']);

    const res = await localApp.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { cookie: localCookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.notificationsConfigured).toBe(false);

    await localApp.close();
  });

  // ─── 6. notificationsConfigured=true after saving SMTP settings ─────────────

  it('GET /api/dashboard — notificationsConfigured=true after saving SMTP settings', async () => {
    const localApp = await buildApp({ testing: true, dbPath: ':memory:' });

    await localApp.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { displayName: 'SMTP Owner', email: 'smtp@test.com', password: 'testpass1234', timezone: 'UTC' },
    });

    const loginRes = await localApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'testpass1234' },
    });
    const localCookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await localApp.inject({
      method: 'GET',
      url: '/api/csrf',
      headers: { cookie: localCookies },
    });
    const localCsrf = JSON.parse(csrfRes.payload).csrfToken;

    // Save SMTP settings
    await localApp.inject({
      method: 'PUT',
      url: '/api/settings/notifications/smtp',
      headers: { cookie: localCookies, 'x-csrf-token': localCsrf },
      payload: {
        host: 'smtp.example.com',
        port: 587,
        user: 'noreply@example.com',
        password: 'super-secret-password',
        fromEmail: 'noreply@example.com',
        secure: false,
      },
    });

    const res = await localApp.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { cookie: localCookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.notificationsConfigured).toBe(true);

    await localApp.close();
  });

  // ─── 7. health.database === 'ok' ────────────────────────────────────────────

  it('GET /api/dashboard — health.database === ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.health).toBeDefined();
    expect(body.health.database).toBe('ok');
    expect(body.health.status).toBe('ok');
    expect(typeof body.health.uptime).toBe('number');
    expect(body.health.version).toBeDefined();
  });

  it('reports the same app version from setup status, public health, and dashboard health', async () => {
    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    expect(healthRes.statusCode).toBe(200);
    const health = JSON.parse(healthRes.payload);

    const setupRes = await app.inject({ method: 'GET', url: '/api/setup/status' });
    expect(setupRes.statusCode).toBe(200);
    const setup = JSON.parse(setupRes.payload);

    const dashboardRes = await app.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { cookie: cookies },
    });
    expect(dashboardRes.statusCode).toBe(200);
    const dashboard = JSON.parse(dashboardRes.payload);

    expect(health.version).toBe(setup.appVersion);
    expect(dashboard.health.version).toBe(health.version);
  });

  // ─── 8. relayConfigured and storageConfigured === false ─────────────────────

  it('GET /api/dashboard — relayConfigured=false and storageConfigured=false', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.relayConfigured).toBe(false);
    expect(body.storageConfigured).toBe(false);
    expect(body.health.relay).toBe('not_configured');
    expect(body.health.storage).toBe('not_configured');
  });
});
