import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { owner } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, deleteSession } from '../auth/session.js';
import { deriveCsrfToken } from '../auth/csrf.js';
import { eq, count } from 'drizzle-orm';

const setupSchema = z.object({
  displayName: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(256),
  timezone: z.string().default('UTC'),
});

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // GET /api/csrf — returns a CSRF token derived from the current session
  app.get('/api/csrf', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const sessionId = req.cookies!.aegis_session!;
    const csrfToken = deriveCsrfToken(sessionId, app.config.secretKey);
    return reply.send({ csrfToken });
  });

  app.get('/api/auth/status', async (_req, reply) => {
    const [result] = await app.db.select({ total: count() }).from(owner);
    return reply.send({ setupRequired: result.total === 0 });
  });

  app.post('/api/auth/setup', async (req, reply) => {
    const [existing] = await app.db.select({ total: count() }).from(owner);
    if (existing.total > 0) {
      return reply.status(409).send({ error: 'Owner already configured' });
    }

    const body = setupSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const now = new Date();

    const [created] = await app.db.insert(owner).values({
      displayName: body.displayName,
      email: body.email,
      passwordHash,
      timezone: body.timezone,
      setupComplete: true,
      createdAt: now,
      updatedAt: now,
    }).returning();

    const sessionId = createSession(app.db, created.id);

    reply.setCookie('aegis_session', sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 86400,
    });

    return reply.status(201).send({
      owner: {
        id: created.id,
        displayName: created.displayName,
        email: created.email,
        timezone: created.timezone,
      },
    });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const [ownerRow] = await app.db.select().from(owner).limit(1);

    if (!ownerRow) {
      return reply.status(401).send({ error: 'No owner configured' });
    }

    const valid = await verifyPassword(body.password, ownerRow.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    const sessionId = createSession(app.db, ownerRow.id);

    reply.setCookie('aegis_session', sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 86400,
    });

    return reply.send({ success: true });
  });

  app.get('/api/auth/me', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const [ownerRow] = await app.db.select().from(owner)
      .where(eq(owner.id, req.ownerId!));

    if (!ownerRow) {
      return reply.status(404).send({ error: 'Owner not found' });
    }

    return reply.send({
      id: ownerRow.id,
      displayName: ownerRow.displayName,
      email: ownerRow.email,
      timezone: ownerRow.timezone,
      totpEnabled: ownerRow.totpEnabled,
    });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const sessionId = req.cookies?.aegis_session;
    if (sessionId) {
      deleteSession(app.db, sessionId);
      reply.clearCookie('aegis_session', { path: '/' });
    }
    return reply.send({ success: true });
  });
}
