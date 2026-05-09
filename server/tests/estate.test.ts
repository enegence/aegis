import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';

describe('Estate Item CRUD', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });

    await app.inject({
      method: 'POST', url: '/api/auth/setup',
      payload: { displayName: 'Test', email: 'test@test.com', password: 'testpass123', timezone: 'UTC' },
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'testpass123' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await app.inject({
      method: 'GET', url: '/api/csrf',
      headers: { cookie: cookies },
    });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;
  });

  afterAll(async () => { await app.close(); });

  it('creates an estate item', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/estate-items',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: {
        category: 'Financial',
        title: 'Chase Checking',
        institutionName: 'Chase Bank',
        referenceHint: '···4821',
        assetDescription: 'Primary checking account',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.id).toBeDefined();
    expect(body.title).toBe('Chase Checking');
    expect(body.assetDescription).toBe('Primary checking account');
  });

  it('lists estate items', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/estate-items',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.length).toBeGreaterThan(0);
  });

  it('updates an estate item', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/estate-items/1',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { title: 'Chase Checking Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).title).toBe('Chase Checking Updated');
  });

  it('deletes an estate item', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/api/estate-items/1',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(204);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/estate-items' });
    expect(res.statusCode).toBe(401);
  });
});
