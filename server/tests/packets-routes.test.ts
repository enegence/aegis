import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildApp } from '../src/index.js';
import { encryptField } from '../src/services/field-encrypt.js';
import { estateItems, contacts } from '../src/db/schema.js';

const FIELD_KEY = 'dev-field-key-change-me-32bytes!!';

describe('packet routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;
  let switchId: number;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'aegis-pkt-test-'));
    app = await buildApp({ testing: true, dbPath: ':memory:', dataDir });

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

    const csrfRes = await app.inject({
      method: 'GET',
      url: '/api/csrf',
      headers: { cookie: cookies },
    });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;

    // Seed a contact and estate item
    await app.db.insert(contacts).values({
      fullNameEncrypted: encryptField('Bob Smith', FIELD_KEY)!,
      emailEncrypted: encryptField('bob@example.com', FIELD_KEY)!,
      priorityOrder: 1,
      preferredChannels: '["email"]',
      confirmationWindowHours: 48,
    });

    await app.db.insert(estateItems).values({
      category: 'Financial',
      title: 'Checking',
      institutionNameEncrypted: encryptField('Chase', FIELD_KEY),
      sensitiveFlag: false,
      sortOrder: 0,
    });

    // Create a switch with selections
    const swRes = await app.inject({
      method: 'POST',
      url: '/api/switches',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'Test Switch', mode: 'trip', triggerAt: new Date(Date.now() + 365 * 86400000).toISOString() },
    });
    switchId = JSON.parse(swRes.payload).id;

    // Update switch with selections
    await app.inject({
      method: 'PUT',
      url: `/api/switches/${switchId}`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { name: 'Test Switch', mode: 'trip', selectedContactIds: [1], selectedEstateItemIds: [1] },
    });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('GET /api/packets — unauthenticated returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/packets' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/packets — authenticated returns empty array initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/packets',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual([]);
  });

  it('POST generate without CSRF returns 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${switchId}/packets/generate`,
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST generate unauthenticated returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${switchId}/packets/generate`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST generate creates packet and returns metadata only', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/switches/${switchId}/packets/generate`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.id).toBeGreaterThan(0);
    expect(body.switchId).toBe(switchId);
    expect(body.version).toBe(1);
    expect(body.contentHash).toBeTruthy();
    // No plaintext fields
    expect(body.estateItems).toBeUndefined();
    expect(body.contacts).toBeUndefined();
  });

  it('GET /api/packets returns metadata list after generation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/packets',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const list = JSON.parse(res.payload);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].contentHash).toBeTruthy();
    expect(list[0].estateItems).toBeUndefined();
  });

  it('GET /api/switches/:id/packets returns packets for switch', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/switches/${switchId}/packets`,
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const list = JSON.parse(res.payload);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].switchId).toBe(switchId);
  });

  it('DELETE /api/packets/:id requires CSRF', async () => {
    // Generate a second packet to delete
    const genRes = await app.inject({
      method: 'POST',
      url: `/api/switches/${switchId}/packets/generate`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    const packetId = JSON.parse(genRes.payload).id;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/packets/${packetId}`,
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE /api/packets/:id marks deletion status', async () => {
    const genRes = await app.inject({
      method: 'POST',
      url: `/api/switches/${switchId}/packets/generate`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    const packetId = JSON.parse(genRes.payload).id;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/packets/${packetId}`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(204);
  });
});
