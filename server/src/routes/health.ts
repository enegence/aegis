import type { FastifyInstance } from 'fastify';

const APP_VERSION = '0.1.0';
const startTime = Date.now();

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => {
    return reply.send({
      status: 'ok',
      version: APP_VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    });
  });
}
