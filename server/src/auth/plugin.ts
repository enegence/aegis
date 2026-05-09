import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { validateSession } from './session.js';
import { deriveCsrfToken } from './csrf.js';

declare module 'fastify' {
  interface FastifyRequest {
    ownerId?: number;
  }
  interface FastifyInstance {
    requireCsrf: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('ownerId', undefined);

  app.decorate('requireAuth', async function (req: FastifyRequest, reply: FastifyReply) {
    const sessionId = req.cookies?.aegis_session;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const db = app.db;
    const ownerId = validateSession(db, sessionId);
    if (!ownerId) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    req.ownerId = ownerId;
  });

  app.decorate('requireCsrf', async function (req: FastifyRequest, reply: FastifyReply) {
    const sessionId = req.cookies?.aegis_session;
    if (!sessionId) {
      // No session at all — let requireAuth handle the 401
      return reply.status(403).send({ error: 'CSRF token required' });
    }

    const expectedToken = deriveCsrfToken(sessionId, app.config.secretKey);
    const providedToken = req.headers['x-csrf-token'];

    if (!providedToken || providedToken !== expectedToken) {
      return reply.status(403).send({ error: 'Invalid or missing CSRF token' });
    }
  });
}

export default fp(authPlugin, { name: 'aegis-auth' });
