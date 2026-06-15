import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { owner } from '../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, deleteSession } from '../auth/session.js';
import { deriveCsrfToken } from '../auth/csrf.js';
import { writeAuditEvent } from '../services/audit.js';
import { eq, count } from 'drizzle-orm';
import { APP_VERSION } from '../version.js';

const setupSchema = z.object({
  displayName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional().nullable(),
  password: z.string().min(12).max(256),
  timezone: z.string().default('UTC'),
  deploymentMode: z.enum(['vault', 'dead_drop', 'relay_monitoring', 'relay_escrow']).default('vault'),
});

const loginSchema = z.object({
  password: z.string().min(1),
  totpCode: z.string().optional(),
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

  // GET /api/setup/status — public, no auth
  app.get('/api/setup/status', async (_req, reply) => {
    const [result] = await app.db.select({ total: count() }).from(owner);
    const ownerExists = result.total > 0;
    return reply.send({
      setupComplete: ownerExists,
      ownerExists,
      appVersion: APP_VERSION,
    });
  });

  // Legacy alias kept for backward compat
  app.get('/api/auth/status', async (_req, reply) => {
    const [result] = await app.db.select({ total: count() }).from(owner);
    return reply.send({ setupRequired: result.total === 0 });
  });

  // POST /api/setup — primary setup endpoint (also aliased from /api/auth/setup)
  async function handleSetup(req: FastifyRequest, reply: FastifyReply) {
    const [existing] = await app.db.select({ total: count() }).from(owner);
    if (existing.total > 0) {
      return reply.status(409).send({ error: 'Owner already configured' });
    }

    const parseResult = setupSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parseResult.error.issues });
    }
    const body = parseResult.data;
    const passwordHash = await hashPassword(body.password);
    const now = new Date();

    const [created] = await app.db.insert(owner).values({
      displayName: body.displayName,
      email: body.email,
      phone: body.phone ?? null,
      passwordHash,
      timezone: body.timezone,
      setupComplete: true,
      createdAt: now,
      updatedAt: now,
    }).returning();

    await writeAuditEvent(app.db, {
      eventType: 'setup_completed',
      actorType: 'owner',
      metadata: { deploymentMode: body.deploymentMode },
    });

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
  }

  app.post('/api/setup', handleSetup);
  app.post('/api/auth/setup', handleSetup);

  app.post('/api/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parseResult.error.issues });
    }
    const body = parseResult.data;
    const [ownerRow] = await app.db.select().from(owner).limit(1);

    if (!ownerRow) {
      return reply.status(401).send({ error: 'No owner configured' });
    }

    // Check setup complete
    if (!ownerRow.setupComplete) {
      return reply.status(428).send({ error: 'Setup not complete', code: 'setup_required' });
    }

    const valid = await verifyPassword(body.password, ownerRow.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    // TOTP check if enabled
    if (ownerRow.totpEnabled) {
      if (!body.totpCode) {
        return reply.status(401).send({ error: 'TOTP code required', requiresTotp: true });
      }
      const { verifyTotpCode } = await import('../auth/totp.js');
      const totpValid = verifyTotpCode(
        body.totpCode,
        ownerRow.totpSecretEncrypted ?? '',
        app.config.fieldEncryptionKey,
      );
      if (!totpValid) {
        return reply.status(401).send({ error: 'Invalid TOTP code' });
      }
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
      phone: ownerRow.phone ?? null,
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
