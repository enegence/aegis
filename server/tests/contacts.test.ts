import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';

describe('Contact CRUD', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookies: string;
  let csrfToken: string;

  beforeAll(async () => {
    app = await buildApp({ testing: true, dbPath: ':memory:' });
    await app.inject({
      method: 'POST', url: '/api/auth/setup',
      payload: { displayName: 'Test', email: 'test@test.com', password: 'testpass1234', timezone: 'UTC' },
    });
    const loginRes = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'testpass1234' },
    });
    cookies = String(loginRes.headers['set-cookie']);

    const csrfRes = await app.inject({
      method: 'GET', url: '/api/csrf',
      headers: { cookie: cookies },
    });
    csrfToken = JSON.parse(csrfRes.payload).csrfToken;
  });

  afterAll(async () => { await app.close(); });

  it('creates contacts with priority ordering', async () => {
    const contacts = [
      { fullName: 'James Whitfield', relationship: 'Brother', email: 'james@example.com', priorityOrder: 1 },
      { fullName: 'Margaret Osei', relationship: 'Father', email: 'dad@example.com', priorityOrder: 2 },
      { fullName: 'Sarah Whitfield', relationship: 'Sister', email: 'sarah@example.com', priorityOrder: 3 },
    ];

    for (const contact of contacts) {
      const res = await app.inject({
        method: 'POST', url: '/api/contacts',
        headers: { cookie: cookies, 'x-csrf-token': csrfToken },
        payload: contact,
      });
      expect(res.statusCode).toBe(201);
    }
  });

  it('lists contacts in priority order', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/contacts',
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.length).toBe(3);
    expect(body[0].fullName).toBe('James Whitfield');
    expect(body[1].fullName).toBe('Margaret Osei');
    expect(body[2].fullName).toBe('Sarah Whitfield');
  });

  it('reorders contacts', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/contacts/reorder',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { order: [3, 1, 2] },
    });
    expect(res.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET', url: '/api/contacts',
      headers: { cookie: cookies },
    });
    const body = JSON.parse(listRes.payload);
    expect(body[0].fullName).toBe('Sarah Whitfield');
    expect(body[1].fullName).toBe('James Whitfield');
  });

  it('deletes a contact', async () => {
    const res = await app.inject({
      method: 'DELETE', url: '/api/contacts/2',
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
    });
    expect(res.statusCode).toBe(204);

    const listRes = await app.inject({
      method: 'GET', url: '/api/contacts',
      headers: { cookie: cookies },
    });
    expect(JSON.parse(listRes.payload).length).toBe(2);
  });
});
