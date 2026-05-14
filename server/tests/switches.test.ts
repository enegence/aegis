import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';

describe('Switch CRUD and Actions', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;
  let contactId: number;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });

    // Setup owner (setupComplete = true)
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: { displayName: 'Test Owner', email: 'owner@test.com', password: 'testpass1234', timezone: 'UTC' },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'testpass1234' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    // Fetch CSRF token
    const csrfRes = await app.inject({
      method: 'GET',
      url: '/api/csrf',
      headers: { cookie: cookies },
    });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;

    // Create a contact so arm readiness check passes
    const contactRes = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        fullName: 'Alice Smith',
        email: 'alice@test.com',
        priorityOrder: 1,
      },
    });
    contactId = JSON.parse(contactRes.payload).id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Auth guard ────────────────────────────────────────────────────────────────

  it('GET /api/switches — unauthenticated returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/switches' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/switches — authenticated returns empty array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/switches',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual([]);
  });

  // ─── CSRF guard ───────────────────────────────────────────────────────────────

  it('POST /api/switches without CSRF token returns 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies },
      payload: {
        name: 'No CSRF Switch',
        mode: 'heartbeat',
        heartbeatIntervalDays: 30,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  // ─── Create ────────────────────────────────────────────────────────────────────

  it('POST /api/switches — missing auth returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/switches',
      payload: {
        name: 'My Switch',
        mode: 'heartbeat',
        heartbeatIntervalDays: 30,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/switches — creates switch successfully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        name: 'Heartbeat Switch',
        mode: 'heartbeat',
        heartbeatIntervalDays: 30,
        gracePeriodHours: 72,
        warningWindowDays: 3,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Heartbeat Switch');
    expect(body.mode).toBe('heartbeat');
    expect(body.status).toBe('draft');
    expect(body.heartbeatIntervalDays).toBe(30);
    expect(body.selectedContactIds).toEqual([]);
    expect(body.selectedEstateItemIds).toEqual([]);
  });

  // ─── Read ──────────────────────────────────────────────────────────────────────

  it('GET /api/switches/:id — returns created switch', async () => {
    // First create one
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'Named Switch', mode: 'heartbeat', heartbeatIntervalDays: 7 },
    });
    const created = JSON.parse(createRes.payload);

    const res = await app.inject({
      method: 'GET',
      url: `/api/switches/${created.id}`,
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(created.id);
    expect(body.name).toBe('Named Switch');
  });

  it('GET /api/switches/:id — returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/switches/99999',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(404);
  });

  // ─── Update ────────────────────────────────────────────────────────────────────

  it('PUT /api/switches/:id — updates switch name', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'Original Name', mode: 'heartbeat', heartbeatIntervalDays: 14 },
    });
    const created = JSON.parse(createRes.payload);

    const res = await app.inject({
      method: 'PUT',
      url: `/api/switches/${created.id}`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).name).toBe('Updated Name');
  });

  it('PUT /api/switches/:id — cannot set status directly (strips status from input)', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'Status Test', mode: 'heartbeat', heartbeatIntervalDays: 14 },
    });
    const created = JSON.parse(createRes.payload);
    expect(created.status).toBe('draft');

    // Try to set status directly — should be ignored
    const res = await app.inject({
      method: 'PUT',
      url: `/api/switches/${created.id}`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { status: 'armed', name: 'Status Test' },
    });
    expect(res.statusCode).toBe(200);
    // Status should still be draft (stripped)
    expect(JSON.parse(res.payload).status).toBe('draft');
  });

  it('PUT /api/switches/:id — returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/switches/99999',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'Ghost' },
    });
    expect(res.statusCode).toBe(404);
  });

  // ─── Delete ────────────────────────────────────────────────────────────────────

  it('DELETE /api/switches/:id — deletes switch', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'To Delete', mode: 'heartbeat', heartbeatIntervalDays: 7 },
    });
    const created = JSON.parse(createRes.payload);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/switches/${created.id}`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(deleteRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/switches/${created.id}`,
      headers: { cookie: cookies },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('DELETE /api/switches/:id — returns 400 for triggered switch', async () => {
    // Create switch
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        name: 'Triggered Switch',
        mode: 'heartbeat',
        heartbeatIntervalDays: 7,
        selectedContactIds: [contactId],
      },
    });
    const created = JSON.parse(createRes.payload);

    // Arm it
    await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/arm`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });

    // Force evaluate with past time so it triggers
    // We use evaluate — the switch is heartbeat, so to trigger we'd need to wait
    // Instead, directly use the repository to set status to triggered
    // Since we can't easily do that in a route test, let's use the evaluate endpoint
    // with a mocked time — but that's not available via HTTP.
    // Instead, create a trip switch with trigger in past (needs triggerAt in future for arm,
    // so we'll just manually set status via repo in the test app's db)

    // Force update status to 'triggered' directly in the db
    const { db } = app;
    const { switches: switchesTable } = await import('../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.update(switchesTable)
      .set({ status: 'triggered' })
      .where(eq(switchesTable.id, created.id));

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/switches/${created.id}`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toContain('Cannot delete active switch');
  });

  // ─── Readiness ─────────────────────────────────────────────────────────────────

  it('GET /api/switches/:id/readiness — returns readiness object', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'Readiness Check', mode: 'heartbeat', heartbeatIntervalDays: 7 },
    });
    const created = JSON.parse(createRes.payload);

    const res = await app.inject({
      method: 'GET',
      url: `/api/switches/${created.id}/readiness`,
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.switchId).toBe(created.id);
    expect(typeof body.status).toBe('string');
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.length).toBeGreaterThan(0);
  });

  // ─── Arm ──────────────────────────────────────────────────────────────────────

  it('POST /api/switches/:id/arm — fails when readiness not_ready', async () => {
    // Switch with no contacts — not ready
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'No Contacts Switch', mode: 'heartbeat', heartbeatIntervalDays: 7 },
    });
    const created = JSON.parse(createRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/arm`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toContain('not ready');
  });

  it('POST /api/switches/:id/arm — succeeds when readiness passes', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        name: 'Ready Heartbeat Switch',
        mode: 'heartbeat',
        heartbeatIntervalDays: 30,
        selectedContactIds: [contactId],
      },
    });
    const created = JSON.parse(createRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/arm`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe('armed');
  });

  // ─── Pause ────────────────────────────────────────────────────────────────────

  it('POST /api/switches/:id/pause — pauses armed switch', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        name: 'Pause Test',
        mode: 'heartbeat',
        heartbeatIntervalDays: 30,
        selectedContactIds: [contactId],
      },
    });
    const created = JSON.parse(createRes.payload);

    // Arm first
    await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/arm`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/pause`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe('paused');
  });

  it('POST /api/switches/:id/pause — fails on draft switch', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'Draft Pause', mode: 'heartbeat', heartbeatIntervalDays: 7 },
    });
    const created = JSON.parse(createRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/pause`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── Cancel ───────────────────────────────────────────────────────────────────

  it('POST /api/switches/:id/cancel — cancels switch', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        name: 'Cancel Test',
        mode: 'heartbeat',
        heartbeatIntervalDays: 30,
        selectedContactIds: [contactId],
      },
    });
    const created = JSON.parse(createRes.payload);

    // Arm it first
    await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/arm`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/cancel`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe('cancelled');
  });

  // ─── Check-in ─────────────────────────────────────────────────────────────────

  it('POST /api/switches/:id/check-in — checks in on armed heartbeat switch', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        name: 'Check-in Test',
        mode: 'heartbeat',
        heartbeatIntervalDays: 30,
        selectedContactIds: [contactId],
      },
    });
    const created = JSON.parse(createRes.payload);

    // Arm it
    await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/arm`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/check-in`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('armed');
    expect(body.lastCheckInAt).not.toBeNull();
  });

  it('POST /api/switches/:id/check-in — fails on draft switch', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'Draft Check-in', mode: 'heartbeat', heartbeatIntervalDays: 7 },
    });
    const created = JSON.parse(createRes.payload);

    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/check-in`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── Evaluate ─────────────────────────────────────────────────────────────────

  it('POST /api/switches/:id/evaluate — evaluates and returns updated switch', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        name: 'Evaluate Test',
        mode: 'heartbeat',
        heartbeatIntervalDays: 30,
        selectedContactIds: [contactId],
      },
    });
    const created = JSON.parse(createRes.payload);

    // Arm it
    await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/arm`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${created.id}/evaluate`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // Should still be armed (no missed check-in yet)
    expect(body.status).toBe('armed');
    expect(body.lastEvaluatedAt).not.toBeNull();
  });
});
