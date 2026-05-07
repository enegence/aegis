import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { validateSession } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    ownerId?: number;
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
}

export default fp(authPlugin, { name: 'aegis-auth' });
